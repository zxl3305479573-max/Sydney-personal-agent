import errno
import importlib.util
import io
import json
import os
import pathlib
import socket
import sys
import tempfile
import time
import types
import unittest
import uuid
from contextlib import ExitStack, redirect_stderr
from unittest.mock import MagicMock, patch

if sys.platform == "win32":
    sys.modules["pwd"] = types.ModuleType("pwd")

SPEC = importlib.util.spec_from_file_location("sydney_driver", pathlib.Path(__file__).with_name("driver.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class NativeDriverPolicyTests(unittest.TestCase):
    def setUp(self):
        self.driver = MODULE.Driver.__new__(MODULE.Driver)
        self.driver.lock = MODULE.threading.RLock()
        self.driver.active = None
        self.driver.fences = {}
        self.driver.generation = "generation"
        self.driver.control = None
        self.driver.control_fences = {}
        self.driver.revoked_controls = {}
        self.driver.seen_request_ids = MODULE.OrderedDict()
        self.driver.processes = {}
        self.driver.project_commands = False

    def control_request(self, lease="human", fence=1, expiry=2000, action=None):
        return {
            "method": "control_input", "botId": "bot", "generation": "generation",
            "control": {"leaseId": lease, "fence": fence, "expiresAt": expiry},
            "request": {
                "actions": [action or {"kind": "pointer", "x": 5, "y": 10, "type": "click"}],
                "observe": False,
            },
        }

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_human_click_uses_separate_control_authorization_without_screenshot(self, _clock):
        with patch.object(self.driver, "desktop_command") as command, \
             patch.object(self.driver, "observe") as observe:
            result = self.driver.dispatch(self.control_request(), None)
            self.assertEqual(result, {"completed": 1})
            self.assertEqual(command.call_count, 2)
            observe.assert_not_called()
            with self.assertRaises(MODULE.Refused):
                self.driver.authorize_run({
                    "botId": "bot", "run": {"id": "run", "fence": 1, "expiresAt": 2000},
                })

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_human_control_refuses_expired_missing_and_excessive_tickets(self, _clock):
        with patch.object(self.driver, "desktop_command") as command:
            for expiry in (1000, 2600, True):
                with self.subTest(expiry=expiry), self.assertRaises(MODULE.Refused):
                    self.driver.dispatch(self.control_request(expiry=expiry), None)
            missing = self.control_request()
            missing.pop("control")
            with self.assertRaises(MODULE.Refused):
                self.driver.dispatch(missing, None)
            command.assert_not_called()

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_revocation_rejects_delayed_first_input_and_does_not_revoke_new_lease(self, _clock):
        self.driver.dispatch({
            "method": "control_revoke", "botId": "bot", "generation": "generation",
            "controlLeaseId": "old",
        }, None)
        with patch.object(self.driver, "desktop_command"):
            with self.assertRaises(MODULE.Refused):
                self.driver.dispatch(self.control_request(lease="old"), None)
            self.driver.dispatch(self.control_request(lease="new", fence=2), None)
            self.driver.revoke_control({"controlLeaseId": "old"})
            self.driver.dispatch(self.control_request(lease="new", fence=2), None)
            with self.assertRaises(MODULE.Refused):
                self.driver.dispatch(self.control_request(lease="different", fence=2), None)
            with self.assertRaises(MODULE.Refused):
                self.driver.dispatch(self.control_request(lease="stale", fence=1), None)

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_human_input_refuses_stale_generation_active_run_and_held_buttons(self, _clock):
        with patch.object(self.driver, "desktop_command") as command:
            stale = self.control_request()
            stale["generation"] = "old"
            with self.assertRaises(MODULE.Refused):
                self.driver.dispatch(stale, None)
            self.driver.authorize_run({
                "botId": "bot", "run": {"id": "run", "fence": 1, "expiresAt": 2000},
            })
            with self.assertRaises(MODULE.ControlBusy):
                self.driver.dispatch(self.control_request(), None)
            self.driver.active = None
            for kind in ("down", "up"):
                with self.subTest(kind=kind), self.assertRaises(MODULE.Refused):
                    self.driver.dispatch(self.control_request(action={
                        "kind": "pointer", "type": kind, "x": 1, "y": 2,
                    }), None)
            command.assert_not_called()

    def test_workspace_rejects_traversal_and_absolute_paths(self):
        for path in ("../private", "/etc/passwd", "a/../b", "a\\b", "a//b", "a/\0"):
            with self.subTest(path=path), self.assertRaises(MODULE.Refused):
                self.driver.path_parts(path)
        self.assertEqual(self.driver.path_parts("notes/result.md"), ["notes", "result.md"])

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_project_file_checks_identity_connection_and_lease_before_opening_output(self, _clock):
        request = {
            "method": "project_file", "botId": "bot", "generation": "generation",
            "folder": {"path": "project", "device": "12", "inode": "34"},
            "file": {"operation": "create", "path": "result.md", "text": "样本"},
            "run": {"id": "run", "fence": 1, "expiresAt": 2000},
        }
        identity = types.SimpleNamespace(st_dev=12, st_ino=34)
        peer = object()
        with patch.object(self.driver, "directory", return_value=10), \
             patch.object(MODULE.os, "fstat", return_value=identity), \
             patch.object(MODULE.os, "O_NOFOLLOW", getattr(MODULE.os, "O_NOFOLLOW", 0x20000), create=True), \
             patch.object(MODULE.os, "close"), \
             patch.object(MODULE.os, "open", return_value=11) as opened, \
             patch.object(MODULE.os, "fdopen") as file, \
             patch.object(MODULE.select, "select", return_value=([], [], [])) as selected:
            result = self.driver.dispatch(request, peer)
            self.assertEqual(result, {"operation": "create", "bytes": 6})
            opened.assert_called_once_with(
                "result.md", MODULE.os.O_WRONLY | MODULE.os.O_CREAT | MODULE.os.O_EXCL | MODULE.os.O_NOFOLLOW,
                0o600, dir_fd=10,
            )
            file.return_value.__enter__.return_value.write.assert_called_once_with("样本".encode("utf-8"))
            opened.reset_mock()
            identity.st_ino = 35
            with self.assertRaises(MODULE.Refused):
                self.driver.dispatch(request, peer)
            identity.st_ino = 34
            selected.return_value = ([peer], [], [])
            with self.assertRaises(MODULE.Refused):
                self.driver.dispatch(request, peer)
            selected.return_value = ([], [], [])
            request["run"]["expiresAt"] = 1000
            with self.assertRaises(MODULE.Refused):
                self.driver.dispatch(request, peer)
            opened.assert_not_called()

    @unittest.skipUnless(sys.platform.startswith("linux"), "requires Linux directory descriptors")
    def test_project_file_accesses_only_the_authorized_linux_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            self.driver.root = temporary
            home = pathlib.Path(temporary, "bot")
            folder = home / "project"
            folder.mkdir(parents=True)
            (folder / "sample.txt").write_text("样本", encoding="utf-8")
            (folder / "nested").mkdir()
            outside = home / "outside.txt"
            outside.write_text("outside", encoding="utf-8")
            (folder / "link.txt").symlink_to(outside)
            (folder / "hard.txt").hardlink_to(outside)
            source, peer = socket.socketpair()
            with source, peer:
                request = {
                    "method": "project_file", "botId": "bot", "generation": "generation",
                    "folder": self.driver.project_folder("bot", "project"),
                    "file": {"operation": "read", "path": "sample.txt"},
                    "run": {"id": "run", "fence": 1, "expiresAt": int(time.time() * 1000) + 5000},
                }
                self.assertEqual(self.driver.dispatch(request, source), {
                    "operation": "read", "text": "样本",
                    "sha256": MODULE.hashlib.sha256("样本".encode("utf-8")).hexdigest(),
                })
                request["file"] = {"operation": "list"}
                self.assertEqual(self.driver.dispatch(request, source), {
                    "operation": "list",
                    "entries": [
                        {"path": "nested", "kind": "directory"},
                        {"path": "sample.txt", "kind": "file"},
                    ],
                    "truncated": False,
                })
                request["file"] = {"operation": "list", "path": "nested"}
                self.assertEqual(self.driver.dispatch(request, source), {
                    "operation": "list", "entries": [], "truncated": False,
                })
                request["file"] = {"operation": "read", "path": "sample.txt"}
                for rejected in ("../outside.txt", "link.txt", "hard.txt"):
                    request["file"]["path"] = rejected
                    with self.subTest(path=rejected), self.assertRaises((MODULE.Refused, OSError)):
                        self.driver.dispatch(request, source)
                request["file"] = {"operation": "create", "path": "result.md", "text": "样本"}
                self.assertEqual(self.driver.dispatch(request, source), {"operation": "create", "bytes": 6})
                with self.assertRaises(FileExistsError):
                    self.driver.dispatch(request, source)
                self.assertEqual((folder / "result.md").read_text(encoding="utf-8"), "样本")
                original_hash = MODULE.hashlib.sha256("样本".encode("utf-8")).hexdigest()
                request["file"] = {
                    "operation": "update", "path": "sample.txt",
                    "expectedSha256": original_hash, "text": "新版本",
                }
                updated = self.driver.dispatch(request, source)
                self.assertEqual(updated, {
                    "operation": "update", "bytes": len("新版本".encode("utf-8")),
                    "sha256": MODULE.hashlib.sha256("新版本".encode("utf-8")).hexdigest(),
                })
                request["file"]["text"] = "must not overwrite"
                self.assertEqual(self.driver.dispatch(request, source), {
                    "operation": "conflict",
                    "sha256": MODULE.hashlib.sha256("新版本".encode("utf-8")).hexdigest(),
                })
                self.assertEqual((folder / "sample.txt").read_text(encoding="utf-8"), "新版本")
                folder.rename(home / "previous")
                folder.mkdir()
                with self.assertRaises(MODULE.Refused):
                    self.driver.dispatch(request, source)
                self.assertFalse((folder / "result.md").exists())

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_fence_and_physical_desktop_exclusivity(self, _clock):
        first = {"botId": "bot", "run": {"id": "run", "fence": 2, "expiresAt": 2000}}
        self.assertEqual(self.driver.authorize_run(first), "run")
        with self.assertRaises(MODULE.Refused):
            self.driver.authorize_run({"botId": "bot", "run": {"id": "run", "fence": 1, "expiresAt": 2000}})
        with self.assertRaises(MODULE.Refused):
            self.driver.authorize_run({"botId": "other", "run": {"id": "other", "fence": 1, "expiresAt": 2000}})

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_expired_and_excessively_long_leases_are_refused(self, _clock):
        for expires_at in (1000, 12000):
            with self.subTest(expires_at=expires_at), self.assertRaises(MODULE.Refused):
                self.driver.authorize_run({
                    "botId": "bot", "run": {"id": "run", "fence": 1, "expiresAt": expires_at},
                })

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_file_operations_require_an_unexpired_run_lease(self, _clock):
        for method in ("list", "read", "write", "export"):
            for run in (None, {"id": "run", "fence": 1, "expiresAt": 1000}):
                with self.subTest(method=method, run=run), self.assertRaises(MODULE.Refused):
                    self.driver.dispatch({
                        "method": method, "botId": "bot", "generation": "generation", "run": run,
                    }, None)

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_project_command_has_no_fallback_and_rejects_invalid_requests_before_launch(self, _clock):
        request = {
            "method": "project_command", "botId": "bot", "generation": "generation",
            "run": {"id": "run", "fence": 1, "expiresAt": 2000},
            "folder": {"path": "project", "device": "12", "inode": "34"},
            "command": {"argv": ["cat", "sample.txt"], "inputFiles": ["sample.txt"], "timeoutMs": 2000},
        }
        with patch.object(MODULE.subprocess, "Popen") as spawn:
            with self.assertRaisesRegex(MODULE.Refused, "isolation is unavailable"):
                self.driver.dispatch(request, None)
            self.driver.project_commands = True
            for command in (
                {**request["command"], "inputFiles": ["../outside.txt"]},
                {**request["command"], "inputFiles": ["sample.txt", "sample.txt"]},
                {**request["command"], "argv": ["cat", "\0"]},
                {**request["command"], "timeoutMs": 8000},
                {**request["command"], "env": {"DISPLAY": ":99"}},
            ):
                with self.subTest(command=command), self.assertRaises(MODULE.Refused):
                    self.driver.dispatch({**request, "command": command}, None)
            with self.assertRaisesRegex(MODULE.Refused, "expired run lease"):
                self.driver.dispatch({**request, "run": {**request["run"], "expiresAt": 1000}}, None)
            spawn.assert_not_called()

    @unittest.skipUnless(
        sys.platform.startswith("linux") and MODULE.os.environ.get("SYDNEY_TEST_PROJECT_COMMAND_ISOLATION") == "1",
        "requires an isolated guest with the project command runtime",
    )
    def test_project_command_isolates_input_host_paths_network_and_processes(self):
        with tempfile.TemporaryDirectory() as root, ExitStack() as resources:
            client, server = socket.socketpair()
            resources.enter_context(client)
            resources.enter_context(server)
            self.driver.root = root
            self.driver.project_commands = True
            home = pathlib.Path(root) / "bot"
            project = home / "project"
            project.mkdir(parents=True)
            sample = project / "sample.txt"
            sample.write_text("original", encoding="utf-8")
            outside = home / "outside.txt"
            outside.write_text("private", encoding="utf-8")
            script = """
import errno
import os
import pathlib
import socket
import sys
import time

assert not os.path.exists(sys.argv[1])
assert not os.path.exists("/proc/1")
assert not os.path.exists("/tmp/.X11-unix")
assert not os.environ.get("DISPLAY")
assert not os.environ.get("XAUTHORITY")
assert not os.environ.get("HTTP_PROXY")
for family in (socket.AF_INET, socket.AF_UNIX):
    try:
        socket.socket(family)
    except OSError as error:
        assert error.errno == errno.EPERM
    else:
        raise AssertionError(f"Unexpected socket access: {family}")
sample = pathlib.Path("sample.txt")
assert sample.read_text() == "original"
sample.write_text("temporary")
if os.fork() == 0:
    os.setsid()
    time.sleep(60)
print(sample.read_text())
"""
            request = {
                "method": "project_command", "botId": "bot", "generation": "generation",
                "run": {"id": "run", "fence": 1, "expiresAt": int(time.time() * 1000) + 8000},
                "folder": self.driver.project_folder("bot", "project"),
                "command": {
                    "argv": ["python3", "-I", "-c", script, str(outside)],
                    "inputFiles": ["sample.txt"],
                    "timeoutMs": 3000,
                },
            }
            result = self.driver.dispatch(request, server)
            self.assertEqual(result, {"code": 0, "stdout": "temporary\n", "stderr": ""})
            self.assertEqual(sample.read_text(encoding="utf-8"), "original")
            self.assertEqual(outside.read_text(encoding="utf-8"), "private")

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_project_search_rejects_invalid_queries(self, _clock):
        base = {
            "method": "project_file", "botId": "bot", "generation": "generation",
            "run": {"id": "run", "fence": 1, "expiresAt": 2000},
            "folder": {"path": "project", "device": "1", "inode": "2"},
        }
        for file_payload in (
            {"operation": "search", "path": "", "query": ""},
            {"operation": "search", "path": "", "query": "a\nb"},
            {"operation": "search", "path": "", "query": "x" * 201},
            {"operation": "search", "path": "../outside", "query": "ok"},
            {"operation": "search", "path": "", "query": "ok", "caseSensitive": "yes"},
        ):
            with self.subTest(file_payload=file_payload), self.assertRaises(MODULE.Refused):
                self.driver.dispatch({**base, "file": file_payload}, None)

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_file_operations_reject_stale_fences(self, _clock):
        self.driver.authorize_run({"botId": "bot", "run": {"id": "run", "fence": 2, "expiresAt": 2000}})
        for method in ("list", "read", "write", "export"):
            with self.subTest(method=method), self.assertRaises(MODULE.Refused):
                self.driver.dispatch({
                    "method": method, "botId": "bot", "generation": "generation",
                    "run": {"id": "run", "fence": 1, "expiresAt": 2000},
                }, None)

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_authorized_file_operations_reach_their_handlers(self, _clock):
        request = {
            "botId": "bot", "generation": "generation",
            "run": {"id": "run", "fence": 1, "expiresAt": 2000},
            "path": "file", "content": "eA==",
        }
        with patch.object(self.driver, "list_files", return_value=[]) as listing, \
             patch.object(self.driver, "read_file", return_value=b"x") as reading, \
             patch.object(self.driver, "write_file") as writing, \
             patch.object(self.driver, "export_files", return_value=[]) as exporting:
            for method in ("list", "read", "write", "export"):
                self.driver.dispatch({**request, "method": method, "requestId": str(uuid.uuid4())}, None)
            listing.assert_called_once()
            reading.assert_called_once()
            writing.assert_called_once()
            exporting.assert_called_once()

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_invalid_pointer_action_does_not_move_the_pointer(self, _clock):
        with patch.object(self.driver, "desktop_command") as command:
            for action in (
                {"kind": "pointer", "x": 5, "y": 10, "type": "invalid"},
                {"kind": "pointer", "x": 5, "y": 10, "type": "click", "button": "invalid"},
            ):
                request = {
                    "botId": "bot", "run": {"id": "run", "fence": 1, "expiresAt": 2000},
                    "request": {"actions": [action]},
                }
                with self.subTest(action=action), self.assertRaises(MODULE.Refused):
                    self.driver.act(request)
            command.assert_not_called()

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_valid_pointer_click_moves_before_clicking(self, _clock):
        request = {
            "botId": "bot", "run": {"id": "run", "fence": 1, "expiresAt": 2000},
            "request": {"actions": [{"kind": "pointer", "x": 5, "y": 10, "type": "click"}], "observe": False},
        }
        with patch.object(self.driver, "desktop_command") as command:
            self.assertEqual(self.driver.act(request), {"completed": 1})
            self.assertEqual(command.call_args_list, [
                unittest.mock.call(["/usr/bin/xdotool", "mousemove", "--", "5", "10"]),
                unittest.mock.call(["/usr/bin/xdotool", "click", "1"]),
            ])

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_text_input_pastes_unicode_into_the_focused_application(self, _clock):
        request = {
            "botId": "bot", "run": {"id": "run", "fence": 1, "expiresAt": 2000},
            "request": {"actions": [{"kind": "clipboard", "text": "你好"}], "observe": False},
        }
        with patch.object(self.driver, "desktop_command") as command:
            self.assertEqual(self.driver.act(request), {"completed": 1})
            self.assertEqual(command.call_args_list, [
                unittest.mock.call(
                    ["/usr/bin/xclip", "-selection", "clipboard"], "你好".encode(),
                    capture_output=False,
                ),
                unittest.mock.call(["/usr/bin/xdotool", "key", "--", "ctrl+v"]),
            ])

    def test_clipboard_command_does_not_capture_output_from_background_owner(self):
        self.driver.display = ":10"
        self.driver.xauthority = "/desktop/.Xauthority"
        result = types.SimpleNamespace(returncode=0, stdout=None)
        with patch.object(MODULE.os, "getuid", return_value=1, create=True), \
             patch.object(MODULE.pwd, "getpwuid", return_value=types.SimpleNamespace(pw_dir="/desktop"), create=True), \
             patch.object(MODULE.subprocess, "run", return_value=result) as run:
            self.assertEqual(
                self.driver.desktop_command(["/usr/bin/xclip"], b"text", capture_output=False), b"",
            )
            self.assertEqual(run.call_args.kwargs["stdout"], MODULE.subprocess.DEVNULL)
            self.assertEqual(run.call_args.kwargs["stderr"], MODULE.subprocess.DEVNULL)

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_scroll_uses_the_requested_position_and_amount(self, _clock):
        request = {
            "botId": "bot", "run": {"id": "run", "fence": 1, "expiresAt": 2000},
            "request": {
                "actions": [{"kind": "scroll", "direction": "down", "amount": 20, "x": 5, "y": 10}],
                "observe": False,
            },
        }
        with patch.object(self.driver, "desktop_command") as command:
            self.assertEqual(self.driver.act(request), {"completed": 1})
            self.assertEqual(command.call_args_list, [
                unittest.mock.call(["/usr/bin/xdotool", "mousemove", "--", "5", "10"]),
                unittest.mock.call(["/usr/bin/xdotool", "click", "--repeat", "20", "5"]),
            ])

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_action_returns_requested_observation(self, _clock):
        request = {
            "botId": "bot", "run": {"id": "run", "fence": 1, "expiresAt": 2000},
            "request": {"actions": [{"kind": "wait", "ms": 0}], "observe": True, "settleMs": 0},
        }
        with patch.object(self.driver, "observe", return_value={"frameId": "frame"}) as observe:
            self.assertEqual(self.driver.act(request), {"completed": 1, "observation": {"frameId": "frame"}})
            observe.assert_called_once_with(request)

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_identical_screens_have_stable_frame_ids(self, _clock):
        png = b"\x89PNG\r\n\x1a\n" + bytes(8) + MODULE.struct.pack(">II", 2, 3)
        request = {"botId": "bot", "run": {"id": "run", "fence": 1, "expiresAt": 2000}}
        with patch.object(self.driver, "desktop_command", return_value=png):
            first = self.driver.observe(request)
            second = self.driver.observe(request)
        self.assertEqual(first["frameId"], second["frameId"])
        self.assertEqual((first["width"], first["height"]), (2, 3))

    @unittest.skipUnless(sys.platform.startswith("linux"), "requires Linux process and socket semantics")
    def test_command_completes_with_idle_timeout_socket(self):
        with tempfile.TemporaryDirectory() as root, ExitStack() as sockets:
            client, server = socket.socketpair()
            sockets.enter_context(client)
            sockets.enter_context(server)
            self.driver.root = root
            self.driver.display = ":10"
            self.driver.xauthority = "/tmp/unused"
            self.driver.processes = {}
            server.settimeout(5)
            request = {
                "botId": "bot",
                "run": {"id": "run", "fence": 1, "expiresAt": int(time.time() * 1000) + 8000},
                "command": {"argv": ["/bin/echo", "ok"], "timeoutMs": 2000},
            }
            result = self.driver.run_command(request, server)
            self.assertEqual(result["code"], 0)
            self.assertEqual(result["stdout"], "ok\n")

    @unittest.skipUnless(sys.platform.startswith("linux"), "requires Linux process and socket semantics")
    def test_command_refuses_a_disconnected_client(self):
        with tempfile.TemporaryDirectory() as root, ExitStack() as sockets:
            client, server = socket.socketpair()
            sockets.enter_context(client)
            sockets.enter_context(server)
            self.driver.root = root
            self.driver.display = ":10"
            self.driver.xauthority = "/tmp/unused"
            self.driver.processes = {}
            server.settimeout(5)
            client.close()
            request = {
                "botId": "bot",
                "run": {"id": "run", "fence": 1, "expiresAt": int(time.time() * 1000) + 8000},
                "command": {"argv": ["/bin/sleep", "5"], "timeoutMs": 2000},
            }
            with self.assertRaisesRegex(MODULE.Refused, "connection closed"):
                self.driver.run_command(request, server)

    def test_inspect_returns_idle_for_a_known_empty_run_registry(self):
        self.driver.processes = {("bot", "run"): set()}
        result = self.driver.dispatch(
            {"method": "inspect", "botId": "bot", "generation": "generation", "targetRunId": "run"},
            None,
        )
        self.assertEqual(result, "idle")

    def test_inspect_returns_unknown_after_registry_is_lost(self):
        self.driver.processes = {}
        result = self.driver.dispatch(
            {"method": "inspect", "botId": "bot", "generation": "generation", "targetRunId": "run"},
            None,
        )
        self.assertEqual(result, "unknown")

    def test_stale_generation_has_distinct_response_without_dispatching_input(self):
        connection = MagicMock()
        connection.__enter__.return_value = connection
        connection.recv.return_value = json.dumps({
            "method": "control_input", "botId": "bot", "generation": "old",
        }).encode() + b"\n"
        with patch.object(self.driver, "peer_allowed", return_value=True), \
             patch.object(self.driver, "control_input") as control_input:
            self.driver.serve_connection(connection)
        response = json.loads(connection.sendall.call_args.args[0])
        self.assertEqual(response, {"ok": False, "error": "native_driver_generation_changed"})
        control_input.assert_not_called()

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_side_effect_lease_methods_require_valid_request_id(self, _clock):
        base = {
            "botId": "bot",
            "generation": "generation",
            "run": {"id": "run", "fence": 1, "expiresAt": 2000},
            "path": "notes.txt",
            "content": "eA==",
            "command": {"argv": ["/bin/true"], "timeoutMs": 1000},
            "request": {"actions": [{"kind": "wait", "ms": 0}], "observe": False},
        }
        with patch.object(self.driver, "write_file") as write_file, \
             patch.object(self.driver, "act") as act, \
             patch.object(self.driver, "run_command") as run_command:
            for method in ("write", "act", "execute"):
                for bad_id in (None, "", "not-a-uuid", 12345, "550e8400-e29b-41d4-a716-44665544000g"):
                    payload = {**base, "method": method}
                    if bad_id is not None:
                        payload["requestId"] = bad_id
                    with self.subTest(method=method, request_id=bad_id), self.assertRaises(MODULE.Refused):
                        self.driver.dispatch(payload, None)
            write_file.assert_not_called()
            act.assert_not_called()
            run_command.assert_not_called()

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_replayed_request_id_is_rejected_and_multistep_act_succeeds_once(self, _clock):
        req_id = str(uuid.uuid4())
        write_request = {
            "method": "write",
            "botId": "bot",
            "generation": "generation",
            "requestId": req_id,
            "run": {"id": "run", "fence": 1, "expiresAt": 2000},
            "path": "notes.txt",
            "content": "eA==",
        }
        with patch.object(self.driver, "write_file") as write_file:
            self.driver.dispatch(write_request, None)
            with self.assertRaisesRegex(MODULE.Refused, "Replayed"):
                self.driver.dispatch(write_request, None)
            with self.assertRaisesRegex(MODULE.Refused, "Replayed"):
                self.driver.dispatch({**write_request, "requestId": req_id.upper()}, None)
            write_file.assert_called_once()

        act_id = str(uuid.uuid4())
        act_request = {
            "method": "act",
            "botId": "bot",
            "generation": "generation",
            "requestId": act_id,
            "run": {"id": "run", "fence": 1, "expiresAt": 2000},
            "request": {
                "actions": [{"kind": "wait", "ms": 0}, {"kind": "wait", "ms": 0}],
                "observe": True,
                "settleMs": 0,
            },
        }
        png = b"\x89PNG\r\n\x1a\n" + bytes(8) + MODULE.struct.pack(">II", 2, 3)
        with patch.object(self.driver, "desktop_command", return_value=png):
            result = self.driver.dispatch(act_request, None)
            self.assertEqual(result["completed"], 2)
            self.assertIn("observation", result)
            with self.assertRaisesRegex(MODULE.Refused, "Replayed"):
                self.driver.dispatch(act_request, None)

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_read_only_observe_without_lease_remains_compatible_without_request_id(self, _clock):
        png = b"\x89PNG\r\n\x1a\n" + bytes(8) + MODULE.struct.pack(">II", 2, 3)
        with patch.object(self.driver, "desktop_command", return_value=png):
            first = self.driver.dispatch(
                {"method": "observe", "botId": "bot", "generation": "generation"}, None,
            )
            self.assertEqual((first["width"], first["height"]), (2, 3))

            req_id = str(uuid.uuid4())
            leased = {
                "method": "observe",
                "botId": "bot",
                "generation": "generation",
                "requestId": req_id,
                "run": {"id": "run", "fence": 1, "expiresAt": 2000},
            }
            self.driver.dispatch(leased, None)
            with self.assertRaisesRegex(MODULE.Refused, "Replayed"):
                self.driver.dispatch(leased, None)

    def test_seen_request_ids_cache_is_bounded(self):
        ids = [str(uuid.uuid4()) for _ in range(3)]
        with patch.object(MODULE, "MAX_SEEN_REQUEST_IDS", 2):
            for req_id in ids:
                self.driver.consume_request_id({"requestId": req_id}, required=True)
            self.assertEqual(len(self.driver.seen_request_ids), 2)
            with self.assertRaisesRegex(MODULE.Refused, "Replayed"):
                self.driver.consume_request_id({"requestId": ids[1]}, required=True)
            with self.assertRaisesRegex(MODULE.Refused, "Replayed"):
                self.driver.consume_request_id({"requestId": ids[2]}, required=True)
            self.assertEqual(self.driver.consume_request_id({"requestId": ids[0]}, required=True), ids[0])

    def test_resolve_command_cwd_restricts_to_bot_home(self):
        with tempfile.TemporaryDirectory() as root:
            bot_home = os.path.join(root, "bot")
            sub_dir = os.path.join(bot_home, "sub")
            other_dir = os.path.join(root, "other")
            regular_file = os.path.join(bot_home, "file.txt")
            os.makedirs(sub_dir)
            os.makedirs(other_dir)
            with open(regular_file, "w", encoding="utf-8") as handle:
                handle.write("ok")

            home_real = os.path.realpath(bot_home)
            sub_real = os.path.realpath(sub_dir)
            other_real = os.path.realpath(other_dir)
            bot_home_posix = pathlib.Path(bot_home).as_posix()
            sub_dir_posix = pathlib.Path(sub_dir).as_posix()
            other_dir_posix = pathlib.Path(other_dir).as_posix()

            with patch.object(self.driver, "environment", return_value={"home": bot_home}):
                self.assertEqual(self.driver.resolve_command_cwd("bot", None), home_real)
                self.assertEqual(self.driver.resolve_command_cwd("bot", ""), home_real)
                self.assertEqual(self.driver.resolve_command_cwd("bot", "."), home_real)
                self.assertEqual(self.driver.resolve_command_cwd("bot", "sub"), sub_real)
                self.assertEqual(self.driver.resolve_command_cwd("bot", bot_home_posix), home_real)
                self.assertEqual(self.driver.resolve_command_cwd("bot", sub_dir_posix), sub_real)

                for bad_cwd in (
                    "sub\0bad",
                    "sub\\dir",
                    "../other",
                    "sub/../../other",
                    "sub/../sub",
                    "/etc",
                    other_dir_posix,
                    "missing-dir",
                    "file.txt",
                    123,
                ):
                    with self.subTest(cwd=bad_cwd), self.assertRaises(MODULE.Refused):
                        self.driver.resolve_command_cwd("bot", bad_cwd)

                escape_target = os.path.join(home_real, "escape-link")
                real_realpath = os.path.realpath

                def fake_realpath(path):
                    if path == escape_target:
                        return other_real
                    return real_realpath(path)

                with patch.object(MODULE.os.path, "realpath", side_effect=fake_realpath):
                    with self.assertRaises(MODULE.Refused):
                        self.driver.resolve_command_cwd("bot", "escape-link")


class NativeDriverStatePersistenceTests(unittest.TestCase):
    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_state_persists_fences_control_fences_and_request_ids_across_restarts(self, _clock):
        req_1 = "11111111-1111-4111-8111-111111111111"
        req_2 = "22222222-2222-4222-8222-222222222222"
        with tempfile.TemporaryDirectory() as root:
            driver1 = MODULE.Driver(root, 1000, ":10", "/tmp/xauth")
            state_file = os.path.join(root, MODULE.STATE_FILENAME)
            self.assertEqual(driver1.state_path, os.path.abspath(state_file))
            self.assertFalse(os.path.exists(state_file))

            driver1.consume_request_id({"requestId": req_1}, required=True)
            self.assertEqual(
                driver1.authorize_run({
                    "botId": "bot",
                    "run": {"id": "run-1", "fence": 5, "expiresAt": 2000},
                }),
                "run-1",
            )
            driver1.active = None
            driver1.authorize_control({
                "botId": "bot",
                "control": {"leaseId": "human-1", "fence": 3, "expiresAt": 2000},
            })

            self.assertTrue(os.path.isfile(state_file))
            self.assertEqual(
                [name for name in os.listdir(root) if name.endswith(".tmp")],
                [],
            )
            with open(state_file, "r", encoding="utf-8") as handle:
                persisted = json.load(handle)
            self.assertEqual(persisted["version"], MODULE.STATE_VERSION)
            self.assertEqual(persisted["fences"], {"run-1": 5})
            self.assertEqual(
                persisted["control_fences"],
                {"bot": {"fence": 3, "leaseId": "human-1"}},
            )
            self.assertEqual(persisted["seen_request_ids"], [req_1])

            driver2 = MODULE.Driver(root, 1000, ":10", "/tmp/xauth")
            with self.assertRaisesRegex(MODULE.Refused, "Replayed"):
                driver2.consume_request_id({"requestId": req_1}, required=True)
            with self.assertRaisesRegex(MODULE.Refused, "Replayed"):
                driver2.consume_request_id({"requestId": req_1.upper()}, required=True)
            with self.assertRaisesRegex(MODULE.Refused, "Stale run fence"):
                driver2.authorize_run({
                    "botId": "bot",
                    "run": {"id": "run-1", "fence": 4, "expiresAt": 2000},
                })
            with self.assertRaisesRegex(MODULE.Refused, "Revoked human control lease"):
                driver2.authorize_control({
                    "botId": "bot",
                    "control": {"leaseId": "human-old", "fence": 2, "expiresAt": 2000},
                })
            with self.assertRaisesRegex(MODULE.Refused, "Human control fence mismatch"):
                driver2.authorize_control({
                    "botId": "bot",
                    "control": {"leaseId": "human-other", "fence": 3, "expiresAt": 2000},
                })

            self.assertEqual(driver2.consume_request_id({"requestId": req_2}, required=True), req_2)
            self.assertEqual(
                driver2.authorize_run({
                    "botId": "bot",
                    "run": {"id": "run-1", "fence": 6, "expiresAt": 2000},
                }),
                "run-1",
            )
            driver2.active = None
            driver2.authorize_control({
                "botId": "bot",
                "control": {"leaseId": "human-2", "fence": 4, "expiresAt": 2000},
            })

            driver3 = MODULE.Driver(root, 1000, ":10", "/tmp/xauth")
            self.assertEqual(driver3.fences, {"run-1": 6})
            self.assertEqual(
                driver3.control_fences,
                {"bot": {"fence": 4, "leaseId": "human-2"}},
            )
            self.assertEqual(list(driver3.seen_request_ids.keys()), [req_1, req_2])

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_save_only_runs_when_state_mutates_and_supports_custom_state_path(self, _clock):
        with tempfile.TemporaryDirectory() as root:
            custom_state = os.path.join(root, "custom", "state.json")
            driver = MODULE.Driver(root, 1000, ":10", "/tmp/xauth", state_path=custom_state)
            with patch.object(driver, "_save_state_locked", wraps=driver._save_state_locked) as save:
                req = {"botId": "bot", "run": {"id": "run-1", "fence": 2, "expiresAt": 2000}}
                driver.authorize_run(req)
                driver.authorize_run(req)
                self.assertEqual(save.call_count, 1)

                driver.active = None
                ctrl = {"botId": "bot", "control": {"leaseId": "human-1", "fence": 2, "expiresAt": 2000}}
                driver.authorize_control(ctrl)
                driver.authorize_control(ctrl)
                self.assertEqual(save.call_count, 2)

            self.assertTrue(os.path.isfile(custom_state))
            self.assertFalse(os.path.exists(os.path.join(root, MODULE.STATE_FILENAME)))

    def test_seen_request_ids_stay_bounded_across_restarts(self):
        ids = [str(uuid.uuid4()) for _ in range(6)]
        with tempfile.TemporaryDirectory() as root, patch.object(MODULE, "MAX_SEEN_REQUEST_IDS", 3):
            driver1 = MODULE.Driver(root, 1000, ":10", "/tmp/xauth")
            for req_id in ids[:5]:
                driver1.consume_request_id({"requestId": req_id}, required=True)

            driver2 = MODULE.Driver(root, 1000, ":10", "/tmp/xauth")
            self.assertEqual(list(driver2.seen_request_ids.keys()), ids[2:5])
            for retained in ids[2:5]:
                with self.assertRaisesRegex(MODULE.Refused, "Replayed"):
                    driver2.consume_request_id({"requestId": retained}, required=True)
            self.assertEqual(driver2.consume_request_id({"requestId": ids[0]}, required=True), ids[0])

            # Also verify oversized persisted lists are trimmed to the newest MAX_SEEN_REQUEST_IDS on load
            state_file = os.path.join(root, MODULE.STATE_FILENAME)
            with open(state_file, "w", encoding="utf-8") as handle:
                json.dump({
                    "version": MODULE.STATE_VERSION,
                    "fences": {},
                    "control_fences": {},
                    "seen_request_ids": [item.upper() for item in ids],
                }, handle)
            driver3 = MODULE.Driver(root, 1000, ":10", "/tmp/xauth")
            self.assertEqual(list(driver3.seen_request_ids.keys()), ids[-3:])

    def test_corrupt_or_invalid_state_file_warns_and_falls_back_to_empty_state(self):
        valid_uuid = str(uuid.uuid4())
        bad_payloads = [
            ("invalid-json", b"{not valid json"),
            ("invalid-utf8", b"\xff\xfe\xfd"),
            ("non-object-root", json.dumps(["bad"]).encode("utf-8")),
            ("wrong-version", json.dumps({
                "version": 99, "fences": {}, "control_fences": {}, "seen_request_ids": [],
            }).encode("utf-8")),
            ("bool-version", json.dumps({
                "version": True, "fences": {}, "control_fences": {}, "seen_request_ids": [],
            }).encode("utf-8")),
            ("missing-key", json.dumps({
                "version": 1, "fences": {}, "control_fences": {},
            }).encode("utf-8")),
            ("negative-fence", json.dumps({
                "version": 1, "fences": {"run-1": -1}, "control_fences": {}, "seen_request_ids": [],
            }).encode("utf-8")),
            ("bool-fence", json.dumps({
                "version": 1, "fences": {"run-1": True}, "control_fences": {}, "seen_request_ids": [],
            }).encode("utf-8")),
            ("bad-control-fence-type", json.dumps({
                "version": 1, "fences": {}, "control_fences": {"bot": "bad"}, "seen_request_ids": [],
            }).encode("utf-8")),
            ("bad-control-fence-value", json.dumps({
                "version": 1, "fences": {}, "control_fences": {"bot": {"fence": -2, "leaseId": "h1"}},
                "seen_request_ids": [],
            }).encode("utf-8")),
            ("bad-control-fence-lease", json.dumps({
                "version": 1, "fences": {}, "control_fences": {"bot": {"fence": 2, "leaseId": "../bad"}},
                "seen_request_ids": [],
            }).encode("utf-8")),
            ("non-list-seen", json.dumps({
                "version": 1, "fences": {}, "control_fences": {}, "seen_request_ids": {valid_uuid: True},
            }).encode("utf-8")),
            ("bad-seen-entry", json.dumps({
                "version": 1, "fences": {}, "control_fences": {}, "seen_request_ids": [valid_uuid, "not-a-uuid"],
            }).encode("utf-8")),
        ]
        with tempfile.TemporaryDirectory() as root:
            state_file = os.path.join(root, MODULE.STATE_FILENAME)
            for name, raw_bytes in bad_payloads:
                with self.subTest(case=name):
                    with open(state_file, "wb") as handle:
                        handle.write(raw_bytes)
                    stderr_buf = io.StringIO()
                    with redirect_stderr(stderr_buf):
                        driver = MODULE.Driver(root, 1000, ":10", "/tmp/xauth")
                    self.assertEqual(driver.fences, {})
                    self.assertEqual(driver.control_fences, {})
                    self.assertEqual(len(driver.seen_request_ids), 0)
                    self.assertIn("sydney-driver:", stderr_buf.getvalue())

    @patch.object(MODULE.time, "time", return_value=1.0)
    def test_symlink_state_file_is_refused_on_load_and_save(self, _clock):
        req_id = "33333333-3333-4333-8333-333333333333"
        fresh_id = "44444444-4444-4444-8444-444444444444"
        with tempfile.TemporaryDirectory() as root:
            state_file = os.path.abspath(os.path.join(root, MODULE.STATE_FILENAME))
            original_payload = {
                "version": MODULE.STATE_VERSION,
                "fences": {"run-1": 9},
                "control_fences": {"bot": {"fence": 7, "leaseId": "human-1"}},
                "seen_request_ids": [req_id],
            }
            with open(state_file, "w", encoding="utf-8") as handle:
                json.dump(original_payload, handle)

            real_islink = os.path.islink

            def fake_islink(path):
                if os.path.abspath(path) == state_file:
                    return True
                return real_islink(path)

            stderr_buf = io.StringIO()
            with patch.object(MODULE.os.path, "islink", side_effect=fake_islink), \
                 redirect_stderr(stderr_buf):
                driver = MODULE.Driver(root, 1000, ":10", "/tmp/xauth")

            self.assertEqual(driver.fences, {})
            self.assertEqual(driver.control_fences, {})
            self.assertEqual(len(driver.seen_request_ids), 0)
            self.assertIn("symlink", stderr_buf.getvalue())

            # Saving must also refuse to overwrite a symlink and roll back in-memory mutation
            save_stderr = io.StringIO()
            with patch.object(MODULE.os.path, "islink", side_effect=fake_islink), \
                 redirect_stderr(save_stderr):
                with self.assertRaisesRegex(MODULE.Refused, "symlink"):
                    driver.consume_request_id({"requestId": fresh_id}, required=True)
                with self.assertRaisesRegex(MODULE.Refused, "symlink"):
                    driver.authorize_run({
                        "botId": "bot",
                        "run": {"id": "run-1", "fence": 1, "expiresAt": 2000},
                    })
                with self.assertRaisesRegex(MODULE.Refused, "symlink"):
                    driver.authorize_control({
                        "botId": "bot",
                        "control": {"leaseId": "human-1", "fence": 1, "expiresAt": 2000},
                    })

            self.assertEqual(driver.fences, {})
            self.assertEqual(driver.control_fences, {})
            self.assertEqual(len(driver.seen_request_ids), 0)
            self.assertIn("symlink", save_stderr.getvalue())
            self.assertEqual(
                [name for name in os.listdir(root) if name.endswith(".tmp")],
                [],
            )
            with open(state_file, "r", encoding="utf-8") as handle:
                self.assertEqual(json.load(handle), original_payload)

            # ELOOP from O_NOFOLLOW during open must also warn and fall back cleanly
            real_open = os.open

            def fake_open(path, *args, **kwargs):
                if os.path.abspath(path) == state_file:
                    raise OSError(errno.ELOOP, "Too many levels of symbolic links")
                return real_open(path, *args, **kwargs)

            eloop_stderr = io.StringIO()
            with patch.object(MODULE.os, "open", side_effect=fake_open), \
                 redirect_stderr(eloop_stderr):
                eloop_driver = MODULE.Driver(root, 1000, ":10", "/tmp/xauth")
            self.assertEqual(eloop_driver.fences, {})
            self.assertEqual(eloop_driver.control_fences, {})
            self.assertEqual(len(eloop_driver.seen_request_ids), 0)
            self.assertIn("unable to open state file", eloop_stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
