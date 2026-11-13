#!/usr/bin/env python3
import importlib.util
import io
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import unittest
from unittest import mock


DIRECTORY = Path(__file__).parent
AGE = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age"
KEYGEN = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age-keygen"
spec = importlib.util.spec_from_file_location(
    "workspace_systemd_supervisor", DIRECTORY / "workspace-systemd-supervisor.py")
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)
verify_spec = importlib.util.spec_from_file_location(
    "workspace_archive_verify", DIRECTORY / "workspace-archive-verify.py")
verify = importlib.util.module_from_spec(verify_spec)
verify_spec.loader.exec_module(verify)


def command(args):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, timeout=30).stdout.decode().strip()


@unittest.skipUnless(os.geteuid() == 0 and Path(AGE).is_file(), "root and real age required")
class SupervisorTest(unittest.TestCase):
    def setUp(self):
        if os.readlink("/proc/self/ns/mnt") == os.readlink("/proc/1/ns/mnt"):
            self.skipTest("requires private mount namespace")
        self.temp = tempfile.TemporaryDirectory(
            prefix="sydney-workspace-supervisor-", dir="/var/backups/sydney-ip-migration")
        self.addCleanup(self.cleanup_resources)
        self.base = Path(self.temp.name)
        self.source = self.base / "source"
        self.source.mkdir(mode=0o700)
        (self.source / "project").write_bytes(b"synthetic supervised")
        self.stage = self.base / "stage"
        self.stage.mkdir(mode=0o700)
        self.backing = self.base / "stage.ext4"
        fd = os.open(self.backing, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            os.posix_fallocate(fd, 0, 128 * 1024 * 1024)
        finally:
            os.close(fd)
        command(["/usr/sbin/mkfs.ext4", "-F", "-m", "0", str(self.backing)])
        command(["/usr/bin/mount", "-o", "loop,nodev,nosuid,noexec",
                 str(self.backing), str(self.stage)])
        self.mounted = True
        self.stage.chmod(0o700)
        self.unit = "sydney-workspace-test-" + secrets.token_hex(12) + ".service"
        command(["/usr/bin/systemd-run", "--unit=" + self.unit,
                 "--setenv=SYDNEY_WORKSPACE_ROOT=" + str(self.source),
                 "--property=User=root", "--property=RuntimeMaxSec=45s",
                 "/usr/bin/sleep", "40"])
        identity = subprocess.run([KEYGEN], check=True, capture_output=True).stdout
        self.key = self.base / "identity"
        self.key.write_bytes(identity)
        self.key.chmod(0o600)
        self.recipient = subprocess.run([KEYGEN, "-y"], input=identity, check=True,
                                        capture_output=True).stdout.decode().strip()

    def cleanup_resources(self):
        if hasattr(self, "unit"):
            subprocess.run(["/usr/bin/systemctl", "stop", self.unit],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        if getattr(self, "mounted", False):
            target = command(["/usr/bin/findmnt", "-n", "-o", "TARGET", "--target", str(self.stage)])
            device = command(["/usr/bin/findmnt", "-n", "-o", "SOURCE", "--target", str(self.stage)])
            backing = command(["/usr/sbin/losetup", "-n", "-O", "BACK-FILE", device])
            if target != str(self.stage) or os.path.realpath(backing) != str(self.backing):
                raise RuntimeError("synthetic mount identity changed")
            command(["/usr/bin/umount", str(self.stage)])
            self.mounted = False
        self.temp.cleanup()

    def capture(self, backing=None):
        return supervisor.capture(self.unit, str(self.source), str(self.stage),
                                  str(self.backing if backing is None else backing),
                                  AGE, self.recipient, 1024 * 1024, 15, 16 * 1024 * 1024)

    def test_systemd_source_and_ext4_stage_round_trip(self):
        self.capture()
        encrypted = (self.stage / "workspace.age").read_bytes()
        plaintext = subprocess.run([AGE, "-d", "-i", str(self.key)], input=encrypted,
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   check=True).stdout
        self.assertEqual(verify.verify(io.BytesIO(plaintext), 0)[:2], (2, 20))

    def test_service_stop_before_publish_rejects(self):
        original = supervisor.controller.guard.PinnedSource.verify
        calls = []

        def stop_after_check(pinned):
            result = original(pinned)
            calls.append(1)
            if len(calls) == 2:
                command(["/usr/bin/systemctl", "stop", self.unit])
            return result

        with mock.patch.object(supervisor.controller.guard.PinnedSource, "verify", stop_after_check):
            with self.assertRaises(ValueError):
                self.capture()
        self.assertFalse((self.stage / "workspace.age").exists())
        self.assertEqual(list(self.stage.glob(".workspace-*.age")), [])

    def test_wrong_backing_is_rejected(self):
        wrong = self.base / "wrong.ext4"
        wrong.write_bytes(b"synthetic")
        wrong.chmod(0o600)
        with self.assertRaisesRegex(ValueError, "backing"):
            self.capture(wrong)
        self.assertFalse((self.stage / "workspace.age").exists())

    def test_unmounted_stage_is_rejected(self):
        command(["/usr/bin/umount", str(self.stage)])
        self.mounted = False
        with self.assertRaises(ValueError):
            self.capture()
        self.assertFalse((self.stage / "workspace.age").exists())

    def test_stage_detached_before_publish_is_rejected(self):
        original = supervisor.controller.guard.PinnedSource.verify
        calls = []

        def detach_after_check(pinned):
            result = original(pinned)
            calls.append(1)
            if len(calls) == 2:
                command(["/usr/bin/umount", "-l", str(self.stage)])
                self.mounted = False
            return result

        with mock.patch.object(supervisor.controller.guard.PinnedSource, "verify", detach_after_check):
            with self.assertRaises(ValueError):
                self.capture()
        self.assertFalse((self.stage / "workspace.age").exists())


if __name__ == "__main__":
    unittest.main()
