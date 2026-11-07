import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import inspect_environment


class InspectEnvironmentTest(unittest.TestCase):
    def test_reads_only_requested_release_fields(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "os-release"
            path.write_text('ID=ubuntu\nVERSION_ID="22.04"\nNAME="Ubuntu"\n', encoding="utf-8")
            self.assertEqual(
                inspect_environment.read_os_release(path),
                {"ID": "ubuntu", "VERSION_ID": "22.04"},
            )

    def test_missing_release_is_unknown(self):
        self.assertEqual(inspect_environment.read_os_release(Path("missing-os-release")), {})

    def test_disk_failure_is_unknown_and_programs_report_availability(self):
        with (
            patch("inspect_environment.platform.system", return_value="Linux"),
            patch("inspect_environment.read_os_release", return_value={}),
            patch("inspect_environment.shutil.disk_usage", side_effect=OSError),
            patch("inspect_environment.shutil.which", side_effect=lambda name: "/bin/ssh" if name == "ssh" else None),
        ):
            result = inspect_environment.inspect_environment()
        self.assertIsNone(result["home_free_bytes"])
        self.assertIsNone(result["distribution"])
        self.assertTrue(result["programs"]["ssh"])
        self.assertFalse(result["programs"]["x11vnc"])


if __name__ == "__main__":
    unittest.main()
