#!/usr/bin/env python3
"""Run the isolated chat and Caddy integration drill on the maintenance host."""

import base64
import ipaddress
import json
from pathlib import Path
import re
import shlex
import socket
import subprocess
import sys
import time


REMOTE = r"""
import base64, json, os, subprocess, sys
payload = json.load(sys.stdin)
env = os.environ.copy()
env["SYDNEY_CADDY_CANDIDATE_BASE64"] = payload["candidate"]
if payload["browser"]:
    env["SYDNEY_STAGING_BROWSER_CHECK"] = "1"
script = base64.b64decode(payload["script"], validate=True)
result = subprocess.run(["/bin/bash", "-s"], input=script, env=env)
sys.exit(result.returncode)
"""


def main():
    if sys.argv[1:] not in ([], ["--browser"], ["--desktop"]):
        raise SystemExit("Only --browser or --desktop is accepted")
    browser = bool(sys.argv[1:])
    probe = "staging-desktop-probe.cjs" if sys.argv[1:] == ["--desktop"] else "staging-browser-probe.cjs"
    directory = Path(__file__).resolve().parent
    payload = {
        "script": base64.b64encode((directory / "staging-chat-drill.sh").read_bytes()).decode(),
        "candidate": base64.b64encode((directory / "Caddyfile.ip.example").read_bytes()).decode(),
        "browser": browser,
    }
    code = "import base64;exec(base64.b64decode(%r))" % base64.b64encode(REMOTE.encode()).decode()
    command = " ".join(shlex.quote(arg) for arg in ["/usr/bin/python3", "-I", "-c", code])
    if not browser:
        subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "sydney-backend-admin", command],
            input=json.dumps(payload).encode(),
            check=True,
        )
        return
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 5173))
    process = subprocess.Popen(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "sydney-backend-admin", command],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
    )
    assert process.stdin is not None and process.stdout is not None
    process.stdin.write(json.dumps(payload))
    process.stdin.close()
    browser_ok = False
    for line in process.stdout:
        if not line.startswith("browser-probe-ready="):
            print(line, end="", flush=True)
            continue
        address_text, separator, prefix = line.strip().partition("=")[2].partition(",")
        address = ipaddress.ip_address(address_text)
        if (address.version != 4 or not address.is_private or separator != ","
                or not re.fullmatch(r"sydney-chat-[0-9a-f]{16}", prefix)):
            raise ValueError("unexpected temporary container address")
        print("browser-probe-ready", flush=True)
        tunnel = subprocess.Popen([
            "ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
            "-o", "ExitOnForwardFailure=yes", "-N", "-L",
            f"127.0.0.1:5173:{address}:5173", "sydney-backend-admin",
        ])
        try:
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                if tunnel.poll() is not None:
                    raise RuntimeError("SSH tunnel failed")
                try:
                    with socket.create_connection(("127.0.0.1", 5173), timeout=0.5):
                        break
                except OSError:
                    time.sleep(0.2)
            else:
                raise RuntimeError("SSH tunnel did not become ready")
            browser_ok = subprocess.run(
                ["node", str(directory / probe)],
                check=False,
            ).returncode == 0
        finally:
            tunnel.terminate()
            tunnel.wait(timeout=10)
            subprocess.run([
                "ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
                "sydney-backend-admin", "docker", "exec", f"{prefix}-web",
                "touch", "/tmp/sydney-browser-probe-finished",
            ], check=True, timeout=15)
    result = process.wait()
    if result != 0 or not browser_ok:
        raise SystemExit("staging or browser probe failed")


if __name__ == "__main__":
    main()
