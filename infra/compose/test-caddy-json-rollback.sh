#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

image="${1:?Pass an existing Caddy image ID}"
[[ "$image" =~ ^sha256:[0-9a-f]{64}$ ]]
[[ -z "${DOCKER_HOST:-}" || "$DOCKER_HOST" == unix://* ]]
for tool in docker openssl python3 mktemp sha256sum grep; do command -v "$tool" >/dev/null; done
[[ "$(docker context inspect "$(docker context show)" --format '{{.Endpoints.docker.Host}}')" == unix://* ]]
docker image inspect "$image" | python3 -c '
import json
import sys

image = json.load(sys.stdin)[0]
volumes = set((image.get("Config") or {}).get("Volumes") or {})
unexpected = volumes - {"/data", "/config"}
if unexpected:
    sys.exit("Unsupported image volumes: " + ", ".join(sorted(unexpected)))
'

lab_dir="$(mktemp -d)"
lab_owner="${lab_dir##*.}"
lab_name="caddy-json-rollback-${lab_owner}"
container=""
create_attempted=0
create_failed=0
cleanup() {
  local status="$?"
  local cleanup_status=0
  trap - EXIT
  if [[ "$create_attempted" == 1 ]]; then
    local inspected_id owner target
    target="${container:-$lab_name}"
    if read -r inspected_id owner < <(docker inspect --format '{{.Id}} {{index .Config.Labels "sydney.json-rollback-lab"}}' "$target" 2>/dev/null); then
      if [[ "$inspected_id" =~ ^[0-9a-f]{64}$ && "$owner" == "$lab_owner" && ( -z "$container" || "$inspected_id" == "$container" ) ]]; then
        docker rm -fv "$inspected_id" >/dev/null 2>&1 || cleanup_status=1
      else
        echo "Container name collision; refusing removal: $lab_name" >&2
        cleanup_status=1
      fi
    elif [[ -n "$container" || "$create_failed" == 1 ]]; then
      echo "Cannot confirm container cleanup: $lab_name" >&2
      cleanup_status=1
    fi
    if [[ "$create_failed" == 1 ]]; then
      echo "Create outcome uncertain; check for late creation: $lab_name" >&2
      cleanup_status=1
    fi
  fi
  rm -f -- "$lab_dir/test.key" "$lab_dir/test.crt" "$lab_dir/Caddyfile" \
    "$lab_dir/candidate.Caddyfile" "$lab_dir/before.json" \
    "$lab_dir/invalid-response.txt" || cleanup_status=1
  rmdir -- "$lab_dir" || cleanup_status=1
  if [[ "$cleanup_status" == 0 ]]; then
    echo "Cleanup: temporary container and files removed"
  else
    echo "Cleanup failed; inspect $lab_name and $lab_dir" >&2
    status=1
  fi
  exit "$status"
}
trap cleanup EXIT

openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$lab_dir/test.key" -out "$lab_dir/test.crt" \
  -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' >/dev/null 2>&1

cat >"$lab_dir/Caddyfile" <<'CADDY'
{
	admin 127.0.0.1:2019
	auto_https off
}
http://127.0.0.1:18080 {
	respond "original-http"
}
https://localhost:18443 {
	tls /lab/test.crt /lab/test.key
	respond "original-https"
}
CADDY
cat >"$lab_dir/candidate.Caddyfile" <<'CADDY'
{
	admin 127.0.0.1:2019
	auto_https off
}
http://127.0.0.1:18080 {
	respond "candidate-http"
}
https://localhost:18443 {
	tls /lab/test.crt /lab/test.key
	respond "candidate-https"
}
CADDY
create_attempted=1
if ! container="$(docker create --name "$lab_name" --label "sydney.json-rollback-lab=$lab_owner" \
  --pull=never --network none --read-only --tmpfs /data --tmpfs /config \
  --memory 128m --cpus 0.5 --pids-limit 128 \
  --mount "type=bind,src=$lab_dir,dst=/lab,readonly" \
  --entrypoint caddy "$image" run --config /lab/Caddyfile --adapter caddyfile)"; then
  create_failed=1
  exit 1
fi
[[ "$container" =~ ^[0-9a-f]{64}$ ]]
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$container")" == none ]]
docker start "$container" >/dev/null

read_response() {
  docker exec "$container" wget -qO- "$1"
}
for attempt in {1..30}; do
  if [[ "$(read_response http://127.0.0.1:18080 2>/dev/null || true)" == original-http ]]; then break; fi
  sleep 0.2
done
[[ "$(read_response http://127.0.0.1:18080)" == original-http ]]
[[ "$(docker exec "$container" wget -qO- --no-check-certificate https://localhost:18443)" == original-https ]]
echo "Initial synthetic HTTP and HTTPS routes: original"

docker exec "$container" wget -qO- http://127.0.0.1:2019/config/ >"$lab_dir/before.json"
LAB_DIR="$lab_dir" python3 - <<'PY'
import json
import os
from pathlib import Path

data = Path(os.environ["LAB_DIR"], "before.json").read_bytes()
config = json.loads(data)
pairs = config["apps"]["tls"]["certificates"]["load_files"]
assert len(pairs) == 1, pairs
assert pairs[0]["certificate"] == "/lab/test.crt" and pairs[0]["key"] == "/lab/test.key", pairs
assert b"PRIVATE KEY" not in data
print("Snapshot is valid JSON and references only synthetic certificate paths.")
PY
printf 'Snapshot SHA-256: '
sha256sum "$lab_dir/before.json" | cut -d' ' -f1

docker exec "$container" caddy validate --config /lab/candidate.Caddyfile --adapter caddyfile >/dev/null 2>&1
docker exec "$container" caddy reload --config /lab/candidate.Caddyfile --adapter caddyfile >/dev/null 2>&1
[[ "$(read_response http://127.0.0.1:18080)" == candidate-http ]]
[[ "$(docker exec "$container" wget -qO- --no-check-certificate https://localhost:18443)" == candidate-https ]]
echo "Candidate reload: synthetic HTTP and HTTPS routes changed"

if docker exec "$container" wget -S -O - --header='Content-Type: application/json' \
  --post-data='{"invalid":' http://127.0.0.1:2019/load > /dev/null 2>"$lab_dir/invalid-response.txt"; then
  echo "Invalid JSON was unexpectedly accepted" >&2
  exit 1
fi
if ! grep -Eq '^[[:space:]]*HTTP/[0-9.]+ 400([[:space:]]|$)' "$lab_dir/invalid-response.txt"; then
  echo "Invalid JSON request did not receive HTTP 400 from Caddy" >&2
  cat "$lab_dir/invalid-response.txt" >&2
  exit 1
fi
[[ "$(read_response http://127.0.0.1:18080)" == candidate-http ]]
[[ "$(docker exec "$container" wget -qO- --no-check-certificate https://localhost:18443)" == candidate-https ]]
echo "Invalid JSON rejected with HTTP 400; candidate HTTP and HTTPS routes remain active"

docker exec -i "$container" caddy reload --config - <"$lab_dir/before.json" >/dev/null 2>&1
[[ "$(read_response http://127.0.0.1:18080)" == original-http ]]
[[ "$(docker exec "$container" wget -qO- --no-check-certificate https://localhost:18443)" == original-https ]]
echo "JSON snapshot reload: synthetic HTTP and HTTPS routes restored"
echo "Scope: isolated container only; no production configuration, certificates, ports, volumes or ACME."
