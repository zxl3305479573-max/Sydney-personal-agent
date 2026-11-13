#!/usr/bin/env python3
import importlib.util
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock


BASE = "/var/backups/sydney-ip-migration"
DIRECTORY = Path(__file__).parent
AGE = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age"
KEYGEN = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age-keygen"
FILE_BYTES = 456609793
IMAGE_BYTES = 1536 * 1024 * 1024
OWNER = 65534


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, DIRECTORY / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def command(args, *, pass_fds=()):
    return subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          check=True, timeout=60, pass_fds=pass_fds).stdout.decode().strip()


class LargeRestoreTest(unittest.TestCase):
    def test_synthetic_production_scale_encrypted_restore(self):
        self.assertEqual(os.geteuid(), 0)
        self.assertNotEqual(os.readlink("/proc/self/ns/mnt"), os.readlink("/proc/1/ns/mnt"))
        info = os.stat(BASE, follow_symlinks=False)
        self.assertEqual((info.st_uid, stat.S_IMODE(info.st_mode)), (0, 0o700))
        space = os.statvfs(BASE)
        self.assertGreater(space.f_bavail * space.f_frsize, 4 * 1024**3)
        directory = tempfile.mkdtemp(prefix="sydney-workspace-large-", dir=BASE)
        root = Path(directory)
        image = root / "scratch.img"
        mountpoint = root / "mount"
        source = root / "source"
        output = root / "cipher"
        mountpoint.mkdir(mode=0o700)
        source.mkdir(mode=0o700)
        output.mkdir(mode=0o700)
        loop = None
        device_number = None
        image_identity = None
        mounted = False
        mapping = "sydney-workspace-large-" + secrets.token_hex(12)
        device = "/dev/mapper/" + mapping
        key_fd = os.memfd_create("synthetic-large-scratch-key", os.MFD_CLOEXEC)
        started = time.monotonic()
        try:
            os.write(key_fd, secrets.token_bytes(64))
            fd = os.open(image, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            try:
                os.posix_fallocate(fd, 0, IMAGE_BYTES)
                os.fsync(fd)
                image_info = os.fstat(fd)
                image_identity = image_info.st_dev, image_info.st_ino
            finally:
                os.close(fd)
            loop = command(["/usr/sbin/losetup", "--find", "--show", str(image)])
            self.assertRegex(loop, r"^/dev/loop[0-9]+$")
            self.assertEqual(os.path.realpath(command(
                ["/usr/sbin/losetup", "-n", "-O", "BACK-FILE", loop])), str(image))
            os.lseek(key_fd, 0, os.SEEK_SET)
            command(["/usr/sbin/cryptsetup", "open", "--type", "plain",
                     "--cipher", "aes-xts-plain64", "--key-size", "512",
                     "--key-file", f"/proc/self/fd/{key_fd}", "--keyfile-size", "64",
                     loop, mapping], pass_fds=(key_fd,))
            device_info = os.stat(device)
            self.assertTrue(stat.S_ISBLK(device_info.st_mode))
            device_number = device_info.st_rdev
            command(["/usr/sbin/mkfs.ext4", "-F", "-m", "0", device])
            command(["/usr/bin/mount", "-o", "nodev,nosuid,noexec", device, str(mountpoint)])
            mounted = True
            actual = command(["/usr/bin/findmnt", "-n", "-o", "MAJ:MIN", "--target", str(mountpoint)])
            self.assertEqual(actual, f"{os.major(device_number)}:{os.minor(device_number)}")
            scratch = mountpoint / "private"
            scratch.mkdir(mode=0o700)
            target = scratch / "restored"
            target.mkdir(mode=0o700)
            marker = b"synthetic-large-workspace-" + secrets.token_bytes(32)
            block = (marker * (1024 * 1024 // len(marker) + 1))[:1024 * 1024]
            with open(source / "sample", "wb") as destination:
                remaining = FILE_BYTES
                while remaining:
                    count = min(len(block), remaining)
                    destination.write(block[:count])
                    remaining -= count
                destination.flush()
                os.fsync(destination.fileno())
            os.chown(source / "sample", OWNER, OWNER)
            os.chown(source, OWNER, OWNER)
            identity = subprocess.run([KEYGEN], check=True, capture_output=True).stdout
            recipient = subprocess.run([KEYGEN, "-y"], input=identity, check=True,
                                       capture_output=True).stdout.decode().strip()
            identity_path = root / "identity"
            identity_path.write_bytes(identity)
            identity_path.chmod(0o600)
            stream = load("workspace_stream", "globals-encrypted-stream.py")
            restorer = load("workspace_restore", "workspace-encrypted-scratch-restore.py")
            source_fd = os.open(source, os.O_RDONLY | os.O_DIRECTORY)
            output_fd = os.open(output, os.O_RDONLY | os.O_DIRECTORY)
            try:
                program = (
                    "import importlib.util,sys;"
                    "s=importlib.util.spec_from_file_location('archive',sys.argv[2]);"
                    "m=importlib.util.module_from_spec(s);s.loader.exec_module(m);"
                    "m.archive(int(sys.argv[1]),sys.stdout.buffer,int(sys.argv[3]))"
                )
                producer = [sys.executable, "-I", "-c", program, str(source_fd),
                            str(DIRECTORY / "workspace-fd-archive.py"), str(OWNER)]
                encrypted_size = stream.capture_workspace(
                    output_fd, "workspace.age", producer, [AGE, "-r", recipient],
                    600 * 1024 * 1024, 300, producer_fds=(source_fd,))
            finally:
                os.close(output_fd)
                os.close(source_fd)
            scratch_fd = os.open(scratch, os.O_RDONLY | os.O_DIRECTORY)
            target_fd = os.open(target, os.O_RDONLY | os.O_DIRECTORY)
            cipher_fd = os.open(output / "workspace.age", os.O_RDONLY | os.O_NOFOLLOW)
            try:
                minimum = []
                original_archive = restorer.archiver.archive

                def sample_after_archive(*args):
                    result = original_archive(*args)
                    available = os.fstatvfs(scratch_fd)
                    minimum.append(available.f_bavail * available.f_frsize)
                    return result

                with mock.patch.object(restorer.archiver, "archive", side_effect=sample_after_archive):
                    result = restorer.restore(cipher_fd, scratch_fd, target_fd, AGE,
                                              str(identity_path), OWNER,
                                              limit=600 * 1024 * 1024, timeout=300)
                self.assertEqual(len(minimum), 1)
                self.assertEqual(result[:2], (2, FILE_BYTES))
                restored = (target / "sample").stat()
                self.assertEqual((restored.st_uid, restored.st_gid, restored.st_size),
                                 (OWNER, OWNER, FILE_BYTES))
                with open(target / "sample", "rb") as sample:
                    self.assertEqual(sample.read(len(marker)), marker)
                available = os.fstatvfs(scratch_fd)
                print("synthetic_bytes=%d ciphertext_bytes=%d archive_sampled_free=%d remaining_bytes=%d elapsed_seconds=%d"
                      % (FILE_BYTES, encrypted_size, minimum[0],
                         available.f_bavail * available.f_frsize,
                         time.monotonic() - started), flush=True)
            finally:
                os.close(cipher_fd)
                os.close(target_fd)
                os.close(scratch_fd)
        finally:
            os.close(key_fd)
            if mounted:
                current = command(["/usr/bin/findmnt", "-n", "-o", "MAJ:MIN",
                                   "--target", str(mountpoint)])
                if device_number is None or current != f"{os.major(device_number)}:{os.minor(device_number)}":
                    raise RuntimeError("unexpected mount identity; manual inspection required")
                command(["/usr/bin/umount", str(mountpoint)])
            if device_number is not None:
                if os.stat(device).st_rdev != device_number:
                    raise RuntimeError("unexpected mapping identity; manual inspection required")
                command(["/usr/sbin/cryptsetup", "close", mapping])
            if loop is not None:
                if not re.fullmatch(r"/dev/loop[0-9]+", loop) or os.path.realpath(command(
                        ["/usr/sbin/losetup", "-n", "-O", "BACK-FILE", loop])) != str(image):
                    raise RuntimeError("unexpected loop identity; manual inspection required")
                command(["/usr/sbin/losetup", "-d", loop])
            if image_identity is not None:
                image_info = os.stat(image, follow_symlinks=False)
                if (image_info.st_dev, image_info.st_ino) != image_identity:
                    raise RuntimeError("unexpected image identity; manual inspection required")
                os.unlink(image)
            for item in (source / "sample", output / "workspace.age", root / "identity"):
                if item.exists():
                    item.unlink()
            source.rmdir()
            output.rmdir()
            mountpoint.rmdir()
            root.rmdir()


if __name__ == "__main__":
    unittest.main()
