#!/usr/bin/env python3
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


spec = importlib.util.spec_from_file_location(
    "workspace_tree_manifest", Path(__file__).with_name("workspace-tree-manifest.py")
)
manifest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manifest)


def record(path=b"", kind=b"d", uid=None, links=b"1", target=b""):
    if uid is None:
        uid = str(os.getuid()).encode()
    return (path, kind, uid, b"0", b"700", b"1", b"1.0000000000",
            b"1.0000000000", links, target)


def stream(*records):
    return b"".join(field + b"\0" for item in records for field in item)


class ManifestTest(unittest.TestCase):
    def setUp(self):
        self.owner = os.getuid()
        self.root = record()
        self.file = record(b"file", b"f")

    def test_real_find_and_order_independence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "sub").mkdir()
            (root / "sub" / "file").write_bytes(b"abc")
            (root / "external").symlink_to("/outside/not-followed")
            command = ["find", "-P", str(root), "-xdev", "-printf",
                       r"%P\0%y\0%U\0%G\0%m\0%s\0%T@\0%C@\0%n\0%l\0"]
            raw = subprocess.check_output(command)
            fields = raw[:-1].split(b"\0")
            records = [tuple(fields[index:index + manifest.FIELDS])
                       for index in range(0, len(fields), manifest.FIELDS)]
            result = manifest.parse(raw, self.owner)
            self.assertEqual(result[:2], (4, 3))
            self.assertEqual(result, manifest.parse(stream(*reversed(records)), self.owner))

    def test_invalid_records(self):
        invalid = [
            b"", stream(self.root)[:-1], stream(self.root) + b"extra\0",
            stream(self.root, self.file, self.file),
            stream(self.root, record(b"/absolute", b"f")),
            stream(self.root, record(b"../escape", b"f")),
            stream(self.root, record(b"missing/file", b"f")),
            stream(self.root, record(b"link", b"l", target=b"/outside"),
                   record(b"link/file", b"f")),
            stream(self.root, record(b"file", b"f", uid=str(self.owner + 1).encode())),
            stream(self.root, record(b"file", b"f", links=b"2")),
            stream(self.root, record(b"socket", b"s")),
            stream(self.root, record(b"link", b"l")),
            stream(self.root, record(b"file", b"f", target=b"unexpected")),
            stream(record(b"", b"f")),
            stream(self.root, self.file[:6] + (b"bad",) + self.file[7:]),
        ]
        for value in invalid:
            with self.subTest(case=invalid.index(value)):
                with self.assertRaises(ValueError):
                    manifest.parse(value, self.owner)

    def test_external_link_is_recorded_without_following(self):
        data = stream(self.root, record(b"link", b"l", target=b"/outside"))
        self.assertEqual(manifest.parse(data, self.owner)[:2], (2, 0))

    def test_limits(self):
        original = manifest.MAX_INPUT, manifest.MAX_ENTRIES, manifest.MAX_BYTES
        try:
            manifest.MAX_INPUT = len(stream(self.root)) - 1
            with self.assertRaises(ValueError):
                manifest.parse(stream(self.root), self.owner)
            manifest.MAX_INPUT = original[0]
            manifest.MAX_ENTRIES = 1
            with self.assertRaises(ValueError):
                manifest.parse(stream(self.root, self.file), self.owner)
            manifest.MAX_ENTRIES = original[1]
            manifest.MAX_BYTES = 0
            with self.assertRaises(ValueError):
                manifest.parse(stream(self.root, self.file), self.owner)
        finally:
            manifest.MAX_INPUT, manifest.MAX_ENTRIES, manifest.MAX_BYTES = original


if __name__ == "__main__":
    unittest.main()
