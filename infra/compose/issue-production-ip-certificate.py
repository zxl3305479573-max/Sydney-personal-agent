#!/usr/bin/env python3
"""Issue an IP certificate with the existing guarded Caddy staging machinery."""

import base64
import ipaddress
import json
from pathlib import Path
import shlex
import subprocess
import sys


def replace_once(source, old, new):
    if source.count(old) != 1:
        raise ValueError("Unexpected guarded script version")
    return source.replace(old, new, 1)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: issue-production-ip-certificate.py PUBLIC_IPV4")
    address = ipaddress.ip_address(sys.argv[1])
    if address.version != 4 or not address.is_global:
        raise ValueError("Expected a global IPv4 address")
    directory = Path(__file__).resolve().parent
    transformer = (directory / "prepare-caddy-staging-candidate.py").read_text(encoding="utf-8")
    runner = (directory / "run-caddy-staging-guarded.py").read_text(encoding="utf-8")
    guard = (directory / "caddy-staging-guard.py").read_bytes()

    transformer = replace_once(
        transformer,
        "https://acme-staging-v02.api.letsencrypt.org/directory",
        "https://acme-v02.api.letsencrypt.org/directory",
    )
    transformer = replace_once(
        transformer, "/tmp/sydney-ip-staging-", "/data/sydney-ip-production-",
    )
    runner = replace_once(
        runner,
        '    if len(sys.argv) not in (2, 5):',
        '    if len(sys.argv) != 2:',
    )
    runner = replace_once(
        runner,
        '    trust = staging_context()',
        '    trust = ssl.create_default_context()',
    )
    runner = replace_once(
        runner,
        '    stage_directory = "/tmp/sydney-ip-staging-" + token',
        '    stage_directory = "/data/sydney-ip-production-" + token\n'
        '    docker(container, "sh", "-ec", \'test ! -e "$1" && test ! -L "$1"\','
        ' "sh", stage_directory)\n'
        '    print("Production certificate storage: " + stage_directory, flush=True)',
    )
    runner = replace_once(
        runner,
        'if served_details == stored_details and ("STAGING" in served_details or "Fake" in served_details):',
        'if served_details == stored_details and "STAGING" not in served_details and "Fake" not in served_details:',
    )
    runner = replace_once(
        runner,
        "Staging IP trust chain, anonymous routes and RPC health verified; original domain unchanged.",
        "Production IP trust chain, anonymous routes and RPC health verified; original domain unchanged.",
    )
    old_cleanup = '''                try:
                    docker(container, "sh", "-ec",
                           'if [ -L "$1" ]; then exit 1; fi; '
                           'if [ -d "$1" ]; then rm -rf -- "$1"; elif [ -e "$1" ]; then exit 1; fi',
                           "sh", stage_directory)
                    print("Temporary staging certificate storage removed.", flush=True)
                except (OSError, subprocess.SubprocessError):
                    succeeded = False
                    print("Temporary staging storage could not be removed.", flush=True)
'''
    runner = replace_once(
        runner, old_cleanup,
        '                print("Production certificate storage retained; automatic renewal is not configured.", flush=True)\n',
    )
    compile(transformer, "production-transformer", "exec")
    compile(runner, "production-runner", "exec")
    payload = json.dumps({
        "ip": str(address),
        "transformer": base64.b64encode(transformer.encode()).decode(),
        "runner": base64.b64encode(runner.encode()).decode(),
        "guard": base64.b64encode(guard).decode(),
    }).encode()
    remote = (
        "import base64,json,os,sys;"
        "p=json.load(sys.stdin);"
        "os.environ['STAGING_CHALLENGE']='http-01';"
        "os.environ['STAGING_TRANSFORM_BASE64']=p['transformer'];"
        "os.environ['SYDNEY_GUARD_BASE64']=p['guard'];"
        "sys.argv=['production-runner',p['ip']];"
        "exec(compile(base64.b64decode(p['runner']),'production-runner','exec'),"
        "{'__name__':'__main__'})"
    )
    encoded = base64.b64encode(remote.encode()).decode()
    command = "sudo /usr/bin/python3 -I -c " + shlex.quote(
        "import base64;exec(base64.b64decode(%r))" % encoded
    )
    result = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
         "sydney-cloud-admin", command],
        input=payload,
    )
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
