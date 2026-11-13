#!/usr/bin/env python3
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest import mock


DIRECTORY = Path(__file__).parent
AGE_DIRECTORY = Path("/root/sydney-sidecar-age-20261111/unpacked/usr/bin")
spec = importlib.util.spec_from_file_location("webassets_batch", DIRECTORY / "webassets-batch.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
verify_spec = importlib.util.spec_from_file_location(
    "webassets_batch_verify", DIRECTORY / "webassets-batch-verify.py")
verifier = importlib.util.module_from_spec(verify_spec)
verify_spec.loader.exec_module(verifier)
restore_spec = importlib.util.spec_from_file_location(
    "webassets_batch_restore", DIRECTORY / "webassets-batch-restore.py")
restorer = importlib.util.module_from_spec(restore_spec)
restore_spec.loader.exec_module(restorer)


@unittest.skipUnless(os.geteuid() == 0 and (AGE_DIRECTORY / "age").is_file(),
                     "requires root and synthetic age tooling")
class BatchTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="sydney-webassets-test-", dir="/root")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source = self.base / "source"
        self.destination = self.base / "destination"
        self.source.mkdir(mode=0o700)
        self.destination.mkdir(mode=0o700)
        (self.source / "nested").mkdir(mode=0o700)
        (self.source / "one").write_bytes(b"synthetic-one")
        (self.source / "nested" / "two").write_bytes(b"synthetic-two")
        (self.source / "nested" / "three").write_bytes(b"synthetic-three")
        identity = subprocess.run([str(AGE_DIRECTORY / "age-keygen")], check=True,
                                  capture_output=True).stdout
        self.identity = self.base / "identity"
        self.identity.write_bytes(identity)
        self.identity.chmod(0o600)
        self.recipient = subprocess.run([str(AGE_DIRECTORY / "age-keygen"), "-y"],
                                        input=identity, check=True,
                                        capture_output=True).stdout.decode().strip()

    def decrypt(self, path):
        return subprocess.run([str(AGE_DIRECTORY / "age"), "-d", "-i", str(self.identity)],
                              input=path.read_bytes(), check=True,
                              capture_output=True).stdout

    def capture(self, owner=None):
        return module.capture(str(self.source), str(self.destination),
                              os.geteuid() if owner is None else owner,
                              self.recipient, str(DIRECTORY / "backup-config-encrypted.sh"),
                              str(AGE_DIRECTORY))

    def verify(self):
        fd = os.open(self.destination, os.O_RDONLY | os.O_DIRECTORY)
        try:
            return verifier.verify(fd, str(AGE_DIRECTORY / "age"), str(self.identity))
        finally:
            os.close(fd)

    def restore(self, target):
        backup_fd = os.open(self.destination, os.O_RDONLY | os.O_DIRECTORY)
        target_fd = os.open(target, os.O_RDONLY | os.O_DIRECTORY)
        try:
            return restorer.restore(backup_fd, target_fd, str(AGE_DIRECTORY / "age"),
                                    str(self.identity))
        finally:
            os.close(target_fd)
            os.close(backup_fd)

    def test_encrypts_all_batches_and_manifest(self):
        with mock.patch.object(module, "MAX_BATCH_FILES", 2):
            groups, files, size = self.capture()
        self.assertEqual((groups, files, size), (2, 3, 41))
        manifest = json.loads(self.decrypt(self.destination / "manifest.age"))
        recovered = {}
        for index in range(groups):
            plaintext = self.decrypt(self.destination / f"part-{index:04d}.age")
            with tarfile.open(fileobj=io.BytesIO(plaintext), mode="r:") as archive:
                for member in archive:
                    recovered["/" + member.name] = hashlib.sha256(
                        archive.extractfile(member).read()).hexdigest()
        expected = {
            str(self.source / path[2:]): entry[2]
            for path, entry in manifest["entries"].items() if entry[0] == "file"
        }
        self.assertEqual(recovered, expected)
        self.assertEqual(len(manifest["groups"]), 2)
        self.assertEqual(self.verify(), (2, 3, 41))
        restored = self.base / "restored"
        restored.mkdir(mode=0o700)
        self.assertEqual(self.restore(restored), (2, 3, 41))
        source_fd = os.open(self.source, os.O_RDONLY | os.O_DIRECTORY)
        restored_fd = os.open(restored, os.O_RDONLY | os.O_DIRECTORY)
        try:
            source_records, source_size = module.scan(source_fd, os.geteuid())
            restored_records, restored_size = module.scan(restored_fd, os.geteuid())
        finally:
            os.close(restored_fd)
            os.close(source_fd)
        self.assertEqual(source_size, restored_size)
        self.assertEqual(set(source_records), set(restored_records))
        for path, entry in source_records.items():
            recovered = restored_records[path]
            self.assertEqual(entry[0], recovered[0])
            for index in (2, 3, 4, 7):
                self.assertEqual(entry[1][index], recovered[1][index])
            if entry[0] == "file":
                self.assertEqual((entry[1][6], entry[2]), (recovered[1][6], recovered[2]))

    def test_verifier_rejects_missing_swapped_and_corrupted_batches(self):
        with mock.patch.object(module, "MAX_BATCH_FILES", 2):
            self.capture()
        first = self.destination / "part-0000.age"
        second = self.destination / "part-0001.age"
        original_first = first.read_bytes()
        original_second = second.read_bytes()
        second.unlink()
        with self.assertRaises(ValueError):
            self.verify()
        second.write_bytes(original_first)
        second.chmod(0o600)
        with self.assertRaises(ValueError):
            self.verify()
        second.write_bytes(original_second)
        damaged = bytearray(original_first)
        damaged[-1] ^= 1
        first.write_bytes(damaged)
        with self.assertRaises(ValueError):
            self.verify()
        restored = self.base / "restored"
        restored.mkdir(mode=0o700)
        with self.assertRaises(ValueError):
            self.restore(restored)
        self.assertEqual(list(restored.iterdir()), [])

    def test_changed_source_does_not_publish_manifest(self):
        original = module.load_config_capture

        def modified_capture(path):
            capture_files = original(path)

            def changing(args):
                capture_files(args)
                (self.source / "one").write_bytes(b"changed-after-capture")

            return changing

        with mock.patch.object(module, "load_config_capture", side_effect=modified_capture):
            with self.assertRaisesRegex(ValueError, "source changed"):
                self.capture()
        self.assertFalse((self.destination / "manifest.age").exists())

    def test_restores_nonroot_numeric_owner(self):
        for path in (self.source, self.source / "nested", self.source / "one",
                     self.source / "nested" / "two", self.source / "nested" / "three"):
            os.chown(path, 65534, 65534)
        self.capture(owner=65534)
        restored = self.base / "restored"
        restored.mkdir(mode=0o700)
        self.assertEqual(self.restore(restored)[1:], (3, 41))
        for path in (restored, restored / "nested", restored / "one",
                     restored / "nested" / "two", restored / "nested" / "three"):
            info = path.stat()
            self.assertEqual((info.st_uid, info.st_gid), (65534, 65534))
        self.assertEqual((restored / "nested" / "three").read_bytes(), b"synthetic-three")

    def test_rejects_symlink_without_publishing(self):
        (self.source / "link").symlink_to("/outside")
        with self.assertRaises(ValueError):
            self.capture()
        self.assertEqual(list(self.destination.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
