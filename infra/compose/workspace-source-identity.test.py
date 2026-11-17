#!/usr/bin/env python3
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


spec = importlib.util.spec_from_file_location(
    "workspace_source_identity", Path(__file__).with_name("workspace-source-identity.py"))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class SourceIdentityTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir="/dev/shm")
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / "source"
        self.source.mkdir(mode=0o700)
        self.child = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(60)"],
            env={"SYDNEY_WORKSPACE_ROOT": str(self.source), "PATH": "/usr/bin:/bin"},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        self.addCleanup(self.stop_child)
        with open("/proc/self/cgroup", encoding="ascii") as source:
            groups = [line.strip()[3:] for line in source if line.startswith("0::")]
        self.assertEqual(len(groups), 1)
        self.cgroup = groups[0]

    def stop_child(self):
        if self.child.poll() is None:
            self.child.terminate()
            self.child.wait(timeout=5)

    def pin(self, owner=None, cgroup=None):
        return guard.PinnedSource(self.child.pid, str(self.source),
                                  os.geteuid() if owner is None else owner,
                                  self.cgroup if cgroup is None else cgroup)

    def test_valid_source_and_wrong_identity(self):
        pinned = self.pin()
        try:
            pinned.verify()
            self.assertEqual(os.fstat(pinned.root_fd).st_ino, self.source.stat().st_ino)
        finally:
            pinned.close()
        with self.assertRaises(ValueError):
            self.pin(owner=os.geteuid() + 1)
        with self.assertRaises(ValueError):
            self.pin(cgroup="/incorrect-synthetic-cgroup")

    def test_replaced_path_is_rejected(self):
        pinned = self.pin()
        try:
            self.source.rename(self.source.with_name("old-source"))
            outside = Path(self.temp.name) / "outside"
            outside.mkdir(mode=0o700)
            self.source.symlink_to(outside, target_is_directory=True)
            with self.assertRaises((OSError, ValueError)):
                pinned.verify()
            self.assertNotEqual(os.fstat(pinned.root_fd).st_ino, outside.stat().st_ino)
        finally:
            pinned.close()

    def test_process_exit_is_rejected(self):
        pinned = self.pin()
        try:
            self.stop_child()
            with self.assertRaisesRegex(ValueError, "exited"):
                pinned.verify()
        finally:
            pinned.close()

    def test_wrong_environment_and_symlink_components_are_rejected(self):
        wrong = self.source.with_name("wrong")
        wrong.mkdir(mode=0o700)
        with self.assertRaises(ValueError):
            guard.PinnedSource(self.child.pid, str(wrong), os.geteuid(), self.cgroup)
        alias = self.source.with_name("alias")
        alias.symlink_to(self.source, target_is_directory=True)
        with self.assertRaises(OSError):
            guard.PinnedSource(self.child.pid, str(alias), os.geteuid(), self.cgroup)

    def test_mountinfo_rejects_nested_escaped_path(self):
        valid = b"1 2 0:3 / / rw - tmpfs tmpfs rw\n"
        guard.reject_nested_mounts(valid, "/tmp/synthetic")
        nested = valid + b"2 1 0:3 / /tmp/synthetic/sub\\040dir rw - tmpfs tmpfs rw\n"
        with self.assertRaisesRegex(ValueError, "nested"):
            guard.reject_nested_mounts(nested, "/tmp/synthetic")
        with self.assertRaises(ValueError):
            guard.reject_nested_mounts(b"", "/tmp/synthetic")

    @unittest.skipUnless(os.geteuid() == 0, "requires root")
    def test_real_nested_bind_mount_is_rejected(self):
        if os.readlink("/proc/self/ns/mnt") == os.readlink("/proc/1/ns/mnt"):
            self.skipTest("requires private mount namespace")
        outside = Path(self.temp.name) / "outside"
        outside.mkdir(mode=0o700)
        nested = self.source / "nested"
        nested.mkdir(mode=0o700)
        subprocess.run(["/usr/bin/mount", "--bind", str(outside), str(nested)],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            with self.assertRaisesRegex(ValueError, "nested"):
                self.pin()
        finally:
            target = subprocess.run(
                ["/usr/bin/findmnt", "-n", "-o", "TARGET", "--target", str(nested)],
                check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            ).stdout.decode().strip()
            if target != str(nested):
                raise RuntimeError("synthetic mount identity changed")
            subprocess.run(["/usr/bin/umount", str(nested)], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


if __name__ == "__main__":
    unittest.main()
