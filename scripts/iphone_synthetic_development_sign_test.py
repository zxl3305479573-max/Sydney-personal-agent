import plistlib
import unittest
from unittest.mock import patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import pkcs12

import iphone_synthetic_development_sign as probe


class SyntheticDevelopmentSignTests(unittest.TestCase):
    def test_synthetic_identity_and_profile_match(self):
        identity, profile_cms, certificate_der = probe.synthetic_material()
        key, certificate, chain = pkcs12.load_key_and_certificates(identity, probe.PASSWORD)
        self.assertIsNotNone(key)
        self.assertEqual(certificate.public_bytes(serialization.Encoding.DER), certificate_der)
        self.assertEqual(len(chain), 1)
        start = profile_cms.find(b"<?xml")
        end = profile_cms.find(b"</plist>", start)
        self.assertGreaterEqual(start, 0)
        profile = plistlib.loads(profile_cms[start : end + len(b"</plist>")])
        self.assertIn(certificate_der, profile["DeveloperCertificates"])
        self.assertEqual(
            profile["Entitlements"]["application-identifier"],
            probe.TEAM + "." + probe.runner_probe.SYNTHETIC_BUNDLE_ID,
        )

    def test_wrong_runner_is_rejected_before_starting_signer(self):
        with patch.object(probe.cms_probe, "read_bounded", return_value=b"untrusted"), patch.object(
            probe.subprocess, "run"
        ) as run:
            with self.assertRaisesRegex(ValueError, "runner digest"):
                probe.run()
            run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
