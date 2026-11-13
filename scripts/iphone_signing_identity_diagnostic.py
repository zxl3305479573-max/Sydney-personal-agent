"""Offline diagnostic only; results do not authorize signing or installation."""

from datetime import datetime, timezone

from cryptography import x509
from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import serialization


def _utc(value):
    if not isinstance(value, datetime):
        raise ValueError("invalid time")
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _application_matches(pattern, team_id, bundle_id):
    if not all(isinstance(value, str) and value for value in (pattern, team_id, bundle_id)):
        return False
    prefix = team_id + "."
    if not pattern.startswith(prefix):
        return False
    allowed = pattern[len(prefix) :]
    if allowed.endswith(".*") and allowed.count("*") == 1:
        base = allowed[:-1]
        return bundle_id.startswith(base) and len(bundle_id) > len(base)
    return "*" not in allowed and allowed == bundle_id


def diagnose_identity(cert_der, private_key_pem, profile, team_id, bundle_id, device_id, now):
    """Return failed checks for supplied data; no trust-chain or CMS verification."""
    failures = set()
    try:
        moment = _utc(now)
        certificate = x509.load_der_x509_certificate(cert_der)
        key = serialization.load_pem_private_key(private_key_pem, password=None)
        cert_public = certificate.public_key().public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
        )
        key_public = key.public_key().public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
        )
        if cert_public != key_public:
            failures.add("key_mismatch")
        if not certificate.not_valid_before_utc <= moment < certificate.not_valid_after_utc:
            failures.add("certificate_time")
    except (ValueError, TypeError, AttributeError, UnsupportedAlgorithm):
        failures.add("invalid_identity")
        try:
            moment = _utc(now)
        except (ValueError, TypeError, OverflowError):
            return frozenset(failures | {"invalid_time"})

    if not isinstance(profile, dict):
        return frozenset(failures | {"invalid_profile"})

    try:
        if not _utc(profile.get("CreationDate")) <= moment < _utc(profile.get("ExpirationDate")):
            failures.add("profile_time")
    except (ValueError, TypeError, OverflowError):
        failures.add("profile_time")

    teams = profile.get("TeamIdentifier")
    if not isinstance(teams, list) or not team_id or team_id not in teams:
        failures.add("profile_team")
    certificates = profile.get("DeveloperCertificates")
    if (
        not isinstance(certificates, list)
        or not isinstance(cert_der, bytes)
        or not cert_der
        or cert_der not in certificates
    ):
        failures.add("profile_certificate")
    devices = profile.get("ProvisionedDevices")
    if not isinstance(devices, list) or not device_id or device_id not in devices:
        failures.add("profile_device")
    entitlements = profile.get("Entitlements")
    if not isinstance(entitlements, dict):
        entitlements = {}
    if entitlements.get("get-task-allow") is not True:
        failures.add("debug_entitlement")
    if entitlements.get("com.apple.developer.team-identifier") != team_id or not team_id:
        failures.add("entitlement_team")
    if not _application_matches(entitlements.get("application-identifier"), team_id, bundle_id):
        failures.add("profile_application")
    return frozenset(failures)
