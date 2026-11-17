#!/usr/bin/env python3
"""Rebuild the reviewed IP overlay using the cached production base image."""

import hashlib
import io
from pathlib import PurePosixPath
import re
import secrets
import shlex
import subprocess
import sys
import tarfile


BASE = "sha256:31167f6506ee1e39f91dfc6435c1530e806426b2b586dcc168ada1fefeafb404"
OVERLAY_IMAGE = "sha256:53e74920f844b86ed90d5a28c6a5ff972b6b7cd4cd84b3707f520ca1600eff36"
EXPECTED = {
    "apps/api/src/app.ts": "49a14fded7f5ff9145e077f2028ee9576df6fe48fc7a4ebf92cda21c5ac011ce",
    "apps/api/src/env.ts": "94820155cabb459d23102a84715e045cd36319ada4c359b057430321fa7cb49c",
    "apps/api/src/routes/computer.ts": "bf03e9d80595b6de851015709ef554fb3a97d2154a0be97b3d88a82c4f55cb26",
    "packages/auth/src/index.ts": "8d085c5676bb9e7f753e4822f77f2722525a95f85023af89a5902e27054c725b",
}
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "sydney-backend-admin"]


def main():
    remote = "docker run --rm --network none --read-only --entrypoint tar " + shlex.join(
        [OVERLAY_IMAGE, "-C", "/app", "-cf", "-", *EXPECTED]
    )
    data = subprocess.run(SSH + [remote], stdout=subprocess.PIPE, check=True, timeout=90).stdout
    entries = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as archive:
        for member in archive:
            name = str(PurePosixPath(member.name))
            if name not in EXPECTED or name in entries or not member.isfile() or member.size > 2097152:
                raise ValueError("Unexpected overlay archive member")
            source = archive.extractfile(member)
            if source is None:
                raise ValueError("Missing overlay source")
            raw = source.read()
            if hashlib.sha256(raw).hexdigest() != EXPECTED[name]:
                raise ValueError("Overlay source digest mismatch: " + name)
            entries[name] = raw
    if set(entries) != set(EXPECTED):
        raise ValueError("Incomplete overlay")
    dockerfile = (
        "FROM " + BASE + "\n"
        "USER root\n"
        "COPY overlay/ /app/\n"
        "RUN cd /app/apps/api && node ../../scripts/build-server.mjs src/index.ts && node --check dist/index.js\n"
        "USER node\n"
        "WORKDIR /app\n"
    ).encode()
    archive_data = io.BytesIO()
    with tarfile.open(fileobj=archive_data, mode="w") as archive:
        for name, raw in [("Dockerfile", dockerfile), *(
            ("overlay/" + name, content) for name, content in entries.items()
        )]:
            member = tarfile.TarInfo(name)
            member.mode = 0o644
            member.mtime = 0
            member.size = len(raw)
            archive.addfile(member, io.BytesIO(raw))
    tag = "sydney-ip-release-candidate:" + secrets.token_hex(12)
    print("candidate_tag=" + tag, flush=True)
    command = "docker build --network none --memory 768m --cpu-period 100000 --cpu-quota 100000 --tag " + tag + " -"
    build = subprocess.run(SSH + [command], input=archive_data.getvalue(), timeout=1800)
    if build.returncode:
        return build.returncode
    result = subprocess.run(
        SSH + ["docker image inspect --format " + shlex.quote("{{.Id}} {{.Config.User}} {{.Config.WorkingDir}}") + " " + tag],
        stdout=subprocess.PIPE, text=True, check=True, timeout=30,
    ).stdout.strip().split()
    if len(result) != 3 or not re.fullmatch(r"sha256:[0-9a-f]{64}", result[0]) or result[1:] != ["node", "/app"]:
        raise ValueError("Unexpected candidate identity")
    print("candidate_image=" + result[0], flush=True)
    print("build_complete_requires_staging_and_release_review", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
