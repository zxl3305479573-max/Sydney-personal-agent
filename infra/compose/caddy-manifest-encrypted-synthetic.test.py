#!/usr/bin/env python3
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


candidate = load("caddy_manifest_candidate", "caddy-manifest-candidate.py")
collection = load("caddy_synthetic_collection", "caddy-synthetic-collection.py")


@unittest.skipUnless(sys.platform == "linux" and hasattr(os, "getuid") and os.getuid() != 0,
                     "requires unprivileged Linux")
class ManifestEncryptedSyntheticTest(unittest.TestCase):
    def test_discovered_manifest_with_real_encryption_and_swapped_content_control(self):
        original_fixture = collection.make_fixture
        original_verify = collection.verify_archive
        verification_calls = []

        def fixture_with_discovered_manifest(lab):
            expected, roots = original_fixture(lab)
            descriptors = {}
            try:
                for name in ("data", "config"):
                    descriptors[name] = os.open(lab / name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
                manifest = candidate.discover(descriptors, 1024)
            finally:
                for descriptor in descriptors.values():
                    os.close(descriptor)
            actual = json.loads(manifest)
            self.assertEqual(actual, {"version": 1, "entries": expected})
            (lab / "manifest.json").write_bytes(manifest)
            return expected, roots

        def verify_with_swapped_content_control(plaintext, entries, roots):
            original_verify(plaintext, entries, roots)
            swapped = {"data": collection.FIXTURES["config"],
                       "config": collection.FIXTURES["data"]}
            with mock.patch.object(collection, "FIXTURES", swapped):
                with self.assertRaises(ValueError):
                    original_verify(plaintext, entries, roots)
            verification_calls.append(True)

        collection.check_platform()
        with tempfile.TemporaryDirectory(prefix="sydney-caddy-chain-", dir="/dev/shm") as directory:
            with mock.patch.object(collection, "make_fixture", side_effect=fixture_with_discovered_manifest), \
                    mock.patch.object(collection, "verify_archive", side_effect=verify_with_swapped_content_control):
                collection.collect(collection.parse_args([]), Path(directory))
        self.assertEqual(verification_calls, [True])


if __name__ == "__main__":
    unittest.main()
