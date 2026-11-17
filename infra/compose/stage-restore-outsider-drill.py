#!/usr/bin/env python3
"""Stage a fixed set of restore-drill scripts on the maintenance host."""

import base64
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import sys

FILES = (
    "restore-acl-audit.py",
    "restore-acl-audit.sql",
    "restore-space-key-check.js",
    "restore-app-smoke.py",
    "restore-auth-smoke.js",
)
REMOTE = r"""
import base64,hashlib,json,os,stat,sys
names = {"restore-acl-audit.py", "restore-acl-audit.sql", "restore-space-key-check.js",
         "restore-app-smoke.py", "restore-auth-smoke.js"}
payload = json.load(sys.stdin)
if set(payload) != names or os.geteuid() != 0:
    raise ValueError("unexpected files or identity")
directory = "/run/sydney-restore-outsider-20261112"
os.mkdir(directory, 0o700)
fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
if stat.S_IMODE(os.fstat(fd).st_mode) != 0o700:
    raise ValueError("unexpected directory permissions")
for name in sorted(names):
    data = base64.b64decode(payload[name]["data"], validate=True)
    if len(data) > 1048576 or hashlib.sha256(data).hexdigest() != payload[name]["sha256"]:
        raise ValueError("input mismatch")
    output = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=fd)
    with os.fdopen(output, "wb") as file:
        file.write(data)
        file.flush()
        os.fsync(file.fileno())
    print(name, payload[name]["sha256"])
os.fsync(fd)
os.close(fd)
"""


def main():
    if sys.argv[1:]:
        raise SystemExit("This staging tool accepts no arguments.")
    directory = Path(__file__).resolve().parent
    payload = {}
    for name in FILES:
        data = (directory / name).read_bytes()
        payload[name] = {"data": base64.b64encode(data).decode(),
                         "sha256": hashlib.sha256(data).hexdigest()}
    encoded = base64.b64encode(REMOTE.encode()).decode()
    code = "import base64;exec(base64.b64decode(%r))" % encoded
    subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
                    "sydney-backend-admin", "sudo /usr/bin/python3 -I -c " + shlex.quote(code)],
                   input=json.dumps(payload).encode(), check=True, timeout=60)


if __name__ == "__main__":
    main()
