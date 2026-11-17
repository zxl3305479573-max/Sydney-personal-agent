"""Offline signature experiment for the fixed public iCTRL runner only."""

import hashlib
import io
import json
from pathlib import Path
import plistlib
import struct
import subprocess
import tempfile
import zipfile
from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import pkcs7
from cryptography.x509.oid import NameOID


ROOT = Path(__file__).resolve().parent.parent
RUNNER = ROOT / "artifacts/ios/iphone-control-probe/iCTRLUITests-Runner.ipa"
OPENSSL = Path(r"D:\anaconda\Library\bin\openssl.exe")
RUNNER_SHA256 = "67450de1524837b137b1ba0175ed16c8850b951ef0127c7c765aa8f3c4702652"
OPENSSL_SHA256 = "4b3f7f194445efc4bac827860842106aed656d6507527482bffd4faa321a2931"
TEST_ROOT = "Payload/iCTRLUITests-Runner.app/PlugIns/iCTRLUITests.xctest/"
MAX_BYTES = 32 * 1024 * 1024


def read_bounded(path):
    with path.open("rb") as source:
        value = source.read(MAX_BYTES + 1)
    if len(value) > MAX_BYTES:
        raise ValueError("file too large")
    return value


def extract_slots(binary):
    if len(binary) < 32 or binary[:4] != b"\xcf\xfa\xed\xfe":
        raise ValueError("unsupported macho")
    count, command_bytes = struct.unpack_from("<II", binary, 16)
    limit = 32 + command_bytes
    if limit > len(binary) or count > command_bytes // 8:
        raise ValueError("invalid commands")
    position = 32
    signature = None
    for _ in range(count):
        if position + 8 > limit:
            raise ValueError("invalid command")
        command, size = struct.unpack_from("<II", binary, position)
        if size < 8 or position + size > limit:
            raise ValueError("invalid command")
        if command == 0x1D:
            if size < 16 or signature is not None:
                raise ValueError("invalid signature command")
            offset, length = struct.unpack_from("<II", binary, position + 8)
            if not length or offset + length > len(binary):
                raise ValueError("invalid signature extent")
            signature = binary[offset : offset + length]
        position += size
    if signature is None or len(signature) < 12:
        raise ValueError("signature unavailable")
    magic, length, count = struct.unpack_from(">III", signature)
    if magic != 0xFADE0CC0 or length > len(signature) or length < 12 or count > (length - 12) // 8:
        raise ValueError("invalid signature container")
    wanted = {}
    index_end = 12 + count * 8
    for index in range(count):
        slot, offset = struct.unpack_from(">II", signature, 12 + index * 8)
        if slot not in (0, 0x10000):
            continue
        if slot in wanted or offset < index_end or offset + 8 > length:
            raise ValueError("invalid signature slot")
        blob_magic, size = struct.unpack_from(">II", signature, offset)
        if size < 8 or offset + size > length:
            raise ValueError("invalid signature blob")
        expected_magic = 0xFADE0C02 if slot == 0 else 0xFADE0B01
        if blob_magic != expected_magic:
            raise ValueError("unexpected signature blob")
        wanted[slot] = signature[offset : offset + size]
    if set(wanted) != {0, 0x10000}:
        raise ValueError("required signature slots missing")
    return wanted[0], wanted[0x10000][8:]


def verify_public_runner():
    runner_bytes = read_bounded(RUNNER)
    if hashlib.sha256(runner_bytes).hexdigest() != RUNNER_SHA256:
        raise ValueError("runner digest mismatch")
    if hashlib.sha256(read_bounded(OPENSSL)).hexdigest() != OPENSSL_SHA256:
        raise ValueError("openssl digest mismatch")
    with zipfile.ZipFile(io.BytesIO(runner_bytes)) as archive:
        info = plistlib.loads(archive.read(TEST_ROOT + "Info.plist"))
        executable = info.get("CFBundleExecutable")
        if not isinstance(executable, str) or not executable or "/" in executable or "\\" in executable:
            raise ValueError("invalid executable")
        entry = archive.getinfo(TEST_ROOT + executable)
        if entry.file_size > MAX_BYTES:
            raise ValueError("executable too large")
        code_directory, cms = extract_slots(archive.read(entry))
    with tempfile.TemporaryDirectory() as temporary:
        directory = Path(temporary)
        cms_path = directory / "signature.der"
        code_path = directory / "code-directory.bin"
        output_path = directory / "verified.bin"
        def check(signature, content):
            cms_path.write_bytes(signature)
            code_path.write_bytes(content)
            result = subprocess.run(
                [
                    str(OPENSSL), "cms", "-verify", "-binary", "-inform", "DER",
                    "-in", str(cms_path), "-content", str(code_path),
                    "-noverify", "-out", str(output_path),
                ],
                capture_output=True,
                timeout=15,
                check=False,
            )
            return result.returncode == 0

        if cms:
            valid = check(cms, code_directory)
            changed = bytearray(code_directory)
            changed[-1] ^= 1
            tampered = check(cms, bytes(changed))
            tampered_rejected = not tampered if valid else None
        else:
            valid = None
            tampered_rejected = None

        key = ec.generate_private_key(ec.SECP256R1())
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Synthetic")])
        now = datetime.now(timezone.utc)
        cert = (
            x509.CertificateBuilder()
            .subject_name(name)
            .issuer_name(name)
            .public_key(key.public_key())
            .serial_number(2026)
            .not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=1))
            .sign(key, hashes.SHA256())
        )
        synthetic_content = b"synthetic-code-directory"
        synthetic_cms = (
            pkcs7.PKCS7SignatureBuilder()
            .set_data(synthetic_content)
            .add_signer(cert, key, hashes.SHA256())
            .sign(serialization.Encoding.DER, [pkcs7.PKCS7Options.DetachedSignature, pkcs7.PKCS7Options.Binary])
        )
        synthetic_valid = check(synthetic_cms, synthetic_content)
        synthetic_tampered = check(synthetic_cms, synthetic_content + b"-tampered")
    return {
        "public_runner_digest_matches": True,
        "public_runner_cms_payload_present": bool(cms),
        "cms_signature_matches_code_directory": valid,
        "tampered_code_directory_rejected": tampered_rejected,
        "synthetic_cms_signature_verified": synthetic_valid,
        "synthetic_tampering_rejected": not synthetic_tampered if synthetic_valid else None,
        "certificate_chain_verified": False,
    }


def main():
    try:
        result = verify_public_runner()
    except (OSError, ValueError, KeyError, struct.error, subprocess.SubprocessError, zipfile.BadZipFile):
        result = {"status": "unavailable_or_invalid"}
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
