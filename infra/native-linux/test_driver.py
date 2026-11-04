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


if __name__ == "__main__":
    unittest.main()
