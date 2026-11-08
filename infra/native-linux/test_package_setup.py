import unittest
from unittest.mock import patch

import package_setup


class PackageSetupTest(unittest.TestCase):
    def setUp(self):
        self.system = {"distribution": "ubuntu", "version": "22.04", "architecture": "x86_64"}
        self.packages = {package: "1.0-1" for package in package_setup.PACKAGES}
        self.plan = {"system": self.system, "packages": self.packages}

    def test_rejects_unexpected_package_or_version(self):
        with patch("package_setup.system_identity", return_value=self.system):
            with self.assertRaisesRegex(package_setup.PreparationError, "^invalid_plan$"):
                package_setup.validate_plan({
                    "system": self.system, "packages": {**self.packages, "evil": "1.0"}
                })
            invalid = {**self.packages, "xfce4": "1.0;command"}
            with self.assertRaisesRegex(package_setup.PreparationError, "^invalid_plan$"):
                package_setup.validate_plan({"system": self.system, "packages": invalid})

    def test_rejects_changed_candidates(self):
        with (
            patch("package_setup.system_identity", return_value=self.system),
            patch("package_setup.candidate_versions", return_value={**self.packages, "xfce4": "2.0"}),
        ):
            with self.assertRaisesRegex(package_setup.PreparationError, "^package_candidates_changed$"):
                package_setup.validate_plan(self.plan)

    def test_installs_only_the_approved_fixed_packages(self):
        with (
            patch("package_setup.system_identity", return_value=self.system),
            patch("package_setup.candidate_versions", return_value=self.packages),
            patch("package_setup.subprocess.run") as run,
        ):
            run.return_value.returncode = 0
            self.assertEqual(package_setup.apply_plan(self.plan), {"status": "packages_installed"})
        arguments = run.call_args.args[0]
        self.assertEqual(arguments[0:3], ["/usr/bin/sudo", "-n", "/usr/bin/env"])
        self.assertEqual(arguments[-len(self.packages):], [
            f"{package}=1.0-1" for package in package_setup.PACKAGES
        ])


if __name__ == "__main__":
    unittest.main()
