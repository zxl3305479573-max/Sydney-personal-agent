#!/usr/bin/env python3
import importlib.util
import io
import os
from pathlib import Path
import tarfile
import tempfile
import unittest


DIRECTORY = Path(__file__).parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, DIRECTORY / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


extractor = load("workspace_safe_extract", "workspace-safe-extract.py")
capture = load("workspace_fd_archive", "workspace-fd-archive.py")


def archive(entries, *, owner=None, group=None):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w") as result:
        for name, kind, content in entries:
            item = tarfile.TarInfo(name)
            item.uid = os.geteuid() if owner is None else owner
            item.gid = os.getegid() if group is None else group
            item.pax_headers = {"mtime": "0.000000000"}
            if kind == "directory":
                item.type = tarfile.DIRTYPE
            elif kind == "link":
                item.type = tarfile.SYMTYPE
                item.linkname = content.decode()
                item.mode = 0o777
            elif kind == "hardlink":
                item.type = tarfile.LNKTYPE
                item.linkname = content.decode()
            else:
                item.size = len(content)
            result.addfile(item, io.BytesIO(content) if kind == "file" else None)
    return output.getvalue()


class SafeExtractTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(dir="/dev/shm")
        self.base = Path(self.temporary.name)
        self.destination = self.base / "destination"
        self.destination.mkdir(mode=0o700)
        self.fd = os.open(self.destination, os.O_RDONLY | os.O_DIRECTORY)

    def tearDown(self):
        os.close(self.fd)
        self.temporary.cleanup()

    def test_round_trip_preserves_data_metadata_and_external_link(self):
        source = self.base / "source"
        source.mkdir(mode=0o700)
        (source / "project").mkdir(mode=0o750)
        (source / "project" / "file").write_bytes(b"synthetic content")
        (source / "external").symlink_to("/outside/not-followed")
        source_fd = os.open(source, os.O_RDONLY | os.O_DIRECTORY)
        try:
            data = io.BytesIO()
            capture.archive(source_fd, data, os.geteuid())
        finally:
            os.close(source_fd)
        expected = extractor.extract(io.BytesIO(data.getvalue()), self.fd, os.geteuid())
        self.assertEqual((self.destination / "project" / "file").read_bytes(), b"synthetic content")
        self.assertEqual(os.readlink(self.destination / "external"), "/outside/not-followed")
        restored = io.BytesIO()
        capture.archive(self.fd, restored, os.geteuid())
        self.assertEqual(extractor.verify_module.verify(io.BytesIO(restored.getvalue()),
                                                        os.geteuid()), expected)

    def test_rejects_symlink_parent_without_touching_external_directory(self):
        external = self.base / "external"
        external.mkdir()
        value = archive([(".", "directory", b""),
                         ("./link", "link", os.fsencode(external)),
                         ("./link/escape", "file", b"bad")])
        with self.assertRaises(ValueError):
            extractor.extract(io.BytesIO(value), self.fd, os.geteuid())
        self.assertFalse((external / "escape").exists())
        self.assertEqual(list(self.destination.iterdir()), [])

    def test_changed_archive_cannot_follow_created_symlink_parent(self):
        external = self.base / "external"
        external.mkdir()
        original = archive([(".", "directory", b""), ("./safe", "file", b"x")])
        changed = archive([(".", "directory", b""),
                           ("./link", "link", os.fsencode(external)),
                           ("./link/escape", "file", b"bad")])

        class ChangingStream(io.BytesIO):
            def __init__(self):
                super().__init__(original)
                self.rewinds = 0

            def seek(self, offset, whence=0):
                if offset == 0 and whence == 0:
                    self.rewinds += 1
                    if self.rewinds == 2:
                        super().seek(0)
                        super().truncate()
                        super().write(changed)
                return super().seek(offset, whence)

        with self.assertRaises((OSError, ValueError)):
            extractor.extract(ChangingStream(), self.fd, os.geteuid())
        self.assertFalse((external / "escape").exists())
        self.assertTrue((self.destination / "link").is_symlink())

    def test_rejects_escape_duplicate_and_hardlink(self):
        for entries in (
            [(".", "directory", b""), ("../escape", "file", b"x")],
            [(".", "directory", b""), ("./a", "file", b"x"), ("./a", "file", b"y")],
            [(".", "directory", b""), ("./a", "hardlink", b"/outside")],
        ):
            with self.subTest(entries=len(entries)), self.assertRaises(ValueError):
                extractor.extract(io.BytesIO(archive(entries)), self.fd, os.geteuid())
        self.assertEqual(list(self.destination.iterdir()), [])

    def test_rejects_nonempty_destination(self):
        (self.destination / "existing").write_bytes(b"keep")
        with self.assertRaises(ValueError):
            extractor.extract(io.BytesIO(archive([(".", "directory", b"")])),
                              self.fd, os.geteuid())
        self.assertEqual((self.destination / "existing").read_bytes(), b"keep")

    def test_rejects_privileged_mode_without_root(self):
        if os.geteuid() == 0:
            self.skipTest("requires a non-root caller")
        value = archive([(".", "directory", b"")])
        with self.assertRaises(ValueError):
            extractor.extract(io.BytesIO(value), self.fd, os.geteuid(),
                              privileged_owner=True)

    def test_default_rejects_different_archive_owner(self):
        other_owner = 65534 if os.geteuid() != 65534 else 65533
        value = archive([(".", "directory", b"")], owner=other_owner)
        with self.assertRaises(ValueError):
            extractor.extract(io.BytesIO(value), self.fd, other_owner)
        self.assertEqual(list(self.destination.iterdir()), [])

    @unittest.skipUnless(os.geteuid() == 0, "requires root")
    def test_privileged_mode_restores_numeric_ownership(self):
        owner = 65534
        group = 65534
        value = archive([(".", "directory", b""),
                         ("./directory", "directory", b""),
                         ("./directory/file", "file", b"synthetic"),
                         ("./link", "link", b"/outside/not-followed")],
                        owner=owner, group=group)
        expected = extractor.extract(io.BytesIO(value), self.fd, owner,
                                     privileged_owner=True)
        self.assertEqual(expected[:2], (4, 9))
        for path in (self.destination, self.destination / "directory",
                     self.destination / "directory" / "file", self.destination / "link"):
            info = path.lstat()
            self.assertEqual((info.st_uid, info.st_gid), (owner, group))
        self.assertEqual((self.destination / "directory" / "file").read_bytes(), b"synthetic")
        self.assertEqual(os.readlink(self.destination / "link"), "/outside/not-followed")
        restored = io.BytesIO()
        capture.archive(self.fd, restored, owner)
        self.assertEqual(extractor.verify_module.verify(io.BytesIO(restored.getvalue()), owner),
                         expected)


if __name__ == "__main__":
    unittest.main()
