#!/usr/bin/env python3
import importlib.util
import io
import os
from pathlib import Path
import socket
import subprocess
import tarfile
import tempfile
import unittest
from unittest import mock


spec = importlib.util.spec_from_file_location(
    "workspace_fd_archive", Path(__file__).with_name("workspace-fd-archive.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ArchiveTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.root = self.base / "root"
        self.root.mkdir()
        self.fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        self.output = io.BytesIO()

    def tearDown(self):
        os.close(self.fd)
        self.temp.cleanup()

    def capture(self):
        return module.archive(self.fd, self.output, os.getuid())

    def test_contents_metadata_and_external_link(self):
        (self.root / "directory").mkdir()
        file = self.root / "directory" / "file"
        file.write_bytes(b"synthetic contents")
        file.chmod(0o640)
        (self.root / "outside").symlink_to("/outside/secret")
        (self.root / "missing").symlink_to("does-not-exist")
        self.assertEqual(self.capture(), (5, 18))
        self.output.seek(0)
        with tarfile.open(fileobj=self.output, mode="r:") as archive:
            members = {member.name: member for member in archive}
            self.assertEqual(members["./outside"].linkname, "/outside/secret")
            self.assertTrue(members["./outside"].issym())
            self.assertTrue(members["./missing"].issym())
            self.assertEqual(members["./directory/file"].mode, 0o640)
            self.assertEqual(archive.extractfile(members["./directory/file"]).read(),
                             b"synthetic contents")

    def test_hardlinks_and_special_files_rejected(self):
        file = self.root / "file"
        file.write_bytes(b"sample")
        os.link(file, self.root / "hardlink")
        with self.assertRaises(ValueError):
            self.capture()
        (self.root / "hardlink").unlink()
        file.unlink()
        os.mkfifo(self.root / "fifo")
        with self.assertRaises(ValueError):
            self.capture()
        (self.root / "fifo").unlink()
        with socket.socket(socket.AF_UNIX) as server:
            server.bind(str(self.root / "socket"))
            with self.assertRaises(ValueError):
                self.capture()

    def test_gnu_tar_restores_synthetic_contents_and_links(self):
        (self.root / "data").write_bytes(b"synthetic")
        (self.root / "link").symlink_to("/outside/not-read")
        self.capture()
        destination = self.base / "restored"
        destination.mkdir()
        subprocess.run(["tar", "-xf", "-", "-C", str(destination)],
                       input=self.output.getvalue(), check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        self.assertEqual((destination / "data").read_bytes(), b"synthetic")
        self.assertEqual(os.readlink(destination / "link"), "/outside/not-read")

    def test_directory_replacement_with_external_link_rejected(self):
        directory = self.root / "directory"
        directory.mkdir()
        outside = self.base / "outside"
        outside.mkdir()
        (outside / "secret").write_bytes(b"outside-marker")
        original_open = os.open
        replaced = False

        def racing_open(path, flags, *args, **kwargs):
            nonlocal replaced
            if path == "directory" and flags & os.O_DIRECTORY and not replaced:
                replaced = True
                directory.rename(self.base / "old-directory")
                directory.symlink_to(outside)
            return original_open(path, flags, *args, **kwargs)

        with mock.patch.object(module.os, "open", side_effect=racing_open):
            with self.assertRaises((ValueError, OSError)):
                self.capture()
        self.assertTrue(replaced)
        self.assertNotIn(b"outside-marker", self.output.getvalue())

    def test_file_changed_during_capture_rejected(self):
        file = self.root / "file"
        file.write_bytes(b"x" * 50000)
        original_fdopen = os.fdopen

        class MutatingReader:
            changed = False

            def __init__(self, source):
                self.source = source

            def __enter__(self):
                return self

            def __exit__(self, *args):
                self.source.close()

            def fileno(self):
                return self.source.fileno()

            def seek(self, offset):
                return self.source.seek(offset)

            def read(self, size):
                data = self.source.read(size)
                if not self.changed:
                    self.changed = True
                    with file.open("r+b") as target:
                        target.write(b"y")
                return data

        readers = []

        def wrap_reader(*args, **kwargs):
            reader = MutatingReader(original_fdopen(*args, **kwargs))
            readers.append(reader)
            return reader

        original_identity = module.identity
        with mock.patch.object(module.os, "fdopen", side_effect=wrap_reader), \
             mock.patch.object(module, "identity", side_effect=lambda info: original_identity(info)[:-2]):
            with self.assertRaisesRegex(ValueError, "file content changed"):
                self.capture()
        self.assertTrue(readers[0].changed)

    def test_mount_identity_mismatch_rejected(self):
        (self.root / "file").write_bytes(b"x")
        original_mount_id = module.mount_id
        root_inode = os.fstat(self.fd).st_ino

        def changed_mount(fd):
            value = original_mount_id(fd)
            return value if os.fstat(fd).st_ino == root_inode else value + 1

        with mock.patch.object(module, "mount_id", side_effect=changed_mount):
            with self.assertRaisesRegex(ValueError, "mount"):
                self.capture()

    def test_owner_size_and_entry_limits(self):
        (self.root / "file").write_bytes(b"x")
        with self.assertRaises(ValueError):
            module.archive(self.fd, self.output, os.getuid() + 1)
        with mock.patch.object(module, "MAX_BYTES", 0):
            with self.assertRaises(ValueError):
                self.capture()
        with mock.patch.object(module, "MAX_ENTRIES", 1):
            with self.assertRaises(ValueError):
                self.capture()

    def test_extended_attributes_rejected(self):
        file = self.root / "file"
        file.write_bytes(b"x")
        try:
            os.setxattr(file, "user.synthetic", b"value")
        except OSError:
            self.skipTest("synthetic filesystem does not support user xattrs")
        with self.assertRaises(ValueError):
            self.capture()


if __name__ == "__main__":
    unittest.main()
