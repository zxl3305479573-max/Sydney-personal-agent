#!/usr/bin/env python3
"""Check a public IP's trusted TLS certificate and remaining lifetime."""

import argparse
from datetime import datetime, timezone
import ipaddress
import math
import socket
import ssl
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("ip", help="public IP address to check")
    parser.add_argument("--port", type=int, default=443)
    parser.add_argument("--warning-hours", type=float, default=72)
    parser.add_argument("--timeout", type=float, default=10)
    args = parser.parse_args()

    try:
        ip = ipaddress.ip_address(args.ip)
        if not ip.is_global:
            raise ValueError("address must be a public IP")
        if not 1 <= args.port <= 65535:
            raise ValueError("port must be between 1 and 65535")
        if not math.isfinite(args.warning_hours) or args.warning_hours <= 0:
            raise ValueError("warning-hours must be a positive finite number")
        if not math.isfinite(args.timeout) or not 0 < args.timeout <= 60:
            raise ValueError("timeout must be between 0 and 60 seconds")
        context = ssl.create_default_context()
        with socket.create_connection((str(ip), args.port), timeout=args.timeout) as connection:
            with context.wrap_socket(connection, server_hostname=str(ip)) as secure:
                certificate = secure.getpeercert()
        expires = datetime.fromtimestamp(
            ssl.cert_time_to_seconds(certificate["notAfter"]), tz=timezone.utc
        )
        remaining = (expires - datetime.now(timezone.utc)).total_seconds() / 3600
        if remaining <= args.warning_hours:
            print(f"WARNING: trusted IP certificate expires in {remaining:.1f} hours")
            return 1
        print(f"OK: trusted IP certificate expires in {remaining:.1f} hours")
        return 0
    except (OSError, ValueError, KeyError, OverflowError) as error:
        print(f"CRITICAL: IP certificate check failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
