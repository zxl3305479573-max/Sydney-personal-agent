import io
import importlib.util
import pathlib
import tarfile
import unittest


path = pathlib.Path(__file__).with_name("verify-appdata-archive.py")
spec = importlib.util.spec_from_file_location("verify_appdata_archive", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def archive(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as writer:
        for name, kind, content in entries:
            member = tarfile.TarInfo(name)
            member.type = kind
            member.size = len(content)
            if kind == tarfile.SYMTYPE:
                member.linkname = "/tmp"
            writer.addfile(member, io.BytesIO(content) if content else None)
    return io.BytesIO(output.getvalue())


class ArchiveVerificationTests(unittest.TestCase):
    def test_accepts_regular_files_and_directories(self):
        self.assertEqual(
            module.verify(archive([(".", tarfile.DIRTYPE, b""), ("./file", tarfile.REGTYPE, b"ok")])),
            (2, 1, 2),
        )

    def test_rejects_unsafe_or_ambiguous_entries(self):
        for entries in (
            [("../file", tarfile.REGTYPE, b"")],
            [("/file", tarfile.REGTYPE, b"")],
            [("link", tarfile.SYMTYPE, b"")],
            [("file", tarfile.REGTYPE, b""), ("./file", tarfile.REGTYPE, b"")],
        ):
            with self.subTest(entries=entries), self.assertRaises(ValueError):
                module.verify(archive(entries))

    def test_rejects_truncated_data_and_oversized_archive(self):
        valid = archive([("file", tarfile.REGTYPE, b"1234")]).getvalue()
        with self.assertRaises((EOFError, tarfile.TarError)):
            module.verify(io.BytesIO(valid[:30]))
        old_limit = module.MAX_BYTES
        try:
            module.MAX_BYTES = 3
            with self.assertRaises(ValueError):
                module.verify(io.BytesIO(valid))
        finally:
            module.MAX_BYTES = old_limit


if __name__ == "__main__":
    unittest.main()
