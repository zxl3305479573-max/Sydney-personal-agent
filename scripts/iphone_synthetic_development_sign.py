"""Sign only the pinned public runner with an ephemeral synthetic identity."""

from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import zipfile

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12, pkcs7
from cryptography.x509.oid import NameOID


sys.path.insert(0, str(Path(__file__).resolve().parent))
import iphone_runner_cms_probe as cms_probe
import iphone_runner_signing_probe as runner_probe


SIGNER = Path(
    r"C:\Users\33054\AppData\Local\Programs\iPASide\engine\python\Lib"
    r"\site-packages\ipaside_engine\vendor\zsign.exe"
)
SIGNER_SHA256 = "fd861f8f76bd44861e56117fb969647d2ad115b40d21237040c7947e0e872ea9"
TEAM = "SYNTHETIC1"
PASSWORD = b"synthetic-password"


def synthetic_material():
    issuer_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    issuer_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Synthetic Issuer")])
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Synthetic Development")])
    now = datetime.now(timezone.utc)
    issuer = (
        x509.CertificateBuilder()
        .subject_name(issuer_name)
        .issuer_name(issuer_name)
        .public_key(issuer_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=30))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(issuer_key, hashes.SHA256())
    )
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(issuer_name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=7))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .sign(issuer_key, hashes.SHA256())
    )
    certificate_der = certificate.public_bytes(serialization.Encoding.DER)
    entitlements = {
        "application-identifier": TEAM + "." + runner_probe.SYNTHETIC_BUNDLE_ID,
        "com.apple.developer.team-identifier": TEAM,
        "get-task-allow": True,
        "keychain-access-groups": [TEAM + ".*"],
    }
    profile = {
        "UUID": "00000000-0000-4000-8000-000000000000",
        "Name": "Synthetic Development",
        "TeamIdentifier": [TEAM],
        "ApplicationIdentifierPrefix": [TEAM],
        "CreationDate": (now - timedelta(days=1)).replace(tzinfo=None),
        "ExpirationDate": (now + timedelta(days=7)).replace(tzinfo=None),
        "DeveloperCertificates": [certificate_der],
        "Entitlements": entitlements,
        "ProvisionedDevices": ["synthetic-device"],
        "Version": 1,
    }
    profile_cms = (
        pkcs7.PKCS7SignatureBuilder()
        .set_data(plistlib.dumps(profile))
        .add_signer(certificate, key, hashes.SHA256())
        .sign(serialization.Encoding.DER, [pkcs7.PKCS7Options.Binary])
    )
    identity = pkcs12.serialize_key_and_certificates(
        b"synthetic", key, certificate, [issuer], serialization.BestAvailableEncryption(PASSWORD)
    )
    return identity, profile_cms, certificate_der


def verify_cms(directory, label, code_directory, cms, expected_certificate):
    if not cms:
        return {"payload_present": False, "verified": None, "tampered_rejected": None}
    signature = directory / (label + ".cms")
    code = directory / (label + ".code")
    output = directory / (label + ".out")
    signer = directory / (label + ".signer")
    signature.write_bytes(cms)

    def check(contents):
        code.write_bytes(contents)
        result = subprocess.run(
            [
                str(cms_probe.OPENSSL), "cms", "-verify", "-binary", "-inform", "DER",
                "-in", str(signature), "-content", str(code), "-noverify",
                "-signer", str(signer), "-out", str(output),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            timeout=15,
            check=False,
        )
        return result.returncode == 0

    verified = check(code_directory)
    signer_matches = False
    if verified and signer.is_file():
        try:
            signer_matches = (
                x509.load_pem_x509_certificate(signer.read_bytes()).public_bytes(serialization.Encoding.DER)
                == expected_certificate
            )
        except ValueError:
            pass
    changed = bytearray(code_directory)
    changed[-1] ^= 1
    rejected = not check(bytes(changed)) if verified else None
    return {
        "payload_present": True,
        "verified": verified,
        "signer_matches_synthetic_certificate": signer_matches,
        "tampered_rejected": rejected,
    }


def run():
    runner = cms_probe.read_bounded(cms_probe.RUNNER)
    if hashlib.sha256(runner).hexdigest() != cms_probe.RUNNER_SHA256:
        raise ValueError("runner digest mismatch")
    if hashlib.sha256(cms_probe.read_bounded(SIGNER)).hexdigest() != SIGNER_SHA256:
        raise ValueError("signer digest mismatch")
    if hashlib.sha256(cms_probe.read_bounded(cms_probe.OPENSSL)).hexdigest() != cms_probe.OPENSSL_SHA256:
        raise ValueError("openssl digest mismatch")

    with tempfile.TemporaryDirectory(prefix="sydney-synthetic-sign-") as temporary:
        directory = Path(temporary)
        source = directory / "runner.ipa"
        prepared = directory / "prepared.ipa"
        output = directory / "signed.ipa"
        scratch = directory / "scratch"
        scratch.mkdir()
        source.write_bytes(runner)
        runner_probe.prepare_synthetic_identifier(source, prepared)
        identity, profile, certificate = synthetic_material()
        identity_path = directory / "synthetic.p12"
        profile_path = directory / "synthetic.mobileprovision"
        identity_path.write_bytes(identity)
        profile_path.write_bytes(profile)
        environment = {key: os.environ[key] for key in ("SystemRoot", "WINDIR", "PATH") if key in os.environ}
        environment.update({"TEMP": str(scratch), "TMP": str(scratch), "TMPDIR": str(scratch)})
        result = subprocess.run(
            [
                str(SIGNER), "-k", str(identity_path), "-p", PASSWORD.decode(),
                "-m", str(profile_path), "-b", runner_probe.SYNTHETIC_BUNDLE_ID,
                "-t", str(scratch), "-o", str(output), str(prepared),
            ],
            cwd=directory,
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=60,
            check=False,
        )
        report = {"signer_exit_code": result.returncode, "apple_trust_verified": False}
        if result.returncode != 0:
            return report
        if not output.is_file() or output.stat().st_size > runner_probe.MAX_IPA_BYTES:
            raise ValueError("invalid signed output")
        inspected = runner_probe.inspect_archive(output)
        app, test = inspected["app"], inspected["test"]
        if app is None or test is None:
            return {**report, "expected_bundles_present": False}
        report["expected_bundles_present"] = True
        report["identifiers_match_target"] = (
            app["identifier"] == test["identifier"] == runner_probe.SYNTHETIC_BUNDLE_ID
        )
        with zipfile.ZipFile(output) as archive:
            for label, root in (("app", runner_probe.APP_ROOT), ("test", runner_probe.TEST_ROOT)):
                info = plistlib.loads(runner_probe.archive_member(archive, root + "Info.plist"))
                executable = info.get("CFBundleExecutable")
                if not isinstance(executable, str) or not executable or "/" in executable or "\\" in executable:
                    raise ValueError("invalid executable")
                binary = runner_probe.archive_member(archive, root + executable)
                code_directory, cms = cms_probe.extract_slots(binary)
                report[label + "_cms"] = verify_cms(directory, label, code_directory, cms, certificate)
                report[label + "_code_directories"] = inspected[label]["signature"]["code_directories"]
        return report


def main():
    try:
        result = run()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError, zipfile.BadZipFile):
        result = {"status": "unavailable_or_invalid"}
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
