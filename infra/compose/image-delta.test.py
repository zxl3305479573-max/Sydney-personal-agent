#!/usr/bin/env python3
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import unittest


spec = importlib.util.spec_from_file_location("image_delta", Path(__file__).with_name("image-delta.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def blob(content):
    return "blobs/sha256/" + hashlib.sha256(content).hexdigest()


def archive(items):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w") as result:
        for name, content in items:
            item = tarfile.TarInfo(name)
            item.size = len(content)
            result.addfile(item, io.BytesIO(content))
    return output.getvalue()


def read(data):
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as source:
        return {member.name: source.extractfile(member).read()
                for member in source if member.isfile()}


class ImageDeltaTest(unittest.TestCase):
    def setUp(self):
        self.common = b"shared synthetic blob"
        self.old = b"old synthetic blob"
        self.base = archive([(blob(self.common), self.common),
                             (blob(b"new"), b"new")])
        manifest = json.dumps([{"Config": blob(self.old), "Layers": [blob(self.common)]}]).encode()
        self.metadata = [("index.json", b"{}"), ("manifest.json", manifest),
                         ("oci-layout", b"{}")]
        self.original = archive([(blob(self.common), self.common),
                                 (blob(self.old), self.old), *self.metadata])

    def delta(self, original=None):
        output = io.BytesIO()
        module.pack(io.BytesIO(original or self.original), output, module.index(io.BytesIO(self.base)))
        return output.getvalue()

    def test_round_trip_reconstructs_old_members(self):
        delta = self.delta()
        self.assertNotIn(blob(self.common), read(delta))
        result = io.BytesIO()
        module.merge(io.BytesIO(delta), io.BytesIO(self.base), result)
        self.assertEqual(read(result.getvalue()), read(self.original))

    def test_modified_delta_blob_rejected(self):
        items = list(read(self.delta()).items())
        modified = [(name, b"x" * len(content) if name == blob(self.old) else content)
                    for name, content in items]
        with self.assertRaises(ValueError):
            module.merge(io.BytesIO(archive(modified)), io.BytesIO(self.base), io.BytesIO())

    def test_missing_and_modified_base_blob_rejected(self):
        for base in (archive([]), archive([(blob(self.common), b"x" * len(self.common))])):
            with self.subTest(base_size=len(base)), self.assertRaises(ValueError):
                module.merge(io.BytesIO(self.delta()), io.BytesIO(base), io.BytesIO())

    def test_unexpected_and_duplicate_members_rejected(self):
        for items in ([("../escape", b"x")], [(blob(self.old), self.old)] * 2):
            with self.subTest(count=len(items)), self.assertRaises(ValueError):
                self.delta(archive(items))

    def test_invalid_base_index_rejected(self):
        with self.assertRaises(ValueError):
            module.pack(io.BytesIO(self.original), io.BytesIO(), {"../escape": 1})

    def test_manifest_missing_blob_is_rejected(self):
        items = list(read(self.delta()).items())
        manifest = json.dumps([{"Config": blob(b"missing"), "Layers": [blob(self.common)]}]).encode()
        altered = [(name, manifest if name == "manifest.json" else content)
                   for name, content in items]
        with self.assertRaises(ValueError):
            module.merge(io.BytesIO(archive(altered)), io.BytesIO(self.base), io.BytesIO())


if __name__ == "__main__":
    unittest.main()
