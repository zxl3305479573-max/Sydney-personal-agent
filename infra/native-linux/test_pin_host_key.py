import base64
import hashlib
import struct
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from inspect_remote import InspectionError
from pin_host_key import create_known_hosts, parse_public_key


def example_key():
    name = b"ssh-ed25519"
    blob = struct.pack(">I", len(name)) + name + struct.pack(">I", 32) + bytes(range(32))
    key = "ssh-ed25519 " + base64.b64encode(blob).decode()
    fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode().rstrip("=")
    return key, fingerprint


class PinHostKeyTest(unittest.TestCase):
    def test_pins_only_when_fingerprint_matches(self):
        key, fingerprint = example_key()
        with TemporaryDirectory() as directory:
            output = Path(directory) / "known_hosts"
            with self.assertRaisesRegex(InspectionError, "^host_fingerprint_mismatch$"):
                create_known_hosts("example.com", 2222, key, "SHA256:wrong", output)
            self.assertFalse(output.exists())
            create_known_hosts("example.com", 2222, key, fingerprint, output)
            self.assertEqual(output.read_text(encoding="ascii"), f"[example.com]:2222 {key}\n")
            with self.assertRaisesRegex(InspectionError, "^known_hosts_creation_failed$"):
                create_known_hosts("example.com", 2222, key, fingerprint, output)

    def test_rejects_inconsistent_key_type(self):
        key, _ = example_key()
        with self.assertRaisesRegex(InspectionError, "^invalid_host_key$"):
            parse_public_key(key.replace("ssh-ed25519", "ssh-rsa", 1))

    def test_rejects_non_ascii_fingerprint(self):
        key, _ = example_key()
        with TemporaryDirectory() as directory:
            with self.assertRaisesRegex(InspectionError, "^host_fingerprint_mismatch$"):
                create_known_hosts("example.com", 22, key, "指纹", Path(directory) / "known_hosts")


if __name__ == "__main__":
    unittest.main()
