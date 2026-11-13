"""Compare public local profile certificates to the pinned signer's embedded CAs."""

import hashlib
import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timezone

from cryptography import x509
from cryptography.exceptions import InvalidSignature, UnsupportedAlgorithm
from cryptography.hazmat.primitives.asymmetric import padding, rsa


sys.path.insert(0, str(Path(__file__).resolve().parent))
from iphone_local_identity_readonly import bounded_read, is_sydney_profile, parse_profile
from iphone_runner_cms_probe import read_bounded as read_signer
from iphone_synthetic_development_sign import SIGNER, SIGNER_SHA256


def valid_at(certificate, now):
    return certificate.not_valid_before_utc <= now < certificate.not_valid_after_utc


def is_ca(certificate):
    try:
        return certificate.extensions.get_extension_for_class(x509.BasicConstraints).value.ca
    except x509.ExtensionNotFound:
        return False


def directly_issued(certificate, issuer):
    try:
        certificate.verify_directly_issued_by(issuer)
        return True
    except ValueError:
        if (
            certificate is not issuer
            or certificate.subject != certificate.issuer
            or certificate.signature_algorithm_oid.dotted_string != "1.2.840.113549.1.1.5"
        ):
            return False
        try:
            public_key = certificate.public_key()
            if not isinstance(public_key, rsa.RSAPublicKey):
                return False
            public_key.verify(
                certificate.signature,
                certificate.tbs_certificate_bytes,
                padding.PKCS1v15(),
                certificate.signature_hash_algorithm,
            )
            return True
        except (ValueError, TypeError, InvalidSignature, UnsupportedAlgorithm):
            return False
    except (TypeError, InvalidSignature, UnsupportedAlgorithm):
        return False


def compare_public_chain(leaf, embedded, now):
    roots = [
        cert for cert in embedded
        if is_ca(cert) and cert.subject == cert.issuer and directly_issued(cert, cert)
    ]
    issuers = [cert for cert in embedded if is_ca(cert) and directly_issued(leaf, cert)]
    paths = [
        (issuer, root)
        for issuer in issuers
        for root in roots
        if directly_issued(issuer, root)
    ]
    return {
        "issuer_in_signer": bool(issuers),
        "chain_to_embedded_self_signed_ca": bool(paths),
        "chain_certificates_current": any(
            valid_at(leaf, now) and valid_at(issuer, now) and valid_at(root, now)
            for issuer, root in paths
        ),
    }


def load_embedded_certificates():
    data = read_signer(SIGNER)
    if hashlib.sha256(data).hexdigest() != SIGNER_SHA256:
        raise ValueError("signer digest mismatch")
    blocks = re.findall(
        b"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----", data, re.DOTALL
    )
    if not blocks or len(blocks) > 64:
        raise ValueError("unexpected embedded certificates")
    return [x509.load_pem_x509_certificate(block) for block in blocks]


def inspect(root, embedded, now):
    result = {
        "embedded_certificates": len(embedded),
        "matching_profiles": 0,
        "profile_certificates": 0,
        "issuer_in_signer": 0,
        "chain_to_embedded_self_signed_ca": 0,
        "chain_certificates_current": 0,
        "errors": 0,
    }
    if root.is_symlink() or not root.is_dir():
        return result
    directories = [root]
    directories.extend(child for child in root.iterdir() if not child.is_symlink() and child.is_dir())
    for directory in directories:
        for path in directory.glob("*.mobileprovision"):
            try:
                profile = parse_profile(bounded_read(path))
                if not is_sydney_profile(profile):
                    continue
                result["matching_profiles"] += 1
                certificates = profile.get("DeveloperCertificates")
                if not isinstance(certificates, list):
                    raise ValueError("invalid profile certificates")
                for raw in certificates:
                    leaf = x509.load_der_x509_certificate(raw)
                    result["profile_certificates"] += 1
                    for key, value in compare_public_chain(leaf, embedded, now).items():
                        result[key] += int(value)
            except Exception:
                result["errors"] += 1
    return result


def main():
    try:
        certificates = load_embedded_certificates()
        root = Path(os.environ["LOCALAPPDATA"]) / "iPASide" / "signing"
        result = inspect(root, certificates, datetime.now(timezone.utc))
    except Exception:
        result = {"status": "unavailable_or_invalid"}
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
