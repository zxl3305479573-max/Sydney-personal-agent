"""Compare matching profile metadata in memory without exposing identifiers."""

import asyncio
import json
import logging
import os
from pathlib import Path
import plistlib

from cryptography import x509
from cryptography.x509.oid import NameOID
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.installation_proxy import InstallationProxyService
from pymobiledevice3.services.misagent import MisagentService
from pymobiledevice3.usbmux import list_devices


def parse_profile(data):
    start = data.find(b"<?xml")
    end = data.find(b"</plist>", start)
    if start < 0 or end < 0:
        raise ValueError("profile plist absent")
    result = plistlib.loads(data[start : end + len(b"</plist>")])
    if not isinstance(result, dict):
        raise ValueError("invalid profile")
    return result


def app_matches(identifier, meta):
    values = (identifier, meta.get("CFBundleDisplayName"), meta.get("CFBundleName"))
    return any(
        isinstance(value, str) and any(word in value.casefold() for word in ("sydney", "rakazo"))
        for value in values
    )


def app_identifier(profile):
    entitlements = profile.get("Entitlements")
    if not isinstance(entitlements, dict):
        return None
    identifier = entitlements.get("application-identifier")
    return identifier if isinstance(identifier, str) and identifier else None


def summarize(apps, device_profiles, local_profiles):
    matches = [meta for identifier, meta in apps.items() if app_matches(identifier, meta)]
    result = {"status": "ok", "matching_apps": len(matches)}
    if len(matches) != 1:
        return result
    identifier = app_identifier(matches[0])
    if identifier is None:
        return {**result, "status": "app_identity_unavailable"}
    device_matches = [(raw, parsed) for raw, parsed in device_profiles if app_identifier(parsed) == identifier]
    local_matches = [(raw, parsed) for raw, parsed in local_profiles if app_identifier(parsed) == identifier]
    raw_equal = 0
    uuid_equal = 0
    certificate_overlap = 0
    signer_match = False
    signer = matches[0].get("SignerIdentity")
    for local_raw, local_profile in local_matches:
        local_certificates = local_profile.get("DeveloperCertificates")
        if isinstance(signer, str) and signer and isinstance(local_certificates, list):
            for certificate in local_certificates:
                if not isinstance(certificate, bytes):
                    continue
                try:
                    subject = x509.load_der_x509_certificate(certificate).subject
                    names = subject.get_attributes_for_oid(NameOID.COMMON_NAME)
                    signer_match |= any(attribute.value == signer for attribute in names)
                except ValueError:
                    continue
        for device_raw, device_profile in device_matches:
            raw_equal += int(local_raw == device_raw)
            local_uuid = local_profile.get("UUID")
            uuid_equal += int(isinstance(local_uuid, str) and bool(local_uuid) and local_uuid == device_profile.get("UUID"))
            local_certs = local_profile.get("DeveloperCertificates")
            device_certs = device_profile.get("DeveloperCertificates")
            if isinstance(local_certs, list) and isinstance(device_certs, list):
                certificate_overlap += int(
                    any(isinstance(cert, bytes) and cert in device_certs for cert in local_certs)
                )
    return {
        **result,
        "matching_device_profiles": len(device_matches),
        "matching_local_profiles": len(local_matches),
        "same_raw_profile_pairs": raw_equal,
        "same_uuid_pairs": uuid_equal,
        "overlapping_certificate_pairs": certificate_overlap,
        "signer_matches_local_cert_common_name": signer_match,
    }


def read_local_profiles(root):
    if root.is_symlink() or not root.is_dir():
        return []
    directories = [root]
    directories.extend(child for child in root.iterdir() if not child.is_symlink() and child.is_dir())
    profiles = []
    for directory in directories:
        for path in directory.glob("*.mobileprovision"):
            if path.is_symlink() or not path.is_file():
                raise ValueError("unexpected profile file")
            with path.open("rb") as source:
                raw = source.read(4 * 1024 * 1024 + 1)
            if len(raw) > 4 * 1024 * 1024:
                raise ValueError("profile too large")
            profiles.append((raw, parse_profile(raw)))
    return profiles


async def inspect():
    devices = await list_devices()
    if len(devices) != 1:
        return {"status": "unexpected_device_count", "device_count": len(devices)}
    client = await create_using_usbmux(autopair=False, connection_type="USB")
    try:
        async with InstallationProxyService(lockdown=client) as proxy:
            apps = await proxy.get_apps(application_type="User")
        async with MisagentService(lockdown=client) as misagent:
            device_profiles = await misagent.copy_all()
        root = Path(os.environ["LOCALAPPDATA"]) / "iPASide" / "signing"
        local_profiles = read_local_profiles(root)
        return summarize(apps, [(profile.buf, profile.plist) for profile in device_profiles], local_profiles)
    finally:
        await client.close()


def main():
    logging.disable(logging.CRITICAL)
    try:
        result = asyncio.run(asyncio.wait_for(inspect(), timeout=25))
    except Exception as error:
        result = {"status": "failed", "error_type": type(error).__name__}
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
