"""Read-only aggregate of local iPASide signing materials; not an installation gate."""

import base64
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import plistlib

from cryptography import x509
from cryptography.hazmat.primitives import serialization


MAX_FILE_BYTES = 4 * 1024 * 1024


def bounded_read(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("not a regular file")
    with path.open("rb") as source:
        data = source.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise ValueError("file too large")
    return data


def parse_profile(data):
    start = data.find(b"<?xml")
    end = data.find(b"</plist>", start)
    if start < 0 or end < 0:
        raise ValueError("profile plist absent")
    result = plistlib.loads(data[start : end + len(b"</plist>")])
    if not isinstance(result, dict):
        raise ValueError("invalid profile")
    return result


def is_sydney_profile(profile):
    entitlements = profile.get("Entitlements")
    if not isinstance(entitlements, dict):
        entitlements = {}
    labels = (profile.get("Name"), profile.get("AppIDName"), entitlements.get("application-identifier"))
    return any(
        isinstance(value, str) and any(word in value.casefold() for word in ("sydney", "rakazo"))
        for value in labels
    )


def compare_cache(profile, cached, now):
    cert_der = base64.b64decode(cached["cert_der"], validate=True)
    key_pem = base64.b64decode(cached["key_pem"], validate=True)
    cert = x509.load_der_x509_certificate(cert_der)
    key = serialization.load_pem_private_key(key_pem, password=None)
    cert_public = cert.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    key_public = key.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    members = profile.get("DeveloperCertificates")
    expiry = profile.get("ExpirationDate")
    if isinstance(expiry, datetime) and expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    return {
        "certificate_in_profile": isinstance(members, list) and cert_der in members,
        "key_matches_certificate": cert_public == key_public,
        "certificate_unexpired": cert.not_valid_before_utc <= now < cert.not_valid_after_utc,
        "profile_unexpired": isinstance(expiry, datetime) and expiry > now,
    }


def inspect_root(root, now):
    result = {
        "matching_profiles": 0,
        "matching_profiles_with_cache": 0,
        "certificate_in_profile": 0,
        "key_matches_certificate": 0,
        "both_unexpired": 0,
        "errors": 0,
    }
    if root.is_symlink() or not root.is_dir():
        return result
    directories = [root]
    directories.extend(child for child in root.iterdir() if not child.is_symlink() and child.is_dir())
    for directory in directories:
        for profile_path in directory.glob("*.mobileprovision"):
            try:
                profile = parse_profile(bounded_read(profile_path))
                if not is_sydney_profile(profile):
                    continue
                result["matching_profiles"] += 1
                cache_path = directory / "certificate.json"
                if not cache_path.is_file() or cache_path.is_symlink():
                    continue
                result["matching_profiles_with_cache"] += 1
                cached = json.loads(bounded_read(cache_path))
                checks = compare_cache(profile, cached, now)
                result["certificate_in_profile"] += int(checks["certificate_in_profile"])
                result["key_matches_certificate"] += int(checks["key_matches_certificate"])
                result["both_unexpired"] += int(
                    checks["certificate_unexpired"] and checks["profile_unexpired"]
                )
            except Exception:
                result["errors"] += 1
    return result


def main():
    root = Path(os.environ["LOCALAPPDATA"]) / "iPASide" / "signing"
    print(json.dumps(inspect_root(root, datetime.now(timezone.utc)), sort_keys=True))


if __name__ == "__main__":
    main()
