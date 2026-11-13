#!/bin/bash -p
set -Eeuo pipefail
umask 077

[[ $- == *p* ]] || { printf 'Run with /bin/bash -p in a clean environment.\n' >&2; exit 1; }
export PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C
unset BASH_ENV ENV CDPATH PYTHONPATH PYTHONHOME PYTHONOPTIMIZE
if [[ $# -ne 0 ]]; then
  printf 'This synthetic drill takes no arguments.\n' >&2
  exit 2
fi

image_id=sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6
fail() { printf '%s\n' "$*" >&2; exit 1; }

[[ $EUID == 0 ]] || fail 'Root is required to verify the local daemon.'
guard_source=$(cat <<'PY'
import fcntl, hashlib, json, os, re, socket, stat, struct, subprocess, sys

def trusted_etc_file(name, limit):
    root = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    directory = None
    item = None
    try:
        for fd in (root,):
            info = os.fstat(fd)
            if info.st_uid != 0 or info.st_mode & 0o022:
                raise ValueError("untrusted root directory")
        directory = os.open("etc", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=root)
        info = os.fstat(directory)
        if info.st_uid != 0 or info.st_mode & 0o022:
            raise ValueError("untrusted etc directory")
        item = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory)
        before = os.fstat(item)
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != 0
                or before.st_mode & 0o022 or before.st_nlink != 1):
            raise ValueError("untrusted host identity file")
        data = os.read(item, limit + 1)
        after = os.fstat(item)
        fields = ("st_dev", "st_ino", "st_uid", "st_mode", "st_nlink",
                  "st_size", "st_mtime_ns", "st_ctime_ns")
        if (len(data) > limit or len(data) != before.st_size
                or any(getattr(before, field) != getattr(after, field) for field in fields)):
            raise ValueError("host identity file changed or exceeds limit")
        return data.strip()
    finally:
        if item is not None:
            os.close(item)
        if directory is not None:
            os.close(directory)
        os.close(root)

def host_identity():
    if (socket.gethostname() != "iZbp1fb03iz01hcvusndc1Z"
            or ident("/proc/self/ns/uts") != ident("/proc/1/ns/uts")):
        raise ValueError("maintenance host or UTS namespace mismatch")
    machine_id = trusted_etc_file("machine-id", 64)
    pin = trusted_etc_file("sydney-pg18-drill-host-id.sha256", 128)
    if (not re.fullmatch(b"[0-9a-f]{32}", machine_id)
            or not re.fullmatch(b"[0-9a-f]{64}", pin)
            or hashlib.sha256(machine_id).hexdigest().encode("ascii") != pin):
        raise ValueError("maintenance host identity pin mismatch")
    return pin.decode("ascii")

def script_snapshot(path):
    if ".." in path.split("/"):
        raise ValueError("script path contains parent component")
    path = os.path.abspath(path)
    parts = path.split("/")[1:]
    if not parts or any(part in ("", ".", "..") for part in parts):
        raise ValueError("invalid script path")
    directory = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    script = None
    try:
        for part in [""] + parts[:-1]:
            if part:
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory)
                os.close(directory)
                directory = child
            metadata = os.fstat(directory)
            if metadata.st_uid != 0 or metadata.st_mode & 0o022:
                raise ValueError("untrusted script ancestor")
        script = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory)
        before = os.fstat(script)
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != 0
                or before.st_mode & 0o022 or before.st_nlink != 1):
            raise ValueError("untrusted script file")
        chunks = []
        size = 0
        while True:
            block = os.read(script, 65536)
            if not block:
                break
            size += len(block)
            if size > 1048576:
                raise ValueError("script exceeds size limit")
            chunks.append(block)
        after = os.fstat(script)
        fields = ("st_dev", "st_ino", "st_uid", "st_mode", "st_nlink",
                  "st_size", "st_mtime_ns", "st_ctime_ns")
        if any(getattr(before, field) != getattr(after, field) for field in fields) or size != before.st_size:
            raise ValueError("script changed while being read")
        data = b"".join(chunks)
        fd = os.memfd_create("sydney-pg18-acl-script", os.MFD_ALLOW_SEALING)
        remaining = memoryview(data)
        while remaining:
            written = os.write(fd, remaining)
            if written <= 0:
                raise ValueError("could not write script snapshot")
            remaining = remaining[written:]
        seals = fcntl.F_SEAL_SEAL | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_GROW | fcntl.F_SEAL_WRITE
        fcntl.fcntl(fd, fcntl.F_ADD_SEALS, seals)
        if fcntl.fcntl(fd, fcntl.F_GET_SEALS) & seals != seals:
            raise ValueError("script snapshot is not sealed")
        os.set_inheritable(fd, True)
        return fd, hashlib.sha256(data).hexdigest()
    finally:
        if script is not None:
            os.close(script)
        os.close(directory)

def ident(path):
    value = os.stat(path)
    return [value.st_dev, value.st_ino]

def start_time(pid):
    with open("/proc/%d/stat" % pid, encoding="ascii") as source:
        data = source.read()
    return data[data.rfind(")") + 2:].split()[19]

def main_pid():
    output = subprocess.run(
        ["/usr/bin/systemctl", "show", "docker.service", "--property=MainPID",
         "--property=ActiveState", "--property=SubState"],
        check=True, capture_output=True, text=True, timeout=5,
        env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"})
    props = dict(line.split("=", 1) for line in output.stdout.splitlines())
    if props.get("ActiveState") != "active" or props.get("SubState") != "running":
        raise ValueError("docker.service is not running")
    pid = int(props["MainPID"])
    if pid <= 1:
        raise ValueError("invalid docker.service PID")
    return pid

def inspect(fd):
    sock_path = "/var/run/docker.sock"
    target = os.fstat(fd)
    if not stat.S_ISSOCK(target.st_mode) or [target.st_dev, target.st_ino] != ident(sock_path):
        raise ValueError("socket changed")
    with socket.socket(socket.AF_UNIX) as client:
        client.settimeout(5)
        client.connect("/proc/self/fd/%d" % fd)
        peer, uid, _ = struct.unpack("3i", client.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
    if uid != 0:
        raise ValueError("listener peer is not root")
    peer_exe = ident("/proc/%d/exe" % peer)
    docker_exe = ident("/usr/bin/dockerd")
    if peer_exe == docker_exe:
        daemon, kind = peer, "direct"
    elif peer == 1 and peer_exe == ident("/usr/lib/systemd/systemd"):
        daemon, kind = main_pid(), "systemd"
    else:
        raise ValueError("unrecognized listener peer")
    if ident("/proc/%d/exe" % daemon) != docker_exe:
        raise ValueError("daemon executable mismatch")
    started = start_time(daemon)
    if ident("/proc/%d/ns/mnt" % daemon) != ident("/proc/self/ns/mnt"):
        raise ValueError("mount namespace mismatch")
    candidates = []
    with open("/proc/net/unix", encoding="ascii") as source:
        next(source)
        for line in source:
            fields = line.split(maxsplit=7)
            if (len(fields) == 8 and fields[4] == "0001" and fields[5] == "01"
                    and int(fields[3], 16) & 0x10000
                    and os.path.realpath(fields[7].strip()) == os.path.realpath(sock_path)):
                candidates.append(fields[6])
    if len(candidates) != 1:
        raise ValueError("listener is ambiguous")
    links = []
    for entry in os.listdir("/proc/%d/fd" % daemon):
        try:
            links.append(os.readlink("/proc/%d/fd/%s" % (daemon, entry)))
        except FileNotFoundError:
            continue
    if "socket:[%s]" % candidates[0] not in links:
        raise ValueError("daemon does not hold listener")
    if start_time(daemon) != started or (kind == "systemd" and main_pid() != daemon):
        raise ValueError("daemon changed")
    if ident(sock_path) != [target.st_dev, target.st_ino]:
        raise ValueError("socket replaced")
    return [kind, daemon, started, candidates[0], target.st_dev, target.st_ino]

try:
    if sys.argv[1] == "start":
        host = host_identity()
        script_fd, digest = script_snapshot(sys.argv[2])
        raw = os.open("/var/run/docker.sock", os.O_PATH | os.O_CLOEXEC)
        fd = fcntl.fcntl(raw, fcntl.F_DUPFD, 100)
        os.close(raw)
        os.set_inheritable(fd, True)
        identity = inspect(fd)
        if inspect(fd) != identity:
            raise ValueError("daemon changed during startup")
        env = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C",
               "_DRILL_FD": str(fd), "_DRILL_ID": json.dumps(identity),
               "_DRILL_SCRIPT_FD": str(script_fd), "_DRILL_SCRIPT_SHA": digest,
               "_DRILL_HOST": host}
        print("sealed_script_sha256=" + digest, flush=True)
        os.execve("/bin/bash", ["/bin/bash", "-p", "/proc/self/fd/%d" % script_fd], env)
    elif sys.argv[1] == "check":
        if host_identity() != os.environ["_DRILL_HOST"]:
            raise ValueError("maintenance host identity changed")
        script_fd = int(os.environ["_DRILL_SCRIPT_FD"])
        seals = fcntl.F_SEAL_SEAL | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_GROW | fcntl.F_SEAL_WRITE
        if fcntl.fcntl(script_fd, fcntl.F_GET_SEALS) & seals != seals:
            raise ValueError("script snapshot is not sealed")
        if hashlib.sha256(os.pread(script_fd, 1048577, 0)).hexdigest() != os.environ["_DRILL_SCRIPT_SHA"]:
            raise ValueError("script snapshot changed")
        if inspect(int(os.environ["_DRILL_FD"])) != json.loads(os.environ["_DRILL_ID"]):
            raise ValueError("daemon identity changed")
    else:
        raise ValueError("invalid guard mode")
except (OSError, ValueError, KeyError, IndexError, subprocess.SubprocessError) as exc:
    print("Daemon identity verification failed: %s" % exc, file=sys.stderr)
    sys.exit(1)
PY
)
if [[ -z ${_DRILL_FD:-} || -z ${_DRILL_ID:-} ]]; then
  [[ -f $0 && ! -L $0 ]] || fail 'Run from a trusted regular script file.'
  exec /usr/bin/env -i PATH="$PATH" LC_ALL=C /usr/bin/python3 -I -c "$guard_source" start "$0"
fi
verify_daemon() {
  /usr/bin/env -i PATH="$PATH" LC_ALL=C _DRILL_FD="$_DRILL_FD" _DRILL_ID="$_DRILL_ID" \
    _DRILL_SCRIPT_FD="${_DRILL_SCRIPT_FD:-}" _DRILL_SCRIPT_SHA="${_DRILL_SCRIPT_SHA:-}" \
    _DRILL_HOST="${_DRILL_HOST:-}" \
    /usr/bin/timeout --kill-after=2s 10s /usr/bin/python3 -I -c "$guard_source" check
}
docker_local() {
  local status=0
  if ! verify_daemon </dev/null; then
    printf 'Docker pre-check failed or timed out; request not started.\n' >&2
    return 1
  fi
  /usr/bin/env -i PATH="$PATH" HOME=/nonexistent LC_ALL=C \
    /usr/bin/timeout --kill-after=5s 30s /usr/bin/docker \
    --host "unix:///proc/self/fd/$_DRILL_FD" "$@" || status=$?
  if ! verify_daemon </dev/null; then
    printf 'Docker post-check failed or timed out; request outcome may be unknown.\n' >&2
    return 1
  fi
  if (( status != 0 )); then
    printf 'Docker request failed or timed out; outcome may be unknown (status=%s).\n' "$status" >&2
  fi
  return "$status"
}

verify_daemon || fail 'Local Docker daemon could not be verified.'
docker_local image inspect "$image_id" | /usr/bin/env -i PATH="$PATH" LC_ALL=C \
  /usr/bin/python3 -I -c '
import json, sys
images = json.load(sys.stdin)
if len(images) != 1:
    raise SystemExit("unexpected image count")
image = images[0]
config = image["Config"]
env = config.get("Env") or []
if (image["Id"] != sys.argv[1]
        or set((config.get("Volumes") or {}).keys()) != {"/var/lib/postgresql"}
        or [entry for entry in env if entry.startswith("PGDATA=")]
           != ["PGDATA=/var/lib/postgresql/18/docker"]):
    raise SystemExit("PG18 image identity or declared storage mismatch")
' "$image_id" || fail 'The required cached PG18 image or configuration is unavailable.'
nonce=$(cat /proc/sys/kernel/random/uuid)
[[ $nonce =~ ^[0-9a-f-]{36}$ ]] || fail 'Cannot create a unique drill identity.'
source_name="sydney-pg18-acl-${nonce}-source"
target_name="sydney-pg18-acl-${nonce}-target"
create_pending=''
printf 'drill_nonce=%s source_name=%s target_name=%s\n' "$nonce" "$source_name" "$target_name"

cleanup() {
  local status=$? name id actual matches
  trap - EXIT HUP INT TERM
  if [[ -n $create_pending ]]; then
    printf 'create_outcome=unknown name=%s nonce=%s possible_late_container_or_anonymous_volume=yes\n' \
      "$create_pending" "$nonce" >&2
    status=1
  fi
  for name in "$source_name" "$target_name"; do
    if [[ $name == "$create_pending" ]]; then
      printf 'cleanup name=%s retained_for_investigation=yes\n' "$name" >&2
      continue
    fi
    if ! matches=$(docker_local container ls -a --no-trunc --filter "name=^/${name}$" --format '{{.ID}} {{.Names}}'); then
      printf 'cleanup_outcome=unknown operation=list name=%s nonce=%s\n' "$name" "$nonce" >&2
      status=1
      continue
    fi
    if [[ -z $matches ]]; then
      printf 'cleanup name=%s absent=yes\n' "$name"
      continue
    fi
    if [[ ! $matches =~ ^([0-9a-f]{64})\ ${name}$ ]]; then
      printf 'Cleanup received unexpected listing: %s\n' "$name" >&2
      status=1
      continue
    fi
    id=${BASH_REMATCH[1]}
    actual=$(docker_local container inspect "$id" --format '{{index .Config.Labels "sydney.acl.drill"}} {{.Image}} {{.Name}}') || {
      printf 'cleanup_outcome=unknown operation=inspect name=%s id=%s nonce=%s\n' "$name" "$id" "$nonce" >&2
      status=1
      continue
    }
    if [[ $actual != "$nonce $image_id /$name" ]]; then
      printf 'Cleanup identity mismatch; container left untouched: %s\n' "$id" >&2
      status=1
      continue
    fi
    if ! docker_local inspect "$id" | /usr/bin/env -i PATH="$PATH" LC_ALL=C /usr/bin/python3 -I -c '
import json, sys
containers = json.load(sys.stdin)
if len(containers) != 1 or any(m.get("Type") != "tmpfs" for m in containers[0]["Mounts"]):
    raise SystemExit("unexpected persistent mount; container left for inspection")
'; then
      printf 'cleanup_outcome=unknown operation=mount_check name=%s id=%s nonce=%s\n' "$name" "$id" "$nonce" >&2
      status=1
      continue
    fi
    if ! docker_local rm -f "$id" >/dev/null; then
      printf 'cleanup_outcome=unknown operation=remove name=%s id=%s nonce=%s\n' "$name" "$id" "$nonce" >&2
      status=1
      continue
    fi
    if ! matches=$(docker_local container ls -a --no-trunc --filter "name=^/${name}$" --format '{{.ID}} {{.Names}}'); then
      printf 'cleanup_outcome=unknown operation=verify_removal name=%s id=%s nonce=%s\n' "$name" "$id" "$nonce" >&2
      status=1
      continue
    fi
    if [[ -n $matches ]]; then
      printf 'cleanup_outcome=unknown operation=verify_removal name=%s id=%s nonce=%s\n' "$name" "$id" "$nonce" >&2
      status=1
      continue
    fi
    printf 'cleanup id=%s removed=yes\n' "${id:0:12}"
  done
  if [[ $status == 0 ]]; then printf 'drill_and_cleanup=passed\n'; fi
  printf 'final_status=%s\n' "$status"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

create_one() {
  docker_local create --pull never --name "$1" --label "sydney.acl.drill=$nonce" \
    --network none --read-only --log-driver none --memory 256m --pids-limit 100 \
    --mount type=tmpfs,destination=/var/lib/postgresql,tmpfs-size=134217728 \
    --mount type=tmpfs,destination=/run/postgresql,tmpfs-size=16777216 \
    --mount type=tmpfs,destination=/tmp,tmpfs-size=16777216 \
    --env PGDATA=/var/lib/postgresql/18/docker \
    --env POSTGRES_USER=drill_admin --env "POSTGRES_DB=$2" \
    --env POSTGRES_HOST_AUTH_METHOD=trust "$image_id"
}

verify_container() {
  local id=$1 name=$2 phase=$3
  docker_local inspect "$id" </dev/null | /usr/bin/env -i PATH="$PATH" LC_ALL=C /usr/bin/python3 -I -c '
import json, sys
containers = json.load(sys.stdin)
if len(containers) != 1:
    raise SystemExit("unexpected container count")
c = containers[0]
nonce, image, name, phase, expected_id = sys.argv[1:]
h = c["HostConfig"]
mounts = h.get("Mounts") or []
networks = c["NetworkSettings"].get("Networks") or {}
expected_mounts = {"/var/lib/postgresql": 134217728,
                   "/run/postgresql": 16777216, "/tmp": 16777216}
configured_mount = (len(mounts) == len(expected_mounts)
    and {mount.get("Target") for mount in mounts} == set(expected_mounts)
    and all(mount.get("Type") == "tmpfs"
            and (mount.get("TmpfsOptions") or {}).get("SizeBytes") == expected_mounts[mount["Target"]]
            for mount in mounts))
env = c["Config"].get("Env") or []
checks = [
    c["Id"] == expected_id and c["Name"] == "/" + name and c["Image"] == image,
    c["Config"]["Labels"]["sydney.acl.drill"] == nonce,
    h["NetworkMode"] == "none" and not h["Privileged"],
    h["ReadonlyRootfs"] and (h.get("LogConfig") or {}).get("Type") == "none",
    not h["Binds"] and not h["PortBindings"] and not h.get("VolumesFrom"),
    not h.get("Tmpfs") and configured_mount,
    [entry for entry in env if entry.startswith("PGDATA=")]
        == ["PGDATA=/var/lib/postgresql/18/docker"],
    not c["NetworkSettings"]["Ports"],
    set(networks) == {"none"},
    all(not network.get(key) for network in networks.values()
        for key in ("IPAddress", "GlobalIPv6Address", "Gateway", "IPv6Gateway")),
    all(m.get("Type") == "tmpfs" and m.get("Destination") in expected_mounts
        for m in c["Mounts"]),
    phase != "prestart" or not c["State"]["Running"],
    phase != "running" or c["State"]["Running"],
]
if not all(checks):
    raise SystemExit("container isolation check failed")
' "$nonce" "$image_id" "$name" "$phase" "$id"
}

create_pending=$source_name
source_id=$(create_one "$source_name" drill_source) || fail 'Source creation outcome unknown.'
[[ $source_id =~ ^[0-9a-f]{64}$ ]] || fail 'Source creation returned an invalid identity.'
verify_container "$source_id" "$source_name" prestart
create_pending=''
create_pending=$target_name
target_id=$(create_one "$target_name" postgres) || fail 'Target creation outcome unknown.'
[[ $target_id =~ ^[0-9a-f]{64}$ ]] || fail 'Target creation returned an invalid identity.'
verify_container "$target_id" "$target_name" prestart
create_pending=''
for id in "$source_id" "$target_id"; do
  docker_local start "$id" >/dev/null
done

verify_runtime() {
  local id=$1 name=$2
  verify_container "$id" "$name" running </dev/null || return 1
  docker_local exec "$id" cat /proc/self/mountinfo </dev/null | /usr/bin/env -i PATH="$PATH" LC_ALL=C \
    /usr/bin/python3 -I -c '
import sys
lines = [line.rstrip("\n").split(" ") for line in sys.stdin]
if any(len(parts) <= 6 or "-" not in parts for parts in lines):
    raise SystemExit("malformed mount information")
roots = [parts for parts in lines if parts[4] == "/"]
if len(roots) != 1 or "ro" not in roots[0][5].split(","):
    raise SystemExit("container root is not read only")
for path in ("/var/lib/postgresql", "/run/postgresql", "/tmp"):
    mounts = [parts for parts in lines if parts[4] == path]
    nested = [parts for parts in lines if parts[4].startswith(path + "/")]
    if len(mounts) != 1 or nested:
        raise SystemExit("expected single tmpfs without nested mounts")
    fields = mounts[0]
    try:
        if fields[fields.index("-") + 1] != "tmpfs":
            raise ValueError("not tmpfs")
    except (ValueError, IndexError):
        raise SystemExit("expected tmpfs")
' || return 1
  docker_local exec "$id" cat /proc/net/dev </dev/null | /usr/bin/env -i PATH="$PATH" LC_ALL=C \
    /usr/bin/python3 -I -c '
import sys
lines = sys.stdin.read().splitlines()
if len(lines) < 3:
    raise SystemExit("network interface listing unavailable")
interfaces = [line.split(":", 1)[0].strip() for line in lines[2:] if ":" in line]
if interfaces != ["lo"]:
    raise SystemExit("unexpected network interfaces")
' || return 1
  verify_container "$id" "$name" running </dev/null
}

for id in "$source_id" "$target_id"; do
  if [[ $id == "$source_id" ]]; then name=$source_name; else name=$target_name; fi
  verify_runtime "$id" "$name" || fail 'Could not verify container runtime isolation.'
  ready=0
  for attempt in {1..45}; do
    if docker_local exec "$id" env -i PATH=/usr/local/bin:/usr/bin:/bin \
      pg_isready -q -h /var/run/postgresql -U drill_admin -d postgres 2>/dev/null; then
      ready=1
      break
    fi
    sleep 1
  done
  [[ $ready == 1 ]] || fail "Synthetic PostgreSQL did not start: $id"
done
verify_container "$source_id" "$source_name" running
verify_container "$target_id" "$target_name" running

inside() {
  local id=$1 name status=0
  shift
  if [[ $id == "$source_id" ]]; then name=$source_name
  elif [[ $id == "$target_id" ]]; then name=$target_name
  else fail 'Unexpected container identity.'; fi
  verify_runtime "$id" "$name" || return 1
  docker_local exec "$id" env -i PATH=/usr/local/bin:/usr/bin:/bin "$@" || status=$?
  verify_runtime "$id" "$name" || return 1
  return "$status"
}
inside_input() {
  local id=$1 name status=0
  shift
  if [[ $id == "$source_id" ]]; then name=$source_name
  elif [[ $id == "$target_id" ]]; then name=$target_name
  else fail 'Unexpected container identity.'; fi
  verify_runtime "$id" "$name" </dev/null || return 1
  docker_local exec -i "$id" env -i PATH=/usr/local/bin:/usr/bin:/bin "$@" || status=$?
  verify_runtime "$id" "$name" </dev/null || return 1
  return "$status"
}
psql_source() { inside "$source_id" psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -U drill_admin -d drill_source "$@"; }
psql_target() { inside "$target_id" psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -U drill_admin "$@"; }

printf 'version='
inside "$source_id" pg_dump --version
printf 'image_id=%s\n' "$image_id"
for id in "$source_id" "$target_id"; do
  result=$(inside "$id" psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql \
    -U drill_admin -d postgres -Atc "SELECT current_setting('server_version_num')::integer / 10000, current_setting('data_directory');")
  [[ $result == '18|/var/lib/postgresql/18/docker' ]] || fail 'Unexpected server version or data directory.'
done
printf 'server_version_and_data_directory=verified\n'
psql_source -c "
CREATE ROLE drill_owner NOLOGIN;
CREATE ROLE drill_group NOLOGIN;
CREATE ROLE drill_reader NOLOGIN;
GRANT drill_group TO drill_reader;
CREATE SCHEMA drill AUTHORIZATION drill_owner;
SET ROLE drill_owner;
CREATE TABLE drill.sample (id integer PRIMARY KEY, value text NOT NULL);
INSERT INTO drill.sample VALUES (1, 'synthetic');
GRANT USAGE ON SCHEMA drill TO drill_group;
GRANT SELECT ON drill.sample TO drill_group;
RESET ROLE;" >/dev/null

inside "$source_id" pg_dumpall -h /var/run/postgresql -U drill_admin --globals-only --no-role-passwords |
  sed '/^CREATE ROLE drill_admin;$/d' |
  inside_input "$target_id" psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -U drill_admin -q -d postgres >/dev/null
printf 'synthetic_globals_restore=success bootstrap_create_filtered=yes\n'

inside "$target_id" createdb -h /var/run/postgresql -U drill_admin restored
inside "$source_id" pg_dump --format=custom -h /var/run/postgresql -U drill_admin drill_source |
  inside_input "$target_id" pg_restore -h /var/run/postgresql -U drill_admin -d restored --exit-on-error
result=$(psql_target -d restored -Atc "
SELECT pg_get_userbyid(c.relowner) = 'drill_owner',
       pg_get_userbyid(n.nspowner) = 'drill_owner',
       has_schema_privilege('drill_group', 'drill', 'USAGE'),
       has_table_privilege('drill_group', 'drill.sample', 'SELECT'),
       has_table_privilege('drill_reader', 'drill.sample', 'SELECT'),
       pg_has_role('drill_reader', 'drill_group', 'MEMBER'),
       (SELECT count(*) = 1 FROM drill.sample WHERE id = 1 AND value = 'synthetic')
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.oid = 'drill.sample'::regclass;")
printf 'owner_schema_acl_inheritance_membership_row=%s\n' "$result"
[[ $result == 't|t|t|t|t|t|t' ]] || fail 'Positive restore assertion failed.'
result=$(psql_target -d restored -Atc "SET ROLE drill_reader; SELECT value FROM drill.sample WHERE id = 1;")
[[ $result == $'SET\nsynthetic' ]] || fail 'Actual reader access failed.'
printf 'actual_reader_select=success\n'

inside "$target_id" createdb -h /var/run/postgresql -U drill_admin no_acl
inside "$source_id" pg_dump --format=custom --no-privileges -h /var/run/postgresql -U drill_admin drill_source |
  inside_input "$target_id" pg_restore -h /var/run/postgresql -U drill_admin -d no_acl --exit-on-error
result=$(psql_target -d no_acl -Atc "SELECT has_table_privilege('drill_group', 'drill.sample', 'SELECT');")
printf 'no_privileges_group_select=%s\n' "$result"
[[ $result == f ]] || fail 'No-privileges comparison failed.'
if output=$(psql_target -d no_acl -Atc "SET ROLE drill_reader; SELECT value FROM drill.sample WHERE id = 1;" 2>&1); then
  fail 'No-privileges reader access unexpectedly succeeded.'
fi
[[ $output == *'permission denied for schema drill'* ]] || fail 'No-privileges access failed for an unexpected reason.'
printf 'no_privileges_schema_access=permission_denied\n'
psql_target -d no_acl -c 'GRANT USAGE ON SCHEMA drill TO drill_group;' >/dev/null
result=$(psql_target -d no_acl -Atc "SELECT has_schema_privilege('drill_reader','drill','USAGE'), has_table_privilege('drill_reader','drill.sample','SELECT');")
[[ $result == 't|f' ]] || fail 'Table-level comparison preconditions failed.'
if output=$(psql_target -d no_acl -Atc "SET ROLE drill_reader; SELECT value FROM drill.sample WHERE id = 1;" 2>&1); then
  fail 'Table-level reader access unexpectedly succeeded.'
fi
[[ $output == *'permission denied for table sample'* ]] || fail 'Table access failed for an unexpected reason.'
printf 'no_privileges_table_select=permission_denied\n'
printf 'checks=passed_pending_cleanup\n'
