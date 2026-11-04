import importlib.util
import pathlib
import sys
import types
import unittest
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


if __name__ == "__main__":
    unittest.main()
