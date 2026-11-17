import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest


SCRIPT = pathlib.Path(__file__).with_name("pg18-globals-synthetic-drill.sh")
BASH = shutil.which("bash")
if os.name == "nt" and pathlib.Path("D:/cxdownload/Git/bin/bash.exe").exists():
    BASH = "D:/cxdownload/Git/bin/bash.exe"


@unittest.skipUnless(BASH, "bash is required")
class GlobalsDrillBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.script = SCRIPT.read_text(encoding="utf-8")

    def run_bash(self, source, *arguments):
        return subprocess.run(
            [BASH, "-p", "-c", source, *arguments],
            capture_output=True,
            timeout=10,
        )

    def test_external_internal_variables_do_not_select_worker_for_file_path(self):
        start = self.script.index('if [[ ! $0 =~ ^/proc/self/fd/[0-9]+$ ]]')
        end = self.script.index("\nverify_daemon() {", start)
        fragment = self.script[start:end]
        original = 'exec /usr/bin/env -i PATH="$PATH" LC_ALL=C /usr/bin/python3 -I -c "$guard_source" start "$0"'
        self.assertIn(original, fragment)
        fragment = fragment.replace(original, "printf 'start\\n'; exit 0")
        fragment = fragment.replace('[[ -f $0 && ! -L $0 ]]', "true")
        result = self.run_bash(
            '_DRILL_FD=100 _DRILL_ID=forged _DRILL_SCRIPT_FD=101\n' + fragment,
            "ordinary-script",
        )
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b"start\n")

    def test_snapshot_worker_checks_executing_fd_and_trusted_source(self):
        worker = self.script.split('elif sys.argv[1] == "worker":', 1)[1].split(
            'elif sys.argv[1] == "check":', 1
        )[0]
        for expected in (
            'sys.argv[2] != "/proc/self/fd/%d" % script_fd',
            'os.stat("/proc/%d/fd/255" % int(sys.argv[3]))',
            "fcntl.F_GET_SEALS",
            'script_snapshot(os.environ["_DRILL_SCRIPT_PATH"])',
            "hashlib.sha256(os.pread(script_fd, 1048577, 0)).hexdigest() != digest",
        ):
            self.assertIn(expected, worker)

    def test_identity_producer_failure_is_propagated(self):
        start = self.script.index('exec {identity_fd}< <(printf')
        pipeline = self.script.index('inside "$source_id" pg_dumpall', start)
        closing = self.script.index("exec {identity_fd}<&-", pipeline)
        end = self.script.index("unset -v age_identity recipient", closing)
        fragment = self.script[start:pipeline] + 'cat <&"$identity_fd" >/dev/null || stream_status=$?\n' + self.script[closing:end]
        for producer_status, expected_status in ((0, 0), (37, 1)):
            with self.subTest(producer_status=producer_status):
                source = (
                    "set -o pipefail\n"
                    "age_identity=synthetic\n"
                    f'printf() {{ builtin printf "%s\\n" "$2"; return {producer_status}; }}\n'
                    "fail() { exit 1; }\n" + fragment
                )
                result = self.run_bash(source, "identity-test")
                self.assertEqual(result.returncode, expected_status, result.stderr)
                self.assertNotIn(b"synthetic", result.stdout + result.stderr)

    @unittest.skipUnless(
        os.name == "posix" and hasattr(os, "geteuid") and os.geteuid() == 0,
        "requires a trusted root-owned temporary directory",
    )
    def test_age_tools_require_trusted_files_and_ancestors(self):
        fragment = self.script.split('<<\'PY\' ||\n', 1)[1].split("\nPY\n", 1)[0]
        with tempfile.TemporaryDirectory(prefix="sydney-age-check-", dir="/root") as root:
            directory = pathlib.Path(root) / "tools"
            directory.mkdir(mode=0o700)
            for name in ("age", "age-keygen"):
                tool = directory / name
                tool.write_bytes(b"fixture")
                tool.chmod(0o700)
            fragment = fragment.replace(
                '("/usr/bin", "/root/sydney-pg18-drill-tools/usr/bin")', f"({str(directory)!r},)"
            )

            def check():
                return subprocess.run(
                    ["/usr/bin/python3", "-I", "-c", fragment, str(directory)],
                    capture_output=True,
                    timeout=10,
                )

            self.assertEqual(check().returncode, 0)
            (directory / "age").chmod(0o722)
            self.assertNotEqual(check().returncode, 0)
            (directory / "age").unlink()
            (directory / "age").symlink_to(directory / "age-keygen")
            self.assertNotEqual(check().returncode, 0)
            (directory / "age").unlink()
            (directory / "age").write_bytes(b"fixture")
            (directory / "age").chmod(0o700)
            directory.chmod(0o777)
            self.assertNotEqual(check().returncode, 0)

    @unittest.skipUnless(
        os.name == "posix" and pathlib.Path("/root/sydney-pg18-drill-tools/usr/bin/age").is_file(),
        "requires the temporary maintenance-host tools",
    )
    def test_temporary_age_tools_are_accepted(self):
        fragment = self.script.split('<<\'PY\' ||\n', 1)[1].split("\nPY\n", 1)[0]
        result = subprocess.run(
            ["/usr/bin/python3", "-I", "-c", fragment, "/root/sydney-pg18-drill-tools/usr/bin"],
            capture_output=True,
            timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
