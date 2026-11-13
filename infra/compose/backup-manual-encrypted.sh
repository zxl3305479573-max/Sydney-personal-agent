#!/usr/bin/env bash
set -euo pipefail
umask 077
set -o noclobber

usage() {
  cat <<'EOF'
Usage: backup-manual-encrypted.sh

Required environment:
  RAKAZO_BACKUP_ROOT            Existing private, trusted output directory
  RAKAZO_BACKUP_SNAPSHOT        New snapshot name, unique within the output directory
  RAKAZO_BACKUP_PROJECT         Expected Docker Compose project label
  RAKAZO_BACKUP_API_CONTAINER   Running API container ID or name
  RAKAZO_BACKUP_DB_CONTAINER    Running postgres container ID or name
  RAKAZO_BACKUP_AGE_RECIPIENTS  Space-separated age recipients, and/or:
  RAKAZO_BACKUP_AGE_RECIPIENTS_FILE  Existing age recipients file
  RAKAZO_BACKUP_MAX_KIB         Maximum combined encrypted payload size in KiB
  RAKAZO_BACKUP_RESERVE_KIB     Minimum free space to leave in KiB

The snapshot contains an encrypted database dump and application /data archive,
plus plaintext metadata and checksums. Configuration, encryption keys, Caddy
data, certificates, external object storage, and other volumes are not backed up.
The database and files are captured separately while writers may be active; they
are not a consistent joint snapshot. Stop all writers under an approved plan if
a consistent backup is required. This tool does not stop or start services.
CAPTURE_FINISHED means streams and checksums completed, not that the backup
decrypts, restores, or represents a consistent snapshot. Failed snapshots remain.
The operator must verify container identity, source mounts, recipient ownership,
free space, off-site copy, decryption, and isolated recovery. Space checks and
per-file limits cannot reserve space against other writers or bound all metadata.
Production requires independently isolated backup capacity, such as a dedicated
filesystem or enforced quota; operators must verify its capacity and isolation.
An advisory nonblocking lock coordinates only this tool using the same root.
Requires Linux and a local dockerd sharing this process's mount namespace.
The privileged host, systemd, Docker daemon and administrators must be trusted.
For a systemd-shared listener, socket ownership cannot prove which privileged
process accepts an individual request. Checks cannot stop privileged tampering.
The API container /data view must match the opened source directory. Nested
mounts under either view are rejected when checked. The open
directory pins its root, but concurrent writes, nested mount changes, and
privileged manipulation are not prevented; this is not an atomic snapshot.
EOF
}

if [[ "${1:-}" == "--help" && $# -eq 1 ]]; then
  usage
  exit 0
fi
[[ $# -eq 0 ]] || { usage >&2; exit 2; }

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

root="${RAKAZO_BACKUP_ROOT:-}"
snapshot_name="${RAKAZO_BACKUP_SNAPSHOT:-}"
project="${RAKAZO_BACKUP_PROJECT:-}"
api="${RAKAZO_BACKUP_API_CONTAINER:-}"
database="${RAKAZO_BACKUP_DB_CONTAINER:-}"
max_kib="${RAKAZO_BACKUP_MAX_KIB:-}"
reserve_kib="${RAKAZO_BACKUP_RESERVE_KIB:-}"
[[ "$root" == /* && -d "$root" && ! -L "$root" ]] || fail "Backup root must be an existing absolute directory, not a symlink."
[[ "$snapshot_name" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]*$ ]] || fail "A safe, nonempty snapshot name is required."
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail "A valid explicit Compose project is required."
[[ "$api" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ && "$database" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ && "$api" != "$database" ]] || fail "Distinct explicit API and postgres containers are required."
for value in "$max_kib" "$reserve_kib"; do
  [[ "$value" =~ ^[1-9][0-9]{0,8}$ ]] || fail "Positive explicit size and reserve limits in KiB are required."
done

age_args=()
read -r -a recipients <<<"${RAKAZO_BACKUP_AGE_RECIPIENTS:-}"
for recipient in "${recipients[@]}"; do
  [[ "$recipient" != -* ]] || fail "Invalid age recipient."
  age_args+=(-r "$recipient")
done
recipients_file="${RAKAZO_BACKUP_AGE_RECIPIENTS_FILE:-}"
if [[ -n "$recipients_file" ]]; then
  [[ -r "$recipients_file" && -s "$recipients_file" ]] || fail "Recipients file must be readable and nonempty."
fi
(( ${#age_args[@]} > 0 )) || [[ -n "$recipients_file" ]] || fail "Explicit age recipients are required; plaintext backup is forbidden."
for tool in docker age tar sha256sum realpath date python3 df stat flock; do
  command -v "$tool" >/dev/null || fail "A required backup tool is unavailable."
done
for recipient in "${recipients[@]}"; do
  age --encrypt -r "$recipient" </dev/null >/dev/null 2>&1 || fail "Age recipient validation failed."
done
[[ -z "${DOCKER_HOST:-}" && -z "${DOCKER_CONTEXT:-}" ]] || fail "Docker endpoint overrides are forbidden."
guard_source="$(cat <<'PY'
import fcntl
import json
import os
import re
import socket
import stat
import struct
import subprocess
import sys

SOCKET = "/var/run/docker.sock"
DOCKERD = "/usr/bin/dockerd"

def reject_nested_mounts(mountinfo, root):
    if not root.startswith("/") or "\n" in root:
        raise ValueError("invalid mount root")
    prefix = root.rstrip("/") + "/"
    seen = False
    with open(mountinfo, encoding="utf-8", errors="strict") as source:
        for line in source:
            fields = line.rstrip("\n").split(" ")
            if len(fields) < 10 or "-" not in fields[6:]:
                raise ValueError("invalid mountinfo")
            encoded = fields[4]
            if re.search(r"\\(?![0-7]{3})", encoded):
                raise ValueError("invalid mount escape")
            path = re.sub(r"\\([0-7]{3})", lambda match: chr(int(match.group(1), 8)), encoded)
            if not path.startswith("/"):
                raise ValueError("invalid mountpoint")
            seen = True
            if path.startswith(prefix) and path != root:
                raise ValueError("nested mount")
    if not seen:
        raise ValueError("empty mountinfo")

def identity(value):
    return (value.st_dev, value.st_ino)

def main_pid():
    result = subprocess.run(
        ["/usr/bin/systemctl", "show", "docker.service", "--property=MainPID",
         "--property=ActiveState", "--property=SubState"],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=5,
    )
    properties = dict(line.split("=", 1) for line in result.stdout.splitlines())
    if properties.get("ActiveState") != "active" or properties.get("SubState") != "running":
        raise ValueError("docker.service is not running")
    pid = int(properties["MainPID"])
    if pid <= 1:
        raise ValueError("invalid MainPID")
    return pid

def start_time(pid):
    with open(f"/proc/{pid}/stat", encoding="ascii") as source:
        contents = source.read()
    return contents[contents.rfind(")") + 2:].split()[19]

def listener_inode(fd):
    path = os.path.realpath(SOCKET)
    candidates = []
    with open("/proc/net/unix", encoding="ascii") as source:
        next(source)
        for line in source:
            fields = line.split(maxsplit=7)
            if (len(fields) == 8 and fields[4] == "0001" and fields[5] == "01"
                    and int(fields[3], 16) & 0x10000
                    and os.path.realpath(fields[7].rstrip("\n")) == path):
                candidates.append(fields[6])
    if len(candidates) != 1 or identity(os.stat(SOCKET)) != identity(os.fstat(fd)):
        raise ValueError("socket listener is ambiguous or replaced")
    return candidates[0]

def inspect(fd):
    target = os.fstat(fd)
    if not stat.S_ISSOCK(target.st_mode) or identity(target) != identity(os.stat(SOCKET)):
        raise ValueError("socket changed")
    with socket.socket(socket.AF_UNIX) as sock:
        sock.settimeout(5)
        sock.connect(f"/proc/self/fd/{fd}")
        peer, uid, _ = struct.unpack("3i", sock.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
    if uid != 0:
        raise ValueError("socket peer is not root")
    peer_exe = identity(os.stat(f"/proc/{peer}/exe"))
    expected_exe = identity(os.stat(DOCKERD))
    if peer_exe == expected_exe:
        daemon = peer
        kind = "direct"
    elif peer == 1 and peer_exe == identity(os.stat("/usr/lib/systemd/systemd")):
        daemon = main_pid()
        kind = "systemd"
    else:
        raise ValueError("unrecognized socket peer")
    if identity(os.stat(f"/proc/{daemon}/exe")) != expected_exe:
        raise ValueError("daemon executable mismatch")
    started = start_time(daemon)
    if identity(os.stat(f"/proc/{daemon}/ns/mnt")) != identity(os.stat("/proc/self/ns/mnt")):
        raise ValueError("mount namespace mismatch")
    inode = listener_inode(fd)
    descriptors = os.listdir(f"/proc/{daemon}/fd")
    links = []
    for entry in descriptors:
        try:
            links.append(os.readlink(f"/proc/{daemon}/fd/{entry}"))
        except FileNotFoundError:
            continue
    if f"socket:[{inode}]" not in links:
        raise ValueError("daemon does not hold the listening socket")
    if start_time(daemon) != started or (kind == "systemd" and main_pid() != daemon):
        raise ValueError("daemon restarted")
    if identity(os.stat(SOCKET)) != identity(target):
        raise ValueError("socket replaced")
    return [kind, daemon, started, inode, target.st_dev, target.st_ino]

def run():
    mode = sys.argv[1]
    if mode == "mounts":
        reject_nested_mounts("/proc/self/mountinfo", sys.argv[2])
        reject_nested_mounts(f"/proc/{int(sys.argv[3])}/mountinfo", "/data")
        return
    if mode == "start":
        original = os.open(SOCKET, os.O_PATH | os.O_CLOEXEC)
        fd = fcntl.fcntl(original, fcntl.F_DUPFD, 100)
        os.close(original)
        os.set_inheritable(fd, True)
        first = inspect(fd)
        if inspect(fd) != first:
            raise ValueError("daemon identity changed")
        env = os.environ.copy()
        env["_RAKAZO_GUARDED"] = "1"
        env["_RAKAZO_SOCKET_FD"] = str(fd)
        env["_RAKAZO_DAEMON_ID"] = json.dumps(first)
        os.execvpe("bash", ["bash", sys.argv[2]], env)
    if mode == "check":
        fd = int(os.environ["_RAKAZO_SOCKET_FD"])
        expected = json.loads(os.environ["_RAKAZO_DAEMON_ID"])
        if inspect(fd) != expected:
            raise ValueError("daemon identity changed")
        return
    raise ValueError("invalid mode")

if __name__ == "__main__":
    try:
        run()
    except (OSError, ValueError, KeyError, IndexError, subprocess.SubprocessError):
        sys.exit(1)
PY
)"
if [[ "${_RAKAZO_GUARDED:-}" != 1 ]]; then
  exec python3 -c "$guard_source" start "$0"
fi
verify_daemon() {
  python3 -c "$guard_source" check || fail "Local Docker identity, listener, or mount namespace changed or could not be verified."
}
verify_daemon
docker() {
  verify_daemon
  local status=0
  command docker --host "unix:///proc/self/fd/$_RAKAZO_SOCKET_FD" "$@" || status=$?
  verify_daemon
  return "$status"
}

inspect_container() {
  local container="$1" service="$2" actual id running started pid actual_project actual_service extra
  actual="$(docker inspect --format '{{.Id}} {{.State.Running}} {{.State.StartedAt}} {{.State.Pid}} {{index .Config.Labels "com.docker.compose.project"}} {{index .Config.Labels "com.docker.compose.service"}}' "$container" 2>/dev/null)" || fail "Container inspection failed."
  read -r id running started pid actual_project actual_service extra <<<"$actual"
  [[ "$id" =~ ^[0-9a-f]{64}$ && "$running" == true && "$started" =~ ^[0-9TZ:.-]+$ && "$pid" =~ ^[1-9][0-9]*$ && "$actual_project" == "$project" && "$actual_service" == "$service" && -z "$extra" ]] || fail "Container is not the expected running Compose service."
  printf '%s\n' "$actual"
}
inspect_appdata_mount() {
  docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{json .}}{{end}}{{end}}' "$api_id" 2>/dev/null || fail "Application data mount inspection failed."
}
inspect_appdata_source() {
  docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}} {{.Source}}{{end}}{{end}}' "$api_id" 2>/dev/null || fail "Application data source inspection failed."
}
api_identity="$(inspect_container "$api" api)"
database_identity="$(inspect_container "$database" postgres)"
api_id="${api_identity%% *}"
database_id="${database_identity%% *}"
read -r _ _ _ api_pid _ <<<"$api_identity"
appdata_mount="$(inspect_appdata_mount)"
[[ -n "$appdata_mount" ]] || fail "Application data mount is missing."
appdata_source="$(inspect_appdata_source)"
mount_type="${appdata_source%% *}"
appdata="${appdata_source#* }"
[[ "$mount_type" == bind || "$mount_type" == volume ]] || fail "Application data mount must be a bind or volume."
[[ "$appdata" != *$'\n'* ]] || fail "Application data path is invalid."
[[ "$appdata" == /* && -d "$appdata" ]] || fail "Application data mount is not an accessible directory."
canonical_root="$(realpath -e -- "$root")" || fail "Backup root resolution failed."
[[ "$root" == "$canonical_root" && "$root" != / ]] || fail "Backup root must be canonical and have no symlinked parents."
[[ "$(stat -c '%u %a' -- "$root")" == "$(id -u) 700" ]] || fail "Backup root must be owned by the current user with mode 700."
python3 - "$root" <<'PY' || fail "Backup root has an untrusted parent directory."
import os
import stat
import sys

path = os.path.dirname(sys.argv[1])
while True:
    info = os.lstat(path)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid not in (0, os.geteuid()) or info.st_mode & 0o022:
        sys.exit(1)
    if path == "/":
        break
    path = os.path.dirname(path)
PY
lock_file="$root/.manual-encrypted.lock"
[[ ! -L "$lock_file" && ( ! -e "$lock_file" || -f "$lock_file" ) ]] || fail "Backup lock path must be a regular file, not a symlink."
exec 9>>"$lock_file" || fail "Unable to open backup lock."
flock -n 9 || fail "Another manual encrypted backup holds the backup root lock."
recipients_dir=""
cleanup_recipients() {
  [[ -n "$recipients_dir" ]] || return 0
  rm -rf -- "$recipients_dir" || return 1
  [[ ! -e "$recipients_dir" && ! -L "$recipients_dir" ]] || return 1
  recipients_dir=""
}
cleanup_on_exit() {
  local status=$?
  trap - EXIT
  if ! cleanup_recipients; then
    printf '%s\n' "Recipients temporary directory cleanup failed: $recipients_dir" >&2
    status=1
  fi
  exit "$status"
}
trap cleanup_on_exit EXIT
if [[ -n "$recipients_file" ]]; then
  recipients_dir="$(mktemp -d "$root/.recipients.XXXXXXXX")" || fail "Cannot create private recipients directory."
  cp -- "$recipients_file" "$recipients_dir/recipients" || fail "Cannot snapshot recipients file."
  [[ -s "$recipients_dir/recipients" ]] || fail "Recipients file snapshot is empty."
  age --encrypt -R "$recipients_dir/recipients" </dev/null >/dev/null 2>&1 || fail "Age recipients file validation failed."
  age_args+=(-R "$recipients_dir/recipients")
fi
appdata="$(realpath -e -- "$appdata")" || fail "Application data path resolution failed."
[[ "$root/" != "$appdata/"* ]] || fail "Backup root must not be inside application data."
[[ "$appdata/" != "$root/"* ]] || fail "Application data must not be inside the backup root."
exec 8<"$appdata" || fail "Cannot open application data directory."
appdata_inode="$(stat -Lc '%d:%i' -- /proc/self/fd/8)" || fail "Application data identity inspection failed."
verify_sources() {
  local mount_now source_now path_now inode_now view_inode pinned_inode
  [[ "$(inspect_container "$api" api)" == "$api_identity" && "$(inspect_container "$api_id" api)" == "$api_identity" ]] || fail "API container changed during capture."
  [[ "$(inspect_container "$database" postgres)" == "$database_identity" && "$(inspect_container "$database_id" postgres)" == "$database_identity" ]] || fail "Postgres container changed during capture."
  mount_now="$(inspect_appdata_mount)"
  [[ "$mount_now" == "$appdata_mount" ]] || fail "Application data mount changed during capture."
  source_now="$(inspect_appdata_source)"
  [[ "$source_now" == "$appdata_source" ]] || fail "Application data source changed during capture."
  path_now="$(realpath -e -- "${source_now#* }")" || fail "Application data path resolution failed."
  inode_now="$(stat -Lc '%d:%i' -- "$path_now")" || fail "Application data identity inspection failed."
  pinned_inode="$(stat -Lc '%d:%i' -- /proc/self/fd/8)" || fail "Pinned application data source is unavailable."
  view_inode="$(stat -Lc '%d:%i' -- "/proc/$api_pid/root/data")" || fail "Cannot verify the API container data view."
  [[ "$path_now" == "$appdata" && "$inode_now" == "$appdata_inode" && "$pinned_inode" == "$appdata_inode" && "$view_inode" == "$appdata_inode" ]] || fail "Application data source and container view differ or changed."
  python3 -c "$guard_source" mounts "$appdata" "$api_pid" || fail "Nested application data mounts exist or cannot be verified."
}
verify_sources

output_limit() {
  local used_kib="$1" free_kib available
  free_kib="$(df -Pk -- "$root" | awk 'NR == 2 {print $4}')" || return 1
  [[ "$free_kib" =~ ^[0-9]+$ ]] || return 1
  ((free_kib > reserve_kib && max_kib > used_kib)) || return 1
  available=$((free_kib - reserve_kib))
  limit_kib=$((max_kib - used_kib))
  ((limit_kib <= available)) || limit_kib="$available"
  ((limit_kib > 0))
}
output_limit 0 || fail "Insufficient space or backup budget."

snapshot="$root/$snapshot_name"
mkdir -m 700 -- "$snapshot" 2>/dev/null || fail "Snapshot already exists or cannot be created; nothing was overwritten."
printf '%s\n' \
  'format=rakazo-manual-encrypted-v1' \
  "started_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "compose_project=$project" \
  'database=postgres custom format; ownership and ACLs included' \
  'appdata=API /data, numeric ownership, ACLs and extended attributes' \
  'consistency=database and appdata captured separately; active writers may make them inconsistent' \
  'excluded=config, application keys, Caddy data, certificates, external object storage, other volumes' \
  'restore=requires matching application configuration and keys, compatible PostgreSQL and roles; pg_restore --no-owner may omit ownership' \
  'capture_status=CAPTURE_FINISHED only indicates stream completion and checksums; recovery is unverified' \
  'trust=privileged host and administrators are trusted; shared systemd listener cannot identify each request consumer' \
  'source=container data view checked against pinned directory; nested mounts and concurrent writes are not frozen' \
  > "$snapshot/METADATA" || fail "Metadata write failed; snapshot is incomplete."

verify_sources
if ! (ulimit -f "$limit_kib" || exit 1; docker exec "$database_id" sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB"' </dev/null 2>/dev/null \
  | age --encrypt "${age_args[@]}" 2>/dev/null > "$snapshot/rakazo.dump.age"); then
  fail "Database capture or encryption failed; snapshot is incomplete."
fi
verify_sources
dump_bytes="$(stat -c '%s' -- "$snapshot/rakazo.dump.age")" || fail "Database artifact size check failed."
output_limit "$(((dump_bytes + 1023) / 1024))" || fail "Insufficient remaining space or backup budget."
if ! (ulimit -f "$limit_kib" || exit 1; tar --create --gzip --file - --numeric-owner --acls --xattrs -C /proc/self/fd/8 . 2>/dev/null \
  | age --encrypt "${age_args[@]}" 2>/dev/null > "$snapshot/appdata.tgz.age"); then
  fail "Application data capture or encryption failed; snapshot is incomplete."
fi
verify_sources
for artifact in "$snapshot/rakazo.dump.age" "$snapshot/appdata.tgz.age"; do
  IFS= read -r header < "$artifact" || fail "Encrypted artifact header is unreadable; snapshot is incomplete."
  [[ "$header" == "age-encryption.org/v1" ]] || fail "Encrypted artifact header is invalid; snapshot is incomplete."
done
if ! (cd "$snapshot" && sha256sum rakazo.dump.age appdata.tgz.age METADATA > SHA256SUMS); then
  fail "Checksum generation failed; snapshot is incomplete."
fi
verify_sources
verify_daemon
cleanup_recipients || fail "Recipients temporary directory cleanup failed; snapshot is incomplete: $recipients_dir"
mkdir -m 700 -- "$snapshot/CAPTURE_FINISHED" 2>/dev/null || fail "Capture marker creation failed; snapshot is incomplete."
printf '%s\n' "Encrypted snapshot created. Decryption and isolated recovery are not verified."
