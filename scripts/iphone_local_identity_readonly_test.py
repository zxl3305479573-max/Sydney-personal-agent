import base64
import json
import plistlib
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

from iphone_local_identity_readonly import inspect_root


class LocalIdentityReadonlyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.now = datetime.now(timezone.utc)
        self.key = ec.generate_private_key(ec.SECP256R1())
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Synthetic")])
        self.cert = (
            x509.CertificateBuilder()
            .subject_name(name)
            .issuer_name(name)
            .public_key(self.key.public_key())
            .serial_number(7)
            .not_valid_before(self.now - timedelta(days=1))
            .not_valid_after(self.now + timedelta(days=1))
            .sign(self.key, hashes.SHA256())
            .public_bytes(serialization.Encoding.DER)
        )
        self.profile = {
            "Name": "Synthetic Sydney",
            "ExpirationDate": (self.now + timedelta(days=1)).replace(tzinfo=None),
            "DeveloperCertificates": [self.cert],
        }
        self.write_profile()
        self.write_cache(self.key)

    def write_profile(self):
        (self.root / "profile.mobileprovision").write_bytes(
            b"synthetic-envelope" + plistlib.dumps(self.profile)
        )

    def write_cache(self, key):
        key_pem = key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        (self.root / "certificate.json").write_text(
            json.dumps(
                {
                    "cert_der": base64.b64encode(self.cert).decode(),
                    "key_pem": base64.b64encode(key_pem).decode(),
                }
            ),
            encoding="utf-8",
        )

    def test_matching_profile_and_key(self):
        result = inspect_root(self.root, self.now)
        self.assertEqual(result["matching_profiles"], 1)
        self.assertEqual(result["certificate_in_profile"], 1)
        self.assertEqual(result["key_matches_certificate"], 1)
        self.assertEqual(result["both_unexpired"], 1)
        self.assertEqual(result["errors"], 0)

    def test_key_mismatch_and_profile_certificate_mismatch(self):
        self.write_cache(ec.generate_private_key(ec.SECP256R1()))
        self.profile["DeveloperCertificates"] = [b"synthetic-other"]
        self.write_profile()
        result = inspect_root(self.root, self.now)
        self.assertEqual(result["matching_profiles_with_cache"], 1)
        self.assertEqual(result["certificate_in_profile"], 0)
        self.assertEqual(result["key_matches_certificate"], 0)

    def test_bad_cache_and_nonmatching_profile_are_not_successes(self):
        (self.root / "certificate.json").write_text("not-json", encoding="utf-8")
        self.assertEqual(inspect_root(self.root, self.now)["errors"], 1)
        self.profile["Name"] = "Unrelated"
        self.write_profile()
        result = inspect_root(self.root, self.now)
        self.assertEqual(result["matching_profiles"], 0)
        self.assertEqual(result["errors"], 0)


if __name__ == "__main__":
    unittest.main()
