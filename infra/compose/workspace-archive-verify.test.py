#!/usr/bin/env python3
import importlib.util
import io
import os
from pathlib import Path
import tarfile
import unittest
from unittest import mock


spec = importlib.util.spec_from_file_location(
    "workspace_archive_verify", Path(__file__).with_name("workspace-archive-verify.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def make_archive(entries, global_headers=None):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w", format=tarfile.PAX_FORMAT,
                      pax_headers=global_headers) as archive:
        for name, kind, data, headers in entries:
            member = tarfile.TarInfo(name)
            member.uid = os.getuid()
            member.gid = os.getgid()
            member.mode = 0o700
            member.pax_headers = headers
            if kind == "directory":
                member.type = tarfile.DIRTYPE
            elif kind == "link":
                member.type = tarfile.SYMTYPE
                member.linkname = data.decode()
            elif kind == "hardlink":
                member.type = tarfile.LNKTYPE
                member.linkname = data.decode()
            else:
                member.size = len(data)
            archive.addfile(member, io.BytesIO(data) if kind == "file" else None)
    return output.getvalue()


class VerifyTest(unittest.TestCase):
    def setUp(self):
        self.root = (".", "directory", b"", {})
        self.directory = ("./dir", "directory", b"", {})
        self.file = ("./dir/file", "file", b"data", {})
        self.link = ("./link", "link", b"/outside", {})

    def verify(self, entries):
        return module.verify(io.BytesIO(make_archive(entries)), os.getuid())

    def test_valid_content_and_order_independent(self):
        result = self.verify([self.root, self.directory, self.file, self.link])
        self.assertEqual(result[:2], (4, 4))
        self.assertEqual(result, self.verify([self.root, self.link, self.directory, self.file]))
        self.assertNotEqual(result, self.verify([self.root, self.directory,
                                                ("./dir/file", "file", b"else", {}),
                                                self.link]))

    def test_unsafe_paths_duplicates_and_link_parent_rejected(self):
        cases = [
            [self.root, ("/absolute", "file", b"x", {})],
            [self.root, ("./../escape", "file", b"x", {})],
            [self.root, ("file", "file", b"x", {})],
            [self.root, self.link, ("./link/child", "file", b"x", {})],
            [self.root, self.link, self.link],
            [self.root, self.file],
            [("./root", "file", b"x", {})],
        ]
        for entries in cases:
            with self.subTest(case=cases.index(entries)), self.assertRaises(ValueError):
                self.verify(entries)

    def test_unsupported_links_and_pax_rejected(self):
        for entries in (
            [self.root, ("./hard", "hardlink", b"./other", {})],
            [self.root, ("./file", "file", b"x", {"SCHILY.xattr.user.foo": "value"})],
        ):
            with self.assertRaises(ValueError):
                self.verify(entries)
        raw = make_archive([self.root], {"comment": "synthetic"})
        with self.assertRaises(ValueError):
            module.verify(io.BytesIO(raw), os.getuid())

    def test_owner_and_limits(self):
        raw = make_archive([self.root, self.directory, self.file])
        with self.assertRaises(ValueError):
            module.verify(io.BytesIO(raw), os.getuid() + 1)
        with mock.patch.object(module, "MAX_BYTES", 3):
            with self.assertRaises(ValueError):
                module.verify(io.BytesIO(raw), os.getuid())
        with mock.patch.object(module, "MAX_ENTRIES", 2):
            with self.assertRaises(ValueError):
                module.verify(io.BytesIO(raw), os.getuid())

    def test_truncated_content_rejected(self):
        raw = make_archive([self.root, ("./file", "file", b"x" * 20000, {})])
        with self.assertRaises((ValueError, tarfile.TarError, OSError)):
            module.verify(io.BytesIO(raw[:10000]), os.getuid())


if __name__ == "__main__":
    unittest.main()
