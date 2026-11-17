#!/usr/bin/env python3
"""Observe an IP staging certificate from an independent network."""

import ipaddress
import http.client
import json
import socket
import ssl
import sys
import time
import urllib.request


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: observe-caddy-staging-ip.py PUBLIC_IPV4")
    ip = ipaddress.ip_address(sys.argv[1])
    if ip.version != 4 or not ip.is_global:
        raise ValueError("Expected a global IPv4 address")
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    for path in ("letsencrypt-stg-root-x1.pem", "letsencrypt-stg-root-x2.pem",
                 "gen-y/root-ye.pem", "gen-y/root-yr.pem"):
        with urllib.request.urlopen(
            "https://letsencrypt.org/certs/staging/" + path, timeout=15
        ) as response:
            context.load_verify_locations(cadata=response.read(16384).decode("ascii"))
    print("External staging observer ready.", flush=True)
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        try:
            probes = (
                ("/health", 200, "application/json"),
                ("/api/auth/get-session", 200, "application/json"),
                ("/rpc/health", 405, "application/json"),
                ("/", 200, "text/html"),
            )
            for path, expected_status, expected_type in probes:
                with socket.create_connection((str(ip), 443), timeout=4) as connection:
                    with context.wrap_socket(connection, server_hostname=str(ip)) as secure:
                        secure.sendall(("GET " + path + " HTTP/1.1\r\nHost: " + str(ip)
                                        + "\r\nConnection: close\r\n\r\n").encode("ascii"))
                        response = http.client.HTTPResponse(secure)
                        response.begin()
                        content_type = response.getheader("Content-Type", "").partition(";")[0].strip().lower()
                        body = response.read(16384)
                        if response.status != expected_status or content_type != expected_type:
                            raise ValueError("Unexpected public probe response")
                        if path == "/health" and json.loads(body).get("ok") is not True:
                            raise ValueError("Unexpected public health response")
            rpc_body = b'{"json":{}}'
            with socket.create_connection((str(ip), 443), timeout=4) as connection:
                with context.wrap_socket(connection, server_hostname=str(ip)) as secure:
                    secure.sendall(("POST /rpc/health HTTP/1.1\r\nHost: " + str(ip)
                                    + "\r\nOrigin: rakazo://\r\nContent-Type: application/json"
                                    + "\r\nContent-Length: " + str(len(rpc_body))
                                    + "\r\nConnection: close\r\n\r\n").encode("ascii") + rpc_body)
                    response = http.client.HTTPResponse(secure)
                    response.begin()
                    body = response.read(16384)
                    if response.status != 200 or json.loads(body).get("json", {}).get("ok") is not True:
                        raise ValueError("Unexpected public RPC health response")
            print("Public IP staging certificate chain, anonymous routes and RPC health verified.", flush=True)
            return
        except (OSError, ssl.SSLError, ValueError):
            time.sleep(1)
    raise RuntimeError("Public staging certificate was not observed before timeout")


if __name__ == "__main__":
    main()
