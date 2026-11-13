#!/usr/bin/env python3
"""Prepare a narrow production API override from a pinned Compose overlay."""

import hashlib
import ipaddress
import re
import sys


def main():
    if len(sys.argv) != 4:
        raise SystemExit("Usage: prepare-ip-api-overlay.py IPV4 IMAGE_ID SOURCE_SHA256")
    address = ipaddress.ip_address(sys.argv[1])
    image = sys.argv[2]
    digest = sys.argv[3]
    if address.version != 4 or not address.is_global:
        raise ValueError("Expected a global IPv4 address")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", image):
        raise ValueError("Expected a full Docker image ID")
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ValueError("Invalid source digest")
    original = sys.stdin.buffer.read(1048577)
    if len(original) > 1048576 or hashlib.sha256(original).hexdigest() != digest:
        raise ValueError("Overlay differs from reviewed source")
    anchor = b"  api:\n    environment:\n"
    if original.count(anchor) != 1 or b"EXTRA_TRUSTED_ORIGINS:" in original:
        raise ValueError("Unexpected API overlay layout")
    api_section = original.split(b"  api:\n", 1)[1].split(b"\n  worker:", 1)[0]
    if b"\n    image:" in api_section:
        raise ValueError("Existing API image override")
    replacement = (
        f"  api:\n    image: {image}\n    environment:\n"
        f"      EXTRA_TRUSTED_ORIGINS: https://{address}\n"
    ).encode()
    sys.stdout.buffer.write(original.replace(anchor, replacement, 1))


if __name__ == "__main__":
    main()
