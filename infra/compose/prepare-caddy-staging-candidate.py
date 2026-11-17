#!/usr/bin/env python3
"""Create a temporary IP staging candidate from a narrowly expected Caddy JSON shape."""

import copy
import ipaddress
import json
import os
import re
import sys


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: prepare-caddy-staging-candidate.py PUBLIC_IPV4 RANDOM_TOKEN")
    address = ipaddress.ip_address(sys.argv[1])
    token = sys.argv[2]
    if address.version != 4 or not address.is_global:
        raise ValueError("A global IPv4 address is required")
    if not re.fullmatch(r"[0-9a-f]{32}", token):
        raise ValueError("A 128-bit lowercase hexadecimal token is required")
    challenge = os.environ.get("STAGING_CHALLENGE", "tls-alpn-01")
    if challenge not in ("tls-alpn-01", "http-01"):
        raise ValueError("Unsupported ACME challenge")

    raw = sys.stdin.buffer.read(1048577)
    if len(raw) > 1048576:
        raise ValueError("Configuration exceeds the size limit")
    original = json.loads(raw)
    candidate = copy.deepcopy(original)
    admin = candidate.setdefault("admin", {})
    admin_config = admin.setdefault("config", {})
    if admin_config.get("persist", True) is not True:
        raise ValueError("Unexpected existing admin persistence setting")
    admin_config["persist"] = False
    apps = candidate["apps"]
    servers = apps["http"]["servers"]
    if len(servers) != 1:
        raise ValueError("Expected exactly one HTTP server")
    server = next(iter(servers.values()))
    if server.get("listen") != [":443"]:
        raise ValueError("Unexpected server listener")

    policies = server["tls_connection_policies"]
    if not isinstance(policies, list) or len(policies) != 2 or policies[-1] != {}:
        raise ValueError("Unexpected TLS connection policies")
    domain_policy = policies[0]
    if set(domain_policy) != {"match", "certificate_selection"}:
        raise ValueError("Unexpected domain policy")
    match = domain_policy["match"]
    selection = domain_policy["certificate_selection"]
    if (set(match) != {"sni"} or len(match["sni"]) != 1
            or set(selection) != {"any_tag"} or len(selection["any_tag"]) != 1):
        raise ValueError("Unexpected domain certificate selection")

    tls = apps["tls"]
    if set(tls) != {"certificates"} or set(tls["certificates"]) != {"load_files"}:
        raise ValueError("Unexpected TLS certificate or automation configuration")
    certs = tls["certificates"]["load_files"]
    if (len(certs) != 1 or set(certs[0]) != {"certificate", "key", "tags"}
            or selection["any_tag"] != certs[0]["tags"]):
        raise ValueError("Unexpected file certificate")
    if any(not isinstance(value, str) or not value for value in (
        match["sni"][0], certs[0]["certificate"], certs[0]["key"]
    )):
        raise ValueError("Invalid domain or certificate path")

    ip = str(address)
    health_routes = []

    def find_health(node):
        if isinstance(node, dict):
            if any(item.get("path") == ["/health"] for item in node.get("match", [])
                   if isinstance(item, dict)):
                health_routes.append(node)
            for value in node.values():
                find_health(value)
        elif isinstance(node, list):
            for value in node:
                find_health(value)

    find_health(server.get("routes", []))
    if len(health_routes) != 1 or not health_routes[0].get("handle"):
        raise ValueError("Expected exactly one health route")
    server["routes"].append({
        "match": [{"host": [ip], "method": ["GET"], "path": ["/health"]}],
        "handle": copy.deepcopy(health_routes[0]["handle"]),
        "terminal": True,
    })
    original_routes = original["apps"]["http"]["servers"]
    original_server = next(iter(original_routes.values()))
    domain_routes = [route for route in original_server.get("routes", [])
                     if route.get("match") == [{"host": [match["sni"][0]]}]]
    if len(domain_routes) != 1 or not domain_routes[0].get("handle"):
        raise ValueError("Expected exactly one original domain route")
    server["routes"].append({
        "match": [{
            "host": [ip], "method": ["GET"],
            "path": ["/api/auth/get-session", "/rpc/health", "/"],
        }],
        "handle": [
            {"handler": "headers", "request": {
                "delete": ["Authorization", "Proxy-Authorization", "Cookie"],
            }},
            *copy.deepcopy(domain_routes[0]["handle"]),
        ],
        "terminal": True,
    })
    server["routes"].append({
        "match": [{"host": [ip], "method": ["POST"], "path": ["/rpc/health"]}],
        "handle": [
            {"handler": "headers", "request": {
                "delete": ["Authorization", "Proxy-Authorization", "Cookie"],
            }},
            *copy.deepcopy(domain_routes[0]["handle"]),
        ],
        "terminal": True,
    })
    policies.insert(1, {"match": {"sni": ["", ip]}, "default_sni": ip})
    tls["certificates"]["automate"] = [ip]
    tls["automation"] = {"policies": [{
        "subjects": [ip],
        "issuers": [{
            "module": "acme",
            "ca": "https://acme-staging-v02.api.letsencrypt.org/directory",
            "profile": "shortlived",
            "challenges": ({"http": {"disabled": True}} if challenge == "tls-alpn-01"
                           else {"tls-alpn": {"disabled": True}}),
        }],
        "storage": {
            "module": "file_system",
            "root": "/tmp/sydney-ip-staging-" + token,
        },
    }]}
    json.dump(candidate, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
