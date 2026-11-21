import base64
import ctypes
import errno
import hashlib
import json
import os
import pwd
import re
import select
import selectors
import signal
import socket
import stat
import struct
import subprocess
import threading
import time
import uuid
from contextlib import ExitStack

MAX_REQUEST = 40 * 1024 * 1024
MAX_FILE = 8 * 1024 * 1024
PROJECT_FILE_LIMIT = 64 * 1024
MAX_EXPORT = 24 * 1024 * 1024
MAX_OUTPUT = 1024 * 1024
MAX_FILES = 500
PROJECT_COMMAND_OUTPUT_LIMIT = 64 * 1024
PROJECT_COMMAND_INPUT_LIMIT = PROJECT_FILE_LIMIT * 16
PROJECT_COMMAND_RUNTIME = "/opt/sydney/project-command-runtime"
SECCOMP_ALLOW = 0x7FFF0000
SECCOMP_DENY = 0x00050000 | errno.EPERM
VALID_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
VALID_KEY = re.compile(r"^[A-Za-z0-9_.+-]{1,100}$")


class Refused(Exception):
    pass


class ControlBusy(Refused):
    pass


class GenerationChanged(Refused):
    pass


def project_command_filter(descriptor):
    library = ctypes.CDLL("libseccomp.so.2")
    library.seccomp_init.argtypes = [ctypes.c_uint32]
    library.seccomp_init.restype = ctypes.c_void_p
    library.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    library.seccomp_rule_add.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint]
    library.seccomp_export_bpf.argtypes = [ctypes.c_void_p, ctypes.c_int]
    library.seccomp_release.argtypes = [ctypes.c_void_p]
    policy = library.seccomp_init(SECCOMP_ALLOW)
    if not policy:
        raise Refused("Could not initialize project command isolation")
    try:
        for name in (
            b"socket", b"socketpair", b"io_uring_setup", b"bpf", b"ptrace",
            b"process_vm_readv", b"process_vm_writev", b"perf_event_open", b"keyctl",
            b"add_key", b"request_key", b"userfaultfd", b"unshare", b"setns",
            b"mount", b"umount2", b"pivot_root", b"open_by_handle_at", b"setsid", b"setpgid",
        ):
            syscall = library.seccomp_syscall_resolve_name(name)
            if syscall < 0 or library.seccomp_rule_add(policy, SECCOMP_DENY, syscall, 0) != 0:
                raise Refused("Could not restrict project command syscalls")
        if library.seccomp_export_bpf(policy, descriptor) != 0:
            raise Refused("Could not export project command isolation")
    finally:
        library.seccomp_release(policy)
    os.lseek(descriptor, 0, os.SEEK_SET)


class Driver:
    def __init__(self, root, control_uid, display, xauthority, project_commands=False):
        self.root = os.path.abspath(root)
        self.control_uid = control_uid
        self.display = display
        self.xauthority = xauthority
        self.project_commands = project_commands
        self.generation = uuid.uuid4().hex
        self.lock = threading.RLock()
        self.active = None
        self.fences = {}
        self.processes = {}
        self.control = None
        self.control_fences = {}
        self.revoked_controls = {}
        os.makedirs(self.root, mode=0o700, exist_ok=True)

    def peer_allowed(self, connection):
        credentials = connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12)
        _, uid, _ = struct.unpack("3i", credentials)
        return uid == self.control_uid

    def bot_directory(self, bot_id):
        if not isinstance(bot_id, str) or not VALID_ID.fullmatch(bot_id):
            raise Refused("Invalid desktop identity")
        root_fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            try:
                os.mkdir(bot_id, 0o700, dir_fd=root_fd)
            except FileExistsError:
                pass
            return os.open(bot_id, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd)
        finally:
            os.close(root_fd)

    def path_parts(self, path, allow_empty=False):
        if not isinstance(path, str) or "\0" in path or "\\" in path or path.startswith("/"):
            raise Refused("Invalid workspace path")
        parts = path.split("/") if path else []
        if any(part in ("", ".", "..") for part in parts) or (not allow_empty and not parts):
            raise Refused("Invalid workspace path")
        return parts

    def directory(self, bot_id, parts, create=False):
        current = self.bot_directory(bot_id)
        try:
            for part in parts:
                if create:
                    try:
                        os.mkdir(part, 0o700, dir_fd=current)
                    except FileExistsError:
                        pass
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current)
                os.close(current)
                current = child
            return current
        except Exception:
            os.close(current)
            raise

    def authorize_run(self, request):
        run = request.get("run")
        if not isinstance(run, dict):
            raise Refused("Run lease required")
        run_id, fence, expires_at = run.get("id"), run.get("fence"), run.get("expiresAt")
        now = int(time.time() * 1000)
        if (
            not isinstance(run_id, str) or not VALID_ID.fullmatch(run_id)
            or not isinstance(fence, int) or isinstance(fence, bool) or fence < 1
            or not isinstance(expires_at, int) or expires_at <= now or expires_at > now + 10_500
        ):
            raise Refused("Invalid or expired run lease")
        with self.lock:
            control = getattr(self, "control", None)
            if control and control["expiresAt"] > now:
                raise Refused("Desktop is held by human control")
            if fence < self.fences.get(run_id, 0):
                raise Refused("Stale run fence")
            if self.active and self.active["expiresAt"] > now and (
                self.active["id"] != run_id or self.active["botId"] != request["botId"]
            ):
                raise Refused("Desktop is held by another run")
            self.fences[run_id] = fence
            self.active = {**run, "botId": request["botId"]}
        return run_id

    def read_file(self, bot_id, path, max_bytes=MAX_FILE):
        parts = self.path_parts(path)
        if not isinstance(max_bytes, int) or isinstance(max_bytes, bool) or max_bytes < 1:
            raise Refused("Invalid file limit")
        max_bytes = min(max_bytes, MAX_FILE)
        directory = self.directory(bot_id, parts[:-1])
        try:
            return self.read_regular_file(directory, parts[-1], max_bytes)
        finally:
            os.close(directory)

    def read_regular_file(self, directory, name, limit, device=None):
        descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        try:
            metadata = os.fstat(descriptor)
            if (
                not stat.S_ISREG(metadata.st_mode) or metadata.st_size > limit
                or (device is not None and (metadata.st_dev != device or metadata.st_nlink != 1))
            ):
                raise Refused("File unavailable or too large")
            data = bytearray()
            while len(data) <= limit:
                chunk = os.read(descriptor, min(65536, limit + 1 - len(data)))
                if not chunk:
                    break
                data.extend(chunk)
            if len(data) > limit:
                raise Refused("File too large")
            return bytes(data)
        finally:
            os.close(descriptor)

    def project_path_parts(self, path):
        if not isinstance(path, str) or len(path) > 1024 or any(
            ord(character) < 32 or ord(character) == 127 for character in path
        ):
            raise Refused("Invalid project path")
        parts = self.path_parts(path)
        if any(len(part.encode("utf-8")) > 255 for part in parts):
            raise Refused("Invalid project path")
        return parts

    def project_folder(self, bot_id, path):
        root = self.directory(bot_id, self.project_path_parts(path))
        try:
            metadata = os.fstat(root)
            return {"path": path, "device": str(metadata.st_dev), "inode": str(metadata.st_ino)}
        finally:
            os.close(root)

    def project_command_available(self, request):
        self.authorize_run(request)
        if not self.project_commands:
            return {"available": False}
        try:
            for directory in ("/opt", "/opt/sydney", PROJECT_COMMAND_RUNTIME):
                metadata = os.stat(directory, follow_symlinks=False)
                if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_mode & 0o022:
                    return {"available": False}
            for path in (
                "/usr/bin/bwrap",
                os.path.join(PROJECT_COMMAND_RUNTIME, "usr/bin/python3"),
                os.path.join(PROJECT_COMMAND_RUNTIME, "usr/bin/prlimit"),
            ):
                metadata = os.stat(path, follow_symlinks=False)
                if path.endswith("bwrap"):
                    if (
                        not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0
                        or metadata.st_mode & (0o622 | stat.S_ISUID | stat.S_ISGID)
                    ):
                        return {"available": False}
                elif path.endswith(("python3", "prlimit")):
                    if not stat.S_ISREG(metadata.st_mode) or not metadata.st_mode & 0o111 or metadata.st_mode & 0o022:
                        return {"available": False}
                elif not stat.S_ISDIR(metadata.st_mode):
                    return {"available": False}
            ctypes.CDLL("libseccomp.so.2")
        except (OSError, AttributeError):
            return {"available": False}
        return {"available": True}

    def project_file(self, request, connection):
        folder, file = request.get("folder"), request.get("file")
        if not isinstance(folder, dict) or not isinstance(file, dict):
            raise Refused("Project folder and operation are required")
        operation = file.get("operation")
        if operation == "list":
            parts = self.path_parts(file.get("path", ""), allow_empty=True)
            if any(len(part.encode("utf-8")) > 255 for part in parts):
                raise Refused("Invalid project path")
        else:
            parts = self.project_path_parts(file.get("path"))
        if operation == "create":
            text = file.get("text")
            if not isinstance(text, str) or not parts[-1].lower().endswith(".md"):
                raise Refused("Only new UTF-8 Markdown is supported")
            data = text.encode("utf-8")
            if len(data) > PROJECT_FILE_LIMIT:
                raise Refused("Project file is too large")
        elif operation == "update":
            text = file.get("text")
            expected_hash = file.get("expectedSha256")
            if not isinstance(text, str) or not isinstance(expected_hash, str) or not re.fullmatch(r"[a-f0-9]{64}", expected_hash):
                raise Refused("Invalid project file update")
            data = text.encode("utf-8")
            if len(data) > PROJECT_FILE_LIMIT:
                raise Refused("Project file is too large")
        elif operation not in ("list", "read"):
            raise Refused("Unknown project file operation")
        root = self.directory(request["botId"], self.project_path_parts(folder.get("path")))
        current = root
        try:
            identity = os.fstat(root)
            if folder.get("device") != str(identity.st_dev) or folder.get("inode") != str(identity.st_ino):
                raise Refused("Authorized directory changed")
            directory_parts = parts if operation == "list" else parts[:-1]
            for part in directory_parts:
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current)
                if current != root:
                    os.close(current)
                current = child
                if os.fstat(current).st_dev != identity.st_dev:
                    raise Refused("Project directory crosses devices")
            with self.lock:
                if select.select([connection], [], [], 0)[0]:
                    raise Refused("Project request disconnected")
                self.authorize_run(request)
                if operation == "read":
                    content = self.read_regular_file(current, parts[-1], PROJECT_FILE_LIMIT, identity.st_dev)
                    return {
                        "operation": "read", "text": content.decode("utf-8"),
                        "sha256": hashlib.sha256(content).hexdigest(),
                    }
                if operation == "list":
                    entries = []
                    truncated = False
                    base = "/".join(parts)
                    scanned = 0
                    with os.scandir(current) as contents:
                        for item in contents:
                            scanned += 1
                            if scanned > MAX_FILES:
                                truncated = True
                                break
                            name = item.name
                            metadata = item.stat(follow_symlinks=False)
                            if metadata.st_dev != identity.st_dev or not (
                                stat.S_ISDIR(metadata.st_mode) or stat.S_ISREG(metadata.st_mode)
                            ):
                                continue
                            if stat.S_ISREG(metadata.st_mode) and metadata.st_nlink != 1:
                                continue
                            entry_path = "/".join(filter(None, (base, name)))
                            try:
                                self.project_path_parts(entry_path)
                            except Refused:
                                continue
                            if len(entries) == MAX_FILES:
                                truncated = True
                                break
                            entries.append({
                                "path": entry_path,
                                "kind": "directory" if stat.S_ISDIR(metadata.st_mode) else "file",
                            })
                    entries.sort(key=lambda entry: entry["path"])
                    return {"operation": "list", "entries": entries, "truncated": truncated}
                if operation == "update":
                    previous = self.read_regular_file(current, parts[-1], PROJECT_FILE_LIMIT, identity.st_dev)
                    previous_hash = hashlib.sha256(previous).hexdigest()
                    if previous_hash != expected_hash:
                        return {"operation": "conflict", "sha256": previous_hash}
                    metadata = os.stat(parts[-1], dir_fd=current, follow_symlinks=False)
                    temporary = f".sydney-update-{uuid.uuid4().hex}"
                    descriptor = os.open(
                        temporary,
                        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                        stat.S_IMODE(metadata.st_mode),
                        dir_fd=current,
                    )
                    try:
                        with os.fdopen(descriptor, "wb", closefd=False) as handle:
                            handle.write(data)
                            handle.flush()
                            os.fsync(descriptor)
                        latest = self.read_regular_file(current, parts[-1], PROJECT_FILE_LIMIT, identity.st_dev)
                        latest_hash = hashlib.sha256(latest).hexdigest()
                        if latest_hash != expected_hash:
                            return {"operation": "conflict", "sha256": latest_hash}
                        if select.select([connection], [], [], 0)[0]:
                            raise Refused("Project request disconnected")
                        self.authorize_run(request)
                        os.replace(temporary, parts[-1], src_dir_fd=current, dst_dir_fd=current)
                        return {
                            "operation": "update", "bytes": len(data),
                            "sha256": hashlib.sha256(data).hexdigest(),
                        }
                    finally:
                        os.close(descriptor)
                        try:
                            os.unlink(temporary, dir_fd=current)
                        except FileNotFoundError:
                            pass
                descriptor = os.open(
                    parts[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=current,
                )
                with os.fdopen(descriptor, "wb") as handle:
                    handle.write(data)
                return {"operation": "create", "bytes": len(data)}
        finally:
            if current != root:
                os.close(current)
            os.close(root)

    def project_command(self, request, connection):
        if not self.project_commands:
            raise Refused("Project command isolation is unavailable")
        folder, command = request.get("folder"), request.get("command")
        if not isinstance(folder, dict) or not isinstance(command, dict) or set(command) != {
            "argv", "inputFiles", "timeoutMs",
        }:
            raise Refused("Invalid project command")
        argv, paths, timeout = command["argv"], command["inputFiles"], command["timeoutMs"]
        if (
            not isinstance(argv, list) or not 1 <= len(argv) <= 32 or not argv[0]
            or any(not isinstance(arg, str) or "\0" in arg or len(arg.encode("utf-8")) > 1024 for arg in argv)
            or sum(len(arg.encode("utf-8")) for arg in argv) > 4096
            or not isinstance(paths, list) or len(paths) > 16
            or not isinstance(timeout, int) or isinstance(timeout, bool) or not 1 <= timeout <= 7000
        ):
            raise Refused("Invalid project command")
        path_parts = [self.project_path_parts(path) for path in paths]
        if len(set(paths)) != len(paths):
            raise Refused("Duplicate project command input")
        self.authorize_run(request)
        if self.project_command_available(request) != {"available": True}:
            raise Refused("Project command isolation runtime is unavailable")
        with ExitStack() as resources:
            def buffer(name):
                descriptor = os.memfd_create(name, os.MFD_CLOEXEC)
                resources.callback(os.close, descriptor)
                return descriptor

            root = self.directory(request["botId"], self.project_path_parts(folder.get("path")))
            resources.callback(os.close, root)
            identity = os.fstat(root)
            if folder.get("device") != str(identity.st_dev) or folder.get("inode") != str(identity.st_ino):
                raise Refused("Authorized directory changed")
            policy, status = buffer("project-command-policy"), buffer("project-command-status")
            project_command_filter(policy)
            launch = [
                "/usr/bin/bwrap", "--unshare-all", "--unshare-user", "--disable-userns",
                "--unshare-pid", "--die-with-parent", "--cap-drop", "ALL",
                "--ro-bind", PROJECT_COMMAND_RUNTIME, "/",
                "--size", str(PROJECT_COMMAND_INPUT_LIMIT * 2), "--tmpfs", "/workspace",
                "--size", str(PROJECT_COMMAND_INPUT_LIMIT), "--tmpfs", "/tmp",
                "--dev", "/dev", "--remount-ro", "/dev",
                "--proc", "/proc",
                "--seccomp", str(policy), "--info-fd", str(status),
                "--clearenv", "--setenv", "PATH", "/usr/bin:/bin",
                "--setenv", "HOME", "/workspace", "--setenv", "LANG", "C.UTF-8",
                "--setenv", "TMPDIR", "/tmp", "--chdir", "/workspace",
            ]
            launch_fds = [policy, status]
            input_bytes = 0
            directories = set()
            for path, parts in zip(paths, path_parts):
                with ExitStack() as parents:
                    current = root
                    for part in parts[:-1]:
                        current = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current)
                        parents.callback(os.close, current)
                        if os.fstat(current).st_dev != identity.st_dev:
                            raise Refused("Project directory crosses devices")
                    data = self.read_regular_file(current, parts[-1], PROJECT_FILE_LIMIT, identity.st_dev)
                data.decode("utf-8")
                input_bytes += len(data)
                if input_bytes > PROJECT_COMMAND_INPUT_LIMIT:
                    raise Refused("Project command inputs exceed the limit")
                for index in range(1, len(parts)):
                    directory = "/workspace/" + "/".join(parts[:index])
                    if directory not in directories:
                        launch.extend(["--dir", directory])
                        directories.add(directory)
                descriptor = buffer("project-command-input")
                with os.fdopen(descriptor, "wb", closefd=False) as staged:
                    staged.write(data)
                os.lseek(descriptor, 0, os.SEEK_SET)
                launch.extend(["--file", str(descriptor), f"/workspace/{path}"])
                launch_fds.append(descriptor)
            with self.lock:
                if select.select([connection], [], [], 0)[0]:
                    raise Refused("Project request disconnected")
                run_id = self.authorize_run(request)
                process = subprocess.Popen(
                    [*launch, "--", "/usr/bin/prlimit", "--as=536870912", "--cpu=6", "--nproc=64", "--nofile=64", "--", *argv],
                    cwd="/", env={"LANG": "C.UTF-8"},
                    stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    pass_fds=tuple(launch_fds), start_new_session=True,
                )
                key = (request["botId"], run_id)
                self.processes.setdefault(key, set()).add(process)

            active_lease = {**request["run"], "botId": request["botId"]}

            def check_lease():
                with self.lock:
                    if self.active != active_lease or (
                        active_lease["expiresAt"] <= int(time.time() * 1000)
                    ):
                        raise Refused("Project command lease is no longer active")

            result = self.collect_command(process, key, connection, timeout, PROJECT_COMMAND_OUTPUT_LIMIT, check_lease)
            check_lease()
            if os.fstat(status).st_size == 0:
                raise Refused("Project command isolation did not start")
            return result

    def write_file(self, bot_id, path, content, executable=False):
        parts = self.path_parts(path)
        try:
            data = base64.b64decode(content, validate=True)
        except (TypeError, ValueError):
            raise Refused("Invalid file data")
        if len(data) > MAX_FILE:
            raise Refused("File too large")
        directory = self.directory(bot_id, parts[:-1], create=True)
        temporary = f".sydney-{uuid.uuid4().hex}"
        try:
            descriptor = os.open(
                temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o700 if executable else 0o600, dir_fd=directory,
            )
            try:
                with os.fdopen(descriptor, "wb") as handle:
                    handle.write(data)
            except Exception:
                os.unlink(temporary, dir_fd=directory)
                raise
            try:
                existing = os.stat(parts[-1], dir_fd=directory, follow_symlinks=False)
                if not stat.S_ISREG(existing.st_mode):
                    raise Refused("Destination is not a regular file")
            except FileNotFoundError:
                pass
            os.rename(temporary, parts[-1], src_dir_fd=directory, dst_dir_fd=directory)
        finally:
            try:
                os.unlink(temporary, dir_fd=directory)
            except FileNotFoundError:
                pass
            os.close(directory)

    def list_files(self, bot_id, path):
        parts = self.path_parts(path, allow_empty=True)
        descriptor = self.directory(bot_id, parts)
        try:
            result = []
            for name in sorted(os.listdir(descriptor)):
                metadata = os.stat(name, dir_fd=descriptor, follow_symlinks=False)
                if not (stat.S_ISDIR(metadata.st_mode) or stat.S_ISREG(metadata.st_mode)):
                    continue
                result.append({
                    "path": "/".join([*parts, name]),
                    "kind": "dir" if stat.S_ISDIR(metadata.st_mode) else "file",
                    "size": metadata.st_size,
                    "executable": bool(metadata.st_mode & 0o100),
                })
                if len(result) > MAX_FILES:
                    raise Refused("Workspace directory exceeds file limit")
            return result
        finally:
            os.close(descriptor)

    def export_files(self, bot_id):
        pending = [""]
        result = []
        total = 0
        visited = 0
        while pending:
            path = pending.pop()
            for entry in self.list_files(bot_id, path):
                visited += 1
                if visited > MAX_FILES:
                    raise Refused("Workspace export exceeds file limit")
                if entry["path"].split("/")[0] in (".browser-profiles", ".cache"):
                    continue
                if entry["kind"] == "dir":
                    pending.append(entry["path"])
                    continue
                data = self.read_file(bot_id, entry["path"])
                total += len(data)
                if total > MAX_EXPORT:
                    raise Refused("Workspace export exceeds size limit")
                result.append({
                    "path": entry["path"], "content": base64.b64encode(data).decode("ascii"),
                    "executable": entry["executable"],
                })
        return result

    def environment(self, bot_id):
        descriptor = self.bot_directory(bot_id)
        os.close(descriptor)
        return {
            "platform": "linux", "home": os.path.join(self.root, bot_id), "shell": "/bin/bash",
        }

    def run_command(self, request, connection):
        run_id = self.authorize_run(request)
        command = request.get("command")
        if not isinstance(command, dict):
            raise Refused("Invalid command")
        argv = command.get("argv")
        timeout = command.get("timeoutMs", 8000)
        if (
            not isinstance(argv, list) or not argv or len(argv) > 100
            or any(not isinstance(arg, str) or "\0" in arg or len(arg) > 32000 for arg in argv)
            or not isinstance(timeout, int) or isinstance(timeout, bool) or not 1 <= timeout <= 8000
            or command.get("pty")
        ):
            raise Refused("Invalid command")
        home = self.environment(request["botId"])["home"]
        cwd = command.get("cwd") or home
        if isinstance(cwd, str) and not os.path.isabs(cwd):
            cwd = os.path.join(home, cwd)
        if not isinstance(cwd, str) or "\0" in cwd or not os.path.isdir(cwd):
            raise Refused("Invalid command directory")
        environment = {
            "HOME": home, "USER": pwd.getpwuid(os.getuid()).pw_name,
            "PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8",
            "DISPLAY": self.display, "XAUTHORITY": self.xauthority,
        }
        for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
                    "http_proxy", "https_proxy", "all_proxy", "no_proxy"):
            if key in os.environ:
                environment[key] = os.environ[key]
        requested = command.get("env") or {}
        if not isinstance(requested, dict) or any(
            not isinstance(key, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key)
            or not isinstance(value, str) or "\0" in value for key, value in requested.items()
        ):
            raise Refused("Invalid command environment")
        environment.update(requested)
        for key in command.get("unsetEnv") or []:
            if not isinstance(key, str):
                raise Refused("Invalid environment removal")
            environment.pop(key, None)
        process = subprocess.Popen(
            argv, cwd=cwd, env=environment, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True,
        )
        with self.lock:
            key = (request["botId"], run_id)
            self.processes.setdefault(key, set()).add(process)
        return self.collect_command(process, key, connection, timeout, MAX_OUTPUT)

    def collect_command(self, process, key, connection, timeout, output_limit, still_authorized=None):
        output = {"stdout": bytearray(), "stderr": bytearray()}
        deadline = time.monotonic() + timeout / 1000
        selector = selectors.DefaultSelector()
        try:
            selector.register(process.stdout, selectors.EVENT_READ, "stdout")
            selector.register(process.stderr, selectors.EVENT_READ, "stderr")
            while True:
                if time.monotonic() >= deadline:
                    raise Refused("Command timed out; inspect its effects before retrying")
                if not selector.get_map() and process.poll() is not None:
                    break
                if still_authorized:
                    still_authorized()
                if select.select([connection], [], [], 0)[0]:
                    try:
                        if connection.recv(1, socket.MSG_PEEK | socket.MSG_DONTWAIT) == b"":
                            raise Refused("Command connection closed; result may be unknown")
                    except BlockingIOError:
                        pass
                for selected, _ in selector.select(timeout=0.1):
                    chunk = os.read(selected.fileobj.fileno(), 65536)
                    if not chunk:
                        selector.unregister(selected.fileobj)
                        continue
                    output[selected.data].extend(chunk)
                    if sum(len(value) for value in output.values()) > output_limit:
                        raise Refused("Command output exceeded limit; result may be unknown")
            return {
                "stdout": output["stdout"].decode("utf-8", errors="replace"),
                "stderr": output["stderr"].decode("utf-8", errors="replace"), "code": process.returncode,
            }
        finally:
            selector.close()
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            if process.poll() is None:
                process.wait()
            process.stdout.close()
            process.stderr.close()
            with self.lock:
                self.processes[key].discard(process)

    def desktop_command(self, argv, data=None, capture_output=True):
        environment = {
            "HOME": pwd.getpwuid(os.getuid()).pw_dir, "PATH": "/usr/bin:/bin",
            "DISPLAY": self.display, "XAUTHORITY": self.xauthority, "LANG": "C.UTF-8",
        }
        try:
            output = subprocess.PIPE if capture_output else subprocess.DEVNULL
            result = subprocess.run(argv, input=data, env=environment, stdout=output,
                                    stderr=output, timeout=5, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise Refused("Desktop operation unavailable")
        if result.returncode != 0 or (result.stdout is not None and len(result.stdout) > MAX_FILE):
            raise Refused("Desktop operation failed")
        return result.stdout or b""

    def observe(self, request):
        if request.get("run"):
            self.authorize_run(request)
        else:
            with self.lock:
                if self.active and self.active["expiresAt"] > int(time.time() * 1000) and (
                    self.active["botId"] != request["botId"]
                ):
                    raise Refused("Desktop is held by another bot")
        data = self.desktop_command(["/usr/bin/import", "-window", "root", "png:-"])
        if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
            raise Refused("Invalid desktop image")
        width, height = struct.unpack(">II", data[16:24])
        return {
            "frameId": hashlib.sha256(data).hexdigest(),
            "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "mimeType": "image/png", "width": width, "height": height,
            "imageBase64": base64.b64encode(data).decode("ascii"),
        }

    def act(self, request):
        with self.lock:
            return self.perform_actions(request, self.authorize_run)

    def authorize_control(self, request):
        control = request.get("control")
        now = int(time.time() * 1000)
        if not isinstance(control, dict):
            raise Refused("Human control lease required")
        lease_id, fence, expiry = control.get("leaseId"), control.get("fence"), control.get("expiresAt")
        if (
            not isinstance(lease_id, str) or not VALID_ID.fullmatch(lease_id)
            or not isinstance(fence, int) or isinstance(fence, bool) or fence < 1
            or not isinstance(expiry, int) or isinstance(expiry, bool)
            or not now < expiry <= now + 1500
        ):
            raise Refused("Invalid or expired human control lease")
        self.revoked_controls = {
            token: until for token, until in self.revoked_controls.items() if until > now
        }
        previous = self.control_fences.get(request["botId"])
        if lease_id in self.revoked_controls or (previous and fence < previous["fence"]):
            raise Refused("Revoked human control lease")
        if previous and fence == previous["fence"] and previous["leaseId"] != lease_id:
            raise Refused("Human control fence mismatch")
        if self.control and self.control["expiresAt"] > now and (
            self.control["botId"] != request["botId"] or self.control["leaseId"] != lease_id
        ):
            raise ControlBusy("Desktop is held by another user")
        if self.active and self.active["expiresAt"] > now:
            raise ControlBusy("Desktop is held by another run")
        if any(process.poll() is None for items in self.processes.values() for process in items):
            raise ControlBusy("Desktop command is still active")
        self.control_fences[request["botId"]] = {"fence": fence, "leaseId": lease_id}
        self.control = {**control, "botId": request["botId"]}

    def control_input(self, request):
        payload = request.get("request") or {}
        actions = payload.get("actions")
        if (
            not isinstance(actions, list) or len(actions) != 1
            or not isinstance(actions[0], dict)
            or actions[0].get("kind") not in ("pointer", "key", "clipboard", "scroll")
            or payload.get("observe") is not False
            or (actions[0].get("kind") == "pointer" and actions[0].get("type") not in ("click", "move"))
        ):
            raise Refused("Unsupported human input")
        with self.lock:
            return self.perform_actions(request, self.authorize_control)

    def revoke_control(self, request):
        lease_id = request.get("controlLeaseId")
        if not isinstance(lease_id, str) or not VALID_ID.fullmatch(lease_id):
            raise Refused("Invalid human control lease")
        with self.lock:
            now = int(time.time() * 1000)
            self.revoked_controls = {
                token: until for token, until in self.revoked_controls.items() if until > now
            }
            self.revoked_controls[lease_id] = now + 10_500
            if self.control and self.control["leaseId"] == lease_id:
                self.control = None

    def perform_actions(self, request, authorize):
        authorize(request)
        actions = (request.get("request") or {}).get("actions")
        if not isinstance(actions, list) or len(actions) > 24:
            raise Refused("Invalid desktop actions")
        settle_ms = (request.get("request") or {}).get("settleMs", 350)
        if not isinstance(settle_ms, int) or isinstance(settle_ms, bool) or not 0 <= settle_ms <= 5000:
            raise Refused("Invalid settle time")
        completed = 0
        for action in actions:
            authorize(request)
            if not isinstance(action, dict):
                raise Refused("Invalid desktop action")
            kind = action.get("kind")
            if kind == "wait":
                duration = action.get("ms")
                if not isinstance(duration, int) or isinstance(duration, bool) or not 0 <= duration <= 5000:
                    raise Refused("Invalid wait")
                time.sleep(duration / 1000)
            elif kind == "key":
                key = action.get("key")
                modifiers = action.get("modifiers") or []
                if not isinstance(key, str) or not VALID_KEY.fullmatch(key) or not isinstance(modifiers, list):
                    raise Refused("Invalid key")
                if any(not isinstance(item, str) or not VALID_KEY.fullmatch(item) for item in modifiers):
                    raise Refused("Invalid key modifier")
                self.desktop_command(["/usr/bin/xdotool", "key", "--", "+".join([*modifiers, key])])
            elif kind == "pointer":
                xpos, ypos = action.get("x"), action.get("y")
                if any(not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 8192
                       for value in (xpos, ypos)):
                    raise Refused("Invalid pointer coordinates")
                action_type = action.get("type")
                button = {"left": "1", "right": "3"}.get(action.get("button", "left"))
                if not button or action_type not in ("move", "click", "down", "up"):
                    raise Refused("Invalid pointer action")
                self.desktop_command(["/usr/bin/xdotool", "mousemove", "--", str(xpos), str(ypos)])
                if action_type != "move":
                    verb = {"click": "click", "down": "mousedown", "up": "mouseup"}[action_type]
                    self.desktop_command(["/usr/bin/xdotool", verb, button])
            elif kind == "scroll":
                button = {"up": "4", "down": "5", "left": "6", "right": "7"}.get(action.get("direction"))
                amount = action.get("amount", 1)
                xpos, ypos = action.get("x"), action.get("y")
                if not button or not isinstance(amount, int) or isinstance(amount, bool) or not 1 <= amount <= 20:
                    raise Refused("Invalid scroll")
                if xpos is not None or ypos is not None:
                    if any(not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 8192
                           for value in (xpos, ypos)):
                        raise Refused("Invalid scroll coordinates")
                    self.desktop_command(["/usr/bin/xdotool", "mousemove", "--", str(xpos), str(ypos)])
                    authorize(request)
                self.desktop_command(["/usr/bin/xdotool", "click", "--repeat", str(amount), button])
            elif kind == "clipboard":
                text = action.get("text")
                if not isinstance(text, str) or len(text.encode("utf-8")) > 65536:
                    raise Refused("Invalid clipboard text")
                self.desktop_command(
                    ["/usr/bin/xclip", "-selection", "clipboard"], text.encode("utf-8"),
                    capture_output=False,
                )
                authorize(request)
                self.desktop_command(["/usr/bin/xdotool", "key", "--", "ctrl+v"])
            else:
                raise Refused("Unsupported desktop action")
            completed += 1
        result = {"completed": completed}
        if (request.get("request") or {}).get("observe", True):
            if settle_ms:
                time.sleep(settle_ms / 1000)
            authorize(request)
            result["observation"] = self.observe(request)
        return result

    def dispatch(self, request, connection):
        if not isinstance(request, dict):
            raise Refused("Invalid request")
        method, bot_id = request.get("method"), request.get("botId")
        if not isinstance(bot_id, str) or not VALID_ID.fullmatch(bot_id):
            raise Refused("Invalid desktop identity")
        if method != "provision" and request.get("generation") != self.generation:
            raise GenerationChanged("Desktop generation changed; reconcile previous work")
        if method == "provision":
            descriptor = self.bot_directory(bot_id)
            os.close(descriptor)
            return {"generation": self.generation}
        if method == "status":
            return {"generation": self.generation}
        if method == "environment":
            return self.environment(bot_id)
        if method == "execute":
            return self.run_command(request, connection)
        if method == "observe":
            return self.observe(request)
        if method == "act":
            return self.act(request)
        if method == "control_input":
            return self.control_input(request)
        if method == "control_revoke":
            return self.revoke_control(request)
        if method == "project_folder":
            return self.project_folder(bot_id, request.get("path"))
        if method == "project_command_status":
            return self.project_command_available(request)
        if method == "project_file":
            return self.project_file(request, connection)
        if method == "project_command":
            return self.project_command(request, connection)
        if method == "list":
            self.authorize_run(request)
            return self.list_files(bot_id, "" if request.get("path") == "/" else request.get("path", ""))
        if method == "read":
            self.authorize_run(request)
            limit = request.get("maxBytes") or MAX_FILE
            return base64.b64encode(self.read_file(bot_id, request.get("path"), limit)).decode("ascii")
        if method == "write":
            self.authorize_run(request)
            self.write_file(bot_id, request.get("path"), request.get("content"), request.get("executable", False))
            return None
        if method == "export":
            self.authorize_run(request)
            return self.export_files(bot_id)
        if method in ("cancel", "inspect", "stop"):
            run_id = request.get("targetRunId")
            with self.lock:
                key = (bot_id, run_id)
                known = key in self.processes if run_id else False
                processes = list(self.processes.get(key, set())) if run_id else [
                    process for (owner, _), items in self.processes.items()
                    if owner == bot_id for process in items
                ]
            if method in ("cancel", "stop"):
                for process in processes:
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                return None
            if any(process.poll() is None for process in processes):
                return "active"
            return "idle" if known else "unknown"
        raise Refused("Unsupported native desktop method")

    def serve_connection(self, connection):
        with connection:
            if not self.peer_allowed(connection):
                return
            connection.settimeout(15)
            try:
                chunks = bytearray()
                while b"\n" not in chunks:
                    chunk = connection.recv(min(65536, MAX_REQUEST + 1 - len(chunks)))
                    if not chunk:
                        return
                    chunks.extend(chunk)
                    if len(chunks) > MAX_REQUEST:
                        raise Refused("Request exceeds size limit")
                request = json.loads(chunks)
                value = self.dispatch(request, connection)
                response = {"ok": True, "value": value}
            except ControlBusy:
                response = {"ok": False, "error": "native_control_busy"}
            except GenerationChanged:
                response = {"ok": False, "error": "native_driver_generation_changed"}
            except (Refused, OSError, ValueError, TypeError, subprocess.TimeoutExpired):
                response = {"ok": False, "error": "Native desktop refused the operation; inspect its result before retrying"}
            try:
                connection.sendall((json.dumps(response, separators=(",", ":")) + "\n").encode())
            except OSError:
                pass


def main():
    if os.getuid() == 0:
        raise SystemExit("Native desktop driver must not run as root")
    if int(os.environ.get("LISTEN_PID", "0")) != os.getpid() or os.environ.get("LISTEN_FDS") != "1":
        raise SystemExit("Native desktop requires its systemd-owned socket")
    control_uid = pwd.getpwnam(os.environ["SYDNEY_CONTROL_USER"]).pw_uid
    if control_uid == os.getuid():
        raise SystemExit("Control and desktop users must be different")
    driver = Driver(
        os.environ["SYDNEY_WORKSPACE_ROOT"], control_uid,
        os.environ["DISPLAY"], os.environ["XAUTHORITY"],
        project_commands=os.environ.get("SYDNEY_ISOLATED_PROJECT_COMMANDS") == "1",
    )
    server = socket.socket(fileno=3)
    while True:
        connection, _ = server.accept()
        threading.Thread(target=driver.serve_connection, args=(connection,), daemon=True).start()


if __name__ == "__main__":
    main()
