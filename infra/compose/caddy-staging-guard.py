#!/usr/bin/env python3
"""Restore a temporary Caddy candidate only if its configuration is still current."""

import json
import os
import re
import stat
import subprocess
import sys


def call(args, data=None):
    return subprocess.run(
        args, input=data, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        check=True, timeout=15,
    ).stdout


def load_state(name):
    if not re.fullmatch(r"sydney-caddy-guard-[0-9a-f]{32}", name):
        raise ValueError("Invalid guard directory")
    run_fd = os.open("/run", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        directory = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=run_fd)
    finally:
        os.close(run_fd)
    try:
        info = os.fstat(directory)
        if info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
            raise ValueError("Untrusted guard directory")
        state_fd = os.open("state.json", os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
        try:
            info = os.fstat(state_fd)
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0
                    or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
                raise ValueError("Untrusted guard state")
            with os.fdopen(state_fd, "rb") as source:
                state_fd = None
                data = source.read(2097153)
            if len(data) > 2097152:
                raise ValueError("Guard state exceeds size limit")
            return json.loads(data)
        finally:
            if state_fd is not None:
                os.close(state_fd)
    finally:
        os.close(directory)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: caddy-staging-guard.py GUARD_DIRECTORY_NAME")
    state = load_state(sys.argv[1])
    if set(state) != {"container", "started_at", "admin_port", "before", "candidate"}:
        raise ValueError("Unexpected state fields")
    container = state["container"]
    if not re.fullmatch(r"[0-9a-f]{64}", container):
        raise ValueError("Invalid container ID")
    port = state["admin_port"]
    if not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535:
        raise ValueError("Invalid admin port")
    if not isinstance(state["before"], dict) or not isinstance(state["candidate"], dict):
        raise ValueError("Invalid configuration")
    if state["before"] == state["candidate"]:
        raise ValueError("Candidate equals original configuration")

    identity = json.loads(call([
        "/usr/bin/docker", "inspect", "--format",
        '{{json .}}', container,
    ]))
    if (identity["Id"] != container or not identity["State"]["Running"]
            or identity["State"]["StartedAt"] != state["started_at"]):
        raise ValueError("Caddy container identity or start time changed")

    url = "http://127.0.0.1:%d/config/" % port
    response = call([
        "/usr/bin/docker", "exec", container, "curl", "-fsS", "--max-time", "5",
        "-D", "-", url,
    ])
    headers, separator, body = response.partition(b"\r\n\r\n")
    if not separator:
        raise ValueError("Missing response headers")
    etags = [line.split(b":", 1)[1].strip() for line in headers.split(b"\r\n")
             if line.lower().startswith(b"etag:")]
    if len(etags) != 1 or b"\n" in etags[0] or b"\r" in etags[0]:
        raise ValueError("Missing or invalid ETag")
    current = json.loads(body)
    if current == state["before"]:
        print("Original configuration is already active.")
        return
    if current != state["candidate"]:
        raise ValueError("Configuration changed; refusing to overwrite it")
    call([
        "/usr/bin/docker", "exec", "-i", container, "curl", "-fsS", "--max-time", "10",
        "-X", "POST", "-H", "Content-Type: application/json",
        "-H", "If-Match: " + etags[0].decode("ascii"), "--data-binary", "@-", url,
    ], json.dumps(state["before"], separators=(",", ":")).encode())
    print("Original configuration restored using a conditional write.")


if __name__ == "__main__":
    main()
