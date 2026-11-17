#!/usr/bin/env python3
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock


DIRECTORY = Path(__file__).parent
spec = importlib.util.spec_from_file_location(
    "workspace_consistent_producer", DIRECTORY / "workspace-consistent-producer.py")
producer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(producer)
verify_spec = importlib.util.spec_from_file_location(
    "workspace_archive_verify", DIRECTORY / "workspace-archive-verify.py")
verify = importlib.util.module_from_spec(verify_spec)
verify_spec.loader.exec_module(verify)


class ProducerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir="/dev/shm")
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / "source"
        self.source.mkdir(mode=0o700)
        self.file = self.source / "file"
        self.file.write_bytes(b"first-value")
        self.fd = os.open(self.source, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, self.fd)

    def test_stable_source_produces_verifiable_archive(self):
        output = io.BytesIO()
        self.assertEqual(producer.produce(self.fd, os.geteuid(), output), (2, 11))
        self.assertEqual(verify.verify(io.BytesIO(output.getvalue()), os.geteuid())[:2], (2, 11))

    def test_changed_content_between_passes_is_rejected(self):
        original = producer.archive.archive
        calls = []

        def changing(root_fd, output, owner):
            result = original(root_fd, output, owner)
            calls.append(1)
            if len(calls) == 1:
                before = self.file.stat()
                self.file.write_bytes(b"other-value")
                os.utime(self.file, ns=(before.st_atime_ns, before.st_mtime_ns))
            return result

        with mock.patch.object(producer.archive, "archive", side_effect=changing):
            with self.assertRaisesRegex(ValueError, "changed between"):
                producer.produce(self.fd, os.geteuid(), io.BytesIO())
        self.assertEqual(len(calls), 2)

    def test_added_file_between_passes_is_rejected(self):
        original = producer.archive.archive
        calls = []

        def changing(root_fd, output, owner):
            result = original(root_fd, output, owner)
            calls.append(1)
            if len(calls) == 1:
                (self.source / "added").write_bytes(b"synthetic")
            return result

        with mock.patch.object(producer.archive, "archive", side_effect=changing):
            with self.assertRaisesRegex(ValueError, "changed between"):
                producer.produce(self.fd, os.geteuid(), io.BytesIO())


if __name__ == "__main__":
    unittest.main()
