#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

image="${1:?Pass the existing Caddy image ID}"
mode="${2:-baseline}"
[[ "$image" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 1
[[ "$mode" == baseline || "$mode" == default-sni || "$mode" == strict || "$mode" == host-guard-negative || "$mode" == sni-guard || "$mode" == sni-guard-case-negative ]] || exit 1
[[ -z "${DOCKER_HOST:-}" || "$DOCKER_HOST" == unix://* ]] || {
  echo "A local Docker daemon is required" >&2
  exit 1
}
for command in docker openssl nsenter timeout mktemp python3; do
  command -v "$command" >/dev/null
done
docker image inspect "$image" >/dev/null
context_host="$(docker context inspect "$(docker context show)" --format '{{.Endpoints.docker.Host}}')"
[[ "$context_host" == unix://* ]] || {
  echo "Docker context must use a local Unix socket" >&2
  exit 1
}
lab_dir="$(mktemp -d)"
lab_container=""
cleanup() {
  local status="$?"
  trap - EXIT
  if [[ -n "$lab_container" ]]; then
    docker rm -f "$lab_container" >/dev/null 2>&1 || {
      echo "Could not remove test container $lab_container" >&2
      status=1
    }
  fi
  rm -f -- "$lab_dir/domain.key" "$lab_dir/domain.crt" "$lab_dir/ip.key" "$lab_dir/ip.crt" "$lab_dir/Caddyfile" "$lab_dir/no-sni.err" "$lab_dir/response.bin" || status=1
  rmdir -- "$lab_dir" 2>/dev/null || {
    echo "Could not remove test directory $lab_dir" >&2
    status=1
  }
  exit "$status"
}
trap cleanup EXIT

openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$lab_dir/domain.key" -out "$lab_dir/domain.crt" \
  -subj '/CN=site.example.test' \
  -addext 'subjectAltName=DNS:site.example.test' >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$lab_dir/ip.key" -out "$lab_dir/ip.crt" \
  -subj '/CN=192.0.2.10' \
  -addext 'subjectAltName=IP:192.0.2.10' >/dev/null 2>&1

cat >"$lab_dir/Caddyfile" <<'CADDY'
{
	admin off
	auto_https off
CADDY
if [[ "$mode" != baseline ]]; then
  printf '\tdefault_sni 192.0.2.10\n' >>"$lab_dir/Caddyfile"
fi
if [[ "$mode" == strict ]]; then
  printf '\tservers {\n\t\tstrict_sni_host on\n\t}\n' >>"$lab_dir/Caddyfile"
fi
cat >>"$lab_dir/Caddyfile" <<'CADDY'
}
https://site.example.test:18443 {
	bind 127.0.0.1
	tls /lab/domain.crt /lab/domain.key
	route {
CADDY
if [[ "$mode" == host-guard-negative ]]; then
  printf '\t@unexpected not host site.example.test 192.0.2.10\n\trespond @unexpected 421\n' >>"$lab_dir/Caddyfile"
fi
if [[ "$mode" == sni-guard ]]; then
  printf '\t@unexpected expression `{http.request.tls.server_name}.lowerAscii() != "SiTe.ExAmPlE.TeSt".lowerAscii()`\n\trespond @unexpected "rejected" 421\n' >>"$lab_dir/Caddyfile"
elif [[ "$mode" == sni-guard-case-negative ]]; then
  printf '\t@unexpected expression `{http.request.tls.server_name} != "site.example.test"`\n\trespond @unexpected "rejected" 421\n' >>"$lab_dir/Caddyfile"
fi
cat >>"$lab_dir/Caddyfile" <<'CADDY'
	handle {
		respond "domain" 200
	}
	}
}
https://192.0.2.10:18443 {
	bind 127.0.0.1
	tls /lab/ip.crt /lab/ip.key
	route {
CADDY
if [[ "$mode" == host-guard-negative ]]; then
  printf '\t@unexpected not host site.example.test 192.0.2.10\n\trespond @unexpected 421\n' >>"$lab_dir/Caddyfile"
fi
if [[ "$mode" == sni-guard || "$mode" == sni-guard-case-negative ]]; then
  printf '\t@unexpected expression `{http.request.tls.server_name} != "" && {http.request.tls.server_name} != "192.0.2.10"`\n\trespond @unexpected "rejected" 421\n' >>"$lab_dir/Caddyfile"
fi
cat >>"$lab_dir/Caddyfile" <<'CADDY'
	handle {
		respond "ip" 200
	}
	}
}
CADDY

lab_container="$(docker create --pull=never --network none \
  --read-only --tmpfs /config --tmpfs /data \
  --memory 128m --cpus 0.5 --pids-limit 128 \
  --mount "type=bind,src=$lab_dir,dst=/lab,readonly" \
  --entrypoint caddy "$image" run --config /lab/Caddyfile --adapter caddyfile)"
docker start "$lab_container" >/dev/null
lab_pid="$(docker inspect --format '{{.State.Pid}}' "$lab_container")"
[[ "$lab_pid" =~ ^[1-9][0-9]*$ ]]

domain_result=""
for attempt in {1..20}; do
  domain_result="$(timeout 3 nsenter -t "$lab_pid" -n openssl s_client \
    -connect 127.0.0.1:18443 -servername site.example.test </dev/null 2>/dev/null \
    | openssl x509 -noout -ext subjectAltName 2>/dev/null)" && break
  sleep 0.25
done
[[ "$domain_result" == *"DNS:site.example.test"* ]] || {
  echo "Domain SNI control failed"
  exit 1
}
echo "Mode: $mode"
echo "Domain SNI: $domain_result"

if result="$(timeout 3 nsenter -t "$lab_pid" -n openssl s_client \
  -connect 127.0.0.1:18443 -noservername </dev/null 2>"$lab_dir/no-sni.err" \
  | openssl x509 -noout -ext subjectAltName 2>/dev/null)"; then
  [[ "$mode" != baseline && "$result" == *"IP Address:192.0.2.10"* ]] || {
    echo "Unexpected no-SNI certificate" >&2
    exit 1
  }
  echo "No SNI: $result"
  response="$(printf 'GET / HTTP/1.1\r\nHost: 192.0.2.10:18443\r\nConnection: close\r\n\r\n' \
    | timeout 3 nsenter -t "$lab_pid" -n openssl s_client \
      -quiet -connect 127.0.0.1:18443 -noservername 2>/dev/null)"
  echo "IP HTTP response: ${response%%$'\n'*}"
  if [[ "$mode" == strict ]]; then
    [[ "$response" == HTTP/1.1\ 421* ]] || exit 1
  else
    [[ "$response" == HTTP/1.1\ 200* ]] || exit 1
  fi
  for server_name in none site.example.test unknown.example.test; do
    for host in 192.0.2.10 site.example.test unknown.example.test; do
      tls_name=(-servername "$server_name")
      if [[ "$server_name" == none ]]; then tls_name=(-noservername); fi
      result_code=0
      printf 'GET / HTTP/1.1\r\nHost: %s:18443\r\nConnection: close\r\n\r\n' "$host" \
        | timeout 3 nsenter -t "$lab_pid" -n openssl s_client \
          -quiet -connect 127.0.0.1:18443 "${tls_name[@]}" \
          >"$lab_dir/response.bin" 2>"$lab_dir/no-sni.err" || result_code=$?
      response="$(cat "$lab_dir/response.bin")"
      status="${response%%$'\n'*}"
      body=invalid
      if [[ "$response" == *$'\r\n\r\n'* ]]; then
        body="${response#*$'\r\n\r\n'}"
      elif [[ "$response" == *$'\r\n\r' ]]; then
        body=""
      fi
      route=none
      if [[ "$body" == ip ]]; then route=ip; fi
      if [[ "$body" == domain ]]; then route=domain; fi
      echo "SNI=$server_name Host=$host: ${status:-no response} route=$route"
      if [[ "$server_name" == unknown.example.test ]]; then
        [[ "$result_code" != 0 && "$result_code" != 124 && -z "$response" ]] && grep -Eq 'alert (internal error|unrecognized name)' "$lab_dir/no-sni.err" || exit 1
      elif [[ "$mode" == strict && ( "$server_name" == none || "$host" != site.example.test ) ]]; then
        [[ "$result_code" == 0 && "$status" == HTTP/1.1\ 421* && "$route" == none ]] || exit 1
      elif [[ ( "$mode" == sni-guard || "$mode" == sni-guard-case-negative ) && ( ( "$server_name" == none && "$host" == site.example.test ) || ( "$server_name" == site.example.test && "$host" == 192.0.2.10 ) ) ]]; then
        [[ "$result_code" == 0 && "$status" == HTTP/1.1\ 421* && "$body" == rejected ]] || exit 1
      elif [[ "$host" == unknown.example.test ]]; then
        [[ "$result_code" == 0 && "$status" == HTTP/1.1\ 200* ]] || exit 1
        python3 -c 'import pathlib, sys; header, separator, body = pathlib.Path(sys.argv[1]).read_bytes().partition(b"\r\n\r\n"); sys.exit(0 if separator and not body else 1)' "$lab_dir/response.bin"
      elif [[ "$host" == 192.0.2.10 ]]; then
        [[ "$result_code" == 0 && "$status" == HTTP/1.1\ 200* && "$route" == ip ]] || exit 1
      else
        [[ "$result_code" == 0 && "$status" == HTTP/1.1\ 200* && "$route" == domain ]] || exit 1
      fi
    done
  done
  if [[ "$mode" == sni-guard || "$mode" == sni-guard-case-negative ]]; then
    response="$(printf 'GET / HTTP/1.1\r\nHost: site.example.test:18443\r\nConnection: close\r\n\r\n' \
      | timeout 3 nsenter -t "$lab_pid" -n openssl s_client -quiet \
        -connect 127.0.0.1:18443 -servername SITE.EXAMPLE.TEST 2>"$lab_dir/no-sni.err")"
    if [[ "$mode" == sni-guard ]]; then
      [[ "$response" == HTTP/1.1\ 200* && "$response" == *$'\r\n\r\ndomain' ]] || exit 1
    else
      [[ "$response" == HTTP/1.1\ 421* && "$response" == *$'\r\n\r\nrejected' ]] || exit 1
    fi
    echo "Uppercase domain SNI: ${response%%$'\n'*}"
    response="$(printf 'GET / HTTP/1.1\r\nHost: 192.0.2.10:18443\r\nConnection: close\r\n\r\n' \
      | timeout 3 nsenter -t "$lab_pid" -n openssl s_client -quiet \
        -connect 127.0.0.1:18443 -servername SITE.EXAMPLE.TEST 2>"$lab_dir/no-sni.err")"
    [[ "$response" == HTTP/1.1\ 421* && "$response" == *$'\r\n\r\nrejected' ]] || exit 1
    echo "Uppercase domain SNI with IP Host: HTTP 421"
  fi
else
  [[ "$mode" == baseline && -z "$result" ]] || {
    echo "Default SNI did not return an IP certificate" >&2
    exit 1
  }
  if ! grep -Eq 'alert (internal error|unrecognized name)' "$lab_dir/no-sni.err"; then
    echo "No-SNI baseline failed without the expected TLS alert" >&2
    exit 1
  fi
  echo "No SNI: expected TLS alert"
fi
