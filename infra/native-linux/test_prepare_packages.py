import unittest
from unittest.mock import patch

try:
    import prepare_packages
except ModuleNotFoundError as error:
    if error.name == "fcntl":
        raise unittest.SkipTest("profile storage requires Linux flock") from error
    raise

from inspect_remote import InspectionError


class PreparePackagesTest(unittest.TestCase):
    def test_rejects_target_change_before_remote_execution(self):
        profile = {"host": "new", "user": "desktop", "port": 22}
        plan = {"target": {"host": "old"}, "preparation": {}}
        with (
            patch("prepare_packages.host_binding", return_value={"host": "new"}),
            patch("prepare_packages.remote_action") as remote,
        ):
            with self.assertRaisesRegex(InspectionError, "^target_changed$"):
                prepare_packages.apply_plan(profile, plan)
        remote.assert_not_called()

    def test_failed_connection_during_install_is_unknown(self):
        profile = {
            "host": "example.com", "user": "desktop", "port": 22,
            "identity": "/identity", "known_hosts": "/known_hosts",
        }
        with patch("prepare_packages.run_remote_script", side_effect=InspectionError("inspection_timeout")):
            with self.assertRaisesRegex(InspectionError, "^install_result_unknown$"):
                prepare_packages.remote_action(profile, "apply", {})


if __name__ == "__main__":
    unittest.main()
