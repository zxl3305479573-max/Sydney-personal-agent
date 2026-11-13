#!/usr/bin/env python3
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


DIRECTORY = Path(__file__).parent
AGE = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age"
KEYGEN = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age-keygen"
spec = importlib.util.spec_from_file_location(
    "workspace_capture_controller", DIRECTORY / "workspace-capture-controller.py")
controller = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controller)
verify_spec = importlib.util.spec_from_file_location(
    "workspace_archive_verify", DIRECTORY / "workspace-archive-verify.py")
verify = importlib.util.module_from_spec(verify_spec)
verify_spec.loader.exec_module(verify)


@unittest.skipUnless(Path(AGE).is_file(), "real age is required")
class ControllerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir="/dev/shm")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source = self.base / "source"
        self.source.mkdir(mode=0o700)
        (self.source / "project").write_bytes(b"synthetic project")
        self.destination = self.base / "output"
        self.destination.mkdir(mode=0o700)
        self.output_fd = os.open(self.destination, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, self.output_fd)
        self.child = subprocess.Popen(
            [sys.executable, "-c", "import time;time.sleep(60)"],
            env={"SYDNEY_WORKSPACE_ROOT": str(self.source), "PATH": "/usr/bin:/bin"},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        self.addCleanup(self.stop_child)
        with open("/proc/self/cgroup", encoding="ascii") as source:
            groups = [line.strip()[3:] for line in source if line.startswith("0::")]
        self.assertEqual(len(groups), 1)
        self.cgroup = groups[0]
        identity = subprocess.run([KEYGEN], check=True, capture_output=True).stdout
        self.key = self.base / "identity"
        self.key.write_bytes(identity)
        self.key.chmod(0o600)
        self.recipient = subprocess.run([KEYGEN, "-y"], input=identity, check=True,
                                        capture_output=True).stdout.decode().strip()

    def stop_child(self):
        if self.child.poll() is None:
            self.child.terminate()
            self.child.wait(timeout=5)

    def capture(self):
        return controller.capture(self.child.pid, str(self.source), os.geteuid(), self.cgroup,
                                  self.output_fd, AGE, self.recipient, 65536, 15)

    def test_stable_source_is_published_and_decryptable(self):
        self.capture()
        encrypted = (self.destination / "workspace.age").read_bytes()
        plaintext = subprocess.run([AGE, "-d", "-i", str(self.key)], input=encrypted,
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   check=True).stdout
        self.assertEqual(verify.verify(io.BytesIO(plaintext), os.geteuid())[:2], (2, 17))
        self.assertEqual([path.name for path in self.destination.iterdir()], ["workspace.age"])

    def test_process_exit_after_capture_does_not_publish(self):
        original = controller.guard.PinnedSource.verify
        calls = []

        def stop_before_publish(pinned):
            calls.append(1)
            if len(calls) == 2:
                self.stop_child()
            return original(pinned)

        with mock.patch.object(controller.guard.PinnedSource, "verify", stop_before_publish):
            with self.assertRaisesRegex(ValueError, "exited"):
                self.capture()
        self.assertEqual(list(self.destination.iterdir()), [])

    def test_path_replacement_after_capture_does_not_publish(self):
        original = controller.guard.PinnedSource.verify
        calls = []

        def replace_before_publish(pinned):
            calls.append(1)
            if len(calls) == 2:
                self.source.rename(self.base / "old-source")
                outside = self.base / "outside"
                outside.mkdir(mode=0o700)
                self.source.symlink_to(outside, target_is_directory=True)
            return original(pinned)

        with mock.patch.object(controller.guard.PinnedSource, "verify", replace_before_publish):
            with self.assertRaises((OSError, ValueError)):
                self.capture()
        self.assertEqual(list(self.destination.iterdir()), [])

    def test_existing_destination_is_not_overwritten(self):
        existing = self.destination / "workspace.age"
        existing.write_bytes(b"existing")
        with self.assertRaises(FileExistsError):
            self.capture()
        self.assertEqual(existing.read_bytes(), b"existing")
        self.assertEqual([path.name for path in self.destination.iterdir()], ["workspace.age"])

    def test_external_pre_publish_rejection_removes_candidate(self):
        def reject():
            raise ValueError("synthetic external guard rejected")

        with self.assertRaisesRegex(ValueError, "external guard"):
            controller.capture(self.child.pid, str(self.source), os.geteuid(), self.cgroup,
                               self.output_fd, AGE, self.recipient, 65536, 15,
                               pre_publish=reject)
        self.assertEqual(list(self.destination.iterdir()), [])

    def test_invalid_candidate_permissions_are_cleaned(self):
        original = controller.stream.capture_workspace

        def change_mode(output_fd, name, *args, **kwargs):
            size = original(output_fd, name, *args, **kwargs)
            os.chmod(name, 0o644, dir_fd=output_fd, follow_symlinks=False)
            return size

        with mock.patch.object(controller.stream, "capture_workspace", side_effect=change_mode):
            with self.assertRaisesRegex(ValueError, "invalid candidate"):
                self.capture()
        self.assertEqual(list(self.destination.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
