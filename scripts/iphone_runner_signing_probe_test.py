import hashlib
import io
import plistlib
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import iphone_runner_signing_probe as probe


def macho(signature=None):
    header = bytearray(32)
    header[:4] = b"\xcf\xfa\xed\xfe"
    if signature is None:
        return bytes(header)
    struct.pack_into("<II", header, 16, 1, 16)
    return bytes(header) + struct.pack("<IIII", 0x1D, 16, 48, len(signature)) + signature


def macho_with_code_directory(info_bytes, identifier, resources=None):
    identifier_bytes = identifier.encode() + b"\0"
    special_slots = 3 if resources is not None else 1
    hash_offset = 44 + len(identifier_bytes) + 32 * special_slots
    directory_size = hash_offset + 32
    signature_size = 20 + directory_size
    header = bytearray(32)
    header[:4] = b"\xcf\xfa\xed\xfe"
    struct.pack_into("<II", header, 16, 1, 16)
    command = struct.pack("<IIII", 0x1D, 16, 64, signature_size)
    code = (bytes(header) + command).ljust(64, b"\0")
    directory = struct.pack(
        ">9I4BI",
        0xFADE0C02,
        directory_size,
        0x20001,
        2,
        hash_offset,
        44,
        special_slots,
        1,
        len(code),
        32,
        2,
        0,
        12,
        0,
    )
    directory += identifier_bytes
    if resources is not None:
        directory += hashlib.sha256(resources).digest() + bytes(32)
    directory += hashlib.sha256(info_bytes).digest() + hashlib.sha256(code).digest()
    return code + struct.pack(">IIIII", 0xFADE0CC0, signature_size, 1, 0, 20) + directory


def runner_archive(path):
    with zipfile.ZipFile(path, "w") as archive:
        for root in (probe.APP_ROOT, probe.TEST_ROOT):
            archive.writestr(
                root + "Info.plist",
                plistlib.dumps({"CFBundleIdentifier": "org.example.original", "CFBundleExecutable": "exec"}),
            )
            archive.writestr(root + "exec", macho(b"old-signature"))


class RunnerProbeTests(unittest.TestCase):
    def test_rejects_non_public_input_before_running_signer(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ipa = root / "user.ipa"
            signer = root / "signer"
            ipa.write_bytes(b"not the public release")
            signer.write_bytes(b"not executed")
            with patch.object(probe, "run_case") as run_case:
                with self.assertRaisesRegex(ValueError, "does not match"):
                    probe.probe(ipa, signer)
            run_case.assert_not_called()

    def test_inspects_both_public_bundle_shapes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.ipa"
            runner_archive(path)
            result = probe.inspect_archive(path)
        self.assertEqual(result["app"]["identifier"], result["test"]["identifier"])
        self.assertTrue(result["test"]["signature"]["present"])

    def test_prealigning_changes_only_test_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.ipa"
            output = Path(directory) / "prealigned.ipa"
            runner_archive(source)
            probe.prepare_synthetic_identifier(source, output)
            original = probe.inspect_archive(source)
            result = probe.inspect_archive(output)
            with zipfile.ZipFile(source) as original_zip, zipfile.ZipFile(output) as result_zip:
                self.assertEqual(set(original_zip.namelist()), set(result_zip.namelist()))
                for name in original_zip.namelist():
                    if name != probe.TEST_ROOT + "Info.plist":
                        self.assertEqual(original_zip.read(name), result_zip.read(name))
        self.assertEqual(original["app"]["identifier"], result["app"]["identifier"])
        self.assertEqual(result["test"]["identifier"], probe.SYNTHETIC_BUNDLE_ID)
        self.assertEqual(original["test"]["signature"], result["test"]["signature"])

    def test_reports_preserved_test_bundle_with_changed_app_identifier(self):
        original = {
            "app": {"identifier": "original"},
            "test": {"identifier": "original", "signature": {"present": True, "blob_sha256": "old"}},
        }
        output = {
            "exit_code": 0,
            "archive": {
                "app": {
                    "identifier": "rewritten",
                    "signature": {"present": True},
                    "resource_manifest": {"status": "unavailable"},
                },
                "test": {
                    "identifier": "original",
                    "signature": {"present": True, "blob_sha256": "new"},
                    "resource_manifest": {"status": "unavailable"},
                },
            },
        }
        result = probe.summarize(original, output)
        self.assertTrue(result["test_present"])
        self.assertTrue(result["app_identifier_changed"])
        self.assertFalse(result["test_identifier_changed"])
        self.assertFalse(result["identifiers_match"])
        self.assertTrue(result["test_signature_changed"])

    def test_rejects_out_of_bounds_macho_signature(self):
        invalid = bytearray(macho(b"signature"))
        struct.pack_into("<I", invalid, 40, len(invalid) + 1)
        with self.assertRaisesRegex(ValueError, "signature range"):
            probe.signature_blob(bytes(invalid))

    def test_verifies_code_and_info_hashes_and_detects_changes(self):
        info = b"synthetic info"
        identifier = "org.example.synthetic"
        binary = macho_with_code_directory(info, identifier)
        result = probe.signature_blob(binary, info, identifier)["code_directories"]["directories"][0]
        self.assertTrue(result["ad_hoc"])
        self.assertTrue(result["code_slots_match"])
        self.assertTrue(result["info_plist_matches"])
        self.assertTrue(result["identifier_matches_plist"])

        changed = bytearray(binary)
        changed[50] ^= 1
        result = probe.signature_blob(bytes(changed), b"changed info", "different")
        directory = result["code_directories"]["directories"][0]
        self.assertFalse(directory["code_slots_match"])
        self.assertFalse(directory["info_plist_matches"])
        self.assertFalse(directory["identifier_matches_plist"])

    def test_unknown_hash_algorithm_is_not_reported_as_verified(self):
        info = b"synthetic info"
        binary = bytearray(macho_with_code_directory(info, "org.example.synthetic"))
        binary[64 + 20 + 37] = 99
        result = probe.signature_blob(bytes(binary), info, "org.example.synthetic")
        directory = result["code_directories"]["directories"][0]
        self.assertEqual(directory["hash_status"], "unsupported")
        self.assertIsNone(directory["code_slots_match"])

    def test_detects_resource_directory_changes(self):
        info = b"synthetic info"
        resources = b"synthetic resource directory"
        identifier = "org.example.synthetic"
        binary = macho_with_code_directory(info, identifier, resources)
        result = probe.signature_blob(binary, info, identifier, resources)
        directory = result["code_directories"]["directories"][0]
        self.assertTrue(directory["resource_directory_matches"])

        result = probe.signature_blob(binary, info, identifier, b"changed resource directory")
        directory = result["code_directories"]["directories"][0]
        self.assertFalse(directory["resource_directory_matches"])

    def test_resource_manifest_classifies_matches_missing_and_unsupported(self):
        contents = b"resource"
        resource_manifest = plistlib.dumps({
            "files2": {
                "good": {"hash2": hashlib.sha256(contents).digest()},
                "changed": {"hash2": hashlib.sha256(contents).digest()},
                "missing": {"hash2": hashlib.sha256(contents).digest()},
                "optional": {"hash2": hashlib.sha256(contents).digest(), "optional": True},
                "nested": {"cdhash": b"ignored"},
            }
        })
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr(probe.APP_ROOT + "good", contents)
            archive.writestr(probe.APP_ROOT + "changed", b"changed")
        with zipfile.ZipFile(buffer) as archive:
            result = probe.inspect_resource_manifest(archive, probe.APP_ROOT, resource_manifest)
        self.assertEqual(result["matched"], 1)
        self.assertEqual(result["mismatched"], 1)
        self.assertEqual(result["missing"], 1)
        self.assertEqual(result["optional_missing"], 1)
        self.assertEqual(result["unsupported"], 1)

    def test_reports_removed_test_bundle(self):
        original = {"app": {"identifier": "original"}, "test": {"identifier": "original"}}
        outcome = {
            "exit_code": 0,
            "archive": {
                "app": {
                    "identifier": "rewritten",
                    "signature": {"present": True},
                    "resource_manifest": {"status": "unavailable"},
                },
                "test": None,
            },
        }
        result = probe.summarize(original, outcome)
        self.assertFalse(result["test_present"])


if __name__ == "__main__":
    unittest.main()
