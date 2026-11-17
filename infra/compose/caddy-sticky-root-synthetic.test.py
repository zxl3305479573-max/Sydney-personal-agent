#!/usr/bin/env python3
import hashlib
import importlib.util
import os
from pathlib import Path
import pwd
import tempfile
import unittest


spec = importlib.util.spec_from_file_location(
    "caddy_backup", Path(__file__).with_name("backup-caddy-volumes-encrypted.py")
)
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


@unittest.skipUnless(os.geteuid() == 0, "root-owned synthetic fixtures required")
class StickyRootTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(dir="/dev/shm")
        self.root = Path(self.temporary.name) / "root"
        self.root.mkdir(mode=0o700)
        (self.root / "owned").write_bytes(b"synthetic")
        (self.root / "owned").chmod(0o600)
        self.root.chmod(0o1777)
        self.root_fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        self.entries = {("data", "owned"): {
            "root": "data", "path": "owned", "type": "file",
            "uid": 0, "gid": 0, "mode": 0o600,
            "sha256": hashlib.sha256(b"synthetic").hexdigest(),
        }}
        self.objects = None

    def tearDown(self):
        if self.objects:
            for fd, _, _ in self.objects.values():
                os.close(fd)
        os.close(self.root_fd)
        self.root.chmod(0o700)
        self.temporary.cleanup()

    def collect(self):
        self.objects, children = backup.collect(
            {"data": self.root_fd}, self.entries, 1000, sticky_root=True,
        )
        return children

    def test_default_rejects_writable_root_and_explicit_policy_accepts_fixture(self):
        with self.assertRaises(ValueError):
            backup.collect({"data": self.root_fd}, self.entries, 1000)
        children = self.collect()
        backup.verify(self.objects, children, sticky_root=True)

    def test_nonroot_injection_is_detected_and_root_file_cannot_be_removed(self):
        children = self.collect()
        nobody = pwd.getpwnam("nobody")
        child = os.fork()
        if child == 0:
            try:
                os.setgroups([])
                os.setgid(nobody.pw_gid)
                os.setuid(nobody.pw_uid)
                try:
                    os.unlink("owned", dir_fd=self.root_fd)
                    os._exit(2)
                except PermissionError:
                    pass
                fd = os.open("foreign", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600,
                             dir_fd=self.root_fd)
                os.close(fd)
                os._exit(0)
            except BaseException:
                os._exit(3)
        _, status = os.waitpid(child, 0)
        self.assertEqual(os.waitstatus_to_exitcode(status), 0)
        with self.assertRaises(ValueError):
            backup.verify(self.objects, children, sticky_root=True)

    def test_writable_descendant_remains_forbidden(self):
        (self.root / "owned").chmod(0o666)
        self.entries[("data", "owned")]["mode"] = 0o666
        with self.assertRaises(ValueError):
            self.collect()


if __name__ == "__main__":
    unittest.main()
