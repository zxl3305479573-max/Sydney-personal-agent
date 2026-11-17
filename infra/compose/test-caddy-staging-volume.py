#!/usr/bin/env python3
"""Exercise staging account and certificate storage across container recreation."""

import hashlib
import ipaddress
import json
import os
import re
import secrets
import signal
import subprocess
import sys
import time


IMAGE = "sha256:df7f1c2fb114453b951de51a98efc010db1655a92c2e86be6706714e2417a78d"
MACHINE_SHA = "a549400a11c795ec5f10861037d168dab3fc06a4dde8b57ff6814b4ee52df52f"
DAEMON_ID = "d78f85ff-124f-4363-b925-10629b517a5a"
CLEANUP = r"""
import json, re, subprocess, sys
owner=sys.argv[1]
if not re.fullmatch(r"[0-9a-f]{32}",owner): raise ValueError("Invalid owner")
docker=["/usr/bin/docker","--host","unix:///var/run/docker.sock"]
def call(args,check=True):
 return subprocess.run(docker+args,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,check=check,timeout=20)
call(["info"])
for suffix in ("one","two"):
 name="sydney-stage-volume-"+owner+"-"+suffix
 result=call(["inspect",name],False)
 if result.returncode:
  continue
 info=json.loads(result.stdout)[0]
 if info["Name"]!="/"+name or info["Config"].get("Labels",{}).get("sydney.stage-volume-lab")!=owner:
  raise ValueError("Container identity mismatch")
 call(["rm","-fv",info["Id"]])
volume="sydney-stage-volume-"+owner
result=call(["volume","inspect",volume],False)
if result.returncode==0:
 info=json.loads(result.stdout)[0]
 if info["Name"]!=volume or (info.get("Labels") or {}).get("sydney.stage-volume-lab")!=owner:
  raise ValueError("Volume identity mismatch")
 call(["volume","rm",volume])
call(["info"])
"""


def run(args, data=None, timeout=20):
    return subprocess.run(
        args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        check=True, timeout=timeout,
    ).stdout


def main():
    if len(sys.argv) not in (2, 3) or (len(sys.argv) == 3 and sys.argv[2] != "--renewal"):
        raise SystemExit("Usage: test-caddy-staging-volume.py MAINTENANCE_IPV4 [--renewal]")
    renewal = len(sys.argv) == 3
    ip = ipaddress.ip_address(sys.argv[1])
    if ip.version != 4 or not ip.is_global or os.geteuid() != 0:
        raise ValueError("Root and a global IPv4 are required")
    ip = str(ip)
    with open("/etc/machine-id", "rb") as source:
        if hashlib.sha256(source.read(4097)).hexdigest() != MACHINE_SHA:
            raise ValueError("Unexpected maintenance host")
    docker = ["/usr/bin/docker", "--host", "unix:///var/run/docker.sock"]
    if run(docker + ["info", "--format", "{{.ID}}"]).decode().strip() != DAEMON_ID:
        raise ValueError("Unexpected Docker daemon")
    run(docker + ["image", "inspect", IMAGE])
    if run(["/usr/bin/ss", "-H", "-lnt", "( sport = :443 )"]).strip():
        raise RuntimeError("Maintenance TCP 443 is in use")

    owner = secrets.token_hex(16)
    volume = "sydney-stage-volume-" + owner
    timer = volume + "-cleanup"
    cleanup_code = CLEANUP
    timer_started = False
    cleaned = False
    config = {
        "admin": {"disabled": True},
        "apps": {
            "http": {"servers": {"stage": {
                "listen": [":443"], "protocols": ["h1", "h2"],
                "automatic_https": {"disable_redirects": True},
                "routes": [{"handle": [{"handler": "static_response", "body": "staging-volume"}]}],
                "tls_connection_policies": [{"default_sni": ip}],
            }}},
            "tls": {
                "certificates": {"automate": [ip]},
                "automation": {"policies": [{
                    "subjects": [ip],
                    "issuers": [{
                        "module": "acme",
                        "ca": "https://acme-staging-v02.api.letsencrypt.org/directory",
                        "profile": "shortlived",
                        "challenges": {"http": {"disabled": True}},
                    }],
                    "storage": {"module": "file_system", "root": "/stage"},
                }]},
            },
        },
    }
    if renewal:
        config["apps"]["tls"]["automation"]["renew_interval"] = 5000000000
        config["apps"]["tls"]["automation"]["policies"][0]["renewal_window_ratio"] = 0.9999

    def stop(_signum, _frame):
        raise SystemExit("Interrupted")

    for signum in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, stop)

    def create(suffix, network):
        result = run(docker + [
            "create", "--name", volume + "-" + suffix, "--label", "sydney.stage-volume-lab=" + owner,
            "--pull=never", "--network", network, "--read-only",
            "--tmpfs", "/data", "--tmpfs", "/config", "--tmpfs", "/tmp",
            "--mount", "type=volume,src=" + volume + ",dst=/stage",
            "--cap-drop", "ALL", "--cap-add", "NET_BIND_SERVICE",
            "--security-opt", "no-new-privileges", "--memory", "128m", "--pids-limit", "128",
            "-e", "STAGING_CONFIG=" + json.dumps(config, separators=(",", ":")),
            "--entrypoint", "sh", IMAGE, "-c",
            'printf "%s" "$STAGING_CONFIG" > /tmp/config.json; exec caddy run --config /tmp/config.json',
        ]).decode().strip()
        if not re.fullmatch(r"[0-9a-f]{64}", result):
            raise RuntimeError("Unexpected container ID")
        return result

    def files(container):
        result = run(docker + ["exec", container, "sh", "-ec",
                     'find /stage -type f -exec sha256sum {} \\; | LC_ALL=C sort'])
        rows = result.decode().splitlines()
        if not rows or any(not re.match(r"^[0-9a-f]{64}  /stage/", row) for row in rows):
            raise RuntimeError("Unexpected storage manifest")
        return rows

    def served(container):
        return run(docker + [
            "exec", container, "curl", "-fsSk", "--max-time", "5", "--noproxy", "*",
            "--resolve", ip + ":443:127.0.0.1", "https://" + ip + "/",
        ], timeout=8).strip() == b"staging-volume"

    try:
        run(["/usr/bin/systemd-run", "--quiet", "--unit=" + timer, "--on-active=180",
             "--timer-property=AccuracySec=1s", "/usr/bin/python3", "-I", "-c", cleanup_code, owner])
        timer_started = True
        result = run(docker + ["volume", "create", "--label", "sydney.stage-volume-lab=" + owner,
                               volume]).decode().strip()
        if result != volume:
            raise RuntimeError("Unexpected volume identity")
        first = create("one", "host")
        if run(["/usr/bin/ss", "-H", "-lnt", "( sport = :443 )"]).strip():
            raise RuntimeError("Maintenance TCP 443 became occupied")
        run(docker + ["start", first])
        manifest = []
        for _ in range(100):
            try:
                manifest = files(first)
                if any("/users/" in row and row.endswith(".key") for row in manifest) and any(
                    row.endswith(".crt") and "/certificates/" in row for row in manifest
                ) and served(first):
                    break
            except subprocess.SubprocessError:
                pass
            time.sleep(1)
        else:
            raise RuntimeError("Staging account and certificate were not observed")
        account = [row for row in manifest if "/users/" in row]
        cert = [row for row in manifest if row.endswith(".crt") and "/certificates/" in row]
        if not account or len(cert) != 1:
            raise RuntimeError("Unexpected staging storage content")
        if renewal:
            original_cert = cert[0]
            account_keys = [row for row in account if row.endswith(".key")]
            if not account_keys:
                raise RuntimeError("Staging account key unavailable")
            for _ in range(100):
                time.sleep(0.5)
                try:
                    current = files(first)
                    current_cert = [row for row in current
                                    if row.endswith(".crt") and "/certificates/" in row]
                    logs = subprocess.run(
                        docker + ["logs", first], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                        check=True, timeout=10,
                    )
                    messages = []
                    for line in (logs.stdout + logs.stderr).splitlines():
                        try:
                            messages.append(json.loads(line).get("msg"))
                        except (ValueError, AttributeError):
                            pass
                    if (len(current_cert) == 1 and current_cert[0] != original_cert
                            and "certificate renewed successfully" in messages):
                        if account_keys != [row for row in current if "/users/" in row and row.endswith(".key")]:
                            raise RuntimeError("Staging account key changed during renewal")
                        certificate_path = current_cert[0].split("  ", 1)[1]
                        certificate = run(docker + ["exec", first, "cat", certificate_path])
                        output = run(["/usr/bin/openssl", "x509", "-noout", "-checkip", ip, "-issuer"],
                                     certificate).decode()
                        if "STAGING" not in output and "Fake" not in output:
                            raise RuntimeError("Renewed certificate does not identify staging")
                        if not served(first):
                            raise RuntimeError("HTTPS unavailable after renewal")
                        stored_fingerprint = run(
                            ["/usr/bin/openssl", "x509", "-noout", "-fingerprint", "-sha256"],
                            certificate,
                        )
                        handshake = subprocess.run(
                            ["/usr/bin/openssl", "s_client", "-connect", "127.0.0.1:443",
                             "-noservername", "-showcerts"], input=b"", stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, timeout=8, check=False,
                        ).stdout
                        presented_fingerprint = run(
                            ["/usr/bin/openssl", "x509", "-noout", "-fingerprint", "-sha256"],
                            handshake,
                        )
                        if stored_fingerprint != presented_fingerprint:
                            continue
                        break
                except subprocess.SubprocessError:
                    continue
            else:
                raise RuntimeError("Automatic staging renewal was not observed before timeout")
            run(docker + ["stop", "--time", "5", first])
            print("Automatic staging renewal observed; certificate changed and account key remained stable.")
            print("Renewed IP SAN and staging issuer checked; HTTPS serves the renewed certificate.")
            print("Scope: accelerated maintenance test only; production renewal was not tested.")
            return
        run(docker + ["rm", "-f", first])
        second = create("two", "none")
        run(docker + ["start", second])
        for _ in range(50):
            try:
                if served(second):
                    break
            except subprocess.SubprocessError:
                pass
            time.sleep(0.2)
        else:
            raise RuntimeError("Recreated offline container did not serve HTTPS")
        after = files(second)
        if account != [row for row in after if "/users/" in row]:
            raise RuntimeError("Staging account files changed after recreation")
        if cert != [row for row in after if row.endswith(".crt") and "/certificates/" in row]:
            raise RuntimeError("Staging certificate changed after recreation")
        print("Staging account and certificate files survived container recreation.")
        print("Recreated network-isolated container served HTTPS from the same volume.")
        print("Scope: maintenance staging only; no renewal or production storage tested.")
    finally:
        try:
            run(["/usr/bin/python3", "-I", "-c", cleanup_code, owner], timeout=45)
            cleaned = True
        finally:
            if timer_started and cleaned:
                run(["/usr/bin/systemctl", "stop", timer + ".timer"])


if __name__ == "__main__":
    main()
