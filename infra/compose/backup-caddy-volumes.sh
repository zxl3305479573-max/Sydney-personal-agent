#!/bin/bash -p
set -Eeuo pipefail
umask 077

if [[ $- != *p* ]]; then
  printf '%s\n' 'Start directly or with bash -p; a non-privileged shell may already have executed BASH_ENV.' >&2
  exit 2
fi

if [[ ( $# == 1 && ( "$1" == "--candidate" || "$1" == "--guard-check" || "$1" == "--guard-check-internal" || "$1" == "--source-check-internal" ) ) || ( $# == 8 && "$1" == "--source-check" ) ]]; then
  exec /usr/bin/python3 -I -c "$(/usr/bin/cat <<'PY'
import json
import ctypes
import hashlib
import os
import re
import resource
import secrets
import signal
import stat
import subprocess
import sys
import time

TAR_BINARY = "/usr/bin/tar"
AGE_BINARY = "/usr/bin/age"
DOCKER_BINARY = "/usr/bin/docker"
PYTHON_BINARY = "/usr/bin/python3"
SAFE_ENV = {"PATH": "/usr/bin:/bin", "LC_ALL": "C"}
PROCESS_TIMEOUT = 60


def container_identity(document, project, service):
    if not isinstance(document, list) or len(document) != 1:
        raise ValueError("invalid container inspection")
    item = document[0]
    labels = item["Config"]["Labels"]
    state = item["State"]
    identifier = item["Id"]
    if (not re.fullmatch(r"[0-9a-f]{64}", identifier)
            or state["Running"] is not True
            or type(state["Pid"]) is not int or state["Pid"] <= 1
            or not state["StartedAt"]
            or labels.get("com.docker.compose.project") != project
            or labels.get("com.docker.compose.service") != service):
        raise ValueError("container identity mismatch")
    return (identifier, state["Pid"], state["StartedAt"])


def volume_identity(container, volumes, expected_names):
    if (not isinstance(expected_names, dict) or set(expected_names) != {"/data", "/config"}
            or any(not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", name)
                   for name in expected_names.values())
            or expected_names["/data"] == expected_names["/config"]):
        raise ValueError("invalid expected volume names")
    result = {}
    mounts = container[0]["Mounts"]
    for destination in ("/data", "/config"):
        selected = [mount for mount in mounts if mount.get("Destination") == destination]
        if len(selected) != 1 or selected[0].get("Type") != "volume":
            raise ValueError("expected one named volume")
        mount = selected[0]
        name, source = mount.get("Name"), mount.get("Source")
        if name != expected_names[destination]:
            raise ValueError("expected volume name mismatch")
        if not isinstance(name, str) or not name or not isinstance(source, str):
            raise ValueError("invalid volume")
        if not source.startswith("/") or os.path.normpath(source) != source or source == "/":
            raise ValueError("invalid volume source")
        inspected = volumes.get(name)
        if (not isinstance(inspected, dict) or inspected.get("Name") != name
                or inspected.get("Mountpoint") != source or inspected.get("Driver") != "local"
                or inspected.get("Options")):
            raise ValueError("volume inspection mismatch")
        result[destination] = (name, source)
    if result["/data"][0] == result["/config"][0] or result["/data"][1] == result["/config"][1]:
        raise ValueError("volumes must be distinct")
    return result


def reject_nested_mounts(text, root, expected_mount_id=None):
    if not root.startswith("/") or "\n" in root:
        raise ValueError("invalid mount root")
    prefix = root.rstrip("/") + "/"
    lines = text.splitlines()
    if not lines:
        raise ValueError("empty mountinfo")
    covering = []
    exact = 0
    for line in lines:
        fields = line.split(" ")
        if len(fields) < 10 or "-" not in fields[6:]:
            raise ValueError("invalid mountinfo")
        encoded = fields[4]
        if re.search(r"\\(?![0-7]{3})", encoded):
            raise ValueError("invalid mount escape")
        path = re.sub(r"\\([0-7]{3})", lambda match: chr(int(match.group(1), 8)), encoded)
        if not path.startswith("/") or path.startswith(prefix):
            raise ValueError("invalid or nested mount")
        if path == root:
            exact += 1
        if path == "/" or path == root or root.startswith(path.rstrip("/") + "/"):
            if not fields[0].isdigit():
                raise ValueError("invalid mount ID")
            covering.append((len(path), int(fields[0])))
    if exact > 1:
        raise ValueError("stacked root mounts")
    if expected_mount_id is not None:
        if not covering:
            raise ValueError("missing covering mount")
        maximum = max(item[0] for item in covering)
        top = [item[1] for item in covering if item[0] == maximum]
        if len(top) != 1 or top[0] != expected_mount_id:
            raise ValueError("mount ID mismatch or stacked mounts")


def mount_id(fd):
    with open(f"/proc/self/fdinfo/{fd}", encoding="ascii") as info:
        matches = [line.split(":", 1)[1].strip() for line in info if line.startswith("mnt_id:")]
    if len(matches) != 1 or not matches[0].isdigit():
        raise ValueError("cannot determine mount ID")
    return int(matches[0])


def open_private_output(path):
    if not os.path.isabs(path) or os.path.normpath(path) != path or path == "/":
        raise ValueError("invalid output path")
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        for part in path.split("/")[1:]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
            os.close(fd)
            fd = child
            info = os.fstat(fd)
            if info.st_uid != 0 or info.st_mode & 0o022:
                raise ValueError("untrusted output ancestor")
        if stat.S_IMODE(os.fstat(fd).st_mode) != 0o700:
            raise ValueError("output directory must be mode 700")
        return fd
    except BaseException:
        os.close(fd)
        raise


def encrypted_archive(source_fd, output_fd, name, recipient, limit_bytes, reserve_bytes):
    if name not in ("data.tar.age", "config.tar.age"):
        raise ValueError("invalid output name")
    if limit_bytes <= 0 or reserve_bytes < 0:
        raise ValueError("invalid limits")
    space = os.fstatvfs(output_fd)
    if space.f_bavail * space.f_frsize < limit_bytes + reserve_bytes:
        raise ValueError("insufficient free space")
    target = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                     0o600, dir_fd=output_fd)
    archive = None
    encryptor = None
    try:
        archive = subprocess.Popen(
            [TAR_BINARY, "--create", "--file", "-", "--format=pax", "--numeric-owner",
             "--acls", "--xattrs", "--xattrs-include=*", "-C", f"/proc/self/fd/{source_fd}", "."],
            pass_fds=(source_fd,), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL, env=SAFE_ENV, start_new_session=True)
        def limit_file():
            resource.setrlimit(resource.RLIMIT_FSIZE, (limit_bytes, limit_bytes))
        encryptor = subprocess.Popen(
            [AGE_BINARY, "--encrypt", "-r", recipient], stdin=archive.stdout, stdout=target,
            stderr=subprocess.DEVNULL, preexec_fn=limit_file, env=SAFE_ENV, start_new_session=True)
        archive.stdout.close()
        encrypted_status = wait_leader(encryptor, PROCESS_TIMEOUT)
        archive_status = wait_leader(archive, PROCESS_TIMEOUT)
        size = os.fstat(target).st_size
        if encrypted_status or archive_status or size == 0 or size > limit_bytes:
            raise RuntimeError("capture failed; partial ciphertext remains")
        os.fsync(target)
        return size
    finally:
        for process in (archive, encryptor):
            if process is not None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    print("A capture process could not be reaped after termination.", file=sys.stderr)
        if archive is not None and archive.stdout is not None:
            archive.stdout.close()
        os.close(target)


def wait_leader(process, timeout):
    deadline = time.monotonic() + timeout
    while True:
        result = os.waitid(os.P_PID, process.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
        if result is not None:
            return result.si_status if result.si_code == os.CLD_EXITED else 128 + result.si_status
        if time.monotonic() >= deadline:
            raise subprocess.TimeoutExpired(process.args, timeout)
        time.sleep(0.02)


class GuardedDocker:
    def __init__(self, guard_source, socket_fd):
        self.guard_source = guard_source
        self.socket_fd = socket_fd

    def verify(self):
        environment = dict(SAFE_ENV)
        for name in ("_RAKAZO_SOCKET_FD", "_RAKAZO_DAEMON_ID"):
            environment[name] = os.environ[name]
        result = subprocess.run([PYTHON_BINARY, "-I", "-c", self.guard_source, "check"],
                                pass_fds=(self.socket_fd,), stdin=subprocess.DEVNULL,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                env=environment, timeout=10, cwd="/")
        if result.returncode:
            raise ValueError("Docker daemon guard failed")

    def docker(self, *arguments):
        self.verify()
        try:
            result = subprocess.run(
                [DOCKER_BINARY, "--host", f"unix:///proc/self/fd/{self.socket_fd}", *arguments],
                pass_fds=(self.socket_fd,), stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True, timeout=30,
                env=SAFE_ENV, cwd="/")
        finally:
            self.verify()
        return json.loads(result.stdout)

    def container(self, identifier):
        return self.docker("inspect", identifier)

    def volume(self, name):
        inspected = self.docker("volume", "inspect", name)
        if not isinstance(inspected, list) or len(inspected) != 1:
            raise ValueError("invalid volume inspection")
        return inspected[0]

    def mountinfo(self, pid=None):
        path = "/proc/self/mountinfo" if pid is None else f"/proc/{pid}/mountinfo"
        with open(path, encoding="utf-8", errors="strict") as source:
            return source.read()

    def container_path(self, pid, destination):
        return f"/proc/{pid}/root{destination}"

    def mount_root(self, pid, destination):
        return destination


def inspect_sources(backend, identifier, project, service, expected_names):
    backend.verify()
    document = backend.container(identifier)
    identity = container_identity(document, project, service)
    mounts = document[0]["Mounts"]
    names = []
    for destination in ("/data", "/config"):
        selected = [item for item in mounts if item.get("Destination") == destination]
        if len(selected) != 1 or not isinstance(selected[0].get("Name"), str):
            raise ValueError("missing named volume")
        names.append(selected[0]["Name"])
    volumes = {name: backend.volume(name) for name in names}
    sources = volume_identity(document, volumes, expected_names)
    backend.verify()
    return identity, sources


def object_identity(fd):
    value = os.fstat(fd)
    return value.st_dev, value.st_ino


def check_roots(backend, identity, sources, descriptors):
    host_mountinfo = backend.mountinfo()
    container_mountinfo = backend.mountinfo(identity[1])
    for destination in ("/data", "/config"):
        source = sources[destination][1]
        if os.path.realpath(source) != source:
            raise ValueError("source path is not canonical")
        source_stat = os.stat(source, follow_symlinks=False)
        container_fd = os.open(backend.container_path(identity[1], destination),
                               os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
        try:
            expected = object_identity(descriptors[destination])
            reject_nested_mounts(host_mountinfo, source, mount_id(descriptors[destination]))
            reject_nested_mounts(container_mountinfo, backend.mount_root(identity[1], destination),
                                 mount_id(container_fd))
            if (not stat.S_ISDIR(source_stat.st_mode)
                    or (source_stat.st_dev, source_stat.st_ino) != expected
                    or object_identity(container_fd) != expected):
                raise ValueError("volume root identity changed")
        finally:
            os.close(container_fd)


def validate_source_arguments(arguments):
    if not isinstance(arguments, list) or len(arguments) != 5 or any(
            not isinstance(value, str) for value in arguments):
        raise ValueError("invalid source arguments")
    identifier, project, service, data_name, config_name = arguments
    if (not re.fullmatch(r"[0-9a-f]{64}", identifier)
            or not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", project)
            or not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", service)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", data_name)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", config_name)
            or data_name == config_name):
        raise ValueError("invalid source arguments")
    return identifier, project, service, {"/data": data_name, "/config": config_name}


def check_sources(backend, identifier, project, service, expected_names):
    identity, sources = inspect_sources(backend, identifier, project, service, expected_names)
    if identity[0] != identifier:
        raise ValueError("container ID mismatch")
    descriptors = {}
    try:
        for destination in ("/data", "/config"):
            descriptors[destination] = os.open(
                sources[destination][1], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        check_roots(backend, identity, sources, descriptors)
        if inspect_sources(backend, identity[0], project, service, expected_names) != (identity, sources):
            raise ValueError("container or volume identity changed")
        check_roots(backend, identity, sources, descriptors)
        backend.verify()
    finally:
        for descriptor in descriptors.values():
            os.close(descriptor)


def publish_noreplace(directory_fd, temporary_name, final_name):
    libc = ctypes.CDLL(None, use_errno=True)
    result = libc.renameat2(directory_fd, os.fsencode(temporary_name),
                            directory_fd, os.fsencode(final_name), 1)
    if result != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))


def reject_output_alias(output_path, output_fd, sources, descriptors, mountinfo):
    output_device = os.fstat(output_fd).st_dev
    output_mount = mount_id(output_fd)
    reject_nested_mounts(mountinfo, output_path, output_mount)
    for destination in ("/data", "/config"):
        source = sources[destination][1]
        source_fd = descriptors[destination]
        source_device = os.fstat(source_fd).st_dev
        source_mount = mount_id(source_fd)
        reject_nested_mounts(mountinfo, source, source_mount)
        if source_device == output_device:
            if source_mount != output_mount:
                raise ValueError("output and volume share a device through different mounts; "
                                 "conservative rejection may reject unrelated paths")
            if os.path.commonpath((output_path, source)) == source:
                raise ValueError("output is inside an input volume")


def collect_candidate(backend, identifier, project, service, expected_names, output_path, snapshot_name,
                      recipient, limit_bytes, reserve_bytes):
    if (not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", project)
            or not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", service)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", snapshot_name)
            or not recipient.startswith("age1")
            or limit_bytes <= 0 or reserve_bytes < 0):
        raise ValueError("invalid candidate arguments")
    identity, sources = inspect_sources(backend, identifier, project, service, expected_names)
    for _, source in sources.values():
        if os.path.commonpath((output_path, source)) == source:
            raise ValueError("output is inside an input volume")
    output_fd = open_private_output(output_path)
    descriptors = {}
    snapshot_fd = None
    temporary_name = None
    try:
        for destination in ("/data", "/config"):
            path = sources[destination][1]
            descriptors[destination] = os.open(
                path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        check_roots(backend, identity, sources, descriptors)
        if inspect_sources(backend, identity[0], project, service, expected_names) != (identity, sources):
            raise ValueError("container or volume identity changed")
        check_output_identity(output_path, output_fd)
        reject_output_alias(output_path, output_fd, sources, descriptors, backend.mountinfo())
        space = os.fstatvfs(output_fd)
        if space.f_bavail * space.f_frsize < limit_bytes + reserve_bytes:
            raise ValueError("insufficient free space")
        temporary_name = ".incomplete-" + secrets.token_hex(16)
        os.mkdir(temporary_name, 0o700, dir_fd=output_fd)
        snapshot_fd = os.open(temporary_name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW |
                              os.O_CLOEXEC, dir_fd=output_fd)
        remaining = limit_bytes
        for destination, filename in (("/data", "data.tar.age"), ("/config", "config.tar.age")):
            remaining -= encrypted_archive(descriptors[destination], snapshot_fd, filename,
                                           recipient, remaining, reserve_bytes)
        check_roots(backend, identity, sources, descriptors)
        if inspect_sources(backend, identity[0], project, service, expected_names) != (identity, sources):
            raise ValueError("container or volume identity changed")
        check_output_identity(output_path, output_fd)
        reject_output_alias(output_path, output_fd, sources, descriptors, backend.mountinfo())
        space = os.fstatvfs(output_fd)
        if space.f_bavail * space.f_frsize < reserve_bytes:
            raise ValueError("free-space reserve not met before publication")
        os.fsync(snapshot_fd)
        publish_noreplace(output_fd, temporary_name, snapshot_name)
        try:
            os.fsync(output_fd)
        except OSError:
            try:
                publish_noreplace(output_fd, snapshot_name, temporary_name)
            except OSError as rollback_error:
                temporary_name = None
                raise RuntimeError("publication sync failed and rollback failed; final name may remain") from rollback_error
            raise
        temporary_name = None
        return limit_bytes - remaining
    except BaseException as error:
        if temporary_name is not None:
            raise RuntimeError(f"capture incomplete; encrypted directory remains: {temporary_name}") from error
        raise
    finally:
        if snapshot_fd is not None:
            os.close(snapshot_fd)
        for descriptor in descriptors.values():
            os.close(descriptor)
        os.close(output_fd)


def check_output_identity(path, output_fd):
    current = open_private_output(path)
    try:
        if object_identity(current) != object_identity(output_fd):
            raise ValueError("output directory identity changed")
    finally:
        os.close(current)


def read_trusted_file(path):
    if not os.path.isabs(path) or os.path.normpath(path) != path:
        raise ValueError("invalid trusted file path")
    parent, name = os.path.split(path)
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        for part in parent.split("/")[1:]:
            if not part:
                continue
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
            os.close(fd)
            fd = child
            info = os.fstat(fd)
            if info.st_uid != 0 or info.st_mode & 0o022:
                raise ValueError("untrusted script ancestor")
        target = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
        try:
            info = os.fstat(target)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_size > 1024 * 1024:
                raise ValueError("untrusted script")
            with os.fdopen(target, "rb", closefd=False) as source:
                return source.read(1024 * 1024 + 1).decode("utf-8")
        finally:
            os.close(target)
    finally:
        os.close(fd)


def guard_from_backup(backup, internal_mode):
    begin = 'guard_source="$(cat <<\'PY\'\n'
    end = "\nPY\n)\""
    if backup.count(begin) != 1:
        raise ValueError("guard source unavailable")
    remainder = backup.split(begin, 1)[1]
    if end not in remainder:
        raise ValueError("guard source incomplete")
    guard = remainder.split(end, 1)[0]
    original = 'os.execvpe("bash", ["bash", sys.argv[2]], env)'
    if internal_mode not in ("--guard-check-internal", "--source-check-internal"):
        raise ValueError("invalid guard mode")
    replacement = ('os.execve("/bin/bash", ["/bin/bash", "-p", sys.argv[2], '
                   + repr(internal_mode) + '], env)')
    if guard.count(original) != 1:
        raise ValueError("guard bootstrap incompatible")
    return guard.replace(original, replacement)


def load_guard_source(script_path, internal_mode="--guard-check-internal"):
    read_trusted_file(script_path)
    backup_path = os.path.join(os.path.dirname(script_path), "backup-manual-encrypted.sh")
    return guard_from_backup(read_trusted_file(backup_path), internal_mode)


def seal_snapshot(data, expected_digest, name):
    import fcntl
    if (not re.fullmatch(r"[0-9a-f]{64}", expected_digest)
            or len(data) > 1024 * 1024 or hashlib.sha256(data).hexdigest() != expected_digest):
        raise ValueError("reviewed snapshot digest mismatch")
    begin = b"exec /usr/bin/python3 -I -c \"$(/usr/bin/cat <<'PY'\n"
    end = b'\nPY\n)" "$0" "$@"'
    if name == "caddy-source-script":
        if data.count(begin) != 1 or end not in data.split(begin, 1)[1]:
            raise ValueError("script bootstrap invalid")
        embedded = data.split(begin, 1)[1].split(end, 1)[0]
        frame = sys._getframe()
        while frame.f_back is not None:
            frame = frame.f_back
        reviewed_code = compile(embedded + b"\n", "<string>", "exec",
                                dont_inherit=True, optimize=sys.flags.optimize)
        if (frame.f_code.co_name != "<module>" or frame.f_code.co_filename != "<string>"
                or frame.f_code != reviewed_code):
            raise ValueError("executed bootstrap differs from reviewed script")
    fd = os.memfd_create(name, os.MFD_ALLOW_SEALING)
    try:
        remaining = memoryview(data)
        while remaining:
            written = os.write(fd, remaining)
            if written <= 0:
                raise OSError("snapshot write failed")
            remaining = remaining[written:]
        seals = fcntl.F_SEAL_SEAL | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_GROW | fcntl.F_SEAL_WRITE
        fcntl.fcntl(fd, fcntl.F_ADD_SEALS, seals)
        if fcntl.fcntl(fd, fcntl.F_GET_SEALS) & seals != seals:
            raise ValueError("snapshot seals missing")
        os.set_inheritable(fd, True)
        return fd
    except BaseException:
        os.close(fd)
        raise


def read_sealed_snapshot(fd, expected_digest):
    import fcntl
    seals = fcntl.F_SEAL_SEAL | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_GROW | fcntl.F_SEAL_WRITE
    if (fd < 3 or not re.fullmatch(r"[0-9a-f]{64}", expected_digest)
            or fcntl.fcntl(fd, fcntl.F_GET_SEALS) & seals != seals):
        raise ValueError("snapshot seals missing")
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_size > 1024 * 1024:
        raise ValueError("invalid snapshot")
    data = os.pread(fd, info.st_size + 1, 0)
    if len(data) != info.st_size or hashlib.sha256(data).hexdigest() != expected_digest:
        raise ValueError("reviewed snapshot digest mismatch")
    return data


def prepare_source_snapshot(script_path, script_digest, backup_digest):
    script = read_trusted_file(script_path).encode("utf-8")
    backup_path = os.path.join(os.path.dirname(script_path), "backup-manual-encrypted.sh")
    backup = read_trusted_file(backup_path).encode("utf-8")
    script_fd = seal_snapshot(script, script_digest, "caddy-source-script")
    try:
        backup_fd = seal_snapshot(backup, backup_digest, "caddy-source-guard")
        try:
            guard = guard_from_backup(backup.decode("utf-8"), "--source-check-internal")
            return script_fd, backup_fd, guard
        except BaseException:
            os.close(backup_fd)
            raise
    except BaseException:
        os.close(script_fd)
        raise


def restore_source_snapshot(script_path):
    script_fd = int(os.environ["_RAKAZO_SOURCE_SCRIPT_FD"])
    backup_fd = int(os.environ["_RAKAZO_SOURCE_BACKUP_FD"])
    if script_fd == backup_fd or script_path != f"/proc/self/fd/{script_fd}":
        raise ValueError("invalid snapshot descriptors")
    read_sealed_snapshot(script_fd, os.environ["_RAKAZO_SOURCE_SCRIPT_SHA256"])
    backup = read_sealed_snapshot(backup_fd, os.environ["_RAKAZO_SOURCE_BACKUP_SHA256"])
    return guard_from_backup(backup.decode("utf-8"), "--source-check-internal")


def main():
    if ((len(sys.argv) == 10 and sys.argv[2] == "--source-check")
            or (len(sys.argv) == 3 and sys.argv[2] == "--source-check-internal")):
        try:
            if os.geteuid() != 0:
                raise ValueError("root required")
            internal = sys.argv[2] == "--source-check-internal"
            script_path = sys.argv[1] if internal else os.path.abspath(sys.argv[1])
            raw_arguments = json.loads(os.environ["_RAKAZO_SOURCE_ARGS"]) if internal else sys.argv[3:8]
            identifier, project, service, names = validate_source_arguments(raw_arguments)
            if not internal:
                script_digest, backup_digest = sys.argv[8:10]
                script_fd, backup_fd, guard = prepare_source_snapshot(script_path, script_digest, backup_digest)
                environment = dict(SAFE_ENV)
                environment["_RAKAZO_SOURCE_ARGS"] = json.dumps(raw_arguments, separators=(",", ":"))
                environment["_RAKAZO_SOURCE_SCRIPT_FD"] = str(script_fd)
                environment["_RAKAZO_SOURCE_BACKUP_FD"] = str(backup_fd)
                environment["_RAKAZO_SOURCE_SCRIPT_SHA256"] = script_digest
                environment["_RAKAZO_SOURCE_BACKUP_SHA256"] = backup_digest
                os.execve(PYTHON_BINARY, [PYTHON_BINARY, "-I", "-c", guard, "start",
                                          f"/proc/self/fd/{script_fd}"],
                          environment)
            guard = restore_source_snapshot(script_path)
            backend = GuardedDocker(guard, int(os.environ["_RAKAZO_SOCKET_FD"]))
            check_sources(backend, identifier, project, service, names)
            print("Source identity and mount checks passed at inspection time; no volume file contents were read "
                  "and no capture was performed. This is not a snapshot or a production readiness approval.")
            return 0
        except ValueError as error:
            if str(error) == "expected volume name mismatch":
                print("Source check failed: expected volume name mismatch.", file=sys.stderr)
            else:
                print("Source check failed; no capture was performed.", file=sys.stderr)
            return 1
        except (OSError, KeyError, TypeError, IndexError, subprocess.SubprocessError):
            print("Source check failed; no capture was performed.", file=sys.stderr)
            return 1
    if len(sys.argv) == 3 and sys.argv[2] in ("--guard-check", "--guard-check-internal"):
        script_path = os.path.abspath(sys.argv[1])
        try:
            if os.geteuid() != 0:
                raise ValueError("root required")
            guard = load_guard_source(script_path)
            if sys.argv[2] == "--guard-check":
                os.execve(PYTHON_BINARY, [PYTHON_BINARY, "-I", "-c", guard, "start", script_path], SAFE_ENV)
            GuardedDocker(guard, int(os.environ["_RAKAZO_SOCKET_FD"])).verify()
            print("Guarded local Docker identity verified; no production capture is enabled.")
            return 0
        except (OSError, ValueError, KeyError, subprocess.SubprocessError):
            print("Guarded Docker verification failed.", file=sys.stderr)
            return 1
    print("Production capture remains blocked pending independent review and production readiness.",
          file=sys.stderr)
    print("Mount checks are point-in-time and cannot detect transient mounts; online data is not atomic. "
          "Free-space checks are not an isolated quota; recovery is not validated.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
PY
)" "$0" "$@"
fi

if [[ $# != 1 || "$1" != "--synthetic" ]]; then
  printf '%s\n' 'Synthetic experiment only: pass --synthetic. Production input is not supported.' >&2
  exit 2
fi
[[ "$(uname -s)" == Linux ]] || { echo 'Linux is required.' >&2; exit 1; }
for tool in age age-keygen tar python3 setfacl getfacl mktemp stat cmp; do
  command -v "$tool" >/dev/null || { echo "Required tool unavailable: $tool" >&2; exit 1; }
done
limit_kib="${SYNTHETIC_LIMIT_KIB:-1024}"
[[ "$limit_kib" =~ ^[1-9][0-9]{0,5}$ ]] || { echo 'Invalid synthetic size limit.' >&2; exit 2; }
lab="$(mktemp -d /tmp/caddy-backup-synthetic.XXXXXXXXXX)"
cleanup() {
  local status=$?
  trap - EXIT
  if ! rm -rf -- "$lab"; then
    echo "Synthetic cleanup failed; inspect private temporary directory: $lab" >&2
    status=1
  else
    echo 'Synthetic temporary files removed.' >&2
  fi
  exit "$status"
}
trap cleanup EXIT

mkdir -m 700 "$lab/data" "$lab/config" "$lab/restored"
printf '%s\n' synthetic-data >"$lab/data/file"
printf '%s\n' synthetic-config >"$lab/config/file"
mkdir -m 750 "$lab/data/empty"
dd if=/dev/urandom of="$lab/data/random" bs=1024 count=256 status=none
setfacl -m u:12345:r-- "$lab/data/file"
python3 - "$lab/data/file" <<'PY'
import os
import sys
os.setxattr(sys.argv[1], "user.synthetic", b"synthetic-xattr")
PY
age-keygen >"$lab/identity" 2>/dev/null
recipient="$(age-keygen -y "$lab/identity")"
exec 8<"$lab"

if ! (
  ulimit -f "$limit_kib"
  set -o noclobber
  tar --create --file - --format=pax --numeric-owner --acls --xattrs \
    --xattrs-include='*' -C /proc/self/fd/8 data config \
    | age --encrypt -r "$recipient" >"$lab/archive.age"
); then
  echo 'Synthetic encrypted capture failed; partial ciphertext is temporary.' >&2
  exit 1
fi
bytes="$(stat -c %s "$lab/archive.age")"
(( bytes > 0 && bytes <= limit_kib * 1024 )) || { echo 'Ciphertext size limit failed.' >&2; exit 1; }

age --decrypt -i "$lab/identity" "$lab/archive.age" \
  | tar --extract --file - --numeric-owner --acls --xattrs --xattrs-include='*' -C "$lab/restored"
cmp "$lab/data/random" "$lab/restored/data/random"
cmp "$lab/config/file" "$lab/restored/config/file"
[[ -d "$lab/restored/data/empty" ]]
[[ "$(stat -c '%u:%g:%a' "$lab/data/file")" == "$(stat -c '%u:%g:%a' "$lab/restored/data/file")" ]]
[[ "$(getfacl -cp "$lab/data/file")" == "$(getfacl -cp "$lab/restored/data/file")" ]]
python3 - "$lab/restored/data/file" <<'PY'
import os
import sys
assert os.getxattr(sys.argv[1], "user.synthetic") == b"synthetic-xattr"
PY
echo 'Synthetic capture and limited synthetic restore checks completed.'
echo 'Experiment only: no Docker identity, mount checks, capacity reserve, or production input.'
echo 'Synthetic mode inherits PATH; use a trusted environment and trusted tools.'
echo 'Online backups are non-atomic; capacity checks are not quotas; production recovery is unverified.'
