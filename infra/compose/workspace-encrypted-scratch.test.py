#!/usr/bin/env python3
import os
import importlib.util
import io
from pathlib import Path
import re
import secrets
import stat
import subprocess
import tempfile
import unittest


BASE = "/var/backups/sydney-ip-migration"
DIRECTORY = Path(__file__).parent
AGE = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age"
KEYGEN = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age-keygen"


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, DIRECTORY / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def command(args, *, pass_fds=()):
    return subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          check=True, timeout=30, pass_fds=pass_fds).stdout.decode().strip()


class EncryptedScratchTest(unittest.TestCase):
    def test_synthetic_encrypted_loop_reopen_and_cleanup(self):
        self.assertEqual(os.geteuid(), 0)
        self.assertNotEqual(os.readlink("/proc/self/ns/mnt"), os.readlink("/proc/1/ns/mnt"))
        base = os.stat(BASE, follow_symlinks=False)
        self.assertEqual((base.st_uid, stat.S_IMODE(base.st_mode)), (0, 0o700))
        directory = tempfile.mkdtemp(prefix="sydney-scratch-test-", dir=BASE)
        image = os.path.join(directory, "scratch.img")
        mountpoint = os.path.join(directory, "mount")
        os.mkdir(mountpoint, 0o700)
        nonce = secrets.token_hex(12)
        mapping = "sydney-scratch-test-" + nonce
        device = "/dev/mapper/" + mapping
        loop = None
        device_number = None
        mounted = False
        image_identity = None
        key_fd = os.memfd_create("synthetic-scratch-key", os.MFD_CLOEXEC)
        try:
            os.write(key_fd, secrets.token_bytes(64))
            fd = os.open(image, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            try:
                os.posix_fallocate(fd, 0, 64 * 1024 * 1024)
                os.fsync(fd)
                image_info = os.fstat(fd)
                image_identity = (image_info.st_dev, image_info.st_ino)
            finally:
                os.close(fd)
            loop = command(["/usr/sbin/losetup", "--find", "--show", image])
            self.assertRegex(loop, r"^/dev/loop[0-9]+$")
            self.assertEqual(os.path.realpath(command(
                ["/usr/sbin/losetup", "-n", "-O", "BACK-FILE", loop])), image)

            def open_mapping():
                os.lseek(key_fd, 0, os.SEEK_SET)
                command(["/usr/sbin/cryptsetup", "open", "--type", "plain",
                         "--cipher", "aes-xts-plain64", "--key-size", "512",
                         "--key-file", f"/proc/self/fd/{key_fd}", "--keyfile-size", "64",
                         loop, mapping], pass_fds=(key_fd,))
                info = os.stat(device)
                self.assertTrue(stat.S_ISBLK(info.st_mode))
                return info.st_rdev

            def mount():
                nonlocal mounted
                command(["/usr/bin/mount", "-o", "nodev,nosuid,noexec", device, mountpoint])
                mounted = True
                actual = command(["/usr/bin/findmnt", "-n", "-o", "MAJ:MIN",
                                  "--target", mountpoint])
                self.assertEqual(actual, f"{os.major(device_number)}:{os.minor(device_number)}")

            device_number = open_mapping()
            command(["/usr/sbin/mkfs.ext4", "-F", "-m", "0", device])
            mount()
            marker = b"synthetic-encrypted-scratch-" + secrets.token_hex(32).encode()
            path = os.path.join(mountpoint, "data")
            with open(path, "wb") as target:
                target.write(marker)
                target.flush()
                os.fsync(target.fileno())
            restorer = load("workspace_scratch_restore", "workspace-encrypted-scratch-restore.py")
            source = Path(mountpoint) / "source"
            source.mkdir(mode=0o700)
            (source / "file").write_bytes(marker)
            (source / "outside").symlink_to("/synthetic-outside")
            scratch = Path(mountpoint) / "private"
            scratch.mkdir(mode=0o700)
            restored = scratch / "restored"
            restored.mkdir(mode=0o700)
            identity = subprocess.run([KEYGEN], check=True, capture_output=True).stdout
            recipient = subprocess.run([KEYGEN, "-y"], input=identity, check=True,
                                       capture_output=True).stdout.decode().strip()
            key = scratch / "identity"
            key.write_bytes(identity)
            key.chmod(0o600)
            source_fd = os.open(source, os.O_RDONLY | os.O_DIRECTORY)
            try:
                archive = io.BytesIO()
                restorer.archiver.archive(source_fd, archive, os.geteuid())
            finally:
                os.close(source_fd)
            encrypted = subprocess.run([AGE, "-r", recipient], input=archive.getvalue(),
                                       check=True, capture_output=True).stdout
            ciphertext = scratch / "cipher.age"
            ciphertext.write_bytes(encrypted)
            ciphertext.chmod(0o600)
            scratch_fd = os.open(scratch, os.O_RDONLY | os.O_DIRECTORY)
            target_fd = os.open(restored, os.O_RDONLY | os.O_DIRECTORY)
            cipher_fd = os.open(ciphertext, os.O_RDONLY)
            try:
                result = restorer.restore(cipher_fd, scratch_fd, target_fd, AGE, str(key),
                                          os.geteuid(), limit=1024 * 1024, timeout=20)
                self.assertEqual(result[:2], (3, len(marker)))
                self.assertEqual((restored / "file").read_bytes(), marker)
                self.assertEqual(os.readlink(restored / "outside"), "/synthetic-outside")
            finally:
                os.close(cipher_fd)
                os.close(target_fd)
            invalid_target = scratch / "invalid"
            invalid_target.mkdir(mode=0o700)
            corrupted = bytearray(encrypted)
            corrupted[-1] ^= 1
            ciphertext.write_bytes(corrupted)
            cipher_fd = os.open(ciphertext, os.O_RDONLY)
            target_fd = os.open(invalid_target, os.O_RDONLY | os.O_DIRECTORY)
            try:
                with self.assertRaisesRegex(ValueError, "authentication or decryption"):
                    restorer.restore(cipher_fd, scratch_fd, target_fd, AGE, str(key),
                                     os.geteuid(), limit=1024 * 1024, timeout=20)
                self.assertEqual(os.listdir(target_fd), [])
            finally:
                os.close(cipher_fd)
                os.close(target_fd)
            source_owner = 65534
            os.chown(source / "file", source_owner, source_owner)
            os.chown(source / "outside", source_owner, source_owner, follow_symlinks=False)
            os.chown(source, source_owner, source_owner)
            source_fd = os.open(source, os.O_RDONLY | os.O_DIRECTORY)
            try:
                archive = io.BytesIO()
                restorer.archiver.archive(source_fd, archive, source_owner)
            finally:
                os.close(source_fd)
            encrypted_nonroot = subprocess.run([AGE, "-r", recipient], input=archive.getvalue(),
                                               check=True, capture_output=True).stdout
            ciphertext.write_bytes(encrypted_nonroot)
            nonroot_target = scratch / "nonroot"
            nonroot_target.mkdir(mode=0o700)
            cipher_fd = os.open(ciphertext, os.O_RDONLY)
            target_fd = os.open(nonroot_target, os.O_RDONLY | os.O_DIRECTORY)
            try:
                result = restorer.restore(cipher_fd, scratch_fd, target_fd, AGE, str(key),
                                          source_owner, limit=1024 * 1024, timeout=20)
                self.assertEqual(result[:2], (3, len(marker)))
                for item in (nonroot_target, nonroot_target / "file", nonroot_target / "outside"):
                    info = item.lstat()
                    self.assertEqual((info.st_uid, info.st_gid), (source_owner, source_owner))
                self.assertEqual((nonroot_target / "file").read_bytes(), marker)
                self.assertEqual(os.readlink(nonroot_target / "outside"), "/synthetic-outside")
            finally:
                os.close(cipher_fd)
                os.close(target_fd)
                os.close(scratch_fd)
            command(["/usr/bin/umount", mountpoint])
            mounted = False
            self.assertEqual(os.stat(device).st_rdev, device_number)
            command(["/usr/sbin/cryptsetup", "close", mapping])
            device_number = None
            with open(image, "rb") as raw:
                contents = raw.read()
            self.assertNotIn(marker, contents)
            del contents
            device_number = open_mapping()
            mount()
            with open(path, "rb") as source:
                self.assertEqual(source.read(), marker)
        finally:
            os.close(key_fd)
            if mounted:
                current = command(["/usr/bin/findmnt", "-n", "-o", "MAJ:MIN",
                                   "--target", mountpoint])
                if device_number is None or current != f"{os.major(device_number)}:{os.minor(device_number)}":
                    raise RuntimeError("unexpected mount identity; manual inspection required")
                command(["/usr/bin/umount", mountpoint])
            if device_number is not None:
                if os.stat(device).st_rdev != device_number:
                    raise RuntimeError("unexpected mapping identity; manual inspection required")
                command(["/usr/sbin/cryptsetup", "close", mapping])
            if loop is not None:
                if not re.fullmatch(r"/dev/loop[0-9]+", loop) or os.path.realpath(command(
                        ["/usr/sbin/losetup", "-n", "-O", "BACK-FILE", loop])) != image:
                    raise RuntimeError("unexpected loop identity; manual inspection required")
                command(["/usr/sbin/losetup", "-d", loop])
            if image_identity is not None:
                info = os.stat(image, follow_symlinks=False)
                if (info.st_dev, info.st_ino) != image_identity:
                    raise RuntimeError("unexpected image identity; manual inspection required")
                os.unlink(image)
            os.rmdir(mountpoint)
            os.rmdir(directory)


if __name__ == "__main__":
    unittest.main()
