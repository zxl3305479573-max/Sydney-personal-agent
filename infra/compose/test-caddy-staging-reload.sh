#!/bin/bash
set -Eeuo pipefail
umask 077

image="${1:?Pass an existing Caddy image ID}"
public_ip="${2:?Pass the maintenance host public IP}"
[[ -n "${STAGING_TRANSFORM_BASE64:-}" ]] || { echo "Provide the base64-encoded staging transformer." >&2; exit 1; }
[[ "${SYDNEY_GUARD_BASE64:-}" =~ ^[A-Za-z0-9+/]+={0,2}$ ]] || { echo "Provide the base64-encoded staging guard." >&2; exit 1; }
[[ "$image" =~ ^sha256:[0-9a-f]{64}$ ]]
[[ -z "${DOCKER_HOST:-}" || "$DOCKER_HOST" == unix://* ]]
for tool in docker python3 openssl curl ss systemd-run systemctl od; do command -v "$tool" >/dev/null; done
python3 -c 'import ipaddress, sys; address = ipaddress.ip_address(sys.argv[1]); assert address.version == 4 and address.is_global' "$public_ip"
[[ "$(docker context inspect "$(docker context show)" --format '{{.Endpoints.docker.Host}}')" == unix://* ]]
docker image inspect "$image" >/dev/null
[[ -z "$(ss -H -lnt '( sport = :443 )')" ]] || { echo "Port 443 is already in use." >&2; exit 1; }

admin_port="$(python3 -c 'import socket; sock=socket.socket(); sock.bind(("127.0.0.1", 0)); print(sock.getsockname()[1]); sock.close()')"
owner="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
[[ "$owner" =~ ^[0-9a-f]{32}$ && "$admin_port" =~ ^[0-9]+$ ]]
name="sydney-stage-reload-$owner"
guard_name="sydney-caddy-guard-$owner"
guard_dir="/run/$guard_name"
test_key="$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null)"
test_cert="$(printf '%s\n' "$test_key" | openssl req -new -x509 -key /dev/stdin \
  -subj '/CN=sydney-stage.invalid' -addext 'subjectAltName=DNS:sydney-stage.invalid' -days 1)"
container=""
timer_started=0
guard_started=0
guard_dir_created=0
cleanup() {
  local status="$?"
  local actual_id actual_owner removed=0
  trap - EXIT
  if [[ "$guard_started" == 1 ]]; then
    systemctl stop "$name-restore.timer" || status=1
    systemctl stop "$name-restore.service" || status=1
  fi
  if [[ "$guard_dir_created" == 1 ]]; then
    rm -f -- "$guard_dir/state.json" || status=1
    rmdir -- "$guard_dir" || status=1
  fi
  if [[ -n "$container" ]]; then
    if read -r actual_id actual_owner < <(docker inspect --format '{{.Id}} {{index .Config.Labels "sydney.staging-reload-lab"}}' "$container" 2>/dev/null) &&
       [[ "$actual_id" == "$container" && "$actual_owner" == "$owner" ]]; then
      if docker rm -fv "$container" >/dev/null; then removed=1; else status=1; fi
    else
      echo "Cannot confirm temporary container identity; inspect $name" >&2
      status=1
    fi
  fi
  if [[ "$timer_started" == 1 && "$removed" == 1 ]]; then
    systemctl stop "$name-cleanup.timer" || status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

initial="$(python3 -c '
import json, sys
config = {
    "admin": {"listen": "127.0.0.1:" + sys.argv[1]},
    "apps": {
        "http": {"servers": {"stage": {
            "listen": [":443"],
            "protocols": ["h1", "h2"],
            "automatic_https": {"disable_redirects": True},
            "routes": [{
                "match": [{"host": ["sydney-stage.invalid"]}],
                "handle": [{"handler": "subroute", "routes": [
                    {"match": [{"path": ["/health"]}],
                     "handle": [{"handler": "static_response", "body": "original"}]},
                    {"handle": [{"handler": "static_response", "body": "original"}]},
                ]}],
                "terminal": True,
            }],
            "tls_connection_policies": [
                {"match": {"sni": ["sydney-stage.invalid"]},
                 "certificate_selection": {"any_tag": ["cert0"]}},
                {},
            ],
        }}},
        "tls": {
            "certificates": {"load_files": [{
                "certificate": "/tmp/original.crt",
                "key": "/tmp/original.key",
                "tags": ["cert0"],
            }]},
        },
    },
}
print(json.dumps(config, separators=(",", ":")))
' "$admin_port")"

container="$(docker create --name "$name" --label "sydney.staging-reload-lab=$owner" \
  --pull=never --network host --read-only --tmpfs /data --tmpfs /config --tmpfs /tmp \
  --cap-drop ALL --cap-add NET_BIND_SERVICE --security-opt no-new-privileges \
  --memory 128m --cpus 0.5 --pids-limit 128 \
  -e "INITIAL_CONFIG=$initial" -e "TEST_KEY=$test_key" -e "TEST_CERT=$test_cert" \
  --entrypoint sh "$image" -c \
  'printf "%s\n" "$TEST_KEY" > /tmp/original.key; printf "%s\n" "$TEST_CERT" > /tmp/original.crt; unset TEST_KEY TEST_CERT; printf "%s" "$INITIAL_CONFIG" > /tmp/initial.json; exec caddy run --config /tmp/initial.json')"
unset test_key test_cert
[[ "$container" =~ ^[0-9a-f]{64}$ ]]
systemd-run --quiet --unit="$name-cleanup" --on-active=180 /usr/bin/docker rm -fv "$container"
timer_started=1
[[ -z "$(ss -H -lnt '( sport = :443 )')" ]] || { echo "Port 443 became occupied." >&2; exit 1; }
docker start "$container" >/dev/null

original_response() {
  curl --noproxy '*' --silent --show-error --fail --insecure --max-time 3 \
    --resolve sydney-stage.invalid:443:127.0.0.1 https://sydney-stage.invalid/
}
original_fingerprint() {
  openssl s_client -connect 127.0.0.1:443 -servername sydney-stage.invalid </dev/null 2>/dev/null |
    openssl x509 -noout -fingerprint -sha256
}
for attempt in {1..60}; do
  if [[ "$(original_response 2>/dev/null || true)" == original ]]; then break; fi
  sleep 0.2
done
[[ "$(original_response)" == original ]]
fingerprint="$(original_fingerprint)"
snapshot="$(docker exec "$container" wget -qO- "http://127.0.0.1:$admin_port/config/")"
[[ -n "$snapshot" && -n "$fingerprint" ]]

if [[ "${STAGING_VALIDATE_ONLY:-0}" == 1 ]]; then
  candidate="$(printf '%s' "$snapshot" | python3 -I -c \
    'import base64, os; exec(base64.b64decode(os.environ["STAGING_TRANSFORM_BASE64"]))' \
    "$public_ip" "$owner")"
  printf '%s' "$candidate" | docker exec -i "$container" caddy validate --config - >/dev/null 2>&1
  [[ "$(original_response)" == original && "$(original_fingerprint)" == "$fingerprint" ]]
  echo "Staging candidate validated without loading; original route remains unchanged."
  exit 0
fi

if [[ -n "${STAGING_RUNNER_BASE64:-}" ]]; then
  python3 -I -c \
    'import base64, os; exec(base64.b64decode(os.environ["STAGING_RUNNER_BASE64"]))' \
    "$public_ip" "$container" "$admin_port" sydney-stage.invalid
  [[ "$(original_response)" == original && "$(original_fingerprint)" == "$fingerprint" ]]
  echo "Production-style controller verified against the synthetic file-certificate configuration."
  exit 0
fi

candidate="$(printf '%s' "$snapshot" | python3 -I -c \
  'import base64, os; exec(base64.b64decode(os.environ["STAGING_TRANSFORM_BASE64"]))' \
  "$public_ip" "$owner")"
[[ "$(findmnt -n -o FSTYPE /run)" == tmpfs ]]
mkdir -m 700 -- "$guard_dir"
guard_dir_created=1
started_at="$(docker inspect --format '{{.State.StartedAt}}' "$container")"
SNAPSHOT="$snapshot" CANDIDATE="$candidate" python3 - "$guard_dir/state.json" "$container" "$started_at" "$admin_port" <<'PY'
import json, os, sys
state = {
    "container": sys.argv[2], "started_at": sys.argv[3], "admin_port": int(sys.argv[4]),
    "before": json.loads(os.environ["SNAPSHOT"]), "candidate": json.loads(os.environ["CANDIDATE"]),
}
fd = os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as output:
    json.dump(state, output, separators=(",", ":"))
PY
systemd-run --quiet --unit="$name-restore" --on-active=55 --timer-property=AccuracySec=1s \
  --remain-after-exit /usr/bin/python3 -I -c \
  "import base64;exec(base64.b64decode('$SYDNEY_GUARD_BASE64'))" "$guard_name"
guard_started=1
python3 - "$guard_dir/state.json" "$admin_port" <<'PY'
import json, sys, urllib.request
with open(sys.argv[1], encoding="utf-8") as source:
    state = json.load(source)
url = "http://127.0.0.1:%d/config/" % int(sys.argv[2])
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
with opener.open(url, timeout=5) as response:
    if json.load(response) != state["before"] or not response.headers.get("ETag"):
        raise SystemExit("Original configuration changed before loading candidate")
    etag = response.headers["ETag"]
request = urllib.request.Request(
    url, data=json.dumps(state["candidate"], separators=(",", ":")).encode(), method="POST",
    headers={"Content-Type": "application/json", "If-Match": etag},
)
with opener.open(request, timeout=10) as response:
    if response.status != 200:
        raise SystemExit("Candidate load failed")
PY
[[ "$(original_response)" == original && "$(original_fingerprint)" == "$fingerprint" ]]

certificate=""
for attempt in {1..100}; do
  [[ "$(docker inspect --format '{{.State.Running}}' "$container")" == true ]] || exit 1
  certificate="$(docker exec "$container" find "/tmp/sydney-ip-staging-$owner" -type f -name "*.crt" -print 2>/dev/null | head -n 1 || true)"
  [[ -z "$certificate" ]] || break
  sleep 1
done
[[ -n "$certificate" ]] || { echo "Staging certificate was not observed before timeout." >&2; exit 1; }
docker exec "$container" cat "$certificate" | openssl x509 -noout -checkip "$public_ip" >/dev/null
issuer="$(docker exec "$container" cat "$certificate" | openssl x509 -noout -issuer)"
[[ "$issuer" == *"STAGING"* || "$issuer" == *"Fake"* ]]
issued_fingerprint="$(docker exec "$container" cat "$certificate" | openssl x509 -noout -fingerprint -sha256)"
served_fingerprint="$(openssl s_client -connect 127.0.0.1:443 -noservername </dev/null 2>/dev/null |
  openssl x509 -noout -fingerprint -sha256)"
[[ "$issued_fingerprint" == "$served_fingerprint" ]]
[[ "$(original_response)" == original && "$(original_fingerprint)" == "$fingerprint" ]]
echo "Staging IP issuance and original HTTPS route succeeded with unchanged original certificate."

for attempt in {1..300}; do
  current="$(docker exec "$container" wget -qO- "http://127.0.0.1:$admin_port/config/" 2>/dev/null || true)"
  if CURRENT="$current" SNAPSHOT="$snapshot" python3 -c \
    'import json,os; raise SystemExit(json.loads(os.environ["CURRENT"]) != json.loads(os.environ["SNAPSHOT"]))' \
    2>/dev/null; then break; fi
  sleep 0.2
done
CURRENT="$current" SNAPSHOT="$snapshot" python3 -c \
  'import json,os; assert json.loads(os.environ["CURRENT"]) == json.loads(os.environ["SNAPSHOT"])'
[[ "$(original_response)" == original && "$(original_fingerprint)" == "$fingerprint" ]]
after_ip_fingerprint="$(openssl s_client -connect 127.0.0.1:443 -noservername </dev/null 2>/dev/null |
  openssl x509 -noout -fingerprint -sha256 2>/dev/null || true)"
if [[ "$after_ip_fingerprint" == "$issued_fingerprint" ]]; then
  echo "Staging IP certificate remains served after restoring the original configuration." >&2
  exit 1
fi
systemctl show "$name-restore.service" --property=Result --property=ExecMainStatus |
  grep -qx 'Result=success'
echo "Independent timed guard restored the runtime configuration; staging IP certificate no longer served."
echo "Scope: synthetic domain on maintenance host; not production rollback or persistent recovery."
