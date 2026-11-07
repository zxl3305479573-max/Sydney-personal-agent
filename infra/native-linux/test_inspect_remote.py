import io
import json
import subprocess
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import inspect_remote


class Process:
    def __init__(self, result, status=0):
        self.stdin = io.BytesIO()
        self.stdout = io.BytesIO(result)
        self.status = status

    def wait(self, timeout=None):
        return self.status

    def poll(self):
        return self.status


class InspectRemoteTest(unittest.TestCase):
    def test_invalid_hosts_are_rejected(self):
        for host in ("-option", "host;command", "example.com\n", "host..name"):
            with self.subTest(host=host), self.assertRaises(inspect_remote.InspectionError):
                inspect_remote.validate_host(host)

    def test_ssh_is_pinned_and_never_uses_a_shell(self):
        response = {
            "system": "Linux",
            "architecture": "x86_64",
            "distribution": "ubuntu",
            "version": "22.04",
            "home_free_bytes": 123,
            "display_configured": False,
            "programs": {"python3": True},
        }
        process = Process(json.dumps(response).encode())
        with TemporaryDirectory() as directory:
            identity = Path(directory) / "identity"
            known_hosts = Path(directory) / "known_hosts"
            identity.touch()
            known_hosts.touch()
            with patch("inspect_remote.subprocess.Popen", return_value=process) as spawn:
                result = inspect_remote.inspect_remote(
                    "example.com", "desktop", 22, identity, known_hosts
                )
        self.assertEqual(result, response)
        arguments = spawn.call_args.args[0]
        self.assertIn("StrictHostKeyChecking=yes", arguments)
        self.assertIn("IdentityAgent=none", arguments)
        self.assertIn("ProxyCommand=none", arguments)
        self.assertEqual(arguments[-2:], ["desktop@example.com", "python3 -"])
        self.assertNotIn("shell", spawn.call_args.kwargs)

    def test_connection_failure_does_not_expose_remote_output(self):
        with TemporaryDirectory() as directory:
            identity = Path(directory) / "identity"
            known_hosts = Path(directory) / "known_hosts"
            identity.touch()
            known_hosts.touch()
            with patch(
                "inspect_remote.subprocess.Popen", return_value=Process(b"secret", 255)
            ), self.assertRaisesRegex(inspect_remote.InspectionError, "^connection_or_inspection_failed$"):
                inspect_remote.inspect_remote("example.com", "desktop", 22, identity, known_hosts)

    def test_timeout_is_reported(self):
        process = Process(b"")
        process.wait = unittest.mock.Mock(side_effect=[subprocess.TimeoutExpired("ssh", 1), 0])
        process.poll = unittest.mock.Mock(return_value=None)
        process.kill = unittest.mock.Mock()
        with TemporaryDirectory() as directory:
            identity = Path(directory) / "identity"
            known_hosts = Path(directory) / "known_hosts"
            identity.touch()
            known_hosts.touch()
            with patch("inspect_remote.subprocess.Popen", return_value=process):
                with self.assertRaisesRegex(inspect_remote.InspectionError, "^inspection_timeout$"):
                    inspect_remote.inspect_remote("example.com", "desktop", 22, identity, known_hosts)
        process.kill.assert_called_once()

    def test_oversized_response_is_rejected(self):
        with TemporaryDirectory() as directory:
            identity = Path(directory) / "identity"
            known_hosts = Path(directory) / "known_hosts"
            identity.touch()
            known_hosts.touch()
            with patch(
                "inspect_remote.subprocess.Popen",
                return_value=Process(b"x" * (inspect_remote.MAX_OUTPUT + 1)),
            ):
                with self.assertRaisesRegex(inspect_remote.InspectionError, "^invalid_response$"):
                    inspect_remote.inspect_remote("example.com", "desktop", 22, identity, known_hosts)


if __name__ == "__main__":
    unittest.main()
