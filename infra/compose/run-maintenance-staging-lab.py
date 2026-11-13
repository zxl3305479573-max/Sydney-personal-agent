#!/usr/bin/env python3
"""Stream the staging lab and helpers to the existing maintenance host."""

import base64
import ipaddress
import json
from pathlib import Path
import shlex
import subprocess
import sys


REMOTE = r"""
import base64, json, os, subprocess, sys
payload = json.load(sys.stdin)
env = os.environ.copy()
for name in ("STAGING_TRANSFORM_BASE64", "SYDNEY_GUARD_BASE64", "STAGING_RUNNER_BASE64"):
    env[name] = payload[name]
if payload["http_validate"]:
    env["STAGING_CHALLENGE"] = "http-01"
    env["STAGING_VALIDATE_ONLY"] = "1"
script = base64.b64decode(payload["script"], validate=True)
result = subprocess.run([
    "/bin/bash", "-s", "--",
    "sha256:df7f1c2fb114453b951de51a98efc010db1655a92c2e86be6706714e2417a78d",
    payload["ip"],
], input=script, env=env)
sys.exit(result.returncode)
"""


def main():
    if sys.argv[1:] not in ([], ["--http-validate"]):
        raise SystemExit("Only --http-validate is accepted")
    ssh_config = subprocess.run(
        ["ssh", "-G", "sydney-backend-admin"], check=True, capture_output=True, text=True,
        timeout=15,
    ).stdout
    hosts = [line.split(maxsplit=1)[1] for line in ssh_config.splitlines()
             if line.startswith("hostname ")]
    if len(hosts) != 1:
        raise ValueError("Maintenance host address unavailable")
    address = ipaddress.ip_address(hosts[0])
    if address.version != 4 or not address.is_global:
        raise ValueError("Maintenance host must have a global IPv4 address")
    directory = Path(__file__).resolve().parent
    files = {
        "script": "test-caddy-staging-reload.sh",
        "STAGING_TRANSFORM_BASE64": "prepare-caddy-staging-candidate.py",
        "SYDNEY_GUARD_BASE64": "caddy-staging-guard.py",
        "STAGING_RUNNER_BASE64": "run-caddy-staging-guarded.py",
    }
    payload = {"ip": str(address), "http_validate": bool(sys.argv[1:])}
    for name, filename in files.items():
        payload[name] = base64.b64encode((directory / filename).read_bytes()).decode()
    code = "import base64;exec(base64.b64decode(%r))" % base64.b64encode(REMOTE.encode()).decode()
    command = " ".join(shlex.quote(arg) for arg in ["/usr/bin/python3", "-I", "-c", code])
    subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "sydney-backend-admin", command],
        input=json.dumps(payload).encode(), check=True, timeout=220,
    )


if __name__ == "__main__":
    main()
