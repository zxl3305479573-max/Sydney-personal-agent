#!/bin/bash -p
set -Eeuo pipefail
umask 077

for internal_name in ${!_DRILL_@}; do unset "$internal_name"; done
[[ $- == *p* ]] || { printf 'Use /bin/bash -p with a clean environment.\n' >&2; exit 1; }
export PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C
unset BASH_ENV ENV CDPATH PYTHONPATH PYTHONHOME PYTHONOPTIMIZE
[[ $# == 0 && $EUID == 0 ]] || { echo 'Root and no arguments are required.' >&2; exit 1; }
image=sha256:df7f1c2fb114453b951de51a98efc010db1655a92c2e86be6706714e2417a78d

guard_source=$(cat <<'PY'
import fcntl, hashlib, json, os, signal, socket, stat, struct, subprocess, sys

MACHINE_SHA = "a549400a11c795ec5f10861037d168dab3fc06a4dde8b57ff6814b4ee52df52f"
DAEMON_ID = "d78f85ff-124f-4363-b925-10629b517a5a"
ENV = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C", "HOME": "/nonexistent"}

def require(condition, message):
    if not condition:
        raise ValueError(message)

def ident(path):
    value = os.stat(path)
    return [value.st_dev, value.st_ino]

def start_time(pid):
    with open("/proc/%d/stat" % pid, encoding="ascii") as source:
        data = source.read()
    return data[data.rfind(")") + 2:].split()[19]

def main_pid():
    result = subprocess.run(
        ["/usr/bin/systemctl", "show", "docker.service", "--property=MainPID",
         "--property=ActiveState", "--property=SubState"],
        check=True, capture_output=True, text=True, timeout=5, env=ENV)
    props = dict(line.split("=", 1) for line in result.stdout.splitlines())
    require(props.get("ActiveState") == "active" and props.get("SubState") == "running",
            "docker.service is not running")
    pid = int(props["MainPID"])
    require(pid > 1, "invalid docker.service PID")
    return pid

def script_snapshot(path, launcher_fd):
    require(".." not in path.split("/"), "script path contains parent component")
    path = os.path.abspath(path)
    parts = path.split("/")[1:]
    require(bool(parts) and all(part not in ("", ".", "..") for part in parts), "invalid script path")
    directory = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    script = None
    try:
        for part in [""] + parts[:-1]:
            if part:
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory)
                os.close(directory)
                directory = child
            metadata = os.fstat(directory)
            require(metadata.st_uid == 0 and not metadata.st_mode & 0o022, "untrusted script ancestor")
        script = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory)
        before = os.fstat(script)
        require(stat.S_ISREG(before.st_mode) and before.st_uid == 0
                and not before.st_mode & 0o022 and before.st_nlink == 1, "untrusted script file")
        launcher = os.fstat(launcher_fd)
        require([launcher.st_dev, launcher.st_ino] == [before.st_dev, before.st_ino],
                "launcher is not reading the trusted script")
        data = bytearray()
        while True:
            block = os.read(script, 65536)
            if not block:
                break
            data.extend(block)
            require(len(data) <= 1048576, "script exceeds size limit")
        after = os.fstat(script)
        fields = ("st_dev", "st_ino", "st_uid", "st_mode", "st_nlink", "st_size", "st_mtime_ns", "st_ctime_ns")
        require(all(getattr(before, field) == getattr(after, field) for field in fields)
                and len(data) == before.st_size, "script changed while read")
        fd = os.memfd_create("sydney-caddy-persistent-script", os.MFD_ALLOW_SEALING)
        remaining = memoryview(data)
        while remaining:
            written = os.write(fd, remaining)
            require(written > 0, "script snapshot write failed")
            remaining = remaining[written:]
        seals = fcntl.F_SEAL_SEAL | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_GROW | fcntl.F_SEAL_WRITE
        fcntl.fcntl(fd, fcntl.F_ADD_SEALS, seals)
        require(fcntl.fcntl(fd, fcntl.F_GET_SEALS) & seals == seals, "script snapshot is not sealed")
        os.set_inheritable(fd, True)
        return fd, hashlib.sha256(data).hexdigest()
    finally:
        if script is not None:
            os.close(script)
        os.close(directory)

def inspect(fd):
    machine = os.stat("/etc/machine-id")
    require(stat.S_ISREG(machine.st_mode) and machine.st_uid == 0 and not machine.st_mode & 0o022,
            "untrusted machine identity file")
    with open("/etc/machine-id", "rb") as source:
        require(hashlib.sha256(source.read(4097)).hexdigest() == MACHINE_SHA, "unauthorized machine")
    path = "/var/run/docker.sock"
    target = os.fstat(fd)
    require(stat.S_ISSOCK(target.st_mode) and [target.st_dev, target.st_ino] == ident(path), "socket changed")
    with socket.socket(socket.AF_UNIX) as client:
        client.settimeout(5)
        client.connect("/proc/self/fd/%d" % fd)
        peer, uid, _ = struct.unpack("3i", client.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
    require(uid == 0, "socket peer is not root")
    peer_exe = ident("/proc/%d/exe" % peer)
    docker_exe = ident("/usr/bin/dockerd")
    if peer_exe == docker_exe:
        daemon, kind = peer, "direct"
    elif peer == 1 and peer_exe == ident("/usr/lib/systemd/systemd"):
        daemon, kind = main_pid(), "systemd"
    else:
        raise ValueError("unrecognized socket peer")
    require(ident("/proc/%d/exe" % daemon) == docker_exe, "daemon executable mismatch")
    started = start_time(daemon)
    require(ident("/proc/%d/ns/mnt" % daemon) == ident("/proc/self/ns/mnt"), "mount namespace mismatch")
    candidates = []
    with open("/proc/net/unix", encoding="ascii") as source:
        next(source)
        for line in source:
            fields = line.split(maxsplit=7)
            if (len(fields) == 8 and fields[4] == "0001" and fields[5] == "01"
                    and int(fields[3], 16) & 0x10000
                    and os.path.realpath(fields[7].strip()) == os.path.realpath(path)):
                candidates.append(fields[6])
    require(len(candidates) == 1, "listener is ambiguous")
    links = []
    for entry in os.listdir("/proc/%d/fd" % daemon):
        try:
            links.append(os.readlink("/proc/%d/fd/%s" % (daemon, entry)))
        except FileNotFoundError:
            continue
    require("socket:[%s]" % candidates[0] in links, "daemon does not hold listener")
    result = subprocess.run(
        ["/usr/bin/docker", "--config", "/nonexistent", "--host", "unix:///proc/self/fd/%d" % fd,
         "info", "--format", "{{.ID}}"], pass_fds=(fd,), check=True,
        capture_output=True, text=True, timeout=10, env=ENV)
    require(result.stdout.strip() == DAEMON_ID, "unexpected Docker daemon ID")
    require(start_time(daemon) == started and (kind != "systemd" or main_pid() == daemon), "daemon changed")
    require(ident(path) == [target.st_dev, target.st_ino], "socket replaced")
    return [kind, daemon, started, candidates[0], target.st_dev, target.st_ino]

try:
    if sys.argv[1] == "start":
        launcher_fd = int(sys.argv[3])
        script_fd, digest = script_snapshot(sys.argv[2], launcher_fd)
        os.close(launcher_fd)
        null_fd = os.open("/dev/null", os.O_RDONLY)
        if null_fd != 0:
            os.dup2(null_fd, 0)
            os.close(null_fd)
        data = os.pread(script_fd, 1048577, 0)
        worker_marker = b"\n: <<'__CADDY_WORKER__'\n"
        worker_end = b"\n__CADDY_WORKER__\n"
        guard_start = b"guard_source=$(cat <<'PY'\n"
        guard_end = b"\nPY\n)"
        require(data.count(worker_marker) == 1 and data.count(worker_end) == 1,
                "invalid sealed worker delimiters")
        require(data.count(guard_start) == 1 and data.count(guard_end) == 1,
                "invalid sealed guard delimiters")
        worker = data.split(worker_marker, 1)[1].split(worker_end, 1)[0].decode("utf-8")
        guard = data.split(guard_start, 1)[1].split(guard_end, 1)[0].decode("utf-8")
        raw = os.open("/var/run/docker.sock", os.O_PATH | os.O_CLOEXEC)
        fd = fcntl.fcntl(raw, fcntl.F_DUPFD, 100)
        os.close(raw)
        os.set_inheritable(fd, True)
        identity = inspect(fd)
        require(inspect(fd) == identity, "daemon changed during startup")
        env = dict(ENV, _DRILL_FD=str(fd), _DRILL_ID=json.dumps(identity),
                   _DRILL_SCRIPT_FD=str(script_fd), _DRILL_SCRIPT_SHA=digest,
                   _DRILL_GUARD=guard)
        print("sealed_script_sha256=" + digest, flush=True)
        state = {"signal": 0, "worker": None, "forwarded": False}
        def forward():
            if state["signal"] and state["worker"] is not None and not state["forwarded"]:
                state["forwarded"] = True
                try:
                    os.killpg(state["worker"].pid, state["signal"])
                except ProcessLookupError:
                    pass
        def on_signal(signum, _frame):
            if not state["signal"]:
                state["signal"] = signum
                forward()
        for signum in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
            signal.signal(signum, on_signal)
        if state["signal"]:
            sys.exit(128 + state["signal"])
        state["worker"] = subprocess.Popen(
            ["/bin/bash", "-p", "-c", worker], env=env,
            pass_fds=(fd, script_fd), start_new_session=True)
        forward()
        os.waitid(os.P_PID, state["worker"].pid, os.WEXITED | os.WNOWAIT)
        blocked = (signal.SIGHUP, signal.SIGINT, signal.SIGTERM)
        previous_mask = signal.pthread_sigmask(signal.SIG_BLOCK, blocked)
        try:
            completed_worker = state["worker"]
            state["worker"] = None
            result = completed_worker.wait()
        finally:
            signal.pthread_sigmask(signal.SIG_SETMASK, previous_mask)
        if state["signal"]:
            print("Supervisor received signal %d; worker exit=%d" % (state["signal"], result), file=sys.stderr)
            sys.exit(128 + state["signal"])
        sys.exit(result if result >= 0 else 128 - result)
    elif sys.argv[1] == "check":
        script_fd = int(os.environ["_DRILL_SCRIPT_FD"])
        seals = fcntl.F_SEAL_SEAL | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_GROW | fcntl.F_SEAL_WRITE
        require(fcntl.fcntl(script_fd, fcntl.F_GET_SEALS) & seals == seals, "script is not sealed")
        require(hashlib.sha256(os.pread(script_fd, 1048577, 0)).hexdigest() == os.environ["_DRILL_SCRIPT_SHA"],
                "script snapshot changed")
        require(inspect(int(os.environ["_DRILL_FD"])) == json.loads(os.environ["_DRILL_ID"]), "daemon identity changed")
    else:
        raise ValueError("invalid guard mode")
except (OSError, ValueError, KeyError, IndexError, subprocess.SubprocessError) as exc:
    print("Maintenance host / daemon verification failed: %s" % exc, file=sys.stderr)
    sys.exit(1)
PY
)
[[ -f $0 && ! -L $0 ]] || { echo 'Use a trusted regular script file.' >&2; exit 1; }
exec 0<&255
exec /usr/bin/env -i PATH="$PATH" LC_ALL=C /usr/bin/python3 -I -c "$guard_source" start "$0" 0

: <<'__CADDY_WORKER__'
set -Eeuo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C
image=sha256:df7f1c2fb114453b951de51a98efc010db1655a92c2e86be6706714e2417a78d
guard_source="${_DRILL_GUARD:?Missing sealed guard}"
unset _DRILL_GUARD
trap 'echo "Interrupted during setup; temporary resource state may be unknown" >&2; exit 129' HUP
trap 'echo "Interrupted during setup; temporary resource state may be unknown" >&2; exit 130' INT
trap 'echo "Interrupted during setup; temporary resource state may be unknown" >&2; exit 143' TERM
verify_daemon() {
  /usr/bin/env -i PATH="$PATH" LC_ALL=C _DRILL_FD="$_DRILL_FD" _DRILL_ID="$_DRILL_ID" \
    _DRILL_SCRIPT_FD="${_DRILL_SCRIPT_FD:-}" _DRILL_SCRIPT_SHA="${_DRILL_SCRIPT_SHA:-}" \
    /usr/bin/python3 -I -c "$guard_source" check
}
docker_local() {
  local status=0
  verify_daemon || return 1
  /usr/bin/env -i PATH="$PATH" HOME=/nonexistent LC_ALL=C /usr/bin/docker \
    --config /nonexistent --host "unix:///proc/self/fd/$_DRILL_FD" "$@" || status=$?
  verify_daemon || return 1
  return "$status"
}

verify_daemon
docker_local image inspect "$image" | /usr/bin/python3 -I -c '
import json, sys
image = json.load(sys.stdin)[0]
if image["Id"] != sys.argv[1] or set((image.get("Config") or {}).get("Volumes") or {}) - {"/data", "/config"}:
    sys.exit("Unexpected image ID or volumes")
' "$image"

lab_dir="$(mktemp -d /tmp/sydney-caddy-persistent.XXXXXXXXXX)"
lab_owner="${lab_dir##*.}"
lab_name="sydney-caddy-persistent-${lab_owner}"
container=""
create_attempted=0
create_failed=0
cleanup() {
  local status="$?" cleanup_status=0 actual remaining
  trap - EXIT HUP INT TERM
  if [[ "$create_attempted" == 1 ]]; then
    if [[ "$create_failed" == 1 || ! "$container" =~ ^[0-9a-f]{64}$ ]]; then
      echo "Create outcome uncertain; refusing removal; inspect $lab_name and $lab_dir" >&2
      cleanup_status=1
    elif ! actual="$(docker_local inspect --format '{{.Id}} {{index .Config.Labels "sydney.persistent-rollback-lab"}} {{.Image}} {{.Name}}' "$container")"; then
      echo "Cannot verify container identity; inspect $lab_name" >&2
      cleanup_status=1
    elif [[ "$actual" != "$container $lab_owner $image /$lab_name" ]]; then
      echo "Container identity mismatch; refusing removal: $lab_name" >&2
      cleanup_status=1
    elif ! docker_local rm -f "$container" >/dev/null; then
      echo "Container removal failed or outcome uncertain: $lab_name" >&2
      cleanup_status=1
    elif ! remaining="$(docker_local container ls -a --no-trunc --filter "id=$container" --format '{{.ID}}')"; then
      echo "Cannot verify removed container ID: $container" >&2
      cleanup_status=1
    elif [[ -n "$remaining" ]]; then
      echo "Container ID remains after removal: $container" >&2
      cleanup_status=1
    elif ! remaining="$(docker_local container ls -a --no-trunc --filter "name=^/${lab_name}$" --format '{{.ID}}')"; then
      echo "Cannot verify removed container name: $lab_name" >&2
      cleanup_status=1
    elif [[ -n "$remaining" ]]; then
      echo "Container name remains after removal: $lab_name" >&2
      cleanup_status=1
    else
      echo "Container removal verified by ID and name: $lab_name"
    fi
  fi
  if [[ "$cleanup_status" == 0 ]]; then
    rm -f -- "$lab_dir/test.key" "$lab_dir/test.crt" "$lab_dir/Caddyfile" \
      "$lab_dir/original.Caddyfile" "$lab_dir/candidate.Caddyfile" "$lab_dir/before.json" || cleanup_status=1
    rmdir -- "$lab_dir" || cleanup_status=1
    [[ ! -e "$lab_dir" && ! -L "$lab_dir" ]] || cleanup_status=1
  fi
  if [[ "$cleanup_status" != 0 ]]; then
    echo "Cleanup failed; inspect $lab_name and $lab_dir" >&2
    status=1
  else
    echo "Cleanup: synthetic container and temporary files removed"
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$lab_dir/test.key" -out "$lab_dir/test.crt" \
  -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' >/dev/null 2>&1

for version in original candidate; do
  cat >"$lab_dir/$version.Caddyfile" <<CADDY
{
	admin 127.0.0.1:2019
	auto_https off
}
http://127.0.0.1:18080 {
	respond "{\$LAB_MESSAGE}-$version-http"
}
https://localhost:18443 {
	tls /lab/test.crt /lab/test.key
	respond "{\$LAB_MESSAGE}-$version-https"
}
CADDY
done
cp "$lab_dir/original.Caddyfile" "$lab_dir/Caddyfile"

create_attempted=1
if ! container="$(docker_local create --name "$lab_name" --label "sydney.persistent-rollback-lab=$lab_owner" \
  --pull=never --network none --read-only --tmpfs /data --tmpfs /config \
  --memory 128m --cpus 0.5 --pids-limit 128 \
  --mount "type=bind,src=$lab_dir,dst=/lab,readonly" \
  -e LAB_MESSAGE=startup --entrypoint caddy "$image" \
  run --config /lab/Caddyfile --adapter caddyfile)"; then
  create_failed=1
  exit 1
fi
[[ "$container" =~ ^[0-9a-f]{64}$ ]]
docker_local inspect "$container" | /usr/bin/python3 -I -c '
import json, sys
c = json.load(sys.stdin)[0]
def require(value, message):
    if not value:
        sys.exit(message)
require(c["Id"] == sys.argv[1] and c["Image"] == sys.argv[2], "container identity mismatch")
require(c["Config"]["Labels"]["sydney.persistent-rollback-lab"] == sys.argv[3], "container label mismatch")
require(c["HostConfig"]["NetworkMode"] == "none", "container network is not none")
require(c["HostConfig"]["ReadonlyRootfs"], "root filesystem is not read-only")
require(not c["HostConfig"]["PortBindings"], "unexpected port bindings")
require(set(c["HostConfig"]["Tmpfs"]) == {"/data", "/config"}, "unexpected tmpfs")
mounts = c["Mounts"]
require(len(mounts) == 1, "unexpected mounts")
require(mounts[0]["Type"] == "bind" and mounts[0]["Source"] == sys.argv[4], "unexpected bind source")
require(mounts[0]["Destination"] == "/lab" and not mounts[0]["RW"], "unexpected bind destination or permissions")
' "$container" "$image" "$lab_owner" "$lab_dir"
docker_local start "$container" >/dev/null

check_routes() {
  local expected="$1" http="" https=""
  for attempt in {1..30}; do
    http="$(docker_local exec "$container" wget -qO- http://127.0.0.1:18080 2>/dev/null || true)"
    https="$(docker_local exec "$container" wget -qO- --no-check-certificate https://localhost:18443 2>/dev/null || true)"
    if [[ "$http" == "$expected-http" && "$https" == "$expected-https" ]]; then
      echo "HTTP and HTTPS: $expected"
      return 0
    fi
    sleep 0.2
  done
  echo "Unexpected or unavailable synthetic routes; expected $expected" >&2
  return 1
}

check_routes startup-original
docker_local exec "$container" wget -qO- http://127.0.0.1:2019/config/ >"$lab_dir/before.json"
/usr/bin/python3 -I - "$lab_dir" <<'PY'
import json, sys
from pathlib import Path
data = Path(sys.argv[1], "before.json").read_bytes()
config = json.loads(data)
pairs = config["apps"]["tls"]["certificates"]["load_files"]
if (len(pairs) != 1 or pairs[0]["certificate"] != "/lab/test.crt"
        or pairs[0]["key"] != "/lab/test.key" or b"PRIVATE KEY" in data):
    sys.exit("Unexpected snapshot")
print("Snapshot: JSON with synthetic certificate paths only")
PY
printf 'Snapshot SHA-256: '
sha256sum "$lab_dir/before.json" | cut -d' ' -f1

docker_local exec -e LAB_MESSAGE=reload "$container" caddy validate --config /lab/candidate.Caddyfile --adapter caddyfile >/dev/null 2>&1
docker_local exec -e LAB_MESSAGE=reload "$container" caddy reload --config /lab/candidate.Caddyfile --adapter caddyfile >/dev/null 2>&1
check_routes reload-candidate
docker_local restart "$container" >/dev/null
check_routes startup-original
echo "Reload-only candidate and injected environment did not survive restart"

cp "$lab_dir/candidate.Caddyfile" "$lab_dir/Caddyfile"
docker_local restart "$container" >/dev/null
check_routes startup-candidate
echo "Candidate persisted with the container startup environment"

docker_local exec -i "$container" caddy reload --config - <"$lab_dir/before.json" >/dev/null 2>&1
check_routes startup-original
docker_local restart "$container" >/dev/null
check_routes startup-candidate
echo "Runtime JSON rollback alone did not change persistent startup configuration"

cp "$lab_dir/original.Caddyfile" "$lab_dir/Caddyfile"
docker_local exec -i "$container" caddy reload --config - <"$lab_dir/before.json" >/dev/null 2>&1
check_routes startup-original
docker_local restart "$container" >/dev/null
check_routes startup-original
echo "Runtime and persistent rollback survived restart"
echo "Scope: synthetic files, certificates and loopback only; no production volumes, ports, network or ACME"
__CADDY_WORKER__
