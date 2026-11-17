import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest


SCRIPT = pathlib.Path(__file__).with_name("backup-postgres-globals.sh")
BASH = shutil.which("bash")
if os.name == "nt" and pathlib.Path("D:/cxdownload/Git/bin/bash.exe").exists():
    BASH = "D:/cxdownload/Git/bin/bash.exe"


@unittest.skipUnless(BASH, "bash is required")
class GlobalsDisabledTests(unittest.TestCase):
    def test_selected_invocations_do_not_run_fake_tools_or_echo_synthetic_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            marker = root / "invoked"
            for command in ("pg_dumpall", "age", "docker"):
                fake = root / command
                fake.write_text("#!/bin/bash\nbuiltin printf invoked > \"$MARKER\"\n", encoding="utf-8")
                fake.chmod(0o700)
            env = {
                **os.environ,
                "PATH": str(root) + os.pathsep + os.environ.get("PATH", ""),
                "TEST_FAKE_DIR": ("/" + root.drive[0].lower() + root.as_posix()[2:]
                                  if os.name == "nt" else str(root)),
                "MARKER": marker.as_posix(),
                "PGPASSWORD": "synthetic-secret-password",
                "PGHOST": "production.invalid",
                "RAKAZO_BACKUP_ROOT": str(root),
                "RAKAZO_BACKUP_AGE_RECIPIENTS": "synthetic-secret-recipient",
            }
            for command in ("pg_dumpall", "age", "docker"):
                with self.subTest(control=command):
                    control = subprocess.run(
                        [BASH, "-p", "-c",
                         'PATH="$TEST_FAKE_DIR:$PATH"; export PATH; "$1"', "test-wrapper", command],
                        env=env, capture_output=True,
                    )
                    self.assertEqual(control.returncode, 0)
                    self.assertTrue(marker.exists(), f"PATH control did not execute {command}")
                    marker.unlink()
            for args in ([], ["--production"], ["--synthetic"], ["--help", "extra"],
                         ["--synthetic", "--confirm-isolated-capacity"],
                         ["--restore"], ["--synthetic", "--restore"],
                         ["--output", str(root / "output.age"), "--recipient", "age1synthetic"]):
                with self.subTest(args=args):
                    result = subprocess.run(
                        [BASH, "-p", "-c",
                         'PATH="$TEST_FAKE_DIR:$PATH"; export PATH; exec "$@"',
                         "test-wrapper", BASH, "-p", str(SCRIPT), *args],
                        env=env, capture_output=True,
                    )
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn(b"disabled", result.stderr)
                    self.assertNotIn(b"synthetic-secret", result.stdout + result.stderr)
                    self.assertFalse(marker.exists())
            self.assertEqual({path.name for path in root.iterdir()}, {"pg_dumpall", "age", "docker"})

    def test_help_identifies_unimplemented_safeguards(self):
        result = subprocess.run([BASH, "-p", str(SCRIPT), "--help"], capture_output=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn(b"DISABLED", result.stdout)
        self.assertIn(b"including role password hashes in the encrypted output", result.stdout)
        self.assertNotIn(b"--no-role-passwords", result.stdout)
        self.assertIn(b"None of these backup or\nrestore capabilities is implemented", result.stdout)
        self.assertIn(b"not an executable mode", result.stdout)
        self.assertIn(b"both processes exit successfully", result.stdout)
        self.assertIn(b"does not authorize production collection", result.stdout)
        self.assertIn(b"without -p", result.stdout)
        self.assertIn(b"never\n  accept an existing container", result.stdout)
        self.assertIn(b"archive with ownership and privileges included", result.stdout)
        self.assertIn(b"already-existing bootstrap role", result.stdout)
        self.assertIn(b"negative control", result.stdout)
        self.assertIn(b"not an atomic\n  snapshot", result.stdout)

    def test_non_privileged_bash_refuses_even_help(self):
        env = {**os.environ, "BASH_ENV": ""}
        for args in ([], ["--help"], ["--synthetic"]):
            with self.subTest(args=args):
                result = subprocess.run([BASH, str(SCRIPT), *args], env=env, capture_output=True)
                self.assertEqual(result.returncode, 1)
                self.assertIn(b"invoke /bin/bash -p", result.stderr)
                self.assertEqual(result.stdout, b"")

    def test_privileged_bash_ignores_startup_file_and_help_ignores_path_cat(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            startup_marker = root / "startup-invoked"
            cat_marker = root / "cat-invoked"
            startup = root / "startup.sh"
            startup.write_text('builtin printf invoked > "$STARTUP_MARKER"\n', encoding="utf-8")
            fake_cat = root / "cat"
            fake_cat.write_text('#!/bin/bash\nbuiltin printf invoked > "$CAT_MARKER"\n', encoding="utf-8")
            fake_cat.chmod(0o700)
            env = {
                **os.environ,
                "PATH": str(root) + os.pathsep + os.environ.get("PATH", ""),
                "BASH_ENV": startup.as_posix(),
                "STARTUP_MARKER": startup_marker.as_posix(),
                "CAT_MARKER": cat_marker.as_posix(),
                "TEST_FAKE_DIR": ("/" + root.drive[0].lower() + root.as_posix()[2:]
                                  if os.name == "nt" else str(root)),
            }
            control = subprocess.run([BASH, "-c", ":"], env=env, capture_output=True)
            self.assertEqual(control.returncode, 0)
            self.assertTrue(startup_marker.exists(), "BASH_ENV control did not execute")
            startup_marker.unlink()
            cat_control = subprocess.run([BASH, "-p", "-c",
                                          'PATH="$TEST_FAKE_DIR:$PATH"; export PATH; cat'],
                                         env=env, capture_output=True)
            self.assertEqual(cat_control.returncode, 0)
            self.assertTrue(cat_marker.exists(), "PATH cat control did not execute")
            cat_marker.unlink()
            if startup_marker.exists():
                startup_marker.unlink()
            for args in ([], ["--production"], ["--help"]):
                with self.subTest(args=args):
                    result = subprocess.run([BASH, "-p", "-c",
                                             'PATH="$TEST_FAKE_DIR:$PATH"; export PATH; exec "$@"',
                                             "test-wrapper", BASH, "-p", str(SCRIPT), *args],
                                            env=env, capture_output=True)
                    self.assertEqual(result.returncode, 0 if args == ["--help"] else 1)
                    self.assertFalse(startup_marker.exists())
                    self.assertFalse(cat_marker.exists())

    @unittest.skipIf(os.name == "nt", "direct shebang execution requires POSIX")
    def test_direct_entry_ignores_startup_file(self):
        if not os.access(SCRIPT, os.X_OK) or not pathlib.Path("/bin/bash").exists():
            self.skipTest("executable script and /bin/bash are required")
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            marker = root / "startup-invoked"
            startup = root / "startup.sh"
            startup.write_text('builtin printf invoked > "$STARTUP_MARKER"\n', encoding="utf-8")
            env = {**os.environ, "BASH_ENV": str(startup), "STARTUP_MARKER": str(marker)}
            result = subprocess.run([str(SCRIPT)], env=env, capture_output=True)
            self.assertEqual(result.returncode, 1)
            self.assertFalse(marker.exists())


if __name__ == "__main__":
    unittest.main()
