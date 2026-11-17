#!/usr/bin/env python3
"""Inspect a temporary staging candidate without loading or printing production configuration."""

import base64
import ipaddress
from pathlib import Path
import secrets
import shlex
import subprocess
import sys


REMOTE = r"""
import copy, json, os, subprocess, sys

ip, token, transformer, challenge = sys.argv[1:]
raw = subprocess.run(
    ["/usr/bin/docker", "exec", "rakazo-prod-caddy-1", "curl",
     "-fsS", "--max-time", "5", "http://127.0.0.1:2019/config/"],
    check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10,
).stdout
if len(raw) > 1048576:
    raise ValueError("Production configuration exceeds size limit")
original = json.loads(raw)
result = subprocess.run(
    ["/usr/bin/python3", "-I", "-c", transformer, ip, token],
    input=raw, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True, timeout=10,
    env={**os.environ, "STAGING_CHALLENGE": challenge},
)
candidate = json.loads(result.stdout)
restored = copy.deepcopy(candidate)
admin = restored.get("admin", {})
expected_admin = copy.deepcopy(original.get("admin", {}))
expected_admin.setdefault("config", {})["persist"] = False
if admin != expected_admin:
    raise ValueError("Unexpected admin configuration")
if "admin" in original:
    restored["admin"] = original["admin"]
else:
    del restored["admin"]
server = next(iter(restored["apps"]["http"]["servers"].values()))
original_server = next(iter(original["apps"]["http"]["servers"].values()))
domain = server["tls_connection_policies"][0]["match"]["sni"][0]
domain_routes = [route for route in original_server.get("routes",[])
                 if route.get("match") == [{"host":[domain]}]]
if len(domain_routes)!=1:
    raise ValueError("Unexpected original domain routes")
rpc_probe = server["routes"].pop()
expected_rpc_probe = {
    "match": [{"host":[ip], "method":["POST"], "path":["/rpc/health"]}],
    "handle": [
        {"handler":"headers", "request":{"delete":["Authorization","Proxy-Authorization","Cookie"]}},
        *domain_routes[0]["handle"],
    ],
    "terminal": True,
}
if rpc_probe!=expected_rpc_probe:
    raise ValueError("Unexpected RPC health route")
probe_route = server["routes"].pop()
expected_probe = {
    "match": [{"host":[ip], "method":["GET"],
               "path":["/api/auth/get-session", "/rpc/health", "/"]}],
    "handle": [
        {"handler":"headers", "request":{"delete":["Authorization","Proxy-Authorization","Cookie"]}},
        *domain_routes[0]["handle"],
    ],
    "terminal": True,
}
if probe_route!=expected_probe:
    raise ValueError("Unexpected anonymous probe route")
extra_route = server["routes"].pop()
if extra_route.get("match") != [{"host": [ip], "method": ["GET"], "path": ["/health"]}] or not extra_route.get("terminal"):
    raise ValueError("Unexpected IP health route")
health = []
def collect(node):
    if isinstance(node,dict):
        if any(item.get("path")==["/health"] for item in node.get("match",[]) if isinstance(item,dict)):
            health.append(node)
        for value in node.values(): collect(value)
    elif isinstance(node,list):
        for value in node: collect(value)
collect(original_server.get("routes",[]))
if len(health)!=1 or extra_route.get("handle")!=health[0].get("handle"):
    raise ValueError("IP health route does not match the existing handler")
extra = server["tls_connection_policies"].pop(1)
if extra != {"match": {"sni": ["", ip]}, "default_sni": ip}:
    raise ValueError("Unexpected additional TLS policy")
tls = restored["apps"]["tls"]
if tls["certificates"].pop("automate") != [ip]:
    raise ValueError("Unexpected managed certificate subjects")
automation = tls.pop("automation")
expected_policy = {
    "subjects": [ip],
    "issuers": [{
        "module": "acme",
        "ca": "https://acme-staging-v02.api.letsencrypt.org/directory",
        "profile": "shortlived",
        "challenges": ({"http":{"disabled":True}} if challenge=="tls-alpn-01"
                       else {"tls-alpn":{"disabled":True}}),
    }],
    "storage": {"module": "file_system", "root": "/tmp/sydney-ip-staging-" + token},
}
if automation != {"policies": [expected_policy]} or restored != original:
    raise ValueError("Candidate alters unexpected production configuration")
print("Production configuration matched expected shape.")
print("Added restricted IP probes, TLS selection, staging issuer and isolated storage; disabled autosave.")
print("Original configuration, existing HTTP routes and certificate references are unchanged.")
print("Candidate was not validated, loaded or persisted.")
"""


def main():
    if len(sys.argv) not in (2, 3):
        raise SystemExit("Usage: audit-caddy-staging-candidate.py PUBLIC_IPV4 [tls-alpn-01|http-01]")
    address = ipaddress.ip_address(sys.argv[1])
    if address.version != 4 or not address.is_global:
        raise SystemExit("A global IPv4 address is required")
    transformer = Path(__file__).with_name("prepare-caddy-staging-candidate.py").read_text(
        encoding="utf-8"
    )
    encoded_remote = base64.b64encode(REMOTE.encode()).decode()
    encoded_transformer = base64.b64encode(transformer.encode()).decode()
    code = (
        "import base64,sys;"
        "sys.argv[3]=base64.b64decode(sys.argv[3]).decode();"
        f"exec(base64.b64decode({encoded_remote!r}))"
    )
    challenge = sys.argv[2] if len(sys.argv) == 3 else "tls-alpn-01"
    if challenge not in ("tls-alpn-01", "http-01"):
        raise SystemExit("Unsupported ACME challenge")
    args = ["/usr/bin/python3", "-I", "-c", code, str(address), secrets.token_hex(16),
            encoded_transformer, challenge]
    command = " ".join(shlex.quote(arg) for arg in args)
    subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "sydney-cloud-admin", command],
        check=True, timeout=40,
    )


if __name__ == "__main__":
    main()
