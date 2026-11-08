"""Create a new SSH known-hosts file after verifying a supplied fingerprint."""

import argparse
import base64
import binascii
import hashlib
import hmac
import os
import struct
import sys
from pathlib import Path

from inspect_remote import InspectionError, validate_host

ALGORITHMS = {"ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521"}
MAX_KEY_LENGTH = 16384


def parse_public_key(public_key):
    parts = public_key.strip().split()
    if len(parts) < 2 or parts[0] not in ALGORITHMS or len(parts[1]) > MAX_KEY_LENGTH:
        raise InspectionError("invalid_host_key")
    try:
        blob = base64.b64decode(parts[1], validate=True)
    except (ValueError, binascii.Error) as exc:
        raise InspectionError("invalid_host_key") from exc
    if len(blob) < 5:
        raise InspectionError("invalid_host_key")
    length = struct.unpack(">I", blob[:4])[0]
    if length > len(blob) - 4 or blob[4:4 + length] != parts[0].encode("ascii"):
        raise InspectionError("invalid_host_key")
    encoded = base64.b64encode(blob).decode("ascii")
    fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode("ascii").rstrip("=")
    return parts[0], encoded, fingerprint


def create_known_hosts(host, port, public_key, expected_fingerprint, output):
    validate_host(host)
    if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
        raise InspectionError("invalid_port")
    algorithm, encoded, fingerprint = parse_public_key(public_key)
    if not isinstance(expected_fingerprint, str) or not expected_fingerprint.isascii() or not hmac.compare_digest(
        fingerprint, expected_fingerprint
    ):
        raise InspectionError("host_fingerprint_mismatch")
    hostname = host if port == 22 else f"[{host}]:{port}"
    line = f"{hostname} {algorithm} {encoded}\n".encode("ascii")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(output, flags, 0o600)
        with os.fdopen(descriptor, "wb") as file:
            file.write(line)
    except OSError as exc:
        raise InspectionError("known_hosts_creation_failed") from exc
    return fingerprint


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, default=22)
    parser.add_argument("--public-key-file", type=Path, required=True)
    parser.add_argument("--fingerprint", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        public_key = args.public_key_file.read_text(encoding="utf-8")
        if len(public_key) > MAX_KEY_LENGTH:
            raise InspectionError("invalid_host_key")
        fingerprint = create_known_hosts(
            args.host, args.port, public_key, args.fingerprint, args.output
        )
    except (OSError, UnicodeError):
        print("public_key_unavailable", file=sys.stderr)
        return 1
    except InspectionError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(fingerprint)
    return 0


if __name__ == "__main__":
    sys.exit(main())
