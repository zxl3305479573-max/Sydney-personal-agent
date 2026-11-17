#!/usr/bin/env python3
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest


spec = importlib.util.spec_from_file_location(
    "restore_app_smoke", Path(__file__).with_name("restore-app-smoke.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def archive(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as data:
        for name, kind, content in entries:
            member = tarfile.TarInfo(name)
            if kind == "dir":
                member.type = tarfile.DIRTYPE
            elif kind == "link":
                member.type = tarfile.SYMTYPE
                member.linkname = content.decode()
            else:
                member.size = len(content)
            data.addfile(member, io.BytesIO(content) if kind == "file" else None)
    return output.getvalue()


class ExtractTest(unittest.TestCase):
    def test_unapproved_application_image_rejected_before_runtime_access(self):
        with self.assertRaises(ValueError):
            module.run(None, None, None, None, "sha256:" + "0" * 64)

    def test_normal_files(self):
        with tempfile.TemporaryDirectory(dir="/dev/shm") as directory:
            root = Path(directory)
            result = module.extract_appdata(
                archive([(".", "dir", b""), ("./sub", "dir", b""),
                         ("./sub/file", "file", b"synthetic")]), root,
            )
            self.assertEqual(result, (1, 9))
            self.assertEqual((root / "sub/file").read_bytes(), b"synthetic")

    def test_unsafe_members_rejected(self):
        for member in (("../escape", "file", b"x"), ("/absolute", "file", b"x"),
                       ("./link", "link", b"/outside")):
            with self.subTest(kind=member[1]), tempfile.TemporaryDirectory(dir="/dev/shm") as directory:
                with self.assertRaises(ValueError):
                    module.extract_appdata(archive([(".", "dir", b""), member]), Path(directory))

    def test_duplicates_rejected(self):
        with tempfile.TemporaryDirectory(dir="/dev/shm") as directory:
            with self.assertRaises(ValueError):
                module.extract_appdata(archive([(".", "dir", b""), ("./a", "file", b"x"),
                                               ("./a", "file", b"y")]), Path(directory))


if __name__ == "__main__":
    unittest.main()
