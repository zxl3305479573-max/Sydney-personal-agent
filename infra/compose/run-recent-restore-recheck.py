#!/usr/bin/env python3
"""Run the fixed recent-backup recovery audit on the maintenance host."""

import io
import json
from pathlib import Path
import re
import secrets
import shlex
import subprocess
import sys
import tarfile


FILES = (
    "restore-acl-audit.py",
    "restore-acl-audit.sql",
    "restore-app-smoke.py",
    "restore-space-key-check.js",
    "restore-auth-smoke.js",
)
REMOTE = r"""
set -eu
directory="$(mktemp -d /dev/shm/sydney-restore-recheck.XXXXXXXX)"
cleanup() {
  case "$directory" in
    /dev/shm/sydney-restore-recheck.*) rm -rf -- "$directory" ;;
    *) exit 1 ;;
  esac
}
trap cleanup EXIT
tar -xf - -C "$directory"
/usr/bin/python3 -I "$directory/restore-acl-audit.py" AUDIT_OPTION
"""


def main():
    if sys.argv[1:] not in ([], ["--cross-version-groups"], ["--cross-version-artifacts"], ["--cross-version-auth"], ["--personality"], ["--personality-compare"], ["--personality-app"], ["--ip-candidate-groups"]):
        raise ValueError("invalid audit option")
    option = {
        (): "--recent-online",
        ("--cross-version-groups",): "--recent-cross-version-groups",
        ("--cross-version-artifacts",): "--recent-cross-version-artifacts",
        ("--cross-version-auth",): "--recent-cross-version-auth",
        ("--personality",): "--recent-personality",
        ("--personality-compare",): "--recent-personality-compare",
        ("--personality-app",): "--recent-personality-app",
        ("--ip-candidate-groups",): "--recent-ip-candidate-groups",
    }[tuple(sys.argv[1:])]
    directory = Path(__file__).resolve().parent
    challenge = None
    if sys.argv[1:] == ["--personality-compare"]:
        nonce = secrets.token_hex(32)
        query = (
            "SELECT md5('" + nonce + "' || coalesce("
            "string_agg(row_to_json(p)::text, chr(10) ORDER BY p.id), '')) "
            "FROM public.personality_presets p;"
        ).encode()
        command = (
            "docker exec -i -e PGOPTIONS=-cdefault_transaction_read_only=on "
            "rakazo-prod-postgres-1 psql -X -v ON_ERROR_STOP=1 "
            "-U rakazo -d rakazo -Atq"
        )
        result = subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
             "sydney-cloud-admin", command],
            input=query, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            check=True, timeout=30,
        ).stdout.decode("ascii").strip()
        if not re.fullmatch(r"[0-9a-f]{32}", result):
            raise RuntimeError("invalid production personality digest")
        challenge = json.dumps({"nonce": nonce, "digest": result}).encode()
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w") as output:
        for name in FILES:
            output.add(directory / name, arcname=name, recursive=False)
        if challenge is not None:
            entry = tarfile.TarInfo("personality-challenge.json")
            entry.size = len(challenge)
            entry.mode = 0o600
            output.addfile(entry, io.BytesIO(challenge))
    command = [
        "ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
        "sydney-backend-admin", "bash -c " + shlex.quote(REMOTE.replace("AUDIT_OPTION", option)),
    ]
    return subprocess.run(command, input=archive.getvalue(), timeout=300).returncode


if __name__ == "__main__":
    raise SystemExit(main())
