#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

image="${1:?Pass the existing Caddy image ID}"
config_base64="${2:?Pass the base64-encoded Caddyfile.ip.example}"
config_sha256="${3:?Pass the SHA-256 of the workspace Caddyfile.ip.example}"
[[ "$image" =~ ^sha256:[0-9a-f]{64}$ ]]
[[ "$config_sha256" =~ ^[0-9a-f]{64}$ ]]
[[ -z "${DOCKER_HOST:-}" || "$DOCKER_HOST" == unix://* ]]
for tool in docker openssl nsenter timeout python3 mktemp; do
  command -v "$tool" >/dev/null
done
[[ "$(docker context inspect "$(docker context show)" --format '{{.Endpoints.docker.Host}}')" == unix://* ]]
docker image inspect "$image" >/dev/null

lab_dir="$(mktemp -d)"
lab_container=""
lab_name="caddy-ip-proxy-lab-${lab_dir##*.}"
lab_owner="${lab_dir##*.}"
upstream_pid=""
create_attempted=0
create_failed=0
cleanup() {
  local status="$?"
  trap - EXIT
  if [[ -n "$upstream_pid" ]]; then
    kill "$upstream_pid" 2>/dev/null || true
    wait "$upstream_pid" 2>/dev/null || true
  fi
  if [[ "$create_attempted" == 1 ]]; then
    local owner
    if owner="$(docker inspect --format '{{ index .Config.Labels "sydney.ip-proxy-lab" }}' "$lab_name" 2>/dev/null)"; then
      if [[ "$owner" == "$lab_owner" ]]; then
        docker rm -f "$lab_name" >/dev/null 2>&1 || status=1
      else
        echo "Container name collision; refusing removal: $lab_name" >&2
        status=1
      fi
    elif [[ -n "$lab_container" || "$create_failed" == 1 ]]; then
      echo "Cannot confirm cleanup of $lab_name; inspect the Docker daemon manually" >&2
      status=1
    fi
    if [[ "$create_failed" == 1 ]]; then
      echo "Create outcome was uncertain; check for a late-created container named $lab_name" >&2
      status=1
    fi
  fi
  rm -f -- "$lab_dir/domain.key" "$lab_dir/domain.crt" "$lab_dir/ip.key" \
    "$lab_dir/ip.crt" "$lab_dir/Caddyfile" "$lab_dir/upstream.py" \
    "$lab_dir/check.py" "$lab_dir/logs" || status=1
  rmdir -- "$lab_dir" || status=1
  if [[ "$status" != 0 ]]; then echo "Test or cleanup failed" >&2; fi
  exit "$status"
}
trap cleanup EXIT

openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$lab_dir/domain.key" -out "$lab_dir/domain.crt" \
  -subj '/CN=site.example.test' -addext 'subjectAltName=DNS:site.example.test' >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$lab_dir/ip.key" -out "$lab_dir/ip.crt" \
  -subj '/CN=192.0.2.10' -addext 'subjectAltName=IP:192.0.2.10' >/dev/null 2>&1

CONFIG_BASE64="$config_base64" CONFIG_SHA256="$config_sha256" LAB_DIR="$lab_dir" python3 - <<'PY'
import base64
import hashlib
import os
from pathlib import Path

content = base64.b64decode(os.environ["CONFIG_BASE64"], validate=True)
digest = hashlib.sha256(content).hexdigest()
if digest != os.environ["CONFIG_SHA256"]:
    raise SystemExit("Caddyfile SHA-256 mismatch; refusing to run")
print(f"Input Caddyfile SHA-256: {digest}")
source = content.decode()
acme = "\ttls {\n\t\tissuer acme {$RAKAZO_IP_ACME_DIRECTORY} {\n\t\t\tprofile shortlived\n\t\t\tdisable_tlsalpn_challenge\n\t\t}\n\t}"
changes = [
    ("{\n\tdefault_sni", "{\n\tadmin off\n\tauto_https off\n\tdefault_sni"),
    (acme, "\ttls /lab/ip.crt /lab/ip.key"),
    ("reverse_proxy api:3100", "reverse_proxy 127.0.0.1:3100"),
    ("reverse_proxy web:5173", "reverse_proxy 127.0.0.1:5173"),
]
for before, after in changes:
    expected = 3 if before == "reverse_proxy api:3100" else 1
    if source.count(before) != expected:
        raise SystemExit(f"Unexpected source layout for {before!r}")
    source = source.replace(before, after)
Path(os.environ["LAB_DIR"], "Caddyfile").write_text(source)
PY
echo "Transforms: disable admin and automatic HTTPS; replace IP ACME with a synthetic certificate; map api/web upstreams to isolated loopback."
echo "No ACME challenge, issuance, renewal, public trust, production network or production upstream is tested."

cat >"$lab_dir/upstream.py" <<'PY'
import base64
import hashlib
import http.server
import json
import threading

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/novnc/session/view/TEST/websockify":
            key = self.headers.get("Sec-WebSocket-Key", "")
            if self.server.label != "web" or self.headers.get("Upgrade", "").lower() != "websocket" or not key:
                self.send_error(400)
                return
            accept = base64.b64encode(hashlib.sha1(
                (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")
            ).digest()).decode("ascii")
            self.send_response(101)
            self.send_header("Upgrade", "websocket")
            self.send_header("Connection", "Upgrade")
            self.send_header("Sec-WebSocket-Accept", accept)
            self.end_headers()
            self.connection.settimeout(5)
            def read_exact(count):
                result = b""
                while len(result) < count:
                    chunk = self.connection.recv(count - len(result))
                    if not chunk:
                        raise ValueError("incomplete WebSocket frame")
                    result += chunk
                return result
            header = read_exact(2)
            if header[0] != 0x81 or not header[1] & 0x80 or header[1] & 0x7f > 125:
                raise ValueError("unexpected WebSocket frame")
            mask = read_exact(4)
            payload = read_exact(header[1] & 0x7f)
            plaintext = bytes(value ^ mask[index % 4] for index, value in enumerate(payload))
            self.connection.sendall(bytes((0x81, len(plaintext))) + plaintext)
            self.close_connection = True
            return
        payload = json.dumps({"upstream": self.server.label, "path": self.path,
                              "host": self.headers.get("Host"),
                              "xff": self.headers.get("X-Forwarded-For")}).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
    def log_message(self, *args):
        pass

servers = []
for port, label in [(3100, "api"), (5173, "web")]:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.label = label
    servers.append(server)
    threading.Thread(target=server.serve_forever, daemon=True).start()
threading.Event().wait()
PY

cat >"$lab_dir/check.py" <<'PY'
import base64
import hashlib
import http.client
import json
import socket
import ssl
import sys
import time

lab = sys.argv[1]
def request(server_name, host, path, expected_status, expected_upstream=None):
    context = ssl.create_default_context(cafile=lab + ("/domain.crt" if server_name else "/ip.crt"))
    context.check_hostname = True
    with socket.create_connection(("127.0.0.1", 443), timeout=3) as raw:
        with context.wrap_socket(raw, server_hostname=server_name or "192.0.2.10") as connection:
            connection.sendall(("GET " + path + " HTTP/1.1\r\nHost: " + host +
                                "\r\nX-Forwarded-For: 203.0.113.123\r\n"
                                "Authorization: Bearer SYNTHETIC_SECRET_HEADER\r\n"
                                "Cookie: session=SYNTHETIC_SECRET_COOKIE\r\n"
                                "Connection: close\r\n\r\n").encode())
            response = http.client.HTTPResponse(connection)
            response.begin()
            body = response.read()
            if response.status != expected_status:
                raise AssertionError((server_name, host, path, response.status, body))
            if expected_upstream:
                result = json.loads(body)
                assert result["upstream"] == expected_upstream, result
                assert result["path"] == path, result
                assert result["host"] == host, result
                if expected_upstream == "api" and path.startswith(("/api/", "/rpc/")):
                    assert result["xff"] == "127.0.0.1", result
            elif expected_status == 200:
                assert body == b"", body
            print(f"SNI={server_name or 'none'} Host={host} {path}: {response.status} {expected_upstream or 'no upstream'}")

for attempt in range(30):
    try:
        request("site.example.test", "site.example.test", "/health", 200, "api")
        break
    except (ConnectionError, OSError):
        time.sleep(0.2)
else:
    raise SystemExit("Caddy or upstream did not start")

def websocket(server_name, host):
    context = ssl.create_default_context(cafile=lab + ("/domain.crt" if server_name else "/ip.crt"))
    with socket.create_connection(("127.0.0.1", 443), timeout=3) as raw:
        with context.wrap_socket(raw, server_hostname=server_name or "192.0.2.10") as connection:
            connection.settimeout(5)
            key = base64.b64encode(b"stage-websocket!").decode("ascii")
            connection.sendall(("GET /novnc/session/view/TEST/websockify HTTP/1.1\r\nHost: " + host +
                                "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                                "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: " + key +
                                "\r\n\r\n").encode("ascii"))
            response = http.client.HTTPResponse(connection)
            response.begin()
            expected = base64.b64encode(hashlib.sha1(
                (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")
            ).digest()).decode("ascii")
            if response.status != 101 or response.getheader("Sec-WebSocket-Accept") != expected:
                raise AssertionError("WebSocket handshake failed")
            payload = b"staging-websocket"
            mask = b"\x01\x02\x03\x04"
            masked = bytes(value ^ mask[index % 4] for index, value in enumerate(payload))
            connection.sendall(bytes((0x81, 0x80 | len(payload))) + mask + masked)
            frame = b""
            while len(frame) < len(payload) + 2:
                chunk = connection.recv(len(payload) + 2 - len(frame))
                if not chunk:
                    raise AssertionError("WebSocket echo incomplete")
                frame += chunk
            if frame != bytes((0x81, len(payload))) + payload:
                raise AssertionError("WebSocket echo mismatch")
            print(f"WebSocket {host}: handshake and bidirectional frame passed")

for name, host in [("site.example.test", "site.example.test"), (None, "192.0.2.10")]:
    for path, upstream in [("/health", "api"), ("/api/example?x=1", "api"),
                           ("/rpc/example", "api"), ("/api", "web"), ("/rpc", "web"),
                           ("/api/auth/verify-email?token=SYNTHETIC_VERIFY_TOKEN", "api"),
                           ("/api/auth/reset-password/SYNTHETIC_RESET_TOKEN", "api"),
                           ("/sign-in", "web"), ("/reset-password?token=SYNTHETIC_PAGE_TOKEN", "web"),
                           ("/novnc/session/view/TEST/vnc.html", "web"), ("/", "web")]:
        request(name, host, path, 200, upstream)
    websocket(name, host)
request("SITE.EXAMPLE.TEST", "site.example.test", "/", 200, "web")
request(None, "192.0.2.10", "/api/example?token=SYNTHETIC_SECRET_QUERY", 200, "api")
request("site.example.test", "192.0.2.10", "/", 421)
request(None, "site.example.test", "/", 421)
request("site.example.test", "unknown.example.test", "/", 200)
PY

create_attempted=1
if ! lab_container="$(docker create --name "$lab_name" --label "sydney.ip-proxy-lab=$lab_owner" \
  --pull=never --network none --read-only \
  --tmpfs /config --tmpfs /data --memory 128m --cpus 0.5 --pids-limit 128 \
  --mount "type=bind,src=$lab_dir,dst=/lab,readonly" \
  -e RAKAZO_HOST=site.example.test -e RAKAZO_PUBLIC_IP=192.0.2.10 \
  -e RAKAZO_CERT_FILE=/lab/domain.crt -e RAKAZO_KEY_FILE=/lab/domain.key \
  --entrypoint caddy "$image" run --config /lab/Caddyfile --adapter caddyfile)"; then
  create_failed=1
  exit 1
fi
docker start "$lab_container" >/dev/null
lab_pid="$(docker inspect --format '{{.State.Pid}}' "$lab_container")"
[[ "$lab_pid" =~ ^[1-9][0-9]*$ ]]
[[ "$lab_container" =~ ^[0-9a-f]{64}$ ]]
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}} {{.State.Running}}' "$lab_container")" == "none true" ]]
process_identity() {
  python3 - "$1" "$lab_container" <<'PY'
import sys
from pathlib import Path

pid, container = sys.argv[1:]
proc = Path("/proc") / pid
cgroup = (proc / "cgroup").read_text()
if container not in cgroup:
    raise SystemExit("Process cgroup does not identify the test container")
stat = (proc / "stat").read_text()
print(stat[stat.rfind(")") + 2:].split()[19])
PY
}
start_time="$(process_identity "$lab_pid")"
exec 9<"/proc/$lab_pid/ns/net"
[[ "$(stat -Lc '%d:%i' /proc/self/fd/9)" != "$(stat -Lc '%d:%i' /proc/self/ns/net)" ]]
[[ "$(process_identity "$lab_pid")" == "$start_time" ]]
[[ "$(stat -Lc '%d:%i' /proc/self/fd/9)" == "$(stat -Lc '%d:%i' "/proc/$lab_pid/ns/net")" ]]
[[ "$(docker inspect --format '{{.State.Pid}} {{.State.Running}}' "$lab_container")" == "$lab_pid true" ]]
nsenter --net=/proc/self/fd/9 python3 "$lab_dir/upstream.py" &
upstream_pid=$!
timeout 30 nsenter --net=/proc/self/fd/9 python3 "$lab_dir/check.py" "$lab_dir"
docker logs "$lab_container" >"$lab_dir/logs" 2>&1
LAB_DIR="$lab_dir" python3 - <<'PY'
import json
import os
from pathlib import Path

records = []
for line in Path(os.environ["LAB_DIR"], "logs").read_text().splitlines():
    try:
        item = json.loads(line)
        if "request" in item:
            records.append(item)
    except json.JSONDecodeError:
        pass
for host in ("site.example.test", "192.0.2.10"):
    assert any(item["request"].get("host") == host for item in records), host
serialized = json.dumps(records)
for secret in ("SYNTHETIC_SECRET_HEADER", "SYNTHETIC_SECRET_COOKIE", "SYNTHETIC_SECRET_QUERY",
               "SYNTHETIC_VERIFY_TOKEN", "SYNTHETIC_RESET_TOKEN", "SYNTHETIC_PAGE_TOKEN"):
    assert secret not in serialized, secret
assert "REDACTED" in serialized
print("Access logs present for both sites; synthetic header, cookie and query token are redacted.")
PY
