import importlib.util
import pathlib
import socket
import sys
import tempfile
import time
import types
import unittest
from contextlib import ExitStack
from unittest.mock import patch

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

    def test_workspace_rejects_traversal_and_absolute_paths(self):
        for path in ("../private", "/etc/passwd", "a/../b", "a\\b", "a//b", "a/\0"):
            with self.subTest(path=path), self.assertRaises(MODULE.Refused):
                self.driver.path_parts(path)
        self.assertEqual(self.driver.path_parts("notes/result.md"), ["notes", "result.md"])

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
                self.driver.dispatch({**request, "method": method}, None)
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


if __name__ == "__main__":
    unittest.main()
