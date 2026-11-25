import base64
import importlib.util
import unittest
from pathlib import Path


runner_path = Path(__file__).with_name("project-command-runner.py")
spec = importlib.util.spec_from_file_location("project_command_runner", runner_path)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class ProjectCommandRequestTests(unittest.TestCase):
    def request(self, **overrides):
        value = {
            "argv": ["/usr/bin/python3", "-c", "print('ok')"],
            "inputFiles": ["src/main.py"],
            "timeoutMs": 2500,
            "files": [{"path": "src/main.py", "content": base64.b64encode(b"print('ok')").decode()}],
        }
        value.update(overrides)
        return value

    def test_accepts_matching_utf8_input_copy(self):
        argv, paths, timeout, contents = runner.check_request(self.request())
        self.assertEqual(argv[0], "/usr/bin/python3")
        self.assertEqual(paths, ["src/main.py"])
        self.assertEqual(timeout, 2500)
        self.assertEqual(contents, [b"print('ok')"])

    def test_rejects_parent_and_absolute_paths(self):
        for value in ("../secret", "/etc/passwd", "src/../secret", "src\\secret"):
            with self.subTest(path=value):
                with self.assertRaises(runner.Refused):
                    runner.check_request(self.request(inputFiles=[value], files=[{"path": value, "content": ""}]))

    def test_rejects_duplicate_and_overlapping_inputs(self):
        for paths in (["src/main.py", "src/main.py"], ["src", "src/main.py"]):
            with self.subTest(paths=paths):
                files = [{"path": item, "content": ""} for item in paths]
                with self.assertRaises(runner.Refused):
                    runner.check_request(self.request(inputFiles=paths, files=files))

    def test_rejects_mismatched_file_list(self):
        with self.assertRaises(runner.Refused):
            runner.check_request(self.request(files=[]))

    def test_rejects_non_utf8_input(self):
        invalid = base64.b64encode(b"\xff").decode()
        with self.assertRaises(UnicodeDecodeError):
            runner.check_request(self.request(files=[{"path": "src/main.py", "content": invalid}]))

    def test_rejects_input_over_per_file_limit(self):
        large = base64.b64encode(b"x" * (runner.MAX_FILE + 1)).decode()
        with self.assertRaises(runner.Refused):
            runner.check_request(self.request(files=[{"path": "src/main.py", "content": large}]))

    def test_rejects_unbounded_timeout(self):
        with self.assertRaises(runner.Refused):
            runner.check_request(self.request(timeoutMs=runner.MAX_LINE))


if __name__ == "__main__":
    unittest.main()
