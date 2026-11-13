#!/usr/bin/env python3
"""Build a bounded, non-production IP candidate from the fixed production image."""

import hashlib
import io
from pathlib import Path
import re
import secrets
import shlex
import subprocess
import sys
import tarfile


BASE = "sha256:31167f6506ee1e39f91dfc6435c1530e806426b2b586dcc168ada1fefeafb404"
EXPECTED = {
    "apps/api/src/app.ts": "e4282882f5cc2e6ca1d6bd7cf2fb6d90cfacadee7d56f560c0f74176e1cf476f",
    "apps/api/src/env.ts": "94820155cabb459d23102a84715e045cd36319ada4c359b057430321fa7cb49c",
    "apps/api/src/routes/computer.ts": "47019c214c90e1a5ee7317371c8b91def225dde0d2fb712f532d91ed8c964378",
    "packages/auth/src/index.ts": "c76179a6d11dfd2a6c22f9b3e7826267150cfc839affc195ca3bbdd297667761",
}


def replace_once(content, before, after):
    if content.count(before) != 1:
        raise ValueError("unexpected source layout")
    return content.replace(before, after, 1)


def sources():
    root = Path(__file__).resolve().parents[2]
    result = {}
    for name, expected in EXPECTED.items():
        raw = (root / name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != expected:
            raise ValueError("source changed; review and update candidate: " + name)
        result[name] = raw.decode("utf-8")
    app = "apps/api/src/app.ts"
    result[app] = replace_once(
        result[app],
        'import { assertAccountDeletionAllowed, deleteAccountContent } from "./account-deletion.js";',
        'import { deleteAccountContent } from "./account-deletion.js";',
    )
    result[app] = replace_once(result[app], "      await assertAccountDeletionAllowed(prisma, userId);\n", "")
    auth = "packages/auth/src/index.ts"
    result[auth] = replace_once(
        result[auth],
        'export function accountHasProjectWorkspacesAuthError() {\n'
        '  return new APIError("CONFLICT", {\n'
        '    code: "ACCOUNT_HAS_PROJECT_WORKSPACES",\n'
        '    message: "Remove project workspaces before deleting the account",\n'
        '  });\n'
        '}\n\n',
        "",
    )
    computer = "apps/api/src/routes/computer.ts"
    result[computer] = replace_once(
        result[computer],
        '          ...(new URL(viewUrl).protocol === "http:" || new URL(viewUrl).protocol === "https:"\n'
        '            ? { proxy: "rakazo-novnc" as const }\n'
        '            : {}),\n',
        "",
    )
    return {name: content.encode("utf-8") for name, content in result.items()}


def main():
    if sys.argv[1:] not in (["--inspect"], ["--build"]):
        raise SystemExit("Use --inspect or --build; never deploy this image.")
    entries = sources()
    for name, raw in entries.items():
        print(name, hashlib.sha256(raw).hexdigest(), flush=True)
    if sys.argv[1:] == ["--inspect"]:
        return
    tag = "sydney-staging-ip-minimal:" + secrets.token_hex(12)
    dockerfile = (
        "FROM " + BASE + "\n"
        "USER root\n"
        + "COPY overlay/ /app/\n"
        + "RUN cd /app/apps/api && node ../../scripts/build-server.mjs src/index.ts && node --check dist/index.js\n"
        + "USER node\n"
    ).encode()
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w") as output:
        for name, raw in [("Dockerfile", dockerfile),
                          *(("overlay/" + name, raw) for name, raw in entries.items())]:
            info = tarfile.TarInfo(name)
            info.size = len(raw)
            info.mode = 0o644
            info.mtime = 0
            output.addfile(info, io.BytesIO(raw))
    print("staging_image_tag=" + tag, flush=True)
    command = (
        "docker build --network none --memory 768m --cpu-period 100000 --cpu-quota 100000 "
        "--tag " + tag + " -"
    )
    subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
         "sydney-backend-admin", command],
        input=archive.getvalue(), check=True, timeout=1800,
    )
    inspection = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
         "sydney-backend-admin", "docker image inspect --format '{{.Id}} {{.Config.User}}' " + tag],
        check=True, timeout=30, capture_output=True, text=True,
    )
    image, user = inspection.stdout.strip().split()
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", image) or user != "node":
        raise RuntimeError("unexpected image identity or user")
    digest_code = (
        "const fs=require('fs'),p=require('path'),c=require('crypto');"
        "const h=c.createHash('sha256');"
        "function visit(x){const s=fs.lstatSync(x);"
        "if(s.isDirectory())for(const n of fs.readdirSync(x).sort())visit(p.join(x,n));"
        "else if(s.isFile()){h.update(x+'\\0');h.update(fs.readFileSync(x));}"
        "else throw Error('unexpected migration entry');}"
        "visit('/app/packages/db/prisma/migrations');"
        "visit('/app/packages/db/prisma/schema.prisma');console.log(h.digest('hex'));"
    )
    digests = []
    for candidate in (BASE, image):
        command = "docker run --rm --network none --entrypoint node " + candidate + " -e " + shlex.quote(digest_code)
        result = subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
             "sydney-backend-admin", command],
            capture_output=True, text=True, check=True, timeout=90,
        ).stdout.strip()
        if not re.fullmatch(r"[0-9a-f]{64}", result):
            raise RuntimeError("invalid migration digest")
        digests.append(result)
    if digests[0] != digests[1]:
        raise RuntimeError("schema or migration tree differs from base")
    print("staging_image_id=" + image, flush=True)
    print("migration_tree_and_schema_match_base=1", flush=True)


if __name__ == "__main__":
    main()
