#!/usr/bin/env python3
"""Run the synthetic chat drill with a staging IP certificate on the maintenance host."""

import base64
import http.client
import ipaddress
import json
from pathlib import Path
import re
import secrets
import shlex
import ssl
import subprocess
import sys
import time
import urllib.request


REMOTE = r"""
import base64, ipaddress, json, os, subprocess, sys
payload = json.load(sys.stdin)
address = ipaddress.ip_address(payload["ip"])
if address.version != 4 or not address.is_global:
    raise ValueError("Expected a global IPv4 address")
script = base64.b64decode(payload["script"], validate=True).decode()
script = script.replace("192.0.2.10", str(address))
env = os.environ.copy()
env["SYDNEY_CADDY_CANDIDATE_BASE64"] = payload["candidate"]
if payload["token"]:
    env["SYDNEY_STAGING_TOKEN"] = payload["token"]
    env["SYDNEY_STAGING_BROWSER_CHECK"] = "1"
result = subprocess.run(["/bin/bash", "-s"], input=script.encode(), env=env)
sys.exit(result.returncode)
"""

STAGING_CADDY = r"""mkdir "$scratch/caddy"
LAB_CADDY_DIR="$scratch/caddy" python3 - <<'PYROOT'
import os
from pathlib import Path
import urllib.request

roots = []
for path in ("letsencrypt-stg-root-x1.pem", "letsencrypt-stg-root-x2.pem",
             "gen-y/root-ye.pem", "gen-y/root-yr.pem"):
    with urllib.request.urlopen("https://letsencrypt.org/certs/staging/" + path, timeout=15) as response:
        data = response.read(16385)
    if len(data) > 16384 or b"-----BEGIN CERTIFICATE-----" not in data:
        raise ValueError("Invalid staging root")
    roots.append(data)
Path(os.environ["LAB_CADDY_DIR"], "ip.crt").write_bytes(b"\n".join(roots))
PYROOT
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -keyout "$scratch/caddy/domain.key" -out "$scratch/caddy/domain.crt" -subj '/CN=old.example.test' -addext 'subjectAltName=DNS:old.example.test' >/dev/null 2>&1
chmod 644 "$scratch/caddy/ip.crt" "$scratch/caddy/domain.crt"
docker run -d --name "${prefix}-web" --label "sydney.stage=$prefix" --network "$prefix" --network-alias web --memory 256m --cpus 1 --pids-limit 128 --user node --env-file "$scratch/common.env" -v "$scratch/caddy/ip.crt:/lab/ip.crt:ro" -e SYDNEY_STAGING_TOKEN -e RAYON_NUM_THREADS=1 -e RAKAZO_HOST=192.0.2.10 -e API_PROXY_TARGET=http://api:3100 --workdir /app/apps/web --entrypoint /app/apps/web/node_modules/.bin/vite "$api_image" preview --host 0.0.0.0 --port 5173 >/dev/null
web_created=1
for attempt in $(seq 1 60); do
  if docker exec "${prefix}-web" node -e "fetch('http://127.0.0.1:5173/',{headers:{host:'192.0.2.10'}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then break; fi
  if [[ "$(docker inspect --format '{{.State.Running}}' "${prefix}-web")" != true ]]; then echo "web-exited"; exit 1; fi
  if (( attempt == 60 )); then echo "web-not-ready"; exit 1; fi
  sleep 1
done
web_ip="$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "${prefix}-web")"
python3 -c 'import ipaddress,sys; assert ipaddress.ip_address(sys.argv[1]).is_private' "$web_ip"
LAB_CADDY_DIR="$scratch/caddy" LAB_WEB_IP="$web_ip" python3 - <<'PYCONFIG'
import base64
import os
from pathlib import Path

source = base64.b64decode(os.environ["SYDNEY_CADDY_CANDIDATE_BASE64"], validate=True).decode()
token = os.environ.get("SYDNEY_STAGING_TOKEN", "")
if token and (len(token) != 64 or any(char not in "0123456789abcdef" for char in token)):
    raise ValueError("Invalid staging token")
guard = ("\t\t@outside not header X-Sydney-Staging " + token if token
         else "\t\t@outside not remote_ip " + os.environ["LAB_WEB_IP"])
changes = (
    ("{\n\tdefault_sni", "{\n\tadmin off\n\tauto_https disable_redirects\n\tdefault_sni", 1),
    ("disable_tlsalpn_challenge", "disable_http_challenge", 1),
    ("\troute {\n", "\troute {\n" + guard + "\n\t\trespond @outside 403\n", 2),
    ("\t\t\timport deploy_retry\n", "\t\t\timport deploy_retry\n\t\t\theader_up -X-Sydney-Staging\n", 4),
)
for before, after, count in changes:
    if source.count(before) != count:
        raise SystemExit("Unexpected Caddy candidate layout")
    source = source.replace(before, after)
Path(os.environ["LAB_CADDY_DIR"], "Caddyfile").write_text(source)
PYCONFIG
[[ -z "$(ss -H -lnt '( sport = :443 )')" ]] || { echo "port-443-busy"; exit 1; }
caddy_id="$(docker create --name "${prefix}-caddy" --label "sydney.stage=$prefix" --network "$prefix" --network-alias stage-caddy --publish 443:443 --memory 128m --cpus 1 --pids-limit 128 --log-driver none --tmpfs /data:rw,size=16m --tmpfs /config:rw,size=16m -v "$scratch/caddy:/lab:ro" -e RAKAZO_PUBLIC_IP=192.0.2.10 -e RAKAZO_HOST=old.example.test -e RAKAZO_CERT_FILE=/lab/domain.crt -e RAKAZO_KEY_FILE=/lab/domain.key -e RAKAZO_IP_ACME_DIRECTORY=https://acme-staging-v02.api.letsencrypt.org/directory --entrypoint caddy "$caddy_image" run --config /lab/Caddyfile --adapter caddyfile)"
[[ "$caddy_id" =~ ^[0-9a-f]{64}$ ]]
caddy_created=1
docker network create --label "sydney.stage=$prefix" "${prefix}-egress" >/dev/null
egress_created=1
docker network connect "${prefix}-egress" "$caddy_id"
systemd-run --quiet --unit="${prefix}-caddy-cleanup" --on-active=600 /usr/bin/docker rm -f "$caddy_id"
timer_started=1
docker start "$caddy_id" >/dev/null
"""

OUTSIDER_PROBE = r"""docker run --rm -i --label "sydney.stage=$prefix" --network "${prefix}-egress" --memory 128m --cpus 1 --pids-limit 128 --user node -v "$scratch/caddy/ip.crt:/lab/ip.crt:ro" -e PROBE_TARGET="${prefix}-caddy" -e PROBE_IP=192.0.2.10 --entrypoint node "$api_image" --input-type=module <<'NODE'
import https from "node:https";
import tls from "node:tls";
import { readFileSync } from "node:fs";
const status = await new Promise((resolve, reject) => {
  const request = https.request({
    host: process.env.PROBE_TARGET, port: 443, servername: "", path: "/health",
    ca: readFileSync("/lab/ip.crt"),
    checkServerIdentity: (_host, cert) => tls.checkServerIdentity(process.env.PROBE_IP, cert),
    headers: { host: process.env.PROBE_IP }, timeout: 10000,
  }, (response) => {
    response.resume();
    response.on("end", () => resolve(response.statusCode));
    response.on("error", reject);
  });
  request.on("timeout", () => request.destroy(new Error("probe timeout")));
  request.on("error", reject);
  request.end();
});
if (status !== 403) throw new Error("Non-lab client was not rejected");
console.log("staging-ip-tls-outsider-denied");
NODE
"""


def replace_once(source: str, before: str, after: str) -> str:
    if source.count(before) != 1:
        raise ValueError("Unexpected staging chat script layout")
    return source.replace(before, after, 1)


def staging_context() -> ssl.SSLContext:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    for path in ("letsencrypt-stg-root-x1.pem", "letsencrypt-stg-root-x2.pem",
                 "gen-y/root-ye.pem", "gen-y/root-yr.pem"):
        url = "https://letsencrypt.org/certs/staging/" + path
        try:
            with urllib.request.urlopen(url, timeout=15) as response:
                data = response.read(16385)
        except (OSError, urllib.error.URLError):
            fetch = (
                "import sys,urllib.request;"
                "sys.stdout.buffer.write(urllib.request.urlopen(sys.argv[1],timeout=15)"
                ".read(16385))"
            )
            data = subprocess.run(
                ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
                 "sydney-backend-admin", "python3 -c " + shlex.quote(fetch) + " "
                 + shlex.quote(url)],
                check=True, capture_output=True, timeout=30,
            ).stdout
        if len(data) > 16384:
            raise ValueError("Staging root too large")
        context.load_verify_locations(cadata=data.decode("ascii"))
    return context


def public_probe(address: str, token: str, context: ssl.SSLContext) -> None:
    def request(path: str, body=None, cookie=None, space=None, extra_headers=None):
        connection = http.client.HTTPSConnection(address, 443, context=context, timeout=10)
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Origin": "https://" + address, "X-Sydney-Staging": token}
        if extra_headers:
            headers.update(extra_headers)
        if data is not None:
            headers["Content-Type"] = "application/json"
        if cookie:
            headers["Cookie"] = cookie
        if space:
            headers["X-Rakazo-Space-Id"] = space
        try:
            connection.request("POST" if data is not None else "GET", path, data, headers)
            response = connection.getresponse()
            content = response.read(1024 * 1024 + 1)
            if len(content) > 1024 * 1024:
                raise ValueError("Probe response too large")
            cookies = [value.split(";", 1)[0] for name, value in response.getheaders()
                       if name.lower() == "set-cookie"]
            return response.status, json.loads(content), "; ".join(cookies)
        finally:
            connection.close()

    status, health, _ = request("/health")
    if status != 200 or health.get("ok") is not True:
        raise ValueError("Public health failed")
    email = "stage-public@example.invalid"
    password = "synthetic-public-password-2849"
    status, _, cookie = request("/api/auth/sign-up/email", {
        "email": email, "password": password, "name": "Public Stage",
    })
    if status != 200 or not cookie:
        raise ValueError("Public signup failed")

    def rpc(path: str, body=None, session=None, space=None):
        status, result, _ = request(
            "/rpc/" + path, {"json": body or {}}, session or cookie, space,
        )
        if status != 200 or result.get("error"):
            raise ValueError("Public RPC failed: " + path)
        return result["json"]

    actor = rpc("me")
    if not actor.get("userId") or not actor.get("spaceId"):
        raise ValueError("Public session missing")
    space = actor["spaceId"]
    for avatar in ("lilac-dragon", "orange-flower", "blue-maid"):
        connection = http.client.HTTPSConnection(address, 443, context=context, timeout=10)
        try:
            connection.request("GET", "/avatar-library/" + avatar + ".webp", headers={
                "X-Sydney-Staging": token,
            })
            response = connection.getresponse()
            image = response.read(1024 * 1024 + 1)
            if (response.status != 200 or len(image) > 1024 * 1024
                    or len(image) < 12 or image[:4] != b"RIFF"
                    or image[8:12] != b"WEBP"):
                raise ValueError("Public built-in avatar unavailable: " + avatar)
        finally:
            connection.close()
    personality = rpc("personalities/create", {
        "name": "Public Stage Personality", "description": "",
        "instructions": "Synthetic staging instructions",
        "selections": [{"attributeId": "speech/mandarin_casual", "weight": "moderate"}],
    }, space=space)
    if not personality.get("id") or not personality.get("instructions"):
        raise ValueError("Public personality creation failed")
    bot = rpc("bots/create", {
        "name": "Public Stage Bot", "title": "Public Stage Bot", "description": "",
        "instructions": personality["instructions"], "notifyOnFinish": False,
    }, space=space)
    peer = rpc("bots/create", {
        "name": "Public Stage Peer", "title": "Public Stage Peer", "description": "",
        "instructions": "", "notifyOnFinish": False,
    }, space=space)
    group = rpc("groups/create", {
        "name": "Public Stage Group", "botIds": [bot["id"], peer["id"]],
    }, space=space)
    targets = [
        ({"botId": bot["id"]}, "public staging direct", {}),
        ({"groupId": group["id"]}, "public staging group",
         {"mentions": [{"kind": "bot", "id": bot["id"]}]}),
    ]
    sends = []
    deadline = time.monotonic() + 60
    for target, text, extra in targets:
        sent = rpc("threads/send", {**target, "text": text, **extra}, space=space)
        if not sent.get("runId"):
            raise ValueError("Public send missing run")
        while time.monotonic() < deadline:
            snapshot = rpc("threads/get", target, space=space)
            messages = snapshot.get("messages", [])
            user_message = any(
                message.get("role") == "user" and any(
                    block.get("kind") == "text" and block.get("text") == text
                    for block in message.get("blocks", [])
                ) for message in messages
            )
            bot_message = any(
                message.get("role") == "bot" and message.get("runId") == sent["runId"]
                and any(block.get("kind") == "text" and block.get("text")
                        for block in message.get("blocks", []))
                for message in messages
            )
            if user_message and bot_message:
                break
            time.sleep(0.5)
        else:
            raise ValueError("Public chat timed out")
        sends.append((target, text, sent["runId"]))
    other_space = rpc("spaces/create", {"name": "Public Stage Other"})
    status, _, _ = request(
        "/rpc/threads/get", {"json": {"groupId": group["id"]}}, cookie, other_space["id"],
    )
    if status != 404:
        raise ValueError("Public cross-space group was not rejected")
    spoofed_addresses = ("203.0.113.123", "203.0.113.124", "203.0.113.125")
    status, _, second_cookie = request("/api/auth/sign-in/email", {
        "email": email, "password": password,
    }, extra_headers={
        "X-Forwarded-For": spoofed_addresses[0],
        "X-Rakazo-Client-Ip": spoofed_addresses[1],
        "CF-Connecting-IP": spoofed_addresses[2],
    })
    if status != 200 or not second_cookie or second_cookie == cookie:
        raise ValueError("Public second sign-in failed")
    status, session_data, _ = request("/api/auth/get-session", cookie=second_cookie)
    client_address = (session_data.get("session") or {}).get("ipAddress")
    if status != 200 or not client_address or client_address in spoofed_addresses:
        raise ValueError("Public session client address missing or spoofed")
    second_actor = rpc("me", session=second_cookie, space=space)
    if second_actor.get("userId") != actor["userId"]:
        raise ValueError("Public second session differs")
    personalities = rpc("personalities/list", session=second_cookie, space=space)
    if not any(
        item.get("id") == personality["id"]
        and item.get("instructions") == personality["instructions"]
        and item.get("selections") == personality["selections"]
        for item in personalities
    ):
        raise ValueError("Public second session cannot read personality")
    for target, text, run_id in sends:
        snapshot = rpc("threads/get", target, second_cookie, space)
        if not any(
            message.get("role") == "user" and any(
                block.get("kind") == "text" and block.get("text") == text
                for block in message.get("blocks", [])
            ) for message in snapshot.get("messages", [])
        ) or not any(
            message.get("role") == "bot" and message.get("runId") == run_id
            for message in snapshot.get("messages", [])
        ):
            raise ValueError("Public second session cannot read chat")
    print("public-staging-avatars-personality-chat-session-and-forwarded-ip-passed", flush=True)


def main() -> None:
    arguments = sys.argv[1:]
    minimal_image = None
    if len(arguments) == 3 and arguments[:2] == ["--public-probe", "--minimal-image"]:
        minimal_image = arguments[2]
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", minimal_image):
            raise SystemExit("Expected a full image ID")
    elif arguments not in ([], ["--public-probe"]):
        raise SystemExit("Use --public-probe [--minimal-image IMAGE_ID]")
    public = bool(arguments)
    context = staging_context() if public else None
    token = secrets.token_hex(32) if public else ""
    config = subprocess.run(
        ["ssh", "-G", "sydney-backend-admin"],
        check=True, capture_output=True, text=True, timeout=15,
    ).stdout
    hosts = [line.split(maxsplit=1)[1] for line in config.splitlines()
             if line.startswith("hostname ")]
    if len(hosts) != 1:
        raise ValueError("Maintenance host address unavailable")
    address = ipaddress.ip_address(hosts[0])
    if address.version != 4 or not address.is_global:
        raise ValueError("Maintenance host must have a global IPv4 address")
    directory = Path(__file__).resolve().parent
    source = (directory / "staging-chat-drill.sh").read_text(encoding="utf-8")
    if minimal_image:
        source = replace_once(
            source,
            "api_image='sha256:50863f1b5a76c9da9c8525564e1b36c42f87bfea82b0ee6afe5e54715d5af4d4'",
            "api_image='" + minimal_image + "'",
        )
        source = replace_once(
            source,
            "worker_image='sha256:e4cdb8d3f16aebd8efaae0902c29b22c98d0ecda3cac4a1e6bbb7b0ae72cf16c'",
            "worker_image='sha256:31167f6506ee1e39f91dfc6435c1530e806426b2b586dcc168ada1fefeafb404'",
        )
    start = 'mkdir "$scratch/caddy"\n'
    end = 'docker exec -i "${prefix}-web" node --input-type=module <<\'NODE\'\n'
    if source.count(start) != 1 or source.count(end) != 2:
        raise ValueError("Unexpected staging chat script layout")
    prefix, remainder = source.split(start, 1)
    _, suffix = remainder.split(end, 1)
    source = prefix + STAGING_CADDY + end + suffix
    source = replace_once(source, "recovery_created=0\n", "recovery_created=0\ntimer_started=0\n")
    source = replace_once(source, "network_created=0\n", "network_created=0\negress_created=0\n")
    source = replace_once(
        source,
        '  if (( network_created )); then docker network rm "$prefix" >/dev/null 2>&1 || status=1; fi\n',
        '  if (( egress_created )); then docker network rm "${prefix}-egress" >/dev/null 2>&1 || status=1; fi\n'
        '  if (( network_created )); then docker network rm "$prefix" >/dev/null 2>&1 || status=1; fi\n',
    )
    source = replace_once(
        source,
        '  if (( web_created )); then docker rm -f "${prefix}-web" >/dev/null 2>&1 || status=1; fi\n',
        '  if (( timer_started )) && ! docker inspect "$caddy_id" >/dev/null 2>&1; then\n'
        '    systemctl stop "${prefix}-caddy-cleanup.timer" || status=1\n'
        '  fi\n'
        '  if (( web_created )); then docker rm -f "${prefix}-web" >/dev/null 2>&1 || status=1; fi\n',
    )
    source = replace_once(
        source, "for (let attempt = 0; attempt < 60; attempt++) {\n  try {\n",
        "for (let attempt = 0; attempt < 240; attempt++) {\n  try {\n",
    )
    source = replace_once(
        source,
        'console.log("candidate-caddy-https-chat-and-isolation-passed");\nNODE\n',
        'console.log("candidate-caddy-https-chat-and-isolation-passed");\nNODE\n' + OUTSIDER_PROBE,
    )
    source = replace_once(
        source,
        'headers: { host: "192.0.2.10", origin: "https://192.0.2.10",\n',
        'headers: { host: "192.0.2.10", origin: "https://192.0.2.10",\n'
        '        ...(process.env.SYDNEY_STAGING_TOKEN ? { "x-sydney-staging": process.env.SYDNEY_STAGING_TOKEN } : {}),\n',
    )
    payload = {
        "ip": str(address),
        "script": base64.b64encode(source.encode()).decode(),
        "candidate": base64.b64encode((directory / "Caddyfile.ip.example").read_bytes()).decode(),
        "token": token,
    }
    code = "import base64;exec(base64.b64decode(%r))" % base64.b64encode(REMOTE.encode()).decode()
    command = " ".join(shlex.quote(arg) for arg in ["/usr/bin/python3", "-I", "-c", code])
    ssh = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "sydney-backend-admin"]
    if not public:
        subprocess.run(ssh + [command], input=json.dumps(payload).encode(), check=True)
        return
    process = subprocess.Popen(
        ssh + [command], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, text=True, encoding="utf-8",
    )
    assert process.stdin is not None and process.stdout is not None
    process.stdin.write(json.dumps(payload))
    process.stdin.close()
    probe_error = None
    probe_ran = False
    for line in process.stdout:
        if not line.startswith("browser-probe-ready="):
            print(line, end="", flush=True)
            continue
        raw_address, separator, prefix = line.strip().partition("=")[2].partition(",")
        address_obj = ipaddress.ip_address(raw_address)
        if not address_obj.is_private or separator != "," or not re.fullmatch(
            r"sydney-chat-[0-9a-f]{16}", prefix
        ):
            raise ValueError("Unexpected temporary container identity")
        print("public-probe-ready", flush=True)
        try:
            public_probe(str(address), token, context)
            probe_ran = True
        except Exception as error:
            probe_error = error
        finally:
            try:
                subprocess.run(
                    ssh + ["docker", "exec", prefix + "-web", "touch",
                           "/tmp/sydney-browser-probe-finished"],
                    check=True, timeout=15,
                )
            except Exception as error:
                probe_error = probe_error or error
    status = process.wait()
    if status != 0 or not probe_ran or probe_error:
        raise SystemExit("Staging or public probe failed") from probe_error


if __name__ == "__main__":
    main()
