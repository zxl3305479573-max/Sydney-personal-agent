#!/bin/bash
set -Eeuo pipefail
umask 077

image="${1:?Pass an existing Caddy image ID}"
[[ "$image" =~ ^sha256:[0-9a-f]{64}$ ]]
[[ -z "${DOCKER_HOST:-}" || "$DOCKER_HOST" == unix://* ]]
for tool in docker od; do command -v "$tool" >/dev/null; done
[[ "$(docker context inspect "$(docker context show)" --format '{{.Endpoints.docker.Host}}')" == unix://* ]]
docker image inspect "$image" >/dev/null

owner="$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
[[ "$owner" =~ ^[0-9a-f]{24}$ ]]
name="sydney-caddy-storage-$owner"
container=""
cleanup() {
  local status="$?"
  local actual_id actual_owner
  trap - EXIT
  if [[ -n "$container" ]]; then
    if read -r actual_id actual_owner < <(docker inspect --format '{{.Id}} {{index .Config.Labels "sydney.storage-lab"}}' "$container" 2>/dev/null) &&
       [[ "$actual_id" == "$container" && "$actual_owner" == "$owner" ]]; then
      docker rm -fv "$container" >/dev/null || status=1
    else
      echo "Cannot confirm temporary container identity; inspect $name" >&2
      status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

container="$(docker create --name "$name" --label "sydney.storage-lab=$owner" \
  --pull=never --network none --read-only --tmpfs /data --tmpfs /config --tmpfs /tmp \
  --memory 128m --cpus 0.5 --pids-limit 128 \
  --entrypoint caddy "$image" run)"
[[ "$container" =~ ^[0-9a-f]{64}$ ]]
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$container")" == none ]]
docker start "$container" >/dev/null

for attempt in {1..50}; do
  if docker exec "$container" wget -qO- http://127.0.0.1:2019/config/ >/dev/null 2>&1; then break; fi
  sleep 0.2
done

docker exec -i "$container" caddy reload --config - >/dev/null 2>&1 <<'JSON'
{"apps":{"http":{"servers":{"original":{"listen":["127.0.0.1:18080"],"routes":[{"handle":[{"handler":"static_response","body":"original"}]}]}}}}}
JSON
[[ "$(docker exec "$container" wget -qO- http://127.0.0.1:18080)" == original ]]
snapshot="$(docker exec "$container" wget -qO- http://127.0.0.1:2019/config/)"
[[ -n "$snapshot" ]]

docker exec -i "$container" caddy reload --config - >/dev/null 2>&1 <<'JSON'
{"apps":{"http":{"servers":{"original":{"listen":["127.0.0.1:18080"],"routes":[{"handle":[{"handler":"static_response","body":"original"}]}]},"test-ip":{"listen":["127.0.0.1:18443"],"routes":[{"handle":[{"handler":"static_response","body":"candidate"}]}],"tls_connection_policies":[{"default_sni":"127.0.0.1"}]}}},"tls":{"certificates":{"automate":["127.0.0.1"]},"automation":{"policies":[{"subjects":["127.0.0.1"],"issuers":[{"module":"internal"}],"storage":{"module":"file_system","root":"/tmp/ip-stage"}}]}}}}
JSON

for attempt in {1..100}; do
  if [[ "$(docker exec "$container" wget -qO- --no-check-certificate https://127.0.0.1:18443 2>/dev/null || true)" == candidate ]]; then break; fi
  sleep 0.2
done
[[ "$(docker exec "$container" wget -qO- http://127.0.0.1:18080)" == original ]]
[[ "$(docker exec "$container" wget -qO- --no-check-certificate https://127.0.0.1:18443)" == candidate ]]
docker exec "$container" sh -ec 'find /tmp/ip-stage -type f -name "*.crt" | grep -q .'
if docker exec "$container" sh -ec 'find /data -type f -path "*/certificates/*" -name "*.crt" | grep -q .'; then
  echo "Unexpected leaf certificate in default storage" >&2
  exit 1
fi
echo "Synthetic IP certificate issued into policy storage; original HTTP route retained."

printf '%s' "$snapshot" | docker exec -i "$container" caddy reload --config - >/dev/null 2>&1
[[ "$(docker exec "$container" wget -qO- http://127.0.0.1:18080)" == original ]]
if docker exec "$container" wget -qO- --no-check-certificate https://127.0.0.1:18443 >/dev/null 2>&1; then
  echo "Synthetic IP route remains reachable after rollback" >&2
  exit 1
fi
echo "Runtime configuration restored; synthetic IP listener closed."
echo "Scope: internal CA in a network-isolated container, not ACME or production rollback."
