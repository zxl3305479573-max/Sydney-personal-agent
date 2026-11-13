#!/usr/bin/env python3
"""Exercise Caddy's configuration concurrency guard in a temporary container."""

import base64
import hashlib
import json
import os
import secrets
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request


IMAGE = "sha256:df7f1c2fb114453b951de51a98efc010db1655a92c2e86be6706714e2417a78d"


def command(*args, input_data=None):
    return subprocess.run(
        args, input=input_data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        check=True, timeout=20,
    ).stdout


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def request(opener, base, path, method="GET", data=None, etag=None):
    headers = {}
    if data is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(data, separators=(",", ":")).encode()
    if etag is not None:
        headers["If-Match"] = etag
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with opener.open(req, timeout=5) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read()


def main():
    if len(sys.argv) != 1:
        raise SystemExit("No arguments are accepted")
    command("docker", "image", "inspect", IMAGE)
    admin_port, http_port = free_port(), free_port()
    if admin_port == http_port:
        raise RuntimeError("Port collision")
    owner = secrets.token_hex(16)
    name = "sydney-etag-lab-" + owner
    guard_name = "sydney-caddy-guard-" + owner
    guard_path = "/run/" + guard_name
    guard_code = os.environ.get("SYDNEY_GUARD_BASE64", "")
    if not guard_code:
        raise RuntimeError("Provide the base64-encoded guard")
    base64.b64decode(guard_code, validate=True)
    container = None
    timer_started = False
    guard_timer_started = False
    guard_dir_created = False
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    base = "http://127.0.0.1:%d" % admin_port
    site = "http://127.0.0.1:%d" % http_port
    original = {
        "admin": {"listen": "127.0.0.1:%d" % admin_port},
        "apps": {"http": {"servers": {"lab": {
            "listen": ["127.0.0.1:%d" % http_port],
            "routes": [{"handle": [{"handler": "static_response", "body": "original"}]}],
        }}}},
    }

    def stop(_signum, _frame):
        raise SystemExit("Interrupted")

    for signum in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, stop)

    def get_config():
        status, headers, body = request(opener, base, "/config/")
        if status != 200 or not headers.get("Etag"):
            raise RuntimeError("Configuration or ETag unavailable")
        return json.loads(body), headers["Etag"]

    def put_config(config, tag):
        return request(opener, base, "/config/", method="POST", data=config, etag=tag)[0]

    def site_body():
        status, _, body = request(opener, site, "/")
        if status != 200:
            raise RuntimeError("Synthetic site request failed")
        return body.decode()

    def saved_hash():
        data = command(
            "docker", "exec", container, "cat", "/config/caddy/autosave.json",
        )
        return hashlib.sha256(data).hexdigest()

    try:
        initial = json.dumps(original, separators=(",", ":"))
        container = command(
            "docker", "create", "--name", name, "--label", "sydney.etag-lab=" + owner,
            "--pull=never", "--network", "host", "--read-only",
            "--tmpfs", "/data", "--tmpfs", "/config", "--tmpfs", "/tmp",
            "--cap-drop", "ALL", "--cap-add", "NET_BIND_SERVICE",
            "--security-opt", "no-new-privileges",
            "--memory", "128m", "--pids-limit", "128",
            "-e", "INITIAL_CONFIG=" + initial, "--entrypoint", "sh", IMAGE,
            "-c", 'printf "%s" "$INITIAL_CONFIG" > /tmp/config.json; exec caddy run --config /tmp/config.json',
        ).decode().strip()
        if len(container) != 64 or any(char not in "0123456789abcdef" for char in container):
            raise RuntimeError("Unexpected container ID")
        command("systemd-run", "--quiet", "--unit=" + name + "-cleanup", "--on-active=120",
                "/usr/bin/docker", "rm", "-fv", container)
        timer_started = True
        command("docker", "start", container)
        last_error = None
        for _ in range(50):
            try:
                current, original_tag = get_config()
                if site_body() == "original":
                    break
            except (OSError, RuntimeError) as error:
                last_error = error
            time.sleep(0.2)
        else:
            logs = subprocess.run(
                ["docker", "logs", container], stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, timeout=10, check=True,
            ).stdout.decode(errors="replace")[-2000:]
            raise RuntimeError("Synthetic Caddy did not start: %s; logs: %s" % (last_error, logs))
        if current != original:
            raise RuntimeError("Unexpected initial configuration")
        original_autosave = saved_hash()

        candidate = json.loads(json.dumps(original))
        candidate["apps"]["http"]["servers"]["lab"]["routes"][0]["handle"][0]["body"] = "candidate"
        if put_config(candidate, original_tag) != 200 or site_body() != "candidate":
            raise RuntimeError("Guarded candidate load failed")
        candidate_config, candidate_tag = get_config()
        if candidate_config != candidate or candidate_tag == original_tag:
            raise RuntimeError("Candidate ETag or configuration mismatch")
        if put_config(original, original_tag) != 412 or site_body() != "candidate":
            raise RuntimeError("Stale ETag did not prevent rollback")
        if put_config(original, candidate_tag) != 200 or site_body() != "original":
            raise RuntimeError("Guarded rollback failed")
        print("ETag guarded load and rollback succeeded; stale ETag was rejected.")

        _, current_tag = get_config()
        no_persist = json.loads(json.dumps(original))
        no_persist["admin"]["config"] = {"persist": False}
        no_persist["apps"]["http"]["servers"]["lab"]["routes"][0]["handle"][0]["body"] = "temporary"
        before_no_persist = saved_hash()
        if put_config(no_persist, current_tag) != 200 or site_body() != "temporary":
            raise RuntimeError("Nonpersistent candidate load failed")
        after_no_persist = saved_hash()
        _, temporary_tag = get_config()
        if put_config(original, temporary_tag) != 200 or site_body() != "original":
            raise RuntimeError("Rollback after nonpersistent candidate failed")
        final_autosave = saved_hash()
        print("Autosave unchanged during persist=false load:", before_no_persist == after_no_persist)
        print("Original autosave restored after rollback:", original_autosave == final_autosave)

        if command("findmnt", "-n", "-o", "FSTYPE", "/run").decode().strip() != "tmpfs":
            raise RuntimeError("Guard state requires tmpfs")
        os.mkdir(guard_path, 0o700)
        guard_dir_created = True
        started = command(
            "docker", "inspect", "--format", "{{.State.StartedAt}}", container,
        ).decode().strip()
        state = {
            "container": container, "started_at": started, "admin_port": admin_port,
            "before": original, "candidate": no_persist,
        }
        fd = os.open(guard_path + "/state.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump(state, output, separators=(",", ":"))
        guard_entry = "import base64;exec(base64.b64decode(%r))" % guard_code
        guard_unit = name + "-restore"
        command(
            "systemd-run", "--quiet", "--unit=" + guard_unit, "--on-active=8",
            "--timer-property=AccuracySec=1s", "--remain-after-exit",
            "/usr/bin/python3", "-I", "-c", guard_entry, guard_name,
        )
        guard_timer_started = True
        _, current_tag = get_config()
        controller_code = (
            "import base64,sys,time,urllib.request;"
            "opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));"
            "req=urllib.request.Request(sys.argv[1],data=base64.b64decode(sys.argv[3]),"
            "headers={'Content-Type':'application/json','If-Match':sys.argv[2]},method='POST');"
            "response=opener.open(req,timeout=5);"
            "assert response.status==200;"
            "print('ready',flush=True);time.sleep(60)"
        )
        candidate_data = base64.b64encode(json.dumps(no_persist).encode()).decode()
        controller = subprocess.Popen(
            ["/usr/bin/python3", "-c", controller_code, base + "/config/", current_tag, candidate_data],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        )
        if controller.stdout.readline().strip() != b"ready":
            raise RuntimeError("Simulated controller did not start")
        if site_body() != "temporary":
            raise RuntimeError("Timed guard candidate load failed")
        controller.kill()
        controller.wait(timeout=5)
        for _ in range(120):
            if site_body() == "original":
                break
            time.sleep(0.2)
        else:
            raise RuntimeError("Timed guard did not restore original configuration")
        unit_status = command(
            "systemctl", "show", guard_unit + ".service",
            "--property=Result", "--property=ExecMainStatus",
        ).decode()
        if "Result=success" not in unit_status or "ExecMainStatus=0" not in unit_status:
            raise RuntimeError("Timed guard did not report success")
        print("Independent timed guard restored the candidate after simulated controller termination.")

        _, current_tag = get_config()
        if put_config(no_persist, current_tag) != 200:
            raise RuntimeError("Conflict setup failed")
        _, candidate_tag = get_config()
        concurrent = json.loads(json.dumps(original))
        concurrent["apps"]["http"]["servers"]["lab"]["routes"][0]["handle"][0]["body"] = "concurrent"
        if put_config(concurrent, candidate_tag) != 200:
            raise RuntimeError("Concurrent change setup failed")
        blocked = subprocess.run(
            ["/usr/bin/python3", "-I", "-c", guard_entry, guard_name],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=20,
        )
        if blocked.returncode == 0 or site_body() != "concurrent":
            raise RuntimeError("Guard did not preserve the concurrent change")
        _, concurrent_tag = get_config()
        if put_config(original, concurrent_tag) != 200 or site_body() != "original":
            raise RuntimeError("Synthetic cleanup restore failed")
        print("Guard refused to overwrite a newer concurrent configuration.")
        print("Scope: synthetic localhost routes and temporary volumes on maintenance host.")
    finally:
        if guard_timer_started:
            command("systemctl", "stop", name + "-restore.timer")
            command("systemctl", "stop", name + "-restore.service")
        if guard_dir_created:
            os.unlink(guard_path + "/state.json")
            os.rmdir(guard_path)
        if container:
            identity = command(
                "docker", "inspect", "--format",
                '{{.Id}} {{index .Config.Labels "sydney.etag-lab"}}', container,
            ).decode().strip().split()
            if identity != [container, owner]:
                raise RuntimeError("Temporary container identity changed; refusing removal")
            command("docker", "rm", "-fv", container)
            if timer_started:
                command("systemctl", "stop", name + "-cleanup.timer")


if __name__ == "__main__":
    main()
