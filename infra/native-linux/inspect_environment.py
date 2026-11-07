#!/usr/bin/env python3
"""Read-only inventory for a prospective Linux desktop host."""

import json
import os
import platform
import shutil
from pathlib import Path


def read_os_release(path: Path = Path("/etc/os-release")) -> dict[str, str]:
    try:
        contents = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return {}
    fields = {}
    for line in contents.splitlines():
        key, separator, value = line.partition("=")
        if separator and key in {"ID", "VERSION_ID"}:
            fields[key] = value.strip().strip("\"'")
    return fields


def inspect_environment() -> dict:
    system = platform.system()
    release = read_os_release() if system == "Linux" else {}
    try:
        free_bytes = shutil.disk_usage(Path.home()).free
    except OSError:
        free_bytes = None
    programs = (
        "python3",
        "ssh",
        "systemctl",
        "Xvfb",
        "x11vnc",
        "websockify",
        "xdotool",
    )
    return {
        "system": system,
        "architecture": platform.machine(),
        "distribution": release.get("ID"),
        "version": release.get("VERSION_ID"),
        "home_free_bytes": free_bytes,
        "display_configured": bool(os.environ.get("DISPLAY")),
        "programs": {name: shutil.which(name) is not None for name in programs},
    }


if __name__ == "__main__":
    print(json.dumps(inspect_environment(), ensure_ascii=False))
