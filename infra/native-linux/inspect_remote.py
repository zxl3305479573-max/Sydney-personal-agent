"""Inspect one explicitly configured host over a pinned SSH connection."""

import argparse
import ipaddress
import json
import re
import subprocess
import sys
import threading
from pathlib import Path

MAX_OUTPUT = 64 * 1024
HOST_LABEL = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$")
USER = re.compile(r"^[a-z_][a-z0-9_.-]{0,31}$")


class InspectionError(Exception):
    pass


def validate_host(host):
    try:
        ipaddress.ip_address(host)
        return host
    except ValueError:
        pass
    if len(host) > 253 or not all(HOST_LABEL.fullmatch(label) for label in host.split(".")):
        raise InspectionError("invalid_host")
    return host


def run_remote_script(host, user, port, identity, known_hosts, payload, command, timeout=30):
    if command not in {"python3 -", "python3 - plan"} and not re.fullmatch(
        r"python3 - apply [A-Za-z0-9+/=]{1,16384}", command
    ):
        raise InspectionError("invalid_remote_operation")
    script_name = "inspect_environment.py" if command == "python3 -" else "package_setup.py"
    if payload != Path(__file__).with_name(script_name).read_bytes():
        raise InspectionError("invalid_remote_operation")
    validate_host(host)
    if not USER.fullmatch(user):
        raise InspectionError("invalid_user")
    if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
        raise InspectionError("invalid_port")
    for path in (identity, known_hosts):
        if not Path(path).is_file():
            raise InspectionError("credential_file_unavailable")
    if any(character.isspace() or ord(character) < 32 for character in str(known_hosts)):
        raise InspectionError("invalid_known_hosts_path")
    args = [
        "ssh",
        "-F", "/dev/null",
        "-T",
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=yes",
        "-o", f"UserKnownHostsFile={known_hosts}",
        "-o", "GlobalKnownHostsFile=/dev/null",
        "-o", "IdentitiesOnly=yes",
        "-o", "IdentityAgent=none",
        "-o", "ClearAllForwardings=yes",
        "-o", "ForwardAgent=no",
        "-o", "ForwardX11=no",
        "-o", "PermitLocalCommand=no",
        "-o", "ProxyCommand=none",
        "-o", "ConnectTimeout=10",
        "-p", str(port),
        "-i", str(identity),
        f"{user}@{host}",
        command,
    ]
    try:
        process = subprocess.Popen(
            args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
        )
    except OSError as exc:
        raise InspectionError("ssh_unavailable") from exc
    output = []

    def read_output():
        output.append(process.stdout.read(MAX_OUTPUT + 1))

    reader = threading.Thread(target=read_output, daemon=True)
    reader.start()
    try:
        try:
            process.stdin.write(payload)
            process.stdin.close()
            status = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            raise InspectionError("inspection_timeout") from exc
        except OSError as exc:
            raise InspectionError("connection_failed") from exc
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        reader.join(timeout=1)
        if not reader.is_alive():
            process.stdout.close()
    if not output or len(output[0]) > MAX_OUTPUT:
        raise InspectionError("invalid_response")
    return status, output[0]


def inspect_remote(host, user, port, identity, known_hosts, timeout=30):
    payload = Path(__file__).with_name("inspect_environment.py").read_bytes()
    status, response = run_remote_script(
        host, user, port, identity, known_hosts, payload, "python3 -", timeout
    )
    if status != 0:
        raise InspectionError("connection_or_inspection_failed")
    try:
        result = json.loads(response)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InspectionError("invalid_response") from exc
    if not isinstance(result, dict) or result.get("system") != "Linux":
        raise InspectionError("unsupported_system")
    if (
        not isinstance(result.get("architecture"), str)
        or not isinstance(result.get("display_configured"), bool)
        or not isinstance(result.get("programs"), dict)
        or not all(
            isinstance(key, str) and isinstance(value, bool)
            for key, value in result["programs"].items()
        )
        or not all(
            result.get(key) is None or isinstance(result.get(key), str)
            for key in ("distribution", "version")
        )
        or not (
            result.get("home_free_bytes") is None
            or (
                isinstance(result.get("home_free_bytes"), int)
                and not isinstance(result["home_free_bytes"], bool)
                and result["home_free_bytes"] >= 0
            )
        )
    ):
        raise InspectionError("invalid_response")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True)
    parser.add_argument("--user", required=True)
    parser.add_argument("--port", type=int, default=22)
    parser.add_argument("--identity", required=True)
    parser.add_argument("--known-hosts", required=True)
    args = parser.parse_args()
    try:
        result = inspect_remote(args.host, args.user, args.port, args.identity, args.known_hosts)
    except InspectionError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 1
    print(json.dumps({"ok": True, "environment": result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
