import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa
from cryptography.x509.oid import NameOID

from iphone_embedded_chain_readonly import compare_public_chain, directly_issued


class EmbeddedChainTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        root_key = ec.generate_private_key(ec.SECP256R1())
        issuer_key = ec.generate_private_key(ec.SECP256R1())
        leaf_key = ec.generate_private_key(ec.SECP256R1())
        root_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Synthetic Root")])
        issuer_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Synthetic Issuer")])
        leaf_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Synthetic Leaf")])

        def cert(subject, issuer, public_key, signer, ca, serial):
            return (
                x509.CertificateBuilder()
                .subject_name(subject)
                .issuer_name(issuer)
                .public_key(public_key)
                .serial_number(serial)
                .not_valid_before(self.now - timedelta(days=1))
                .not_valid_after(self.now + timedelta(days=1))
                .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
                .sign(signer, hashes.SHA256())
            )

        self.root = cert(root_name, root_name, root_key.public_key(), root_key, True, 1)
        self.issuer = cert(issuer_name, root_name, issuer_key.public_key(), root_key, True, 2)
        self.leaf = cert(leaf_name, issuer_name, leaf_key.public_key(), issuer_key, False, 3)
        impostor = ec.generate_private_key(ec.SECP256R1())
        self.impostor = cert(issuer_name, root_name, impostor.public_key(), root_key, True, 4)

    def test_matching_issuer_and_root(self):
        result = compare_public_chain(self.leaf, [self.root, self.issuer], self.now)
        self.assertTrue(all(result.values()))

    def test_missing_root_and_same_name_wrong_key(self):
        result = compare_public_chain(self.leaf, [self.issuer], self.now)
        self.assertTrue(result["issuer_in_signer"])
        self.assertFalse(result["chain_to_embedded_self_signed_ca"])
        result = compare_public_chain(self.leaf, [self.root, self.impostor], self.now)
        self.assertFalse(result["issuer_in_signer"])

    def test_expired_chain_is_not_current(self):
        result = compare_public_chain(self.leaf, [self.root, self.issuer], self.now + timedelta(days=2))
        self.assertTrue(result["chain_to_embedded_self_signed_ca"])
        self.assertFalse(result["chain_certificates_current"])

    def test_old_self_signed_root_fallback_checks_signature(self):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

        class SyntheticOldRoot:
            subject = issuer = "synthetic"
            signature_algorithm_oid = SimpleNamespace(dotted_string="1.2.840.113549.1.1.5")
            signature_hash_algorithm = hashes.SHA1()
            tbs_certificate_bytes = b"synthetic-root"
            signature = key.sign(tbs_certificate_bytes, padding.PKCS1v15(), hashes.SHA1())

            def verify_directly_issued_by(self, _issuer):
                raise ValueError("unsupported synthetic algorithm")

            def public_key(self):
                return key.public_key()

        root = SyntheticOldRoot()
        self.assertTrue(directly_issued(root, root))
        root.signature = b"tampered"
        self.assertFalse(directly_issued(root, root))


if __name__ == "__main__":
    unittest.main()
