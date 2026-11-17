#!/usr/bin/env python3
"""Prepare a health-only IP site while preserving the existing Caddyfile."""

import hashlib
import ipaddress
import re
import sys


def main():
    if len(sys.argv) != 4:
        raise SystemExit("Usage: prepare-ip-health-caddyfile.py IPV4 STORAGE_ROOT SOURCE_SHA256")
    address = ipaddress.ip_address(sys.argv[1])
    storage = sys.argv[2]
    digest = sys.argv[3]
    if address.version != 4 or not address.is_global:
        raise ValueError("Expected a global IPv4 address")
    if not re.fullmatch(r"/data/sydney-ip-production-[0-9a-f]{32}", storage):
        raise ValueError("Unexpected certificate storage")
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ValueError("Invalid source digest")
    source = sys.stdin.buffer.read(1048577)
    if len(source) > 1048576 or hashlib.sha256(source).hexdigest() != digest:
        raise ValueError("Source does not match the expected Caddyfile")
    if not source.startswith(b"(access_log) {") or not source.endswith(b"\n"):
        raise ValueError("Unexpected source layout")
    prefix = (
        "{\n"
        f" default_sni {address}\n"
        " storage file_system {\n"
        f"  root {storage}\n"
        " }\n"
        "}\n\n"
    ).encode()
    site = (
        f"\n{address} {{\n"
        " tls {\n"
        "  issuer acme https://acme-v02.api.letsencrypt.org/directory {\n"
        "   profile shortlived\n"
        "   disable_tlsalpn_challenge\n"
        "  }\n"
        " }\n"
        " import access_log\n"
        " handle /health {\n"
        "  reverse_proxy api:3100\n"
        " }\n"
        " respond 404\n"
        "}\n"
    ).encode()
    sys.stdout.buffer.write(prefix + source + site)


if __name__ == "__main__":
    main()
