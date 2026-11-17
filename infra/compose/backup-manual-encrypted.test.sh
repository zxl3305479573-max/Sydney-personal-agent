#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
test_dir="$(mktemp -d)"
trap 'rm -rf -- "$test_dir"' EXIT
mkdir "$test_dir/bin" "$test_dir/backups" "$test_dir/data"
chmod 700 "$test_dir/backups"
export PATH="$test_dir/bin:$PATH"
export RAKAZO_BACKUP_ROOT="$test_dir/backups"
export RAKAZO_BACKUP_PROJECT=example
export RAKAZO_BACKUP_API_CONTAINER=example-api
export RAKAZO_BACKUP_DB_CONTAINER=example-db
export FAKE_APPDATA="$test_dir/data"
export FAKE_COUNTER_FILE="$test_dir/check-count"
export FAKE_EVENT_FILE="$test_dir/container-change"
export FAKE_API_ID="$(printf '%064d' 1)" FAKE_DB_ID="$(printf '%064d' 2)"
export FAKE_NEW_ID="$(printf '%064d' 3)"
export RAKAZO_BACKUP_MAX_KIB=1024 RAKAZO_BACKUP_RESERVE_KIB=1
if [[ "$(uname -s)" == MINGW* ]]; then
  ulimit() { [[ "${FAIL_ULIMIT:-0}" == 0 ]]; }
  export -f ulimit
  printf 'Git Bash: file-size limit is mocked; kernel enforcement is not tested.\n'
fi

cat > "$test_dir/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -eu
[[ "$1" == --host && "$2" == unix:///proc/self/fd/100 ]] || exit 5
shift 2
if [[ "$1" == inspect ]]; then
  container="${@: -1}"
  changed=0
  [[ ! -e "$FAKE_EVENT_FILE" ]] || changed=1
  if [[ "$*" == *".Mounts"* ]]; then
    if [[ "$*" == *"json ."* ]]; then
      if [[ "${FAKE_CHANGE:-}" == mount* && "$changed" == 1 ]]; then
        printf '{"Type":"bind","RW":false}\n'
      else
        printf '{"Type":"bind","RW":true}\n'
      fi
    elif [[ "${FAKE_CHANGE:-}" == mount* && "$changed" == 1 ]]; then
      printf 'bind %s\n' "$FAKE_APPDATA/changed"
    else
      printf 'bind %s\n' "$FAKE_APPDATA"
    fi
  elif [[ "$container" == example-api || "$container" == "$FAKE_API_ID" ]]; then
    id="$FAKE_API_ID"
    if [[ "$container" == example-api && "${FAKE_CHANGE:-}" == api-recreate* && "$changed" == 1 ]]; then id="$FAKE_NEW_ID"; fi
    printf '%s true 2026-01-01T00:00:00Z 12345 example api\n' "$id"
  elif [[ "$container" == example-db || "$container" == "$FAKE_DB_ID" ]]; then
    id="$FAKE_DB_ID"
    started=2026-01-01T00:00:00Z
    if [[ "$container" == example-db && "${FAKE_CHANGE:-}" == db-recreate && "$changed" == 1 ]]; then id="$FAKE_NEW_ID"; fi
    if [[ "${FAKE_CHANGE:-}" == db-restart && "$changed" == 1 ]]; then started=2026-01-02T00:00:00Z; fi
    printf '%s true %s 23456 example postgres\n' "$id" "$started"
  else
    exit 1
  fi
elif [[ "$1" == exec ]]; then
  [[ "${2:-}" != -i && "${2:-}" != --interactive ]] || exit 93
  [[ "${2:-}" == "$FAKE_DB_ID" ]] || exit 95
  [[ "${3:-}" == sh && "${4:-}" == -c ]] || exit 97
  [[ "${5:-}" == 'pg_dump --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB"' ]] || exit 98
  if [[ "${CHECK_EXEC_STDIN:-0}" == 1 ]] && IFS= read -r unexpected; then exit 94; fi
  [[ "${FAIL_DUMP:-0}" == 0 ]] || exit 2
  if [[ -n "${FAKE_CHANGE:-}" && "$FAKE_CHANGE" != *-during-tar ]]; then : > "$FAKE_EVENT_FILE"; fi
  if [[ "${ROTATE_RECIPIENTS:-0}" == 1 ]]; then printf 'rotated\n' > "$RAKAZO_BACKUP_AGE_RECIPIENTS_FILE"; fi
  printf 'fake database payload'
else
  exit 3
fi
EOF
cat > "$test_dir/bin/age" <<'EOF'
#!/usr/bin/env bash
set -eu
[[ "${FAIL_AGE:-0}" == 0 ]] || exit 1
[[ "${FAIL_RECIPIENT_FILE:-0}" == 0 || "$*" != *" -R "* ]] || exit 1
args=("$@")
for ((index=0; index<${#args[@]}; index++)); do
  if [[ "${args[index]}" == -R ]]; then
    [[ -z "${RECIPIENT_LOG:-}" ]] || cat "${args[index+1]}" >> "$RECIPIENT_LOG"
  fi
done
payload="$(cat)"
[[ "${FAIL_AGE_STREAM:-0}" == 0 || -z "$payload" ]] || exit 1
[[ "${FAIL_ARCHIVE_AGE:-0}" == 0 || "$payload" != "fake archive payload" ]] || exit 1
printf 'age-encryption.org/v1\n'
if [[ "${LARGE_AGE_STREAM:-0}" == 1 && -n "$payload" ]]; then
  head -c 2048 /dev/zero
fi
EOF
cat > "$test_dir/bin/tar" <<'EOF'
#!/usr/bin/env bash
set -eu
[[ "${FAIL_TAR:-0}" == 0 ]] || exit 1
[[ "$*" == *"-C /proc/self/fd/8"* && -d /proc/self/fd/8 ]] || exit 96
if [[ "${FAKE_CHANGE:-}" == source-during-tar ]]; then
  mv -- "$FAKE_APPDATA" "$FAKE_APPDATA-old"
  mkdir -- "$FAKE_APPDATA"
  stat -Lc '%d:%i' /proc/self/fd/8 > "$FAKE_EVENT_FILE.pinned"
fi
if [[ "${FAKE_CHANGE:-}" == *-during-tar ]]; then : > "$FAKE_EVENT_FILE"; fi
printf 'fake archive payload'
EOF
cat > "$test_dir/bin/stat" <<'EOF'
#!/usr/bin/env bash
set -eu
if [[ "${@: -1}" == /proc/12345/root/data ]]; then
  path="${FAKE_CONTAINER_APPDATA:-$FAKE_APPDATA}"
  if [[ "${FAKE_CHANGE:-}" == source-during-tar && -e "$FAKE_EVENT_FILE" ]]; then path="$FAKE_APPDATA-old"; fi
  exec /usr/bin/stat -Lc '%d:%i' -- "$path"
fi
exec /usr/bin/stat "$@"
EOF
cat > "$test_dir/bin/python3" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == -c ]]; then
  if [[ "$3" == mounts ]]; then
    [[ "${FAKE_NESTED_MOUNT:-0}" == 0 ]] || exit 1
    [[ "${FAKE_CHANGE:-}" != nested-during-tar || ! -e "$FAKE_EVENT_FILE" ]] || exit 1
    exit 0
  fi
  [[ "${FAIL_DAEMON:-0}" == 0 ]] || exit 1
  if [[ "$3" == start ]]; then
    export _RAKAZO_GUARDED=1 _RAKAZO_SOCKET_FD=100
    exec bash "$4"
  fi
  count=0
  [[ ! -f "$FAKE_COUNTER_FILE" ]] || read -r count < "$FAKE_COUNTER_FILE"
  count=$((count + 1))
  printf '%s\n' "$count" > "$FAKE_COUNTER_FILE"
  [[ "${FAKE_FAIL_CHECK_AT:-0}" != "$count" ]]
  exit
fi
cat >/dev/null
[[ "${FAIL_DAEMON:-0}" == 0 ]]
EOF
cat > "$test_dir/bin/df" <<'EOF'
#!/usr/bin/env bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n'
printf 'fake 100000 0 %s 1%% /\n' "${FAKE_FREE_KIB:-50000}"
EOF
cat > "$test_dir/bin/rm" <<'EOF'
#!/usr/bin/env bash
if [[ "${FAIL_RECIPIENT_CLEANUP:-0}" == 1 && "${@: -1}" == */.recipients.* ]]; then
  exit 1
fi
exec /usr/bin/rm "$@"
EOF
if ! command -v flock >/dev/null; then
  cat > "$test_dir/bin/flock" <<'EOF'
#!/usr/bin/env bash
[[ "${FAKE_LOCK_HELD:-0}" == 0 ]]
EOF
  export FAKE_FLOCK=1
  printf 'flock is mocked; operating-system lock enforcement is not tested.\n'
fi
chmod +x "$test_dir/bin/"*
script="$root/infra/compose/backup-manual-encrypted.sh"

export RAKAZO_BACKUP_SNAPSHOT=missing-recipient
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/$RAKAZO_BACKUP_SNAPSHOT" ]]

export RAKAZO_BACKUP_AGE_RECIPIENTS=age1example
export RAKAZO_BACKUP_SNAPSHOT=success
bash "$script" >"$test_dir/output" 2>&1 || { cat "$test_dir/output"; exit 1; }
[[ -d "$RAKAZO_BACKUP_ROOT/success/CAPTURE_FINISHED" ]]
grep -Fx 'database=postgres custom format; ownership and ACLs included' "$RAKAZO_BACKUP_ROOT/success/METADATA" >/dev/null
(cd "$RAKAZO_BACKUP_ROOT/success" && sha256sum -c SHA256SUMS >/dev/null)
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ -d "$RAKAZO_BACKUP_ROOT/success/CAPTURE_FINISHED" ]]
exec 8>>"$RAKAZO_BACKUP_ROOT/.manual-encrypted.lock"
if [[ "${FAKE_FLOCK:-0}" == 1 ]]; then
  export FAKE_LOCK_HELD=1
else
  flock -n 8
fi
export RAKAZO_BACKUP_SNAPSHOT=lock-conflict
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/lock-conflict" ]]
if [[ "${FAKE_FLOCK:-0}" == 1 ]]; then
  unset FAKE_LOCK_HELD
else
  flock -u 8
fi
exec 8>&-
export RAKAZO_BACKUP_SNAPSHOT=lock-released
bash "$script" >"$test_dir/output" 2>&1 || { cat "$test_dir/output"; exit 1; }
[[ -d "$RAKAZO_BACKUP_ROOT/lock-released/CAPTURE_FINISHED" ]]

printf 'caller-input-remains\n' > "$test_dir/caller-input"
export RAKAZO_BACKUP_SNAPSHOT=stdin-preserved CHECK_EXEC_STDIN=1
{
  bash "$script" >"$test_dir/output" 2>&1 || { cat "$test_dir/output"; exit 1; }
  IFS= read -r remaining
  [[ "$remaining" == caller-input-remains ]]
} < "$test_dir/caller-input"
[[ -d "$RAKAZO_BACKUP_ROOT/stdin-preserved/CAPTURE_FINISHED" ]]
unset CHECK_EXEC_STDIN

mkdir "$test_dir/container-old"
export RAKAZO_BACKUP_SNAPSHOT=old-container-view FAKE_CONTAINER_APPDATA="$test_dir/container-old"
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/old-container-view" ]]
unset FAKE_CONTAINER_APPDATA

export RAKAZO_BACKUP_SNAPSHOT=nested-mount FAKE_NESTED_MOUNT=1
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/nested-mount" ]]
unset FAKE_NESTED_MOUNT

for change in api-recreate db-recreate db-restart mount api-recreate-during-tar mount-during-tar source-during-tar nested-during-tar; do
  rm -f "$FAKE_EVENT_FILE"
  export RAKAZO_BACKUP_SNAPSHOT="change-$change" FAKE_CHANGE="$change"
  if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
  [[ -f "$FAKE_EVENT_FILE" && ! -e "$RAKAZO_BACKUP_ROOT/change-$change/CAPTURE_FINISHED" ]]
  if [[ "$change" == source-during-tar ]]; then
    [[ "$(cat "$FAKE_EVENT_FILE.pinned")" == "$(stat -Lc '%d:%i' "$FAKE_APPDATA-old")" ]]
    rmdir "$FAKE_APPDATA"
    mv -- "$FAKE_APPDATA-old" "$FAKE_APPDATA"
  fi
done
unset FAKE_CHANGE
rm -f "$FAKE_EVENT_FILE"

export RAKAZO_BACKUP_SNAPSHOT=dump-failure FAIL_DUMP=1
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/dump-failure/CAPTURE_FINISHED" ]]
unset FAIL_DUMP
export RAKAZO_BACKUP_SNAPSHOT=tar-failure FAIL_TAR=1
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/tar-failure/CAPTURE_FINISHED" ]]
unset FAIL_TAR
export RAKAZO_BACKUP_SNAPSHOT=age-failure FAIL_AGE=1
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/age-failure" ]]
unset FAIL_AGE
export RAKAZO_BACKUP_SNAPSHOT=wrong-project RAKAZO_BACKUP_PROJECT=wrong
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/wrong-project" ]]
export RAKAZO_BACKUP_PROJECT=example RAKAZO_BACKUP_SNAPSHOT=stream-failure FAIL_AGE_STREAM=1
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/stream-failure/CAPTURE_FINISHED" ]]
unset FAIL_AGE_STREAM
export RAKAZO_BACKUP_SNAPSHOT=archive-stream-failure FAIL_ARCHIVE_AGE=1
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ -f "$RAKAZO_BACKUP_ROOT/archive-stream-failure/rakazo.dump.age" ]]
[[ ! -e "$RAKAZO_BACKUP_ROOT/archive-stream-failure/CAPTURE_FINISHED" ]]
unset FAIL_ARCHIVE_AGE
export RAKAZO_BACKUP_SNAPSHOT=remote DOCKER_HOST=tcp://example.invalid:2375
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/remote" ]]
unset DOCKER_HOST
export RAKAZO_BACKUP_SNAPSHOT=bad-daemon FAIL_DAEMON=1
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/bad-daemon" ]]
unset FAIL_DAEMON
rm -f "$FAKE_COUNTER_FILE"
export RAKAZO_BACKUP_SNAPSHOT=daemon-restart FAKE_FAIL_CHECK_AT=9
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/daemon-restart/CAPTURE_FINISHED" ]]
unset FAKE_FAIL_CHECK_AT
export RAKAZO_BACKUP_SNAPSHOT=space FAKE_FREE_KIB=1
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/space" ]]
unset FAKE_FREE_KIB
export RAKAZO_BACKUP_SNAPSHOT=budget RAKAZO_BACKUP_MAX_KIB=1 LARGE_AGE_STREAM=1
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/budget/CAPTURE_FINISHED" ]]
unset LARGE_AGE_STREAM
export RAKAZO_BACKUP_MAX_KIB=1024
export RAKAZO_BACKUP_SNAPSHOT=wrong-service RAKAZO_BACKUP_DB_CONTAINER=example-api
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/wrong-service" ]]
export RAKAZO_BACKUP_DB_CONTAINER=example-db
printf 'invalid\n' > "$test_dir/recipients"
export RAKAZO_BACKUP_SNAPSHOT=bad-recipients RAKAZO_BACKUP_AGE_RECIPIENTS_FILE="$test_dir/recipients" FAIL_RECIPIENT_FILE=1
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/bad-recipients" ]]
unset RAKAZO_BACKUP_AGE_RECIPIENTS_FILE FAIL_RECIPIENT_FILE
printf 'original\n' > "$test_dir/recipients"
export RAKAZO_BACKUP_SNAPSHOT=rotated-recipients RAKAZO_BACKUP_AGE_RECIPIENTS_FILE="$test_dir/recipients"
export ROTATE_RECIPIENTS=1 RECIPIENT_LOG="$test_dir/recipient-log"
bash "$script" >"$test_dir/output" 2>&1 || { cat "$test_dir/output"; exit 1; }
[[ "$(cat "$RECIPIENT_LOG")" == $'original\noriginal\noriginal' ]]
[[ "$(cat "$test_dir/recipients")" == rotated ]]
[[ -d "$RAKAZO_BACKUP_ROOT/rotated-recipients/CAPTURE_FINISHED" ]]
[[ -z "$(find "$RAKAZO_BACKUP_ROOT" -maxdepth 1 -name '.recipients.*' -print)" ]]
unset ROTATE_RECIPIENTS RECIPIENT_LOG
export RAKAZO_BACKUP_SNAPSHOT=cleanup-failure FAIL_RECIPIENT_CLEANUP=1
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/cleanup-failure/CAPTURE_FINISHED" ]]
[[ -f "$RAKAZO_BACKUP_ROOT/cleanup-failure/SHA256SUMS" ]]
grep -q 'Recipients temporary directory cleanup failed' "$test_dir/output"
export RAKAZO_BACKUP_SNAPSHOT=cleanup-after-error FAIL_DUMP=1
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$RAKAZO_BACKUP_ROOT/cleanup-after-error/CAPTURE_FINISHED" ]]
grep -q 'Recipients temporary directory cleanup failed' "$test_dir/output"
unset RAKAZO_BACKUP_AGE_RECIPIENTS_FILE FAIL_RECIPIENT_CLEANUP FAIL_DUMP
export RAKAZO_BACKUP_SNAPSHOT=noncanonical RAKAZO_BACKUP_ROOT="$test_dir/backups/../backups"
if bash "$script" >"$test_dir/output" 2>&1; then exit 1; fi
[[ ! -e "$test_dir/backups/noncanonical" ]]
printf 'All manual backup tests passed.\n'
