#!/usr/bin/env python3
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


spec = importlib.util.spec_from_file_location(
    "globals_encrypted_stream", Path(__file__).with_name("globals-encrypted-stream.py")
)
stream = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stream)

AGE = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age"
KEYGEN = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age-keygen"


class EncryptedStreamTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir="/dev/shm")
        self.root = Path(self.temp.name)
        self.fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        identity = subprocess.run([KEYGEN], check=True, capture_output=True).stdout
        self.identity = self.root / "synthetic-identity"
        self.identity.write_bytes(identity)
        self.identity.chmod(0o600)
        recipient = subprocess.run([KEYGEN, "-y"], input=identity, check=True,
                                   capture_output=True).stdout.decode().strip()
        self.encryptor = [AGE, "-r", recipient]
        self.producer = [sys.executable, "-c",
                         "import sys; sys.stdout.buffer.write(b'synthetic globals')"]

    def tearDown(self):
        os.close(self.fd)
        self.temp.cleanup()

    def test_real_age_round_trip_and_exclusive_output(self):
        size = stream.capture(self.fd, "capture.age", self.producer, self.encryptor, 65536, 10)
        path = self.root / "capture.age"
        self.assertEqual(size, path.stat().st_size)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        decrypted = subprocess.run([AGE, "-d", "-i", str(self.identity)],
                                   input=path.read_bytes(), capture_output=True, check=True).stdout
        self.assertEqual(decrypted, b"synthetic globals")
        before = path.read_bytes()
        with self.assertRaises(FileExistsError):
            stream.capture(self.fd, "capture.age", self.producer, self.encryptor, 65536, 10)
        self.assertEqual(path.read_bytes(), before)

    def test_producer_or_encryptor_failure_removes_output(self):
        for producer, encryptor in (
            ([sys.executable, "-c", "import sys; sys.exit(7)"], self.encryptor),
            (self.producer, [sys.executable, "-c", "import sys; sys.exit(8)"]),
        ):
            with self.assertRaises(RuntimeError):
                stream.capture(self.fd, "failed.age", producer, encryptor, 65536, 10)
            self.assertFalse((self.root / "failed.age").exists())
            self.assertEqual(list(self.root.glob(".capture-*.partial")), [])

    def test_pre_publish_failure_removes_candidate(self):
        def reject():
            raise ValueError("synthetic source changed")

        with self.assertRaises(ValueError):
            stream.capture(self.fd, "rejected.age", self.producer, self.encryptor,
                           65536, 10, pre_publish=reject)
        self.assertFalse((self.root / "rejected.age").exists())
        self.assertEqual(list(self.root.glob(".capture-*.partial")), [])

    def test_competing_publish_does_not_overwrite_or_remove_other_file(self):
        original_link = os.link

        def competing_link(*args, **kwargs):
            (self.root / "capture.age").write_bytes(b"existing synthetic file")
            return original_link(*args, **kwargs)

        with mock.patch.object(stream.os, "link", side_effect=competing_link):
            with self.assertRaises(FileExistsError):
                stream.capture(self.fd, "capture.age", self.producer, self.encryptor, 65536, 10)
        self.assertEqual((self.root / "capture.age").read_bytes(), b"existing synthetic file")
        self.assertEqual(list(self.root.glob(".capture-*.partial")), [])

    def test_timeout_and_size_limit_remove_output(self):
        producer = [sys.executable, "-c", "import time; time.sleep(30)"]
        with self.assertRaises((TimeoutError, subprocess.TimeoutExpired)):
            stream.capture(self.fd, "timeout.age", producer, self.encryptor, 65536, 0.2)
        self.assertFalse((self.root / "timeout.age").exists())
        producer = [sys.executable, "-c", "import os; os.write(1, os.urandom(200000))"]
        with self.assertRaises(RuntimeError):
            stream.capture(self.fd, "limit.age", producer, self.encryptor, 4096, 10)
        self.assertFalse((self.root / "limit.age").exists())

    def test_unsafe_destination_rejected(self):
        with self.assertRaises(ValueError):
            stream.capture(self.fd, "../escape", self.producer, self.encryptor, 65536, 10)
        with self.assertRaises(ValueError):
            stream.capture(self.fd, "unsafe.age", self.producer, self.encryptor, 65536, 10,
                           producer_fds=(1,))
        self.root.chmod(0o755)
        try:
            with self.assertRaises(ValueError):
                stream.capture(self.fd, "unsafe.age", self.producer, self.encryptor, 65536, 10)
        finally:
            self.root.chmod(0o700)
        self.assertFalse((self.root / "unsafe.age").exists())

    def test_workspace_policy_supports_larger_stream_without_loosening_globals(self):
        producer = [sys.executable, "-c",
                    "import sys; block=b's'*65536; "
                    "[sys.stdout.buffer.write(block) for _ in range(1040)]"]
        limit = 70 * 1024 * 1024
        with self.assertRaises(ValueError):
            stream.capture(self.fd, "global-too-large.age", producer, self.encryptor, limit, 10)
        size = stream.capture_workspace(self.fd, "workspace.age", producer, self.encryptor,
                                        limit, 60)
        self.assertGreater(size, 64 * 1024 * 1024)
        result = subprocess.run(
            [AGE, "-d", "-i", str(self.identity), str(self.root / "workspace.age")],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60,
        )
        self.assertEqual(result.returncode, 0)
        with self.assertRaises(ValueError):
            stream.capture_workspace(self.fd, "oversized.age", producer, self.encryptor,
                                     768 * 1024 * 1024 + 1, 10)
        self.assertFalse((self.root / "oversized.age").exists())


if __name__ == "__main__":
    unittest.main()
