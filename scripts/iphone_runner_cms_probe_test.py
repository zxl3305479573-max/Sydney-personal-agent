import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import iphone_runner_cms_probe as probe


def synthetic_macho(*, duplicate=False, cms=b"synthetic-cms"):
    code = struct.pack(">II", 0xFADE0C02, 12) + b"code"
    signature = struct.pack(">II", 0xFADE0B01, 8 + len(cms)) + cms
    code_offset = 28
    signature_offset = code_offset + len(code)
    second_slot = 0 if duplicate else 0x10000
    total = 28 + len(code) + len(signature)
    blob = (
        struct.pack(">III", 0xFADE0CC0, total, 2)
        + struct.pack(">IIII", 0, code_offset, second_slot, signature_offset)
        + code
        + signature
    )
    header = bytearray(32)
    header[:4] = b"\xcf\xfa\xed\xfe"
    struct.pack_into("<II", header, 16, 1, 16)
    return bytes(header) + struct.pack("<IIII", 0x1D, 16, 48, len(blob)) + blob


class RunnerCMSProbeTests(unittest.TestCase):
    def test_extracts_code_directory_and_signature(self):
        directory, cms = probe.extract_slots(synthetic_macho())
        self.assertEqual(directory, struct.pack(">II", 0xFADE0C02, 12) + b"code")
        self.assertEqual(cms, b"synthetic-cms")

    def test_empty_signature_is_not_reported_as_valid(self):
        _, cms = probe.extract_slots(synthetic_macho(cms=b""))
        self.assertEqual(cms, b"")

    def test_rejects_duplicate_and_truncated_slots(self):
        with self.assertRaises(ValueError):
            probe.extract_slots(synthetic_macho(duplicate=True))
        with self.assertRaises(ValueError):
            probe.extract_slots(synthetic_macho()[:-2])
        with self.assertRaises(ValueError):
            probe.extract_slots(b"invalid")

    def test_rejects_untrusted_input_before_starting_openssl(self):
        with tempfile.TemporaryDirectory() as temporary:
            runner = Path(temporary) / "runner.ipa"
            runner.write_bytes(b"not-the-pinned-public-runner")
            with patch.object(probe, "RUNNER", runner), patch.object(probe.subprocess, "run") as run:
                with self.assertRaises(ValueError):
                    probe.verify_public_runner()
                run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
