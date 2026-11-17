import unittest
from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

from iphone_signing_identity_diagnostic import diagnose_identity


class SigningIdentityDiagnosticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.now = datetime(2026, 11, 12, tzinfo=timezone.utc)
        cls.key = ec.generate_private_key(ec.SECP256R1())
        cls.other_key = ec.generate_private_key(ec.SECP256R1())
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Synthetic")])
        cls.cert = (
            x509.CertificateBuilder()
            .subject_name(name)
            .issuer_name(name)
            .public_key(cls.key.public_key())
            .serial_number(1234)
            .not_valid_before(cls.now - timedelta(days=1))
            .not_valid_after(cls.now + timedelta(days=1))
            .sign(cls.key, hashes.SHA256())
            .public_bytes(serialization.Encoding.DER)
        )

    def setUp(self):
        self.profile = {
            "CreationDate": self.now - timedelta(days=1),
            "ExpirationDate": self.now + timedelta(days=1),
            "TeamIdentifier": ["SYNTHETIC"],
            "DeveloperCertificates": [self.cert],
            "ProvisionedDevices": ["synthetic-device"],
            "Entitlements": {
                "application-identifier": "SYNTHETIC.org.example.runner",
                "com.apple.developer.team-identifier": "SYNTHETIC",
                "get-task-allow": True,
            },
        }
        self.key_pem = self.serialize(self.key)

    @staticmethod
    def serialize(key):
        return key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )

    def diagnose(self, *, cert=None, key=None, profile=None, now=None, bundle="org.example.runner"):
        return diagnose_identity(
            self.cert if cert is None else cert,
            self.key_pem if key is None else key,
            self.profile if profile is None else profile,
            "SYNTHETIC",
            bundle,
            "synthetic-device",
            self.now if now is None else now,
        )

    def test_matching_identity_and_profile(self):
        self.assertEqual(self.diagnose(), frozenset())

    def test_invalid_and_mismatched_identity(self):
        self.assertIn("invalid_identity", self.diagnose(cert=b"", key=b""))
        self.assertIn("key_mismatch", self.diagnose(key=self.serialize(self.other_key)))
        self.profile["DeveloperCertificates"] = [b"other"]
        self.assertIn("profile_certificate", self.diagnose())

    def test_expiration_boundaries(self):
        self.assertIn("certificate_time", self.diagnose(now=self.now + timedelta(days=1)))
        self.assertIn("profile_time", self.diagnose(now=self.now + timedelta(days=1)))
        self.profile["CreationDate"] = self.now + timedelta(seconds=1)
        self.assertIn("profile_time", self.diagnose())

    def test_team_device_and_debug_constraints(self):
        self.profile["TeamIdentifier"] = ["OTHER"]
        self.profile["ProvisionedDevices"] = ["other-device"]
        self.profile["Entitlements"]["get-task-allow"] = 1
        self.profile["Entitlements"]["com.apple.developer.team-identifier"] = "OTHER"
        self.assertTrue(
            {"profile_team", "profile_device", "debug_entitlement", "entitlement_team"}
            <= self.diagnose()
        )

    def test_wildcard_is_scoped_and_malformed_patterns_are_rejected(self):
        entitlements = self.profile["Entitlements"]
        entitlements["application-identifier"] = "SYNTHETIC.org.example.*"
        self.assertNotIn("profile_application", self.diagnose())
        self.assertIn("profile_application", self.diagnose(bundle="org.examples.runner"))
        self.assertIn("profile_application", self.diagnose(bundle="org.example."))
        for pattern in ("SYNTHETIC.org.*.runner", "OTHER.org.example.*", "SYNTHETIC.*"):
            entitlements["application-identifier"] = pattern
            self.assertIn("profile_application", self.diagnose())

    def test_missing_and_invalid_fields_fail_closed(self):
        self.assertIn("invalid_profile", self.diagnose(profile=[]))
        self.profile["ExpirationDate"] = "not-a-date"
        self.profile["Entitlements"] = None
        self.assertTrue({"profile_time", "debug_entitlement", "profile_application"} <= self.diagnose())


if __name__ == "__main__":
    unittest.main()
