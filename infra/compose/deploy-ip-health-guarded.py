#!/usr/bin/env python3
"""Deploy a health-only IP Caddyfile with a conditional timed rollback."""

import base64
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import ssl
import subprocess
import sys
import urllib.request


BUSINESS = len(sys.argv) == 2 and sys.argv[1] == "--business"
if sys.argv[1:] not in ([], ["--business"]):
    raise SystemExit("Usage: deploy-ip-health-guarded.py [--business]")

REMOTE = r'''
import base64, fcntl, hashlib, http.client, json, os, re, secrets, ssl, stat, subprocess, sys

DOCKER = "/usr/bin/docker"
FILE = "/etc/rakazo/Caddyfile.prod"
CONTAINER = "rakazo-prod-caddy-1"

def call(args, data=None, timeout=20):
    return subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          check=True, timeout=timeout).stdout

def docker(*args, data=None, timeout=20):
    command = [DOCKER, "exec"]
    if data is not None:
        command.append("-i")
    return call(command + [CONTAINER] + list(args), data, timeout)

def config():
    response = docker("curl", "-fsS", "--max-time", "5", "-D", "-",
                      "http://127.0.0.1:2019/config/")
    headers, sep, body = response.partition(b"\r\n\r\n")
    if not sep:
        raise ValueError("Missing Caddy response headers")
    etags = [line.split(b":", 1)[1].strip().decode("ascii") for line in headers.split(b"\r\n")
             if line.lower().startswith(b"etag:")]
    if len(etags) != 1:
        raise ValueError("Missing Caddy ETag")
    return json.loads(body), etags[0]

def read_file(fd):
    os.lseek(fd, 0, os.SEEK_SET)
    data = os.read(fd, 1048577)
    if len(data) > 1048576:
        raise ValueError("Caddyfile too large")
    return data

def write_file(fd, data):
    os.lseek(fd, 0, os.SEEK_SET)
    view = memoryview(data)
    while view:
        written = os.write(fd, view)
        if written <= 0:
            raise OSError("Caddyfile write failed")
        view = view[written:]
    os.ftruncate(fd, len(data))
    os.fsync(fd)

def interrupted_write(data, original, candidate):
    if data in (original, candidate):
        return True
    for offset in range(min(len(candidate), len(data)) + 1):
        if data == candidate[:offset] + original[offset:]:
            return True
    return False

def open_file(state):
    fd = os.open(FILE, os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC)
    fcntl.flock(fd, fcntl.LOCK_EX)
    info = os.fstat(fd)
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0
            or stat.S_IMODE(info.st_mode) != state["mode"]
            or info.st_dev != state["dev"] or info.st_ino != state["ino"]):
        os.close(fd)
        raise ValueError("Caddyfile identity changed")
    return fd

def load_state(name):
    if not re.fullmatch(r"sydney-ip-health-[0-9a-f]{32}", name):
        raise ValueError("Invalid state name")
    directory = "/run/" + name
    info = os.stat(directory, follow_symlinks=False)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError("Untrusted state directory")
    fd = os.open(directory + "/state.json", os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError("Untrusted state file")
        return json.loads(os.read(fd, 4194305))
    finally:
        os.close(fd)

def identity(state):
    info = json.loads(call([DOCKER, "inspect", CONTAINER]))[0]
    if (info["Id"] != state["container"] or info["State"]["StartedAt"] != state["started"]
            or not info["State"]["Running"]):
        raise ValueError("Caddy container identity changed")

def rollback(name):
    state = load_state(name)
    original = base64.b64decode(state["original"], validate=True)
    candidate = base64.b64decode(state["candidate"], validate=True)
    fd = open_file(state)
    try:
        current_file = read_file(fd)
        if not interrupted_write(current_file, original, candidate):
            raise ValueError("Caddyfile changed independently; refusing overwrite")
        if current_file != original:
            write_file(fd, original)
    finally:
        os.close(fd)
    identity(state)
    current, etag = config()
    if current == state["before"]:
        print("Original Caddy configuration already active.", flush=True)
        return
    if current != state["after"]:
        raise ValueError("Runtime configuration changed independently; refusing overwrite")
    docker("curl", "-fsS", "--max-time", "10", "-X", "POST", "-H",
           "Content-Type: application/json", "-H", "If-Match: " + etag,
           "--data-binary", "@-", "http://127.0.0.1:2019/config/",
           data=json.dumps(state["before"], separators=(",", ":")).encode())
    if config()[0] != state["before"]:
        raise ValueError("Runtime restoration unconfirmed")
    print("Original Caddyfile and runtime configuration restored.", flush=True)

def domain_health(domain):
    body = docker("curl", "-fsS", "--max-time", "5", "--noproxy", "*",
                  "--resolve", domain + ":443:127.0.0.1", "https://" + domain + "/health")
    return json.loads(body).get("ok") is True

def ip_health(address):
    import socket
    with socket.create_connection(("127.0.0.1", 443), timeout=8) as raw:
        with ssl.create_default_context().wrap_socket(raw, server_hostname=address) as connection:
            connection.sendall(("GET /health HTTP/1.1\r\nHost: " + address
                                + "\r\nConnection: close\r\n\r\n").encode())
            response = http.client.HTTPResponse(connection)
            response.begin()
            return response.status == 200 and json.loads(response.read(16384)).get("ok") is True

def apply(payload, source_code):
    if os.geteuid() != 0 or call(["/usr/bin/findmnt", "-n", "-o", "FSTYPE", "/run"]).strip() != b"tmpfs":
        raise ValueError("Requires root and tmpfs guard state")
    address = payload["ip"]
    if address != "124.221.182.39":
        raise ValueError("Unexpected production IP")
    original = base64.b64decode(payload["original"], validate=True)
    candidate = base64.b64decode(payload["candidate"], validate=True)
    if payload.get("business"):
        identifiers = call([DOCKER, "ps", "-q", "--no-trunc",
                            "--filter", "label=com.docker.compose.project=rakazo-prod",
                            "--filter", "label=com.docker.compose.service=api"]).decode().split()
        if len(identifiers) != 1:
            raise ValueError("Expected exactly one production API")
        apis = json.loads(call([DOCKER, "inspect", identifiers[0]]))
        expected = "sha256:acc903c111681c8c69b71beb3dca6bebcb9681ef308d776d6723cafbd820fe87"
        if (len(apis) != 1 or apis[0]["Image"] != expected
                or apis[0]["State"].get("Health", {}).get("Status") != "healthy"
                or "EXTRA_TRUSTED_ORIGINS=https://" + address not in apis[0]["Config"]["Env"]):
            raise ValueError("IP-compatible production API is not ready")
    if hashlib.sha256(original).hexdigest() != payload["original_digest"]:
        raise ValueError("Original digest mismatch")
    info = json.loads(call([DOCKER, "inspect", CONTAINER]))[0]
    if info["Name"] != "/" + CONTAINER or not info["State"]["Running"]:
        raise ValueError("Unexpected container")
    domain_values = [entry.partition("=")[2] for entry in info["Config"]["Env"]
                     if entry.startswith("RAKAZO_HOST=")]
    if len(domain_values) != 1 or not re.fullmatch(r"[A-Za-z0-9.-]+", domain_values[0]):
        raise ValueError("Unexpected domain")
    domain = domain_values[0]
    host_info = os.stat(FILE, follow_symlinks=False)
    state = {"container": info["Id"], "started": info["State"]["StartedAt"],
             "dev": host_info.st_dev, "ino": host_info.st_ino,
             "mode": stat.S_IMODE(host_info.st_mode),
             "original": base64.b64encode(original).decode(),
             "candidate": base64.b64encode(candidate).decode()}
    fd = open_file(state)
    try:
        if read_file(fd) != original or docker("cat", "/etc/caddy/Caddyfile") != original:
            raise ValueError("Caddyfile changed or bind mount differs")
    finally:
        os.close(fd)
    before, etag = config()
    adapted_before = json.loads(docker("caddy", "adapt", "--adapter", "caddyfile",
                                       "--config", "/dev/stdin", data=original))
    if before != adapted_before or not domain_health(domain):
        raise ValueError("Running configuration or domain differs from baseline")
    after = json.loads(docker("caddy", "adapt", "--adapter", "caddyfile",
                              "--config", "/dev/stdin", data=candidate))
    docker("caddy", "validate", "--config", "-", data=json.dumps(after).encode(), timeout=30)
    state["before"], state["after"] = before, after
    token = secrets.token_hex(16)
    name = "sydney-ip-health-" + token
    directory = "/run/" + name
    timer = name + "-restore"
    os.mkdir(directory, 0o700)
    with os.fdopen(os.open(directory + "/state.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as output:
        json.dump(state, output, separators=(",", ":"))
        output.flush()
        os.fsync(output.fileno())
    encoded = base64.b64encode(source_code).decode()
    call(["/usr/bin/systemd-run", "--quiet", "--unit=" + timer, "--on-active=180",
          "--timer-property=AccuracySec=1s", "--remain-after-exit", "/usr/bin/python3",
          "-I", "-c", "import base64;exec(base64.b64decode(%r))" % encoded,
          "rollback", name])
    if call(["/usr/bin/systemctl", "is-active", timer + ".timer"]).strip() != b"active":
        raise ValueError("Rollback timer not active")
    committed = False
    try:
        backup = FILE + ".before-ip-" + token
        with os.fdopen(os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb") as output:
            output.write(original)
            output.flush()
            os.fsync(output.fileno())
        fd = open_file(state)
        try:
            if read_file(fd) != original or config() != (before, etag):
                raise ValueError("Configuration changed before deployment")
            write_file(fd, candidate)
        finally:
            os.close(fd)
        docker("curl", "-fsS", "--max-time", "15", "-X", "POST", "-H",
               "Content-Type: application/json", "-H", "If-Match: " + etag,
               "--data-binary", "@-", "http://127.0.0.1:2019/config/",
               data=json.dumps(after, separators=(",", ":")).encode())
        if config()[0] != after or not domain_health(domain) or not ip_health(address):
            raise ValueError("Local health or configuration check failed")
        print("READY " + name, flush=True)
        if sys.stdin.readline().strip() != "COMMIT":
            raise ValueError("External verification not confirmed")
        if config()[0] != after or not domain_health(domain) or not ip_health(address):
            raise ValueError("Final health or configuration check failed")
        call(["/usr/bin/systemctl", "stop", timer + ".timer"])
        if call(["/usr/bin/systemctl", "show", timer + ".service",
                 "-p", "LoadState", "--value"]).strip() != b"not-found":
            call(["/usr/bin/systemctl", "stop", timer + ".service"])
        fd = open_file(state)
        try:
            if read_file(fd) != candidate or config()[0] != after:
                raise ValueError("Configuration changed while stopping rollback timer")
        finally:
            os.close(fd)
        committed = True
        print("COMMITTED backup=" + backup, flush=True)
    finally:
        if not committed:
            try:
                rollback(name)
                call(["/usr/bin/systemctl", "stop", timer + ".timer"])
            except Exception as error:
                print("ROLLBACK_UNCONFIRMED " + name + " " + type(error).__name__, flush=True)

if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "rollback":
        rollback(sys.argv[2])
    else:
        payload = json.loads(sys.stdin.readline())
        apply(payload, base64.b64decode(payload["remote"], validate=True))
'''


def main():
    address = "124.221.182.39"
    storage = "/data/sydney-ip-production-28c59232bfd078872e0d783a7d45a37a"
    original_digest = (
        "a75c54ffec7f4a24fac27155e87443f5fa71e7960c2ab8fc6f945bec8b544ce0"
        if BUSINESS else "d853fa688d25345264275fe3a337a977cf7d07f6b58e140a08fad1f8bd072460"
    )
    ssh = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "sydney-cloud-admin"]
    original = subprocess.run(
        ssh + ["docker exec rakazo-prod-caddy-1 cat /etc/caddy/Caddyfile"],
        stdout=subprocess.PIPE, check=True, timeout=20,
    ).stdout
    generator = Path(__file__).with_name(
        "prepare-ip-business-caddyfile.py" if BUSINESS else "prepare-ip-health-caddyfile.py"
    )
    arguments = ([address, original_digest] if BUSINESS else [address, storage, original_digest])
    candidate = subprocess.run(
        [sys.executable, str(generator), *arguments],
        input=original, stdout=subprocess.PIPE, check=True, timeout=20,
    ).stdout
    compile(REMOTE, "remote-guarded-deploy", "exec")
    encoded = base64.b64encode(REMOTE.encode()).decode()
    command = "sudo /usr/bin/python3 -I -u -c " + shlex.quote(
        "import base64;exec(base64.b64decode(%r))" % encoded
    )
    payload = {
        "ip": address, "original_digest": original_digest,
        "business": BUSINESS,
        "original": base64.b64encode(original).decode(),
        "candidate": base64.b64encode(candidate).decode(),
        "remote": encoded,
    }
    process = subprocess.Popen(ssh + [command], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True, encoding="utf-8")
    assert process.stdin is not None and process.stdout is not None
    process.stdin.write(json.dumps(payload) + "\n")
    process.stdin.flush()
    ready = False
    for line in process.stdout:
        print(line, end="", flush=True)
        if line.startswith("READY "):
            ready = True
            try:
                opener = urllib.request.build_opener(
                    urllib.request.ProxyHandler({}),
                    urllib.request.HTTPSHandler(context=ssl.create_default_context()),
                )
                with opener.open("https://" + address + "/health", timeout=10) as response:
                    result = json.loads(response.read(16384))
                    ok = response.status == 200 and result.get("ok") is True
                if BUSINESS and ok:
                    request = urllib.request.Request(
                        "https://" + address + "/rpc/health",
                        data=b'{"json":{}}',
                        headers={"Origin": "https://" + address, "Content-Type": "application/json"},
                    )
                    with opener.open(request, timeout=10) as response:
                        result = json.loads(response.read(16384))
                        ok = (response.status == 200 and result.get("json", {}).get("ok") is True
                              and response.headers.get("Access-Control-Allow-Origin")
                              == "https://" + address)
                    with opener.open("https://" + address + "/", timeout=10) as response:
                        ok = ok and response.status == 200 and (
                            response.headers.get_content_type() == "text/html"
                        )
            except Exception:
                ok = False
            process.stdin.write("COMMIT\n" if ok else "ROLLBACK\n")
            process.stdin.flush()
            print("independent_ip_https_health=" + str(ok), flush=True)
    status = process.wait()
    return status if status else (0 if ready else 1)


if __name__ == "__main__":
    raise SystemExit(main())
