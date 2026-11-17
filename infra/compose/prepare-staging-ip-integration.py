#!/usr/bin/env python3
"""Adapt the candidate IP configuration for a synthetic staging route check."""

from pathlib import Path
import sys

source = Path(__file__).with_name("Caddyfile.ip.example").read_text(encoding="utf-8")
changes = (
    ("{\n\tdefault_sni", "{\n\tadmin off\n\tauto_https disable_redirects\n\tdefault_sni", 1),
    ("disable_tlsalpn_challenge", "disable_http_challenge", 1),
    ("reverse_proxy api:3100", "reverse_proxy 127.0.0.1:3100", 3),
    ("reverse_proxy web:5173", "reverse_proxy 127.0.0.1:5173", 1),
)
for before, after, count in changes:
    if source.count(before) != count:
        raise SystemExit("Candidate configuration differs from the expected layout.")
    source = source.replace(before, after)
sys.stdout.write(source)
