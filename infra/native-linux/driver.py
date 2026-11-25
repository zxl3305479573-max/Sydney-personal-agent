import base64
from collections import OrderedDict
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
import sys
import threading
import time
import uuid

MAX_REQUEST = 40 * 1024 * 1024
MAX_FILE = 8 * 1024 * 1024
MAX_EXPORT = 24 * 1024 * 1024
MAX_OUTPUT = 1024 * 1024
MAX_FILES = 500
MAX_SEEN_REQUEST_IDS = 4096
STATE_VERSION = 1
STATE_FILENAME = ".driver-state.json"
MAX_STATE_BYTES = 4 * 1024 * 1024
VALID_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
VALID_KEY = re.compile(r"^[A-Za-z0-9_.+-]{1,100}$")
VALID_REQUEST_ID = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
SIDE_EFFECT_RUN_METHODS = frozenset({"execute", "act", "write"})


class Refused(Exception):
    pass


class ControlBusy(Refused):
    pass


class GenerationChanged(Refused):
    pass


class Driver:
    def __init__(self, root, control_uid, display, xauthority, state_path=None):
        self.root = os.path.abspath(root)
        self.control_uid = control_uid
        self.display = display
        self.xauthority = xauthority
        if state_path is None:
            self.state_path = os.path.join(self.root, STATE_FILENAME)
        else:
            if not isinstance(state_path, str) or not state_path.strip():
                raise ValueError("Invalid state path")
            self.state_path = os.path.abspath(state_path)
        self.generation = uuid.uuid4().hex
        self.lock = threading.RLock()
        self.active = None
        self.fences = {}
        self.processes = {}
        self.control = None
        self.control_fences = {}
        self.revoked_controls = {}
        self.seen_request_ids = OrderedDict()
        os.makedirs(self.root, mode=0o700, exist_ok=True)
        state_dir = os.path.dirname(self.state_path)
        if state_dir:
            os.makedirs(state_dir, mode=0o700, exist_ok=True)
        self._load_state()

    def _warn_state(self, message):
        sys.stderr.write(f"sydney-driver: {message}\n")
        sys.stderr.flush()

    def _parse_state(self, raw):
        if not isinstance(raw, dict):
            raise ValueError("state root must be a JSON object")
        expected_keys = {"version", "fences", "control_fences", "seen_request_ids"}
        if set(raw.keys()) != expected_keys:
            raise ValueError("unexpected or missing state keys")
        version = raw.get("version")
        if not isinstance(version, int) or isinstance(version, bool) or version != STATE_VERSION:
            raise ValueError("unsupported state version")

        raw_fences = raw.get("fences")
        if not isinstance(raw_fences, dict):
            raise ValueError("fences must be an object")
        fences = {}
        for run_id, fence in raw_fences.items():
            if (
                not isinstance(run_id, str)
                or not VALID_ID.fullmatch(run_id)
                or not isinstance(fence, int)
                or isinstance(fence, bool)
                or fence < 0
            ):
                raise ValueError("invalid fence entry")
            fences[run_id] = fence

        raw_control_fences = raw.get("control_fences")
        if not isinstance(raw_control_fences, dict):
            raise ValueError("control_fences must be an object")
        control_fences = {}
        for bot_id, entry in raw_control_fences.items():
            if not isinstance(bot_id, str) or not VALID_ID.fullmatch(bot_id):
                raise ValueError("invalid control fence bot id")
            if not isinstance(entry, dict) or set(entry.keys()) != {"fence", "leaseId"}:
                raise ValueError("invalid control fence entry")
            fence = entry.get("fence")
            lease_id = entry.get("leaseId")
            if (
                not isinstance(fence, int)
                or isinstance(fence, bool)
                or fence < 0
                or not isinstance(lease_id, str)
                or not VALID_ID.fullmatch(lease_id)
            ):
                raise ValueError("invalid control fence values")
            control_fences[bot_id] = {"fence": fence, "leaseId": lease_id}

        raw_seen = raw.get("seen_request_ids")
        if not isinstance(raw_seen, list):
            raise ValueError("seen_request_ids must be a list")
        seen = OrderedDict()
        for item in raw_seen:
            if not isinstance(item, str) or not VALID_REQUEST_ID.fullmatch(item):
                raise ValueError("invalid seen request id")
            normalized = item.lower()
            if normalized in seen:
                seen.move_to_end(normalized)
            else:
                seen[normalized] = None
        while len(seen) > MAX_SEEN_REQUEST_IDS:
            seen.popitem(last=False)

        return fences, control_fences, seen

    def _load_state(self):
        state_path = getattr(self, "state_path", None)
        if not state_path:
            return
        if os.path.islink(state_path):
            self._warn_state(f"refusing symlink state file: {state_path}; starting with empty state")
            return
        flags = (
            os.O_RDONLY
            | getattr(os, "O_NOFOLLOW", 0)
            | getattr(os, "O_NONBLOCK", 0)
            | getattr(os, "O_BINARY", 0)
        )
        try:
            descriptor = os.open(state_path, flags)
        except FileNotFoundError:
            return
        except OSError as exc:
            self._warn_state(f"unable to open state file ({exc}); starting with empty state")
            return
        try:
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode):
                self._warn_state("state file is not a regular file; starting with empty state")
                return
            if metadata.st_size > MAX_STATE_BYTES:
                self._warn_state("state file exceeds size limit; starting with empty state")
                return
            chunks = bytearray()
            while len(chunks) <= MAX_STATE_BYTES:
                chunk = os.read(descriptor, min(65536, MAX_STATE_BYTES + 1 - len(chunks)))
                if not chunk:
                    break
                chunks.extend(chunk)
            if len(chunks) > MAX_STATE_BYTES:
                self._warn_state("state file exceeds size limit; starting with empty state")
                return
        except OSError as exc:
            self._warn_state(f"unable to read state file ({exc}); starting with empty state")
            return
        finally:
            os.close(descriptor)
        try:
            raw = json.loads(chunks.decode("utf-8"))
            fences, control_fences, seen = self._parse_state(raw)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            self._warn_state(f"invalid state file ({exc}); starting with empty state")
            return
        self.fences = fences
        self.control_fences = control_fences
        self.seen_request_ids = seen

    def _save_state_locked(self):
        state_path = getattr(self, "state_path", None)
        if not state_path:
            return
        if os.path.islink(state_path):
            self._warn_state(f"refusing to overwrite symlink state file: {state_path}")
            raise Refused("State file is a symlink")
        state_dir = os.path.dirname(state_path) or "."
        os.makedirs(state_dir, mode=0o700, exist_ok=True)
        payload = {
            "version": STATE_VERSION,
            "fences": dict(self.fences),
            "control_fences": {
                bot_id: {"fence": entry["fence"], "leaseId": entry["leaseId"]}
                for bot_id, entry in self.control_fences.items()
            },
            "seen_request_ids": list(self.seen_request_ids.keys()),
        }
        data = (json.dumps(payload, separators=(",", ":"), sort_keys=True) + "\n").encode("utf-8")
        tmp_path = os.path.join(state_dir, f".driver-state-{uuid.uuid4().hex}.tmp")
        flags = (
            os.O_WRONLY
            | os.O_CREAT
            | os.O_EXCL
            | getattr(os, "O_NOFOLLOW", 0)
            | getattr(os, "O_BINARY", 0)
        )
        descriptor = None
        try:
            descriptor = os.open(tmp_path, flags, 0o600)
            view = memoryview(data)
            written = 0
            while written < len(view):
                step = os.write(descriptor, view[written:])
                if step <= 0:
                    raise OSError("Short write while persisting driver state")
                written += step
            os.fsync(descriptor)
            os.close(descriptor)
            descriptor = None
            if os.path.islink(state_path):
                self._warn_state(f"refusing to overwrite symlink state file: {state_path}")
                raise Refused("State file is a symlink")
            os.replace(tmp_path, state_path)
            if hasattr(os, "O_DIRECTORY"):
                dir_fd = None
                try:
                    dir_fd = os.open(
                        state_dir, os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0)
                    )
                    os.fsync(dir_fd)
                except OSError:
                    pass
                finally:
                    if dir_fd is not None:
                        os.close(dir_fd)
        except Exception:
            if descriptor is not None:
                try:
                    os.close(descriptor)
                except OSError:
                    pass
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

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

    def consume_request_id(self, request, required=False):
        request_id = request.get("requestId")
        if request_id is None:
            if required:
                raise Refused("Request ID required")
            return None
        if not isinstance(request_id, str) or not VALID_REQUEST_ID.fullmatch(request_id):
            raise Refused("Invalid request ID")
        normalized = request_id.lower()
        with self.lock:
            seen = getattr(self, "seen_request_ids", None)
            if seen is None:
                seen = OrderedDict()
                self.seen_request_ids = seen
            if normalized in seen:
                raise Refused("Replayed request ID")
            evicted = []
            seen[normalized] = None
            while len(seen) > MAX_SEEN_REQUEST_IDS:
                evicted.append(seen.popitem(last=False))
            try:
                self._save_state_locked()
            except Exception:
                seen.pop(normalized, None)
                for key, value in reversed(evicted):
                    seen[key] = value
                    seen.move_to_end(key, last=False)
                raise
        return normalized

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
            previous_fence = self.fences.get(run_id)
            if previous_fence != fence:
                self.fences[run_id] = fence
                try:
                    self._save_state_locked()
                except Exception:
                    if previous_fence is None:
                        self.fences.pop(run_id, None)
                    else:
                        self.fences[run_id] = previous_fence
                    raise
            self.active = {**run, "botId": request["botId"]}
        return run_id

    def read_file(self, bot_id, path, max_bytes=MAX_FILE):
        parts = self.path_parts(path)
        if not isinstance(max_bytes, int) or isinstance(max_bytes, bool) or max_bytes < 1:
            raise Refused("Invalid file limit")
        max_bytes = min(max_bytes, MAX_FILE)
        directory = self.directory(bot_id, parts[:-1])
        try:
            descriptor = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
            try:
                metadata = os.fstat(descriptor)
                if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > max_bytes:
                    raise Refused("File unavailable or too large")
                data = bytearray()
                while len(data) <= max_bytes:
                    chunk = os.read(descriptor, min(65536, max_bytes + 1 - len(data)))
                    if not chunk:
                        break
                    data.extend(chunk)
                if len(data) > max_bytes:
                    raise Refused("File too large")
                return bytes(data)
            finally:
                os.close(descriptor)
        finally:
            os.close(directory)

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

    def resolve_command_cwd(self, bot_id, cwd, home=None):
        if home is None:
            home = self.environment(bot_id)["home"]
        home_real = os.path.realpath(home)
        if cwd is None or cwd == "":
            return home_real
        if not isinstance(cwd, str) or "\0" in cwd or "\\" in cwd:
            raise Refused("Invalid command directory")
        if any(part == ".." for part in cwd.split("/")):
            raise Refused("Invalid command directory")
        if cwd.startswith("/") or os.path.isabs(cwd):
            candidate = cwd
        else:
            candidate = os.path.join(home_real, cwd)
        real_target = os.path.realpath(candidate)
        try:
            within_home = os.path.commonpath([home_real, real_target]) == home_real
        except ValueError:
            within_home = False
        if not within_home or not os.path.isdir(real_target):
            raise Refused("Invalid command directory")
        return real_target

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
        cwd = self.resolve_command_cwd(request["botId"], command.get("cwd"), home=home)
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
            self.processes.setdefault((request["botId"], run_id), set()).add(process)
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ, "stdout")
        selector.register(process.stderr, selectors.EVENT_READ, "stderr")
        output = {"stdout": bytearray(), "stderr": bytearray()}
        deadline = time.monotonic() + timeout / 1000
        try:
            while selector.get_map():
                if time.monotonic() >= deadline:
                    raise Refused("Command timed out; inspect its effects before retrying")
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
                    if sum(len(value) for value in output.values()) > MAX_OUTPUT:
                        raise Refused("Command output exceeded limit; result may be unknown")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise Refused("Command timed out; result may be unknown")
            code = process.wait(timeout=remaining)
            return {
                "stdout": output["stdout"].decode("utf-8", errors="replace"),
                "stderr": output["stderr"].decode("utf-8", errors="replace"), "code": code,
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
                self.processes.get((request["botId"], run_id), set()).discard(process)

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
        with self.lock:
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
            new_entry = {"fence": fence, "leaseId": lease_id}
            if previous != new_entry:
                self.control_fences[request["botId"]] = new_entry
                try:
                    self._save_state_locked()
                except Exception:
                    if previous is None:
                        self.control_fences.pop(request["botId"], None)
                    else:
                        self.control_fences[request["botId"]] = previous
                    raise
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
        self.consume_request_id(request, required=method in SIDE_EFFECT_RUN_METHODS)
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
    )
    server = socket.socket(fileno=3)
    while True:
        connection, _ = server.accept()
        threading.Thread(target=driver.serve_connection, args=(connection,), daemon=True).start()


if __name__ == "__main__":
    main()
