#!/usr/bin/env python3
"""Run a temporary staging IP issuance with an independently armed restore guard."""

import base64
import http.client
import ipaddress
import json
import os
import re
import secrets
import socket
import ssl
import subprocess
import sys
import time
import urllib.request


DOCKER = "/usr/bin/docker"


def run(args, data=None, timeout=15):
    return subprocess.run(
        args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        timeout=timeout, check=True,
    ).stdout


def docker(container, *args, data=None, timeout=15):
    command = [DOCKER, "exec"]
    if data is not None:
        command.append("-i")
    return run([*command, container, *args], data, timeout)


def configuration(container, port):
    response = docker(container, "curl", "-fsS", "--max-time", "5", "-D", "-",
                      "http://127.0.0.1:%d/config/" % port)
    headers, separator, body = response.partition(b"\r\n\r\n")
    if not separator:
        raise RuntimeError("Missing Caddy response headers")
    etags = [line.split(b":", 1)[1].strip().decode("ascii")
             for line in headers.split(b"\r\n") if line.lower().startswith(b"etag:")]
    if len(etags) != 1 or "\n" in etags[0] or "\r" in etags[0]:
        raise RuntimeError("Missing Caddy configuration ETag")
    return json.loads(body), etags[0]


def domain_health(container, domain, path, lab):
    args = ["curl", "-fsS", "--max-time", "5", "--noproxy", "*"]
    if lab:
        args.append("--insecure")
    args.extend(["--resolve", domain + ":443:127.0.0.1", "https://" + domain + path])
    result = docker(container, *args)
    if lab:
        return result == b"original"
    return json.loads(result).get("ok") is True


def domain_probe(container, domain, path, lab):
    args = ["curl", "-sS", "--max-time", "5", "--noproxy", "*"]
    if lab:
        args.append("--insecure")
    args.extend(["--resolve", domain + ":443:127.0.0.1", "-o", "/dev/null",
                 "-w", "%{http_code}\n%{content_type}", "https://" + domain + path])
    status, content_type = docker(container, *args).decode().split("\n", 1)
    return int(status), content_type.partition(";")[0].strip().lower()


def domain_rpc_health(container, domain, lab):
    args = ["curl", "-fsS", "--max-time", "5", "--noproxy", "*"]
    if lab:
        args.append("--insecure")
    args.extend(["--resolve", domain + ":443:127.0.0.1",
                 "-H", "Content-Type: application/json", "-H", "Origin: rakazo://",
                 "--data-binary", '{"json":{}}', "https://" + domain + "/rpc/health"])
    body = docker(container, *args)
    return body == b"original" if lab else json.loads(body).get("json", {}).get("ok") is True


def domain_http_redirect(container, domain):
    return docker(container, "curl", "-sS", "--max-time", "5", "--noproxy", "*",
                  "--resolve", domain + ":80:127.0.0.1", "-o", "/dev/null",
                  "-w", "%{http_code} %{redirect_url}", "http://" + domain + "/health").decode()


def peer_certificate(domain=None):
    command = ["/usr/bin/openssl", "s_client", "-connect", "127.0.0.1:443", "-showcerts"]
    if domain:
        command.extend(["-servername", domain])
    else:
        command.append("-noservername")
    result = subprocess.run(command, input=b"", stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=8)
    return result.stdout + result.stderr


def certificate_details(data, ip=None):
    if b"-----BEGIN CERTIFICATE-----" not in data:
        raise ValueError("No peer certificate")
    command = ["/usr/bin/openssl", "x509", "-noout", "-fingerprint", "-sha256", "-issuer"]
    if ip:
        command.extend(["-checkip", ip])
    return run(command, data, timeout=8).decode()


def staging_context():
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    for path in ("letsencrypt-stg-root-x1.pem", "letsencrypt-stg-root-x2.pem",
                 "gen-y/root-ye.pem", "gen-y/root-yr.pem"):
        with urllib.request.urlopen(
            "https://letsencrypt.org/certs/staging/" + path, timeout=15
        ) as response:
            context.load_verify_locations(cadata=response.read(16384).decode("ascii"))
    return context


def main():
    if len(sys.argv) not in (2, 5):
        raise SystemExit("Usage: run-caddy-staging-guarded.py IPV4 [LAB_CONTAINER ADMIN_PORT DOMAIN]")
    ip = ipaddress.ip_address(sys.argv[1])
    if ip.version != 4 or not ip.is_global:
        raise ValueError("Expected a global IPv4 address")
    ip = str(ip)
    lab = len(sys.argv) == 5
    requested_container = sys.argv[2] if lab else "rakazo-prod-caddy-1"
    port = int(sys.argv[3]) if lab else 2019
    if not 1 <= port <= 65535:
        raise ValueError("Invalid admin port")
    guard = os.environ["SYDNEY_GUARD_BASE64"]
    transformer = os.environ["STAGING_TRANSFORM_BASE64"]
    observe_seconds = int(os.environ.get("STAGING_OBSERVE_SECONDS", "0"))
    if not 0 <= observe_seconds <= 20:
        raise ValueError("Invalid observation interval")
    base64.b64decode(guard, validate=True)
    base64.b64decode(transformer, validate=True)
    trust = staging_context()
    guard_entry = "import base64;exec(base64.b64decode(%r))" % guard
    transform_entry = "import base64;exec(base64.b64decode(%r))" % transformer

    if run(["/usr/bin/findmnt", "-n", "-o", "FSTYPE", "/run"]).strip() != b"tmpfs":
        raise RuntimeError("Guard state requires a tmpfs /run")
    info = json.loads(run([DOCKER, "inspect", requested_container]))[0]
    container = info["Id"]
    if not re.fullmatch(r"[0-9a-f]{64}", container) or not info["State"]["Running"]:
        raise RuntimeError("Caddy container is not running")
    if lab:
        labels = info["Config"].get("Labels") or {}
        if not labels.get("sydney.staging-reload-lab"):
            raise RuntimeError("Lab container label required")
        domain, path = sys.argv[4], "/"
    else:
        if info["Name"] != "/rakazo-prod-caddy-1":
            raise RuntimeError("Unexpected production container")
        domains = [item.partition("=")[2] for item in info["Config"]["Env"]
                   if item.startswith("RAKAZO_HOST=")]
        if len(domains) != 1:
            raise RuntimeError("Production hostname unavailable")
        domain, path = domains[0], "/health"
        if "/tmp" not in (info["HostConfig"].get("Tmpfs") or {}):
            raise RuntimeError("Production Caddy /tmp is not a tmpfs")
    if not re.fullmatch(r"[A-Za-z0-9.-]+", domain):
        raise ValueError("Invalid domain")
    started = info["State"]["StartedAt"]
    before, before_etag = configuration(container, port)
    if json.loads(docker(container, "cat", "/config/caddy/autosave.json")) != before:
        raise RuntimeError("Autosaved configuration differs from running configuration")
    if not domain_health(container, domain, path, lab):
        raise RuntimeError("Original domain health check failed")
    if not domain_rpc_health(container, domain, lab):
        raise RuntimeError("Original RPC health check failed")
    original_redirect = None if lab else domain_http_redirect(container, domain)
    if not lab and not original_redirect.startswith("308 "):
        raise RuntimeError("Original domain HTTP redirect is unavailable")
    probe_paths = ("/api/auth/get-session", "/rpc/health", "/")
    original_probes = {path: domain_probe(container, domain, path, lab) for path in probe_paths}
    baseline_certificate = certificate_details(peer_certificate(domain))
    token = secrets.token_hex(16)
    candidate = json.loads(run(
        ["/usr/bin/python3", "-I", "-c", transform_entry, ip, token],
        json.dumps(before, separators=(",", ":")).encode(),
    ))
    directory_name = "sydney-caddy-guard-" + token
    directory = "/run/" + directory_name
    stage_directory = "/tmp/sydney-ip-staging-" + token
    timer_name = "sydney-staging-" + token + "-restore"
    state = {"container": container, "started_at": started, "admin_port": port,
             "before": before, "candidate": candidate}
    guard_armed = False
    state_created = False
    load_attempted = False
    succeeded = False
    try:
        os.mkdir(directory, 0o700)
        state_created = True
        fd = os.open(directory + "/state.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump(state, output, separators=(",", ":"))
            output.flush()
            os.fsync(output.fileno())
        run(["/usr/bin/systemd-run", "--quiet", "--unit=" + timer_name, "--on-active=180",
             "--timer-property=AccuracySec=1s", "--remain-after-exit", "/usr/bin/python3",
             "-I", "-c", guard_entry, directory_name])
        guard_armed = True
        if run(["/usr/bin/systemctl", "is-active", timer_name + ".timer"]).strip() != b"active":
            raise RuntimeError("Restore timer is not active")
        print("Independent timed restore is armed.", flush=True)

        docker(container, "caddy", "validate", "--config", "-",
               data=json.dumps(candidate, separators=(",", ":")).encode(), timeout=30)
        current, etag = configuration(container, port)
        if current != before or etag != before_etag:
            raise RuntimeError("Running configuration changed before staging")
        load_attempted = True
        docker(container, "curl", "-fsS", "--max-time", "15", "-X", "POST",
               "-H", "Content-Type: application/json", "-H", "If-Match: " + etag,
               "--data-binary", "@-", "http://127.0.0.1:%d/config/" % port,
               data=json.dumps(candidate, separators=(",", ":")).encode(), timeout=20)
        if not domain_health(container, domain, path, lab):
            raise RuntimeError("Original domain health check failed after loading candidate")
        if not lab and domain_http_redirect(container, domain) != original_redirect:
            raise RuntimeError("Original domain HTTP redirect changed")
        print("Temporary candidate loaded; original domain remains healthy.", flush=True)
        for _ in range(100):
            try:
                files = docker(container, "find", stage_directory, "-type", "f",
                               "-name", "*.crt", "-print", timeout=5).decode().splitlines()
                if len(files) != 1 or not files[0].startswith(stage_directory + "/"):
                    raise ValueError("Staging certificate file unavailable")
                stored_details = certificate_details(docker(container, "cat", files[0]), ip)
                served_details = certificate_details(peer_certificate(), ip)
                if served_details == stored_details and ("STAGING" in served_details or "Fake" in served_details):
                    break
            except (ValueError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
                pass
            time.sleep(1)
        else:
            raise RuntimeError("Staging IP certificate not observed before timeout")
        if not domain_health(container, domain, path, lab):
            raise RuntimeError("Original domain health check failed after staging issuance")
        if certificate_details(peer_certificate(domain)) != baseline_certificate:
            raise RuntimeError("Original domain certificate changed")
        if not lab and domain_http_redirect(container, domain) != original_redirect:
            raise RuntimeError("Original domain HTTP redirect changed during issuance")
        with socket.create_connection(("127.0.0.1", 443), timeout=8) as connection:
            with trust.wrap_socket(connection, server_hostname=ip) as secure:
                secure.sendall(("GET /health HTTP/1.1\r\nHost: " + ip
                                + "\r\nConnection: close\r\n\r\n").encode("ascii"))
                response = http.client.HTTPResponse(secure)
                response.begin()
                status = response.status
                body = response.read(16384)
        if status != 200:
            raise RuntimeError("Staging IP health route failed")
        if (lab and body != b"original") or (not lab and json.loads(body).get("ok") is not True):
            raise RuntimeError("Unexpected staging IP health response")
        for probe_path in probe_paths:
            with socket.create_connection(("127.0.0.1", 443), timeout=8) as connection:
                with trust.wrap_socket(connection, server_hostname=ip) as secure:
                    secure.sendall(("GET " + probe_path + " HTTP/1.1\r\nHost: " + ip
                                    + "\r\nConnection: close\r\n\r\n").encode("ascii"))
                    response = http.client.HTTPResponse(secure)
                    response.begin()
                    actual = (response.status, response.getheader("Content-Type", "")
                              .partition(";")[0].strip().lower())
                    response.read(16384)
            if actual != original_probes[probe_path]:
                raise RuntimeError("Staging IP probe does not match original domain")
        rpc_body = b'{"json":{}}'
        with socket.create_connection(("127.0.0.1", 443), timeout=8) as connection:
            with trust.wrap_socket(connection, server_hostname=ip) as secure:
                secure.sendall(("POST /rpc/health HTTP/1.1\r\nHost: " + ip
                                + "\r\nOrigin: rakazo://\r\nContent-Type: application/json"
                                + "\r\nContent-Length: " + str(len(rpc_body))
                                + "\r\nConnection: close\r\n\r\n").encode("ascii") + rpc_body)
                response = http.client.HTTPResponse(secure)
                response.begin()
                rpc_status = response.status
                rpc_response = response.read(16384)
        if rpc_status != 200 or (lab and rpc_response != b"original") or (
            not lab and json.loads(rpc_response).get("json", {}).get("ok") is not True
        ):
            raise RuntimeError("Staging IP RPC health check failed")
        print("Staging IP trust chain, anonymous routes and RPC health verified; original domain unchanged.", flush=True)
        if observe_seconds:
            time.sleep(observe_seconds)
        succeeded = True
    finally:
        restored = False
        if guard_armed:
            try:
                run(["/usr/bin/python3", "-I", "-c", guard_entry, directory_name], timeout=30)
                restored = configuration(container, port)[0] == before
                if restored:
                    restored = domain_health(container, domain, path, lab)
                if restored and not lab:
                    restored = domain_http_redirect(container, domain) == original_redirect
            except (OSError, subprocess.SubprocessError, ValueError, RuntimeError):
                restored = False
            if restored:
                run(["/usr/bin/systemctl", "stop", timer_name + ".timer"])
                guard_armed = False
                print("Original runtime configuration and domain health restored.", flush=True)
                try:
                    docker(container, "sh", "-ec",
                           'if [ -L "$1" ]; then exit 1; fi; '
                           'if [ -d "$1" ]; then rm -rf -- "$1"; elif [ -e "$1" ]; then exit 1; fi',
                           "sh", stage_directory)
                    print("Temporary staging certificate storage removed.", flush=True)
                except (OSError, subprocess.SubprocessError):
                    succeeded = False
                    print("Temporary staging storage could not be removed.", flush=True)
            else:
                print("Restore not confirmed; independent timer and protected state remain.", flush=True)
                print("Restore timer: " + timer_name + ".timer", flush=True)
        if state_created and not guard_armed:
            os.unlink(directory + "/state.json")
            os.rmdir(directory)
        if load_attempted and not restored:
            succeeded = False
    if not succeeded:
        raise RuntimeError("Staging issuance was not completed")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError, RuntimeError) as error:
        print("Staging exercise failed: " + type(error).__name__, file=sys.stderr)
        sys.exit(1)
