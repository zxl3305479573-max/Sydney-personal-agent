#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock


spec = importlib.util.spec_from_file_location(
    "caddy_manifest", Path(__file__).with_name("caddy-manifest-candidate.py"))
candidate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(candidate)


class ManifestTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="sydney-caddy-manifest-", dir="/dev/shm")
        root = Path(self.temporary.name)
        self.data = root / "data"
        self.config = root / "config"
        self.data.mkdir(mode=0o700)
        self.config.mkdir(mode=0o700)
        (self.data / "sub").mkdir(mode=0o700)
        (self.data / "sub" / "file").write_bytes(b"synthetic data")
        (self.config / "file").write_bytes(b"synthetic config")
        self.roots = {name: os.open(path, os.O_RDONLY | os.O_DIRECTORY)
                      for name, path in (("data", self.data), ("config", self.config))}

    def tearDown(self):
        for fd in self.roots.values():
            os.close(fd)
        self.temporary.cleanup()

    def test_discovery_covers_distinct_roots_and_content(self):
        document = json.loads(candidate.discover(self.roots, 1024))
        entries = {(entry["root"], entry["path"]): entry for entry in document["entries"]}
        self.assertEqual(set(entries), {("data", "sub"), ("data", "sub/file"), ("config", "file")})
        self.assertEqual(entries[("data", "sub/file")]["sha256"],
                         hashlib.sha256(b"synthetic data").hexdigest())

    def test_rejects_links_writable_files_and_limits(self):
        (self.data / "link").symlink_to("/tmp")
        with self.assertRaises(ValueError):
            candidate.discover(self.roots, 1024)
        (self.data / "link").unlink()
        (self.config / "file").chmod(0o666)
        with self.assertRaises(ValueError):
            candidate.discover(self.roots, 1024)
        (self.config / "file").chmod(0o600)
        with self.assertRaises(ValueError):
            candidate.discover(self.roots, 2)
        with self.assertRaises(ValueError):
            candidate.discover({"data": self.roots["data"], "config": self.roots["data"]}, 1024)

    def test_changed_file_between_discovery_and_recheck_rejected(self):
        original = candidate.archive.collect

        def changed(*args, **kwargs):
            (self.config / "file").write_bytes(b"changed")
            return original(*args, **kwargs)

        with mock.patch.object(candidate.archive, "collect", side_effect=changed):
            with self.assertRaises(ValueError):
                candidate.discover(self.roots, 1024)

    @unittest.skipUnless(os.geteuid() == 0, "root-owned sticky fixture required")
    def test_sticky_roots_require_explicit_policy(self):
        self.data.chmod(0o1777)
        self.config.chmod(0o1777)
        try:
            with self.assertRaises(ValueError):
                candidate.discover(self.roots, 1024)
            document = json.loads(candidate.discover(self.roots, 1024, sticky_root=True))
            self.assertEqual(len(document["entries"]), 3)
        finally:
            self.data.chmod(0o700)
            self.config.chmod(0o700)


if __name__ == "__main__":
    unittest.main()
