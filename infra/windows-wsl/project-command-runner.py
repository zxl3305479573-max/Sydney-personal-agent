import base64
import ctypes
import errno
import json
import os
import selectors
import signal
import socket
import stat
import subprocess
import sys
import time

MAX_LINE = 2 * 1024 * 1024
MAX_FILE = 64 * 1024
MAX_INPUT = MAX_FILE * 16
MAX_OUTPUT = 64 * 1024
RUNTIME = "/opt/sydney/project-command-runtime"
RUNNER_USER = "sydney-project-runner"
SECCOMP_ALLOW = 0x7FFF0000
SECCOMP_DENY = 0x00050000 | errno.EPERM


class Refused(Exception):
    pass


def reply(value, code=0):
    sys.stdout.buffer.write(json.dumps(value, separators=(",", ":")).encode() + b"\n")
    sys.stdout.buffer.flush()
    return code


def install_filter(fd):
    library = ctypes.CDLL("libseccomp.so.2")
    library.seccomp_init.argtypes = [ctypes.c_uint32]
    library.seccomp_init.restype = ctypes.c_void_p
    library.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    library.seccomp_rule_add.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint]
    library.seccomp_export_bpf.argtypes = [ctypes.c_void_p, ctypes.c_int]
    library.seccomp_release.argtypes = [ctypes.c_void_p]
    policy = library.seccomp_init(SECCOMP_ALLOW)
    if not policy:
        raise Refused("seccomp unavailable")
    try:
        for name in (
            b"socket", b"socketpair", b"io_uring_setup", b"bpf", b"ptrace",
            b"process_vm_readv", b"process_vm_writev", b"perf_event_open", b"keyctl",
            b"add_key", b"request_key", b"userfaultfd", b"unshare", b"setns",
            b"mount", b"umount2", b"pivot_root", b"open_by_handle_at", b"setsid", b"setpgid",
        ):
            syscall = library.seccomp_syscall_resolve_name(name)
            if syscall < 0 or library.seccomp_rule_add(policy, SECCOMP_DENY, syscall, 0) != 0:
                raise Refused("seccomp policy unavailable")
        if library.seccomp_export_bpf(policy, fd) != 0:
            raise Refused("seccomp policy export failed")
    finally:
        library.seccomp_release(policy)
    os.lseek(fd, 0, os.SEEK_SET)


def trusted_file(path, executable=False):
    metadata = os.stat(path, follow_symlinks=False)
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_mode & (0o022 | stat.S_ISUID | stat.S_ISGID):
        raise Refused("untrusted sandbox runtime")
    if executable and not metadata.st_mode & 0o111:
        raise Refused("sandbox runtime executable unavailable")


def runtime_link_target(path):
    target = os.readlink(path)
    if os.path.isabs(target):
        candidate = os.path.normpath(os.path.join(RUNTIME, target.lstrip("/")))
    else:
        candidate = os.path.normpath(os.path.join(os.path.dirname(path), target))
    if os.path.commonpath((RUNTIME, candidate)) != RUNTIME:
        raise Refused("sandbox runtime link escapes its root")
    return candidate


def trusted_runtime_path(path, executable=False):
    current = path
    visited = set()
    while stat.S_ISLNK(os.lstat(current).st_mode):
        if current in visited:
            raise Refused("sandbox runtime link cycle")
        visited.add(current)
        current = runtime_link_target(current)
    if os.path.commonpath((RUNTIME, current)) != RUNTIME:
        raise Refused("sandbox runtime file escapes its root")
    trusted_file(current, executable=executable)


def trusted_runtime_tree():
    try:
        with open("/proc/self/mountinfo", "r", encoding="utf-8") as mounts:
            for line in mounts:
                fields = line.split()
                mountpoint = fields[4]
                for escaped, decoded in (
                    ("\\040", " "), ("\\011", "\t"), ("\\012", "\n"), ("\\134", "\\"),
                ):
                    mountpoint = mountpoint.replace(escaped, decoded)
                if mountpoint == RUNTIME or mountpoint.startswith(RUNTIME + "/"):
                    return False
    except (OSError, IndexError):
        return False
    checked = 0
    for directory, names, files in os.walk(RUNTIME, followlinks=False):
        for name in [*names, *files]:
            checked += 1
            if checked > 50000:
                return False
            path = os.path.join(directory, name)
            metadata = os.lstat(path)
            if metadata.st_uid != 0 or metadata.st_mode & (0o022 | stat.S_ISUID | stat.S_ISGID):
                return False
            if stat.S_ISLNK(metadata.st_mode):
                try:
                    runtime_link_target(path)
                except (OSError, ValueError, Refused):
                    return False
            elif stat.S_ISREG(metadata.st_mode):
                if metadata.st_nlink != 1:
                    return False
            elif not (stat.S_ISDIR(metadata.st_mode) or stat.S_ISCHR(metadata.st_mode) or
                      stat.S_ISBLK(metadata.st_mode)):
                return False
    return checked > 0


def configured_for_isolation():
    try:
        import pwd

        account = pwd.getpwuid(os.getuid()).pw_name
    except (ImportError, KeyError, OSError):
        return False
    if os.getuid() == 0 or account != RUNNER_USER:
        return False
    if "microsoft-standard-wsl2" not in os.uname().release.lower():
        return False
    if os.environ.get("WSL_INTEROP") or has_windows_drive_mount():
        return False
    try:
        trusted_file("/etc/wsl.conf")
        import configparser

        config = configparser.ConfigParser()
        config.read("/etc/wsl.conf", encoding="utf-8")
        if config.getboolean("automount", "enabled", fallback=True):
            return False
        if config.getboolean("interop", "enabled", fallback=True):
            return False
        for path in ("/opt", "/opt/sydney", RUNTIME):
            metadata = os.stat(path, follow_symlinks=False)
            if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_mode & 0o022:
                return False
        trusted_file("/usr/bin/bwrap", executable=True)
        if not trusted_runtime_tree():
            return False
        trusted_runtime_path(os.path.join(RUNTIME, "usr/bin/python3"), executable=True)
        trusted_runtime_path(os.path.join(RUNTIME, "usr/bin/prlimit"), executable=True)
        ctypes.CDLL("libseccomp.so.2")
        return True
    except (OSError, ValueError, KeyError, configparser.Error, AttributeError):
        return False


def has_windows_drive_mount():
    try:
        with open("/proc/self/mountinfo", "r", encoding="utf-8") as mounts:
            for line in mounts:
                fields = line.split()
                separator = fields.index("-")
                filesystem = fields[separator + 1].lower()
                source = fields[separator + 2]
                if filesystem == "drvfs" or (
                    len(source) >= 2 and source[0].isalpha() and source[1] == ":"
                ):
                    return True
        return False
    except (OSError, ValueError, IndexError):
        return True


def validate_path(value):
    if not isinstance(value, str) or not value or len(value) > 1024 or "\\" in value or "\0" in value:
        raise Refused("invalid project input path")
    parts = value.split("/")
    if any(not part or part in (".", "..") or len(part.encode("utf-8")) > 255 or
           any(ord(char) < 32 or ord(char) == 127 for char in part) for part in parts):
        raise Refused("invalid project input path")
    return parts


def read_request():
    line = sys.stdin.buffer.readline(MAX_LINE + 1)
    if not line or len(line) > MAX_LINE or not line.endswith(b"\n"):
        raise Refused("invalid project command request")
    value = json.loads(line)
    if not isinstance(value, dict) or set(value) != {"argv", "inputFiles", "timeoutMs", "files"}:
        raise Refused("invalid project command request")
    return value


def check_request(request):
    argv, paths, timeout, files = (
        request["argv"], request["inputFiles"], request["timeoutMs"], request["files"],
    )
    if (
        not isinstance(argv, list) or not 1 <= len(argv) <= 32 or argv[0] == "" or
        any(not isinstance(arg, str) or "\0" in arg or len(arg.encode("utf-8")) > 1024 for arg in argv) or
        sum(len(arg.encode("utf-8")) for arg in argv) > 4096 or
        not isinstance(paths, list) or len(paths) > 16 or
        not isinstance(timeout, int) or isinstance(timeout, bool) or not 1 <= timeout <= 7000 or
        not isinstance(files, list) or len(files) != len(paths)
    ):
        raise Refused("invalid project command request")
    normalized = ["/".join(validate_path(path)) for path in paths]
    if len(set(normalized)) != len(normalized):
        raise Refused("duplicate project input")
    for index, path in enumerate(normalized):
        if any(other.startswith(path + "/") or path.startswith(other + "/") for other in normalized[index + 1:]):
            raise Refused("overlapping project inputs")
    total = 0
    contents = []
    for item, path in zip(files, normalized):
        if not isinstance(item, dict) or set(item) != {"path", "content"} or item["path"] != path:
            raise Refused("project input mismatch")
        if not isinstance(item["content"], str):
            raise Refused("invalid project input")
        data = base64.b64decode(item["content"], validate=True)
        if len(data) > MAX_FILE:
            raise Refused("project input exceeds the file limit")
        data.decode("utf-8")
        total += len(data)
        contents.append(data)
    if total > MAX_INPUT:
        raise Refused("project inputs exceed the limit")
    return argv, normalized, timeout, contents


def run_probe():
    with os.fdopen(os.memfd_create("project-probe-seccomp", os.MFD_CLOEXEC), "w+b", closefd=True) as policy:
        install_filter(policy.fileno())
        command = [
            "/usr/bin/bwrap", "--unshare-all", "--unshare-user", "--disable-userns",
            "--unshare-pid", "--die-with-parent", "--cap-drop", "ALL",
            "--ro-bind", RUNTIME, "/", "--tmpfs", "/workspace", "--tmpfs", "/tmp",
            "--dev", "/dev", "--proc", "/proc", "--seccomp", str(policy.fileno()),
            "--clearenv", "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "HOME", "/workspace",
            "--chdir", "/workspace", "--", "/usr/bin/python3", "-I", "-c",
            "import errno,os,socket,sys; assert 'microsoft-standard-wsl2' in os.uname().release.lower(); assert not os.path.exists('/mnt/c'); assert not os.environ.get('WSL_INTEROP');\ntry: socket.socket(socket.AF_INET)\nexcept OSError as e: assert e.errno == errno.EPERM\nelse: raise AssertionError('network socket available')\ntry: os.setsid()\nexcept PermissionError: pass\nelse: raise AssertionError('session escape available')",
        ]
        result = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=5, env={"LANG": "C.UTF-8"}, check=False,
                                pass_fds=(policy.fileno(),))
        return result.returncode == 0


def available():
    return configured_for_isolation() and run_probe()


def execute(request):
    argv, paths, timeout, contents = check_request(request)
    with os.fdopen(os.memfd_create("project-command-seccomp", os.MFD_CLOEXEC), "w+b", closefd=True) as policy, \
         os.fdopen(os.memfd_create("project-command-status", os.MFD_CLOEXEC), "w+b", closefd=True) as status:
        install_filter(policy.fileno())
        command = [
            "/usr/bin/bwrap", "--unshare-all", "--unshare-user", "--disable-userns",
            "--unshare-pid", "--die-with-parent", "--cap-drop", "ALL",
            "--ro-bind", RUNTIME, "/",
            "--size", str(MAX_INPUT * 2), "--tmpfs", "/workspace",
            "--size", str(MAX_INPUT), "--tmpfs", "/tmp",
            "--dev", "/dev", "--proc", "/proc",
            "--seccomp", str(policy.fileno()), "--info-fd", str(status.fileno()),
            "--clearenv", "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "HOME", "/workspace",
            "--setenv", "TMPDIR", "/tmp", "--setenv", "LANG", "C.UTF-8", "--chdir", "/workspace",
        ]
        descriptors = [policy.fileno(), status.fileno()]
        directories = set()
        staged_descriptors = []
        process = None
        selector = None
        try:
            for path, data in zip(paths, contents):
                parts = path.split("/")
                for index in range(1, len(parts)):
                    folder = "/workspace/" + "/".join(parts[:index])
                    if folder not in directories:
                        command.extend(["--dir", folder])
                        directories.add(folder)
                descriptor = os.memfd_create("project-command-input", os.MFD_CLOEXEC)
                staged_descriptors.append(descriptor)
                with os.fdopen(descriptor, "wb", closefd=False) as staged:
                    staged.write(data)
                os.lseek(descriptor, 0, os.SEEK_SET)
                command.extend(["--file", str(descriptor), "/workspace/" + path])
            command.extend([
                "--", "/usr/bin/prlimit", "--as=536870912", "--cpu=6", "--nproc=64", "--nofile=64",
                "--", *argv,
            ])
            descriptors.extend(staged_descriptors)
            process = subprocess.Popen(
                command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                env={"LANG": "C.UTF-8"}, pass_fds=tuple(descriptors), start_new_session=True,
            )
            selector = selectors.DefaultSelector()
            selector.register(process.stdout, selectors.EVENT_READ, "stdout")
            selector.register(process.stderr, selectors.EVENT_READ, "stderr")
            selector.register(sys.stdin.buffer, selectors.EVENT_READ, "control")
            output = {"stdout": bytearray(), "stderr": bytearray()}
            control = bytearray()
            deadline = time.monotonic() + timeout / 1000
            while selector.get_map() or process.poll() is None:
                if process.poll() is not None and sys.stdin.buffer in selector.get_map():
                    selector.unregister(sys.stdin.buffer)
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise Refused("project command timed out")
                for selected, _ in selector.select(min(0.1, remaining)):
                    if selected.data == "control":
                        chunk = os.read(sys.stdin.fileno(), 4096)
                        if not chunk:
                            raise Refused("project command cancelled")
                        control.extend(chunk)
                        if len(control) > 4096:
                            raise Refused("invalid project command control")
                        while b"\n" in control:
                            line, _, remainder = control.partition(b"\n")
                            control = bytearray(remainder)
                            try:
                                message = json.loads(line)
                            except json.JSONDecodeError as error:
                                raise Refused("invalid project command control") from error
                            if message == {"cancel": True}:
                                raise Refused("project command cancelled")
                            raise Refused("invalid project command control")
                    else:
                        chunk = os.read(selected.fileobj.fileno(), 65536)
                        if not chunk:
                            selector.unregister(selected.fileobj)
                            continue
                        output[selected.data].extend(chunk)
                        if sum(len(value) for value in output.values()) > MAX_OUTPUT:
                            raise Refused("project command output limit exceeded")
            if os.fstat(status.fileno()).st_size == 0:
                raise Refused("project command isolation failed to start")
            return {
                "stdout": output["stdout"].decode("utf-8", errors="replace"),
                "stderr": output["stderr"].decode("utf-8", errors="replace"),
                "code": process.returncode,
            }
        finally:
            if selector is not None:
                selector.close()
            if process is not None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                if process.poll() is None:
                    process.wait()
                process.stdout.close()
                process.stderr.close()
            for descriptor in staged_descriptors:
                os.close(descriptor)


def main():
    if sys.argv[1:] == ["--health"]:
        return reply({"available": available()})
    if sys.argv[1:]:
        return reply({"error": "unsupported request"}, 2)
    try:
        if not available():
            return reply({"status": "unavailable"})
        request = read_request()
        result = execute(request)
        return reply(result)
    except (Refused, OSError, ValueError, TypeError, subprocess.SubprocessError, json.JSONDecodeError) as error:
        return reply({"error": str(error)[:256]}, 1)


if __name__ == "__main__":
    raise SystemExit(main())
