#!/bin/bash
set -Eeuo pipefail
umask 077

image="${1:?Pass an existing Caddy image ID}"
public_ip="${2:?Pass the maintenance host public IP}"
[[ "$image" =~ ^sha256:[0-9a-f]{64}$ ]]
[[ -z "${DOCKER_HOST:-}" || "$DOCKER_HOST" == unix://* ]]
for tool in docker python3 openssl ss systemd-run systemctl od; do command -v "$tool" >/dev/null; done
python3 -c 'import ipaddress, sys; address = ipaddress.ip_address(sys.argv[1]); assert address.version == 4 and address.is_global' "$public_ip"
[[ "$(docker context inspect "$(docker context show)" --format '{{.Endpoints.docker.Host}}')" == unix://* ]]
docker image inspect "$image" >/dev/null
[[ -z "$(ss -H -lnt '( sport = :443 )')" ]] || { echo "Port 443 is already in use." >&2; exit 1; }

owner="$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
[[ "$owner" =~ ^[0-9a-f]{24}$ ]]
name="sydney-stage-storage-$owner"
container=""
timer_started=0
cleanup() {
  local status="$?"
  local actual_id actual_owner removed=0
  trap - EXIT
  if [[ -n "$container" ]]; then
    if read -r actual_id actual_owner < <(docker inspect --format '{{.Id}} {{index .Config.Labels "sydney.staging-storage-lab"}}' "$container" 2>/dev/null) &&
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

config="$(python3 -c '
import json, sys
ip = sys.argv[1]
config = {
    "admin": {"disabled": True},
    "apps": {
        "http": {"servers": {"stage": {
            "listen": [":443"],
            "protocols": ["h1", "h2"],
            "automatic_https": {"disable_redirects": True},
            "routes": [{"handle": [{"handler": "static_response", "body": "staging-policy-storage"}]}],
            "tls_connection_policies": [{"default_sni": ip}],
        }}},
        "tls": {
            "certificates": {"automate": [ip]},
            "automation": {"policies": [{
                "subjects": [ip],
                "issuers": [{
                    "module": "acme",
                    "ca": "https://acme-staging-v02.api.letsencrypt.org/directory",
                    "profile": "shortlived",
                    "challenges": {"http": {"disabled": True}},
                }],
                "storage": {"module": "file_system", "root": "/tmp/ip-stage"},
            }]},
        },
    },
}
print(json.dumps(config, separators=(",", ":")))
' "$public_ip")"

container="$(docker create --name "$name" --label "sydney.staging-storage-lab=$owner" \
  --pull=never --network host --read-only --tmpfs /data --tmpfs /config --tmpfs /tmp \
  --cap-drop ALL --cap-add NET_BIND_SERVICE --security-opt no-new-privileges \
  --memory 128m --cpus 0.5 --pids-limit 128 \
  -e "STAGING_CONFIG=$config" --entrypoint sh "$image" -c \
  'printf "%s" "$STAGING_CONFIG" > /tmp/staging.json; exec caddy run --config /tmp/staging.json')"
[[ "$container" =~ ^[0-9a-f]{64}$ ]]
systemd-run --quiet --unit="$name-cleanup" --on-active=150 /usr/bin/docker rm -fv "$container"
timer_started=1
[[ -z "$(ss -H -lnt '( sport = :443 )')" ]] || { echo "Port 443 became occupied." >&2; exit 1; }
docker start "$container" >/dev/null

certificate=""
for attempt in {1..100}; do
  [[ "$(docker inspect --format '{{.State.Running}}' "$container")" == true ]] || {
    echo "Staging container stopped before issuance." >&2
    exit 1
  }
  certificate="$(docker exec "$container" sh -c 'find /tmp/ip-stage -type f -name "*.crt" -print' | head -n 1)"
  [[ -z "$certificate" ]] || break
  sleep 1
done
[[ -n "$certificate" ]] || { echo "Staging certificate was not observed before timeout." >&2; exit 1; }
docker exec "$container" cat "$certificate" | openssl x509 -noout -checkip "$public_ip" >/dev/null
issuer="$(docker exec "$container" cat "$certificate" | openssl x509 -noout -issuer)"
[[ "$issuer" == *"STAGING"* || "$issuer" == *"Fake"* ]] || {
  echo "Certificate issuer does not identify staging." >&2
  exit 1
}
if docker exec "$container" sh -ec 'find /data -type f -path "*/certificates/*" -name "*.crt" | grep -q .'; then
  echo "Unexpected leaf certificate in default storage" >&2
  exit 1
fi
echo "Staging IP certificate issued into policy storage; IP SAN and staging issuer checked."
echo "Scope: maintenance host only; no production configuration or client addresses changed."
