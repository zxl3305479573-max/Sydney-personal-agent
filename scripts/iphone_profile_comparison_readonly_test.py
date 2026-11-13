import unittest
from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID
from iphone_profile_comparison_readonly import summarize


class ProfileComparisonTests(unittest.TestCase):
    def setUp(self):
        self.apps = {
            "org.synthetic.sydney": {
                "CFBundleDisplayName": "Sydney",
                "Entitlements": {"application-identifier": "TEAM.org.synthetic.sydney"},
            }
        }
        self.profile = {
            "UUID": "synthetic-uuid",
            "Entitlements": {"application-identifier": "TEAM.org.synthetic.sydney"},
            "DeveloperCertificates": [b"synthetic-cert"],
        }

    def test_matching_profiles_are_compared_without_identifiers_in_result(self):
        result = summarize(self.apps, [(b"same", self.profile)], [(b"same", self.profile)])
        self.assertEqual(result["matching_device_profiles"], 1)
        self.assertEqual(result["matching_local_profiles"], 1)
        self.assertEqual(result["same_raw_profile_pairs"], 1)
        self.assertEqual(result["same_uuid_pairs"], 1)
        self.assertEqual(result["overlapping_certificate_pairs"], 1)
        self.assertNotIn("synthetic", str(result))

    def test_wrong_identity_or_missing_certificate_do_not_match(self):
        other = {
            "UUID": "other",
            "Entitlements": {"application-identifier": "TEAM.other"},
            "DeveloperCertificates": [b"synthetic-cert"],
        }
        result = summarize(self.apps, [(b"other", other)], [(b"same", self.profile)])
        self.assertEqual(result["matching_device_profiles"], 0)
        self.assertEqual(result["same_raw_profile_pairs"], 0)
        no_cert = {**self.profile, "DeveloperCertificates": []}
        result = summarize(self.apps, [(b"different", no_cert)], [(b"same", self.profile)])
        self.assertEqual(result["overlapping_certificate_pairs"], 0)

    def test_ambiguous_or_missing_app_identity_stops_comparison(self):
        ambiguous = {**self.apps, "org.other.rakazo": {"CFBundleName": "Rakazo"}}
        self.assertEqual(summarize(ambiguous, [], [])["matching_apps"], 2)
        missing = {"org.synthetic.sydney": {"CFBundleName": "Sydney"}}
        self.assertEqual(summarize(missing, [], [])["status"], "app_identity_unavailable")

    def test_signer_name_match_is_only_a_metadata_comparison(self):
        key = ec.generate_private_key(ec.SECP256R1())
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Synthetic Signer")])
        now = datetime.now(timezone.utc)
        certificate = (
            x509.CertificateBuilder()
            .subject_name(name)
            .issuer_name(name)
            .public_key(key.public_key())
            .serial_number(22)
            .not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=1))
            .sign(key, hashes.SHA256())
            .public_bytes(serialization.Encoding.DER)
        )
        self.apps["org.synthetic.sydney"]["SignerIdentity"] = "Synthetic Signer"
        self.profile["DeveloperCertificates"] = [certificate]
        result = summarize(self.apps, [(b"same", self.profile)], [(b"same", self.profile)])
        self.assertTrue(result["signer_matches_local_cert_common_name"])
        self.apps["org.synthetic.sydney"]["SignerIdentity"] = "Other"
        result = summarize(self.apps, [(b"same", self.profile)], [(b"same", self.profile)])
        self.assertFalse(result["signer_matches_local_cert_common_name"])


if __name__ == "__main__":
    unittest.main()
