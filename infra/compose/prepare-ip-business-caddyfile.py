#!/usr/bin/env python3
"""Mirror the existing domain routes onto the persistent IP site."""

import hashlib
import ipaddress
import re
import sys


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: prepare-ip-business-caddyfile.py IPV4 SOURCE_SHA256")
    address = ipaddress.ip_address(sys.argv[1])
    digest = sys.argv[2]
    if address.version != 4 or not address.is_global:
        raise ValueError("Expected a global IPv4 address")
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ValueError("Invalid source digest")
    original = sys.stdin.buffer.read(1048577)
    if len(original) > 1048576 or hashlib.sha256(original).hexdigest() != digest:
        raise ValueError("Caddyfile differs from reviewed source")
    domain_start = b"{$RAKAZO_HOST:app.example.com} {\n"
    boundary = f"\n}}\n\n{address} {{\n".encode()
    if original.count(domain_start) != 1 or original.count(boundary) != 1:
        raise ValueError("Unexpected site layout")
    domain_body = original.split(domain_start, 1)[1].split(boundary, 1)[0]
    tls_line = b"\ttls /data/certs/fullchain.pem /data/certs/privkey.pem\n"
    if not domain_body.startswith(tls_line):
        raise ValueError("Unexpected domain certificate")
    shared_body = domain_body[len(tls_line):]
    health_site = (
        f"\n}}\n\n{address} {{\n"
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
    if not original.endswith(health_site):
        raise ValueError("Unexpected IP health site")
    business_site = (
        f"\n}}\n\n{address} {{\n"
        " tls {\n"
        "  issuer acme https://acme-v02.api.letsencrypt.org/directory {\n"
        "   profile shortlived\n"
        "   disable_tlsalpn_challenge\n"
        "  }\n"
        " }\n"
    ).encode() + shared_body + b"\n}\n"
    sys.stdout.buffer.write(original[:-len(health_site)] + business_site)


if __name__ == "__main__":
    main()
