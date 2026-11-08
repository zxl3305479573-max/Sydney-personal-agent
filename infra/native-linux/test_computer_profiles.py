import os
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

if sys.platform != "linux":
    raise unittest.SkipTest("profile storage requires Linux flock")

import computer_profiles
from inspect_remote import InspectionError


class ComputerProfilesTest(unittest.TestCase):
    def test_add_list_remove_preserves_credentials(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            identity = root / "identity"
            known_hosts = root / "known_hosts"
            identity.write_text("private-key-placeholder")
            known_hosts.write_text("known-host-placeholder")
            path = root / "profiles.json"
            profile = {
                "id": "one", "name": "电脑一", "host": "example.com", "user": "desktop",
                "port": 22, "identity": str(identity), "known_hosts": str(known_hosts),
            }
            computer_profiles.add_profile(path, profile)
            self.assertEqual(computer_profiles.get_profiles(path), {"one": profile})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertNotIn("private-key-placeholder", path.read_text())
            with self.assertRaisesRegex(InspectionError, "^profile_already_exists$"):
                computer_profiles.add_profile(path, profile)
            computer_profiles.remove_profile(path, "one")
            self.assertEqual(computer_profiles.get_profiles(path), {})
            self.assertTrue(identity.exists())
            self.assertTrue(known_hosts.exists())

    def test_rejects_insecure_store_and_symlink(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "profiles.json"
            path.write_text("{}")
            os.chmod(path, 0o644)
            with self.assertRaisesRegex(InspectionError, "^profile_file_permissions$"):
                computer_profiles.get_profiles(path)
            path.unlink()
            path.symlink_to(root / "missing")
            with self.assertRaisesRegex(InspectionError, "^profile_storage_unavailable$"):
                computer_profiles.get_profiles(path)

    def test_rejects_invalid_input(self):
        with self.assertRaisesRegex(InspectionError, "^invalid_profile$"):
            computer_profiles.validate_profile({"id": "one"})


if __name__ == "__main__":
    unittest.main()
