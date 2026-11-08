"""Prepare an explicitly approved, version-pinned Linux desktop package set."""

import base64
import json
import os
import platform
import re
import subprocess
import sys
from pathlib import Path

PACKAGES = (
    "dbus-x11",
    "imagemagick",
    "novnc",
    "websockify",
    "x11vnc",
    "xauth",
    "xclip",
    "xdotool",
    "xfce4",
    "xvfb",
)
VERSION = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.+:~_-]{0,199}$")


class PreparationError(Exception):
    pass


def system_identity():
    values = {}
    try:
        for line in Path("/etc/os-release").read_text(encoding="utf-8").splitlines():
            key, separator, value = line.partition("=")
            if separator and key in {"ID", "VERSION_ID"}:
                values[key] = value.strip().strip("\"'")
    except (OSError, UnicodeError) as exc:
        raise PreparationError("unsupported_system") from exc
    if (
        platform.system() != "Linux"
        or values.get("ID") != "ubuntu"
        or values.get("VERSION_ID") not in {"22.04", "24.04"}
        or platform.machine() not in {"x86_64", "aarch64"}
    ):
        raise PreparationError("unsupported_system")
    return {
        "distribution": values["ID"],
        "version": values["VERSION_ID"],
        "architecture": platform.machine(),
    }


def candidate_versions():
    environment = {**os.environ, "LC_ALL": "C"}
    result = {}
    for package in PACKAGES:
        try:
            command = subprocess.run(
                ["/usr/bin/apt-cache", "policy", package],
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=10,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise PreparationError("package_query_failed") from exc
        if command.returncode != 0 or len(command.stdout) > 65536:
            raise PreparationError("package_query_failed")
        lines = command.stdout.decode("utf-8", errors="replace").splitlines()
        candidates = [line.partition(":")[2].strip() for line in lines if line.strip().startswith("Candidate:")]
        if len(candidates) != 1 or not VERSION.fullmatch(candidates[0]):
            raise PreparationError("package_candidate_unavailable")
        result[package] = candidates[0]
    return result


def make_plan():
    return {"system": system_identity(), "packages": candidate_versions()}


def validate_plan(plan):
    if not isinstance(plan, dict) or set(plan) != {"system", "packages"}:
        raise PreparationError("invalid_plan")
    if plan["system"] != system_identity():
        raise PreparationError("system_changed")
    packages = plan["packages"]
    if not isinstance(packages, dict) or set(packages) != set(PACKAGES):
        raise PreparationError("invalid_plan")
    if not all(isinstance(value, str) and VERSION.fullmatch(value) for value in packages.values()):
        raise PreparationError("invalid_plan")
    if packages != candidate_versions():
        raise PreparationError("package_candidates_changed")
    return packages


def apply_plan(plan):
    packages = validate_plan(plan)
    arguments = [f"{package}={packages[package]}" for package in PACKAGES]
    environment = {**os.environ, "DEBIAN_FRONTEND": "noninteractive", "LC_ALL": "C"}
    try:
        result = subprocess.run(
            [
                "/usr/bin/sudo",
                "-n",
                "/usr/bin/env",
                "DEBIAN_FRONTEND=noninteractive",
                "LC_ALL=C",
                "/usr/bin/apt-get",
                "-y",
                "--no-install-recommends",
                "-o", "Dpkg::Options::=--force-confold",
                "-o", "Acquire::AllowInsecureRepositories=false",
                "-o", "Acquire::AllowDowngradeToInsecureRepositories=false",
                "-o", "APT::Get::AllowUnauthenticated=false",
                "install",
                *arguments,
            ],
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=1800,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise PreparationError("install_result_unknown") from exc
    except OSError as exc:
        raise PreparationError("installer_unavailable") from exc
    if result.returncode != 0:
        raise PreparationError("install_failed_inspect_before_retry")
    return {"status": "packages_installed"}


def main():
    try:
        if len(sys.argv) == 2 and sys.argv[1] == "plan":
            result = make_plan()
        elif len(sys.argv) == 3 and sys.argv[1] == "apply":
            if len(sys.argv[2]) > 16384:
                raise PreparationError("invalid_plan")
            try:
                plan = json.loads(base64.b64decode(sys.argv[2], validate=True))
            except (ValueError, UnicodeDecodeError) as exc:
                raise PreparationError("invalid_plan") from exc
            result = apply_plan(plan)
        else:
            raise PreparationError("invalid_request")
    except PreparationError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 1
    print(json.dumps({"ok": True, "result": result}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
