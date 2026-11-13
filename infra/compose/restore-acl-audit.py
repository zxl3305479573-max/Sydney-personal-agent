#!/usr/bin/env python3
import glob
import hashlib
import hmac
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import tarfile
import tempfile
import time


IMAGE = "sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6"
LABEL = "sydney.acl.restore.audit"
BACKUP = "/var/backups/sydney-ip-migration/pre-ip-acl-20261111/rakazo.dump.age"
RECENT_BACKUP = Path("/var/backups/sydney-ip-migration/image-recv-20261111/partial-online-20261112")
RECENT_HASHES = {
    "rakazo.dump.age": "d29c427fdd4f2ff1afe1b0426914787067ea5696c3ad26a7c369eb2524a4026a",
    "appdata.tgz.age": "1a8bedaa0657ea97a3cb89221514d88bd6a8512a068e2bd16f1d3726bbdd37bb",
    "METADATA": "06c7950d02ff834ba14341df13300c1ff283e41baea32b3708d0ccee34acf97f",
    "SHA256SUMS": "76c0438483f69729bfaa6c7d86c2c4e17dd093ede022b9684de5d55653a7fa35",
}
AGE = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age"
IDENTITY = "/var/lib/sydney-backup-keys/ip-migration.agekey"
ENV = {"PATH": "/usr/bin:/bin", "LC_ALL": "C"}


def docker(*args, data=None, timeout=40):
    return subprocess.run(
        ["/usr/bin/docker", *args], input=data, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, check=True, timeout=timeout, env=ENV,
    ).stdout


def main():
    if sys.argv[1:] not in (
        [], ["--rollback-image"], ["--cross-version-groups"],
        ["--recent-online"], ["--recent-cross-version-groups"], ["--recent-cross-version-artifacts"],
        ["--recent-cross-version-auth"], ["--recent-personality"],
        ["--recent-personality-compare"],
        ["--recent-personality-app"],
        ["--recent-ip-candidate-groups"],
    ):
        raise ValueError("invalid audit option")
    if os.environ.get("DOCKER_HOST") or os.environ.get("DOCKER_CONTEXT"):
        raise RuntimeError("Docker endpoint override rejected")
    backup = BACKUP
    if sys.argv[1:] in (["--recent-online"], ["--recent-cross-version-groups"], ["--recent-cross-version-artifacts"], ["--recent-cross-version-auth"], ["--recent-personality"], ["--recent-personality-compare"], ["--recent-personality-app"], ["--recent-ip-candidate-groups"]):
        directory = os.stat(RECENT_BACKUP, follow_symlinks=False)
        marker = os.stat(RECENT_BACKUP / "RECEIVE_FINISHED", follow_symlinks=False)
        if (not stat.S_ISDIR(directory.st_mode) or directory.st_uid != 0
                or stat.S_IMODE(directory.st_mode) != 0o700 or not stat.S_ISDIR(marker.st_mode)
                or marker.st_uid != 0 or stat.S_IMODE(marker.st_mode) != 0o700):
            raise RuntimeError("snapshot receive incomplete")
        for name, expected in RECENT_HASHES.items():
            descriptor = os.open(RECENT_BACKUP / name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
            with os.fdopen(descriptor, "rb") as source:
                info = os.fstat(source.fileno())
                if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0
                        or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
                    raise RuntimeError("snapshot file permissions invalid")
                digest = hashlib.sha256()
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    digest.update(chunk)
            if digest.hexdigest() != expected:
                raise RuntimeError("snapshot checksum mismatch")
        backup = str(RECENT_BACKUP / "rakazo.dump.age")
    query = Path(__file__).with_name("restore-acl-audit.sql").read_bytes()
    nonce = secrets.token_hex(16)
    label = f"{LABEL}={nonce}"
    try:
        container = docker(
            "create", "--name", "sydney-acl-audit-" + nonce, "--label", label,
            "--network", "none", "--read-only", "--log-driver", "none",
            "--memory", "512m", "--pids-limit", "128",
            "--tmpfs", "/var/lib/postgresql:rw,nosuid,nodev,size=512m",
            "--tmpfs", "/run/postgresql:rw,nosuid,nodev,size=16m",
            "--tmpfs", "/tmp:rw,nosuid,nodev,size=32m",
            "-e", "POSTGRES_USER=rakazo", "-e", "POSTGRES_DB=rakazo",
            "-e", "POSTGRES_HOST_AUTH_METHOD=trust", IMAGE,
        ).decode().strip()
        if len(container) != 64:
            raise RuntimeError("invalid container id")
        info = json.loads(docker("inspect", container))[0]
        if not (
            info["Image"] == IMAGE and info["Config"]["Labels"].get(LABEL) == nonce
            and info["HostConfig"]["NetworkMode"] == "none"
            and info["HostConfig"]["ReadonlyRootfs"]
            and info["HostConfig"]["LogConfig"]["Type"] == "none"
            and not info["HostConfig"]["PortBindings"]
            and set(info["HostConfig"]["Tmpfs"]) == {"/var/lib/postgresql", "/run/postgresql", "/tmp"}
            and all(mount["Type"] == "tmpfs" for mount in info["Mounts"])
        ):
            raise RuntimeError("container isolation check failed")
        docker("start", container)
        psql = ("exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1",
                "-h", "/var/run/postgresql", "-U", "rakazo", "-d", "rakazo", "-Atq")
        deadline = time.monotonic() + 30
        stable = 0
        while True:
            result = subprocess.run(
                ["/usr/bin/docker", *psql], input=b"SELECT 1;",
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5, env=ENV,
            )
            if result.returncode == 0 and result.stdout.strip() == b"1":
                stable += 1
                if stable >= 4:
                    break
            else:
                stable = 0
            if time.monotonic() >= deadline:
                raise TimeoutError("database not ready")
            time.sleep(0.3)
        docker(*psql, data=b"CREATE ROLE rakazo_app NOLOGIN NOSUPERUSER NOBYPASSRLS;")
        age = subprocess.Popen([AGE, "-d", "-i", IDENTITY, backup], stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, env=ENV)
        try:
            restore = subprocess.Popen(
                ["/usr/bin/docker", "exec", "-i", container, "pg_restore", "--exit-on-error",
                 "-h", "/var/run/postgresql", "-U", "rakazo", "-d", "rakazo"],
                stdin=age.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=ENV,
            )
            age.stdout.close()
            try:
                restore_status = restore.wait(timeout=90)
            except subprocess.TimeoutExpired:
                restore.kill()
                restore.wait()
                raise
            try:
                age_status = age.wait(timeout=15)
            except subprocess.TimeoutExpired:
                age.kill()
                age.wait()
                raise
        finally:
            if age.poll() is None:
                age.kill()
                age.wait()
        print(f"age_exit={age_status} restore_exit={restore_status}", flush=True)
        if age_status or restore_status:
            raise RuntimeError("restore failed")
        if sys.argv[1:] in (["--recent-personality"], ["--recent-personality-compare"]):
            result = docker(*psql, data=(
                b'SELECT count(*), count(*) FILTER (WHERE u.id IS NULL) '
                b'FROM personality_presets p LEFT JOIN "user" u ON u.id = p."userId";'
            )).decode().strip()
            print("restored_personality_count_and_missing_users=" + result, flush=True)
            if sys.argv[1:] == ["--recent-personality-compare"]:
                challenge = json.loads(
                    Path(__file__).with_name("personality-challenge.json").read_bytes()
                )
                challenge_nonce, expected = challenge["nonce"], challenge["digest"]
                if not re.fullmatch(r"[0-9a-f]{64}", challenge_nonce) or not re.fullmatch(r"[0-9a-f]{32}", expected):
                    raise RuntimeError("invalid personality comparison challenge")
                comparison = (
                    "SELECT md5('" + challenge_nonce + "' || coalesce("
                    "string_agg(row_to_json(p)::text, chr(10) ORDER BY p.id), '')) "
                    "FROM public.personality_presets p;"
                ).encode()
                actual = docker(*psql, data=comparison).decode("ascii").strip()
                if not hmac.compare_digest(actual, expected):
                    raise RuntimeError("personality backup differs from production")
                print("personality_backup_matches_production=1", flush=True)
            return
        sys.stdout.buffer.write(docker(*psql, data=query))
        sys.stdout.buffer.flush()
        row_query = (
            b'SELECT coalesce(json_agg(json_build_object('
            b"'id', id, 'spaceId', \"spaceId\", 'version', version, "
            b"'masterKeyId', \"masterKeyId\", 'wrappedKey', \"wrappedKey\")), '[]'::json) "
            b"FROM space_keys;"
        )
        records = json.loads(docker(*psql, data=row_query))
        message_query = (
            b"SELECT coalesce(json_agg(json_build_object("
            b"'rowId', id, 'threadId', thread_id, 'spaceId', space_id, "
            b"'ciphertext', ciphertext)), '[]'::json) FROM ("
            b'SELECT m.id, m."threadId" AS thread_id, t."spaceId" AS space_id, '
            b"block ->> '$sealed' AS ciphertext "
            b'FROM messages m JOIN threads t ON t.id = m."threadId" '
            b"CROSS JOIN LATERAL jsonb_array_elements("
            b"CASE WHEN jsonb_typeof(m.blocks) = 'array' THEN m.blocks "
            b"ELSE jsonb_build_array(m.blocks) END) AS block "
            b"WHERE jsonb_typeof(block) = 'object' AND block ->> '$sealed' LIKE 'rkz1:%' "
            b"AND length(block ->> '$sealed') <= 16384 ORDER BY m.id LIMIT 25) sample;"
        )
        messages = json.loads(docker(*psql, data=message_query))
        archives = glob.glob("/var/backups/sydney-ip-migration/*/config-core.age")
        if len(archives) != 1:
            raise RuntimeError("configuration archive ambiguous")
        decrypted = subprocess.run(
            [AGE, "-d", "-i", IDENTITY, archives[0]], stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, timeout=20, check=True, env=ENV,
        ).stdout
        if len(decrypted) > 2 * 1024 * 1024:
            raise RuntimeError("configuration archive too large")
        configuration = {}
        with tarfile.open(fileobj=io.BytesIO(decrypted), mode="r:*") as archive:
            for member in archive:
                if not member.isfile():
                    continue
                if member.size > 1024 * 1024:
                    raise RuntimeError("configuration entry too large")
                for line in archive.extractfile(member).read().splitlines():
                    if b"=" not in line:
                        continue
                    name, _, value = line.partition(b"=")
                    if name in (b"ENCRYPTION_KEY", b"BETTER_AUTH_SECRET", b"CONTENT_ENCRYPTION"):
                        if name in configuration:
                            raise RuntimeError("duplicate configuration")
                        value = value.strip()
                        if not value or any(item in value for item in (b"\\", b"$", b"#", b'"', b"'")):
                            raise RuntimeError("configuration format unsupported")
                        configuration[name] = value.decode("ascii")
        if set(configuration) != {b"ENCRYPTION_KEY", b"BETTER_AUTH_SECRET", b"CONTENT_ENCRYPTION"}:
            raise RuntimeError("configuration missing")
        payload = json.dumps({"encryptionKey": configuration[b"ENCRYPTION_KEY"],
                              "records": records, "messages": messages}).encode()
        checked = subprocess.run(
            ["/usr/bin/node", str(Path(__file__).with_name("restore-space-key-check.js"))],
            input=payload, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            check=True, timeout=20, env=ENV,
        )
        sys.stdout.buffer.write(checked.stdout)
        sys.stdout.buffer.flush()
        smoke_spec = importlib.util.spec_from_file_location(
            "restore_app_smoke", Path(__file__).with_name("restore-app-smoke.py")
        )
        smoke = importlib.util.module_from_spec(smoke_spec)
        smoke_spec.loader.exec_module(smoke)
        if sys.argv[1:] in (["--recent-online"], ["--recent-cross-version-groups"], ["--recent-cross-version-artifacts"], ["--recent-cross-version-auth"], ["--recent-personality-app"], ["--recent-ip-candidate-groups"]):
            smoke.APPDATA = str(RECENT_BACKUP / "appdata.tgz.age")
        config = {key.decode(): value for key, value in configuration.items()}
        if sys.argv[1:] == ["--recent-ip-candidate-groups"]:
            baseline_name = "restore-baseline-" + secrets.token_hex(16)
            candidate_name = "restore-ip-" + secrets.token_hex(16)
            for image, transition in (
                (smoke.IMAGE, {"create": baseline_name, "verify": []}),
                (smoke.IP_CANDIDATE_IMAGE, {"create": candidate_name, "verify": [baseline_name]}),
                (smoke.IMAGE, {"verify": [baseline_name, candidate_name]}),
            ):
                smoke.run(container, docker, psql, config, image, transition)
        elif sys.argv[1:] == ["--recent-personality-app"]:
            smoke.run(container, docker, psql, config, smoke.IMAGE, {"personality": True})
        elif sys.argv[1:] == ["--recent-cross-version-auth"]:
            email = "restore-" + secrets.token_hex(16) + "@example.invalid"
            password = secrets.token_urlsafe(32)
            for image, operation in (
                (smoke.IMAGE, "signup"),
                (smoke.ROLLBACK_IMAGE, "signin"),
                (smoke.IMAGE, "signin"),
            ):
                smoke.run(container, docker, psql, config, image, {
                    "auth": {"email": email, "password": password, "operation": operation},
                })
        elif sys.argv[1:] == ["--recent-cross-version-artifacts"]:
            current_name = "restore-current-" + secrets.token_hex(16)
            old_name = "restore-old-" + secrets.token_hex(16)
            with tempfile.TemporaryDirectory(prefix="sydney-restore-shared-", dir="/dev/shm") as temporary:
                os.chmod(temporary, 0o711)
                shared_data = Path(temporary) / "data"
                for image, transition in (
                    (smoke.IMAGE, {"artifactCreate": current_name, "artifactVerify": []}),
                    (smoke.ROLLBACK_IMAGE, {"artifactCreate": old_name, "artifactVerify": [current_name]}),
                    (smoke.IMAGE, {"artifactVerify": [current_name, old_name]}),
                ):
                    smoke.run(container, docker, psql, config, image, transition, shared_data)
        elif sys.argv[1:] in (["--cross-version-groups"], ["--recent-cross-version-groups"]):
            current_name = "restore-current-" + secrets.token_hex(16)
            old_name = "restore-old-" + secrets.token_hex(16)
            for image, transition in (
                (smoke.IMAGE, {"create": current_name, "verify": []}),
                (smoke.ROLLBACK_IMAGE, {"create": old_name, "verify": [current_name]}),
                (smoke.IMAGE, {"verify": [current_name, old_name]}),
            ):
                smoke.run(container, docker, psql, config, image, transition)
        else:
            image = smoke.ROLLBACK_IMAGE if sys.argv[1:] == ["--rollback-image"] else smoke.IMAGE
            smoke.run(container, docker, psql, config, image)
    finally:
        containers = docker("ps", "-aq", "--filter", "label=" + label).decode().split()
        for container in containers:
            info = json.loads(docker("inspect", container))[0]
            if info["Image"] != IMAGE or info["Config"]["Labels"].get(LABEL) != nonce:
                raise RuntimeError("unexpected container identity")
            docker("rm", "-f", container)
        if docker("ps", "-aq", "--filter", "label=" + label).strip():
            raise RuntimeError("container cleanup failed")
        print("audit_containers_cleaned=1", flush=True)


if __name__ == "__main__":
    main()
