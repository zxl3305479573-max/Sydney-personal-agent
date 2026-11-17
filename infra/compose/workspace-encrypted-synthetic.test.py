#!/usr/bin/env python3
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest


DIRECTORY = Path(__file__).parent
AGE = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age"
KEYGEN = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age-keygen"


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, DIRECTORY / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


capture = load("workspace_fd_archive", "workspace-fd-archive.py")
verify = load("workspace_archive_verify", "workspace-archive-verify.py")
stream = load("globals_encrypted_stream", "globals-encrypted-stream.py")
extractor = load("workspace_safe_extract", "workspace-safe-extract.py")


class EncryptedSyntheticTest(unittest.TestCase):
    def test_two_pass_stream_rejects_changed_source_before_publish(self):
        with tempfile.TemporaryDirectory(dir="/dev/shm") as temporary:
            base = Path(temporary)
            source = base / "source"
            source.mkdir(mode=0o700)
            synthetic = source / "project"
            synthetic.write_bytes(b"synthetic-before")
            destination = base / "output"
            destination.mkdir(mode=0o700)
            identity = subprocess.run([KEYGEN], check=True, capture_output=True).stdout
            recipient = subprocess.run([KEYGEN, "-y"], input=identity, check=True,
                                       capture_output=True).stdout.decode().strip()
            identity_path = base / "identity"
            identity_path.write_bytes(identity)
            identity_path.chmod(0o600)
            root_fd = os.open(source, os.O_RDONLY | os.O_DIRECTORY)
            output_fd = os.open(destination, os.O_RDONLY | os.O_DIRECTORY)
            program = (
                "import importlib.util,os,sys\n"
                "spec=importlib.util.spec_from_file_location('producer',sys.argv[2])\n"
                "module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)\n"
                "original=module.archive.archive; calls=[]\n"
                "def changing(root,output,owner):\n"
                " result=original(root,output,owner); calls.append(1)\n"
                " if sys.argv[3]=='change' and len(calls)==1:\n"
                "  open(sys.argv[4],'wb').write(b'synthetic-after!')\n"
                " return result\n"
                "module.archive.archive=changing\n"
                "module.produce(int(sys.argv[1]),os.getuid(),sys.stdout.buffer)\n"
            )
            base_command = [sys.executable, "-c", program, str(root_fd),
                            str(DIRECTORY / "workspace-consistent-producer.py")]
            try:
                stream.capture_workspace(output_fd, "stable.age",
                                         base_command + ["stable", str(synthetic)],
                                         [AGE, "-r", recipient], 65536, 10,
                                         producer_fds=(root_fd,))
                decrypted = subprocess.run(
                    [AGE, "-d", "-i", str(identity_path)],
                    input=(destination / "stable.age").read_bytes(),
                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True,
                ).stdout
                self.assertEqual(verify.verify(io.BytesIO(decrypted), os.getuid())[:2], (2, 16))
                with self.assertRaises(RuntimeError):
                    stream.capture_workspace(output_fd, "changed.age",
                                             base_command + ["change", str(synthetic)],
                                             [AGE, "-r", recipient], 65536, 10,
                                             producer_fds=(root_fd,))
                self.assertFalse((destination / "changed.age").exists())
                self.assertEqual(list(destination.glob(".capture-*.partial")), [])
            finally:
                os.close(output_fd)
                os.close(root_fd)

    def test_descriptor_archive_stream_and_source_failure(self):
        with tempfile.TemporaryDirectory(dir="/dev/shm") as temporary:
            base = Path(temporary)
            source = base / "source"
            source.mkdir(mode=0o700)
            (source / "project.txt").write_bytes(b"synthetic streamed project")
            (source / "external").symlink_to("/outside/not-followed")
            destination = base / "output"
            destination.mkdir(mode=0o700)
            identity = subprocess.run([KEYGEN], check=True, capture_output=True).stdout
            recipient = subprocess.run([KEYGEN, "-y"], input=identity, check=True,
                                       capture_output=True).stdout.decode().strip()
            identity_path = base / "identity"
            identity_path.write_bytes(identity)
            identity_path.chmod(0o600)
            root_fd = os.open(source, os.O_RDONLY | os.O_DIRECTORY)
            output_fd = os.open(destination, os.O_RDONLY | os.O_DIRECTORY)
            pinned = base / "pinned-source"
            source.rename(pinned)
            source.mkdir(mode=0o700)
            (source / "project.txt").write_bytes(b"decoy project")
            producer_script = (
                "import importlib.util,os,sys;"
                "spec=importlib.util.spec_from_file_location('archive',sys.argv[2]);"
                "module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);"
                "module.archive(int(sys.argv[1]),sys.stdout.buffer,os.getuid())"
            )
            producer = [sys.executable, "-c", producer_script, str(root_fd),
                        str(DIRECTORY / "workspace-fd-archive.py")]
            try:
                stream.capture(output_fd, "workspace.age", producer, [AGE, "-r", recipient],
                               65536, 10, producer_fds=(root_fd,))
                decrypted = subprocess.run(
                    [AGE, "-d", "-i", str(identity_path)],
                    input=(destination / "workspace.age").read_bytes(),
                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True,
                ).stdout
                entries, size, _ = verify.verify(io.BytesIO(decrypted), os.getuid())
                self.assertEqual((entries, size), (3, 26))
                with tarfile.open(fileobj=io.BytesIO(decrypted), mode="r:") as archive:
                    self.assertEqual(archive.extractfile("./project.txt").read(),
                                     b"synthetic streamed project")
                    self.assertEqual(archive.getmember("./external").linkname,
                                     "/outside/not-followed")
                restored = base / "safe-restored"
                restored.mkdir(mode=0o700)
                restored_fd = os.open(restored, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    expected = extractor.extract(io.BytesIO(decrypted), restored_fd, os.getuid())
                    regenerated = io.BytesIO()
                    capture.archive(restored_fd, regenerated, os.getuid())
                    self.assertEqual(verify.verify(io.BytesIO(regenerated.getvalue()), os.getuid()),
                                     expected)
                finally:
                    os.close(restored_fd)
                os.mkfifo(pinned / "unsupported")
                with self.assertRaises(RuntimeError):
                    stream.capture(output_fd, "failure.age", producer, [AGE, "-r", recipient],
                                   65536, 10, producer_fds=(root_fd,))
                self.assertFalse((destination / "failure.age").exists())
                self.assertEqual(list(destination.glob(".capture-*.partial")), [])
            finally:
                os.close(output_fd)
                os.close(root_fd)

    def test_age_decrypt_verify_restore_and_tamper(self):
        with tempfile.TemporaryDirectory(dir="/dev/shm") as temporary:
            base = Path(temporary)
            source = base / "source"
            source.mkdir(mode=0o700)
            (source / "project").mkdir(mode=0o750)
            (source / "project" / "sample").write_bytes(b"synthetic project data")
            (source / "external").symlink_to("/outside/not-followed")
            (source / "missing").symlink_to("missing-target")

            identity = subprocess.run([KEYGEN], check=True, capture_output=True).stdout
            recipient = subprocess.run([KEYGEN, "-y"], input=identity, check=True,
                                       capture_output=True).stdout.strip()
            identity_path = base / "identity"
            identity_fd = os.open(identity_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(identity_fd, "wb") as identity_file:
                identity_file.write(identity)

            root_fd = os.open(source, os.O_RDONLY | os.O_DIRECTORY)
            try:
                plaintext = io.BytesIO()
                self.assertEqual(capture.archive(root_fd, plaintext, os.getuid()), (5, 22))
            finally:
                os.close(root_fd)
            expected = verify.verify(io.BytesIO(plaintext.getvalue()), os.getuid())
            encrypted = subprocess.run([AGE, "-r", recipient.decode("ascii")],
                                       input=plaintext.getvalue(), capture_output=True,
                                       check=True).stdout
            ciphertext = base / "workspace.age"
            ciphertext_fd = os.open(ciphertext, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(ciphertext_fd, "wb") as destination:
                destination.write(encrypted)

            decrypted = subprocess.run([AGE, "-d", "-i", str(identity_path)],
                                       input=ciphertext.read_bytes(), capture_output=True,
                                       check=True).stdout
            self.assertEqual(verify.verify(io.BytesIO(decrypted), os.getuid()), expected)
            restore = base / "restore"
            restore.mkdir(mode=0o700)
            subprocess.run(["tar", "-xf", "-", "-C", str(restore)],
                           input=decrypted, check=True, stdout=subprocess.DEVNULL,
                           stderr=subprocess.PIPE)
            self.assertEqual((restore / "project" / "sample").read_bytes(),
                             b"synthetic project data")
            self.assertEqual(os.readlink(restore / "external"), "/outside/not-followed")
            self.assertEqual(os.readlink(restore / "missing"), "missing-target")
            restored_fd = os.open(restore, os.O_RDONLY | os.O_DIRECTORY)
            try:
                restored = io.BytesIO()
                capture.archive(restored_fd, restored, os.getuid())
            finally:
                os.close(restored_fd)
            self.assertEqual(verify.verify(io.BytesIO(restored.getvalue()), os.getuid()),
                             expected)

            altered = bytearray(encrypted)
            altered[-1] ^= 1
            failed = subprocess.run([AGE, "-d", "-i", str(identity_path)],
                                    input=altered, capture_output=True)
            self.assertNotEqual(failed.returncode, 0)
            truncated = subprocess.run([AGE, "-d", "-i", str(identity_path)],
                                       input=encrypted[:-20], capture_output=True)
            self.assertNotEqual(truncated.returncode, 0)
            other_identity = subprocess.run([KEYGEN], check=True, capture_output=True).stdout
            other_path = base / "other-identity"
            other_fd = os.open(other_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(other_fd, "wb") as other_file:
                other_file.write(other_identity)
            wrong_identity = subprocess.run([AGE, "-d", "-i", str(other_path)],
                                            input=encrypted, capture_output=True)
            self.assertNotEqual(wrong_identity.returncode, 0)


if __name__ == "__main__":
    unittest.main()
