#!/usr/bin/env python3
import base64
import hashlib
import hmac
import io
import json
import os
from pathlib import Path, PurePosixPath
import secrets
import shlex
import subprocess
import tarfile
import tempfile
import time


IMAGE = "sha256:31167f6506ee1e39f91dfc6435c1530e806426b2b586dcc168ada1fefeafb404"
ROLLBACK_IMAGE = "sha256:59ddeb7193b9fa63531dafb759752124c9cd391f603210668d84cde1d09692d2"
IP_CANDIDATE_IMAGE = "sha256:9b2c39780146bdbb66218c6101782e79d3e95ec4b6b7b5aaaf8dcca82192832d"
LABEL = "sydney.restore.app.audit"
ENV = {"PATH": "/usr/bin:/bin", "LC_ALL": "C"}
AGE = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age"
IDENTITY = "/var/lib/sydney-backup-keys/ip-migration.agekey"
APPDATA = "/var/backups/sydney-ip-migration/pre-ip-acl-20261111/appdata.tgz.age"


def extract_appdata(data, destination):
    entries = set()
    files = 0
    total = 0
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        for member in archive:
            path = PurePosixPath(member.name)
            if (not member.name or path.is_absolute() or ".." in path.parts
                    or not (member.isfile() or member.isdir()) or len(entries) >= 10000):
                raise ValueError("unsafe application archive")
            parts = tuple(part for part in path.parts if part != ".")
            if parts in entries or member.size < 0:
                raise ValueError("duplicate or invalid entry")
            entries.add(parts)
            if not parts:
                if not member.isdir():
                    raise ValueError("invalid root")
                continue
            target = destination.joinpath(*parts)
            if member.isdir():
                target.mkdir(mode=0o700, parents=True, exist_ok=True)
            else:
                total += member.size
                if total > 256 * 1024 * 1024:
                    raise ValueError("application archive too large")
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                source = archive.extractfile(member)
                if source is None:
                    raise ValueError("missing archive content")
                descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                                     0o600)
                with os.fdopen(descriptor, "wb") as output:
                    remaining = member.size
                    while remaining:
                        chunk = source.read(min(1024 * 1024, remaining))
                        if not chunk:
                            raise ValueError("truncated archive")
                        output.write(chunk)
                        remaining -= len(chunk)
                files += 1
    for directory, subdirectories, filenames in os.walk(destination, followlinks=False):
        os.chown(directory, 1000, 1000, follow_symlinks=False)
        for name in subdirectories + filenames:
            os.chown(os.path.join(directory, name), 1000, 1000, follow_symlinks=False)
    return files, total


def run(postgres, docker, psql, configuration, image=IMAGE, transition=None, shared_data=None):
    if image not in (IMAGE, ROLLBACK_IMAGE, IP_CANDIDATE_IMAGE):
        raise ValueError("unapproved application image")
    nonce = secrets.token_hex(16)
    label = f"{LABEL}={nonce}"
    if subprocess.check_output(["/usr/bin/stat", "-f", "-c", "%T", "/dev/shm"],
                               env=ENV).strip() != b"tmpfs":
        raise RuntimeError("temporary storage is not tmpfs")
    networks = docker("exec", postgres, "sh", "-c",
                      "for x in /sys/class/net/*; do basename \"$x\"; done").decode().split()
    if networks != ["lo"]:
        raise RuntimeError("database network isolation failed")
    synthetic_password = secrets.token_hex(24)
    docker(*psql, data=("ALTER ROLE rakazo_app LOGIN PASSWORD '" +
                        synthetic_password + "';").encode())
    if transition is not None and "auth" in transition:
        bypass_key = hmac.new(
            synthetic_password.encode(), b"rakazo rls bypass", hashlib.sha256
        ).hexdigest()
        bypass_digest = hashlib.sha256(bypass_key.encode()).hexdigest()
        docker(*psql, data=(
            "WITH stored AS (INSERT INTO rakazo_private.rls_bypass_keys (digest) "
            f"VALUES (decode('{bypass_digest}', 'hex')) ON CONFLICT (digest) DO NOTHING) "
            "DELETE FROM rakazo_private.rls_bypass_keys "
            f"WHERE digest <> decode('{bypass_digest}', 'hex');"
        ).encode())
    with tempfile.TemporaryDirectory(prefix="sydney-restore-app-", dir="/dev/shm") as temporary:
        root = Path(temporary)
        os.chmod(root, 0o711)
        data_directory = root / "data" if shared_data is None else shared_data
        if shared_data is not None and data_directory.exists():
            info = os.stat(data_directory, follow_symlinks=False)
            if not data_directory.is_dir() or data_directory.is_symlink() or info.st_uid != 1000:
                raise RuntimeError("shared application directory invalid")
            print("appdata_reused=1", flush=True)
        else:
            data_directory.mkdir(mode=0o700)
            decrypted = subprocess.run(
                [AGE, "-d", "-i", IDENTITY, APPDATA], check=True, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL, timeout=30, env=ENV,
            ).stdout
            if len(decrypted) > 32 * 1024 * 1024:
                raise RuntimeError("application archive too large")
            try:
                files, size = extract_appdata(decrypted, data_directory)
            except Exception:
                raise RuntimeError("application archive validation failed") from None
            if not files:
                raise RuntimeError("application archive empty")
            print(f"appdata_files_restored={files} appdata_bytes_restored={size}", flush=True)
        values = {
            "NODE_ENV": "production",
            "DATABASE_URL": f"postgres://rakazo_app:{synthetic_password}@127.0.0.1:5432/rakazo",
            "ENCRYPTION_KEY": configuration["ENCRYPTION_KEY"],
            "BETTER_AUTH_SECRET": configuration["BETTER_AUTH_SECRET"],
            "CONTENT_ENCRYPTION": configuration["CONTENT_ENCRYPTION"],
            "SCREEN_PROXY_SECRET": secrets.token_hex(32),
            "DATA_DIR": "/data",
            "API_HOST": "127.0.0.1",
            "API_PORT": "3100",
            "API_URL": "http://127.0.0.1:3100",
            "BETTER_AUTH_URL": "http://127.0.0.1:3100",
            "WEB_ORIGIN": "http://127.0.0.1:5173",
            "AUTH_BREACHED_PASSWORD_CHECK_ENABLED": "false",
        }
        if transition is not None and "auth" in transition:
            values["SIGNUPS_ENABLED"] = "true"
        env_path = root / "environment"
        descriptor = os.open(env_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o400)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            for name, value in values.items():
                output.write(f"export {name}={shlex.quote(value)}\n")
        os.chown(env_path, 1000, 1000)
        try:
            launch = ". /run/restore.env; exec node --enable-source-maps dist/index.js"
            if transition is not None and "auth" in transition:
                launch += " >/tmp/restore-auth.log 2>&1"
            app = docker(
                "create", "--name", "sydney-restore-app-" + nonce, "--label", label,
                "--network", "container:" + postgres, "--read-only", "--log-driver", "none",
                "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
                "--memory", "512m", "--pids-limit", "256", "--user", "1000:1000",
                "--tmpfs", "/tmp:rw,nosuid,nodev,size=32m",
                "--mount", f"type=bind,src={data_directory},dst=/data",
                "--mount", f"type=bind,src={env_path},dst=/run/restore.env,readonly",
                "--workdir", "/app/apps/api", "--entrypoint", "/bin/sh", image,
                "-c", launch,
            ).decode().strip()
            info = json.loads(docker("inspect", app))[0]
            if not (
                len(app) == 64 and info["Image"] == image
                and info["Config"]["Labels"].get(LABEL) == nonce
                and info["HostConfig"]["NetworkMode"] == "container:" + postgres
                and info["HostConfig"]["ReadonlyRootfs"]
                and info["HostConfig"]["LogConfig"]["Type"] == "none"
                and not info["HostConfig"]["PortBindings"]
                and {mount["Destination"] for mount in info["Mounts"]} == {"/data", "/run/restore.env"}
                and all(mount["Type"] == "bind" for mount in info["Mounts"])
            ):
                raise RuntimeError("application isolation check failed")
            docker("start", app)
            deadline = time.monotonic() + 60
            probe = ("Promise.all(['/health','/ready'].map(async p=>"
                     "{let r=await fetch('http://127.0.0.1:3100'+p);return r.status}))"
                     ".then(s=>{if(s[0]!==200||s[1]!==200)process.exit(1)})"
                     ".catch(()=>process.exit(1))")
            while True:
                result = subprocess.run(
                    ["/usr/bin/docker", "exec", app, "node", "-e", probe],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8, env=ENV,
                )
                if result.returncode == 0:
                    break
                state = json.loads(docker("inspect", app))[0]["State"]
                if not state["Running"] or time.monotonic() >= deadline:
                    print(f"app_running={state['Running']} app_exit={state['ExitCode']}", flush=True)
                    raise RuntimeError("isolated application not ready")
                time.sleep(1)
            print("isolated_health_http=200 isolated_ready_http=200", flush=True)
            token = secrets.token_hex(24)
            session_id = "restoreaudit" + secrets.token_hex(16)
            personality_filter = (
                'AND EXISTS (SELECT 1 FROM personality_presets p WHERE p."userId"=t."userId") '
                if transition is not None and transition.get("personality") is True else ""
            )
            session_sql = (
                'WITH chosen AS (SELECT t."userId",t."spaceId",s."organizationId",'
                't."botId",m.id AS message_id FROM threads t '
                'JOIN spaces s ON s.id=t."spaceId" '
                'JOIN space_members sm ON sm."spaceId"=t."spaceId" AND sm."userId"=t."userId" '
                'JOIN bots b ON b.id=t."botId" AND b."userId"=t."userId" AND b."archivedAt" IS NULL '
                'JOIN messages m ON m."threadId"=t.id '
                "WHERE EXISTS (SELECT 1 FROM jsonb_array_elements("
                "CASE WHEN jsonb_typeof(m.blocks)='array' THEN m.blocks "
                "ELSE jsonb_build_array(m.blocks) END) item "
                "WHERE item ->> '$sealed' LIKE 'rkz1:%') "
                + personality_filter +
                "ORDER BY m.seq DESC LIMIT 1), "
                'inserted AS (INSERT INTO "session" '
                '("id","token","userId","activeOrganizationId","createdAt","updatedAt","expiresAt") '
                f"SELECT '{session_id}','{token}',\"userId\",\"organizationId\",now(),now(),"
                "now()+interval '1 hour' FROM chosen RETURNING \"userId\") "
                "SELECT json_build_object('userId',chosen.\"userId\",'spaceId',chosen.\"spaceId\","
                "'botId',chosen.\"botId\",'messageId',chosen.message_id,"
                "'artifacts',COALESCE((SELECT json_agg(json_build_object("
                "'id',sample.id,'hash',sample.hash,'size',sample.size)) FROM ("
                'SELECT a.id,a.hash,a.size FROM artifacts a '
                'WHERE a."userId"=chosen."userId" AND a."spaceId"=chosen."spaceId" '
                "AND a.size > 0 AND a.size <= 1048576 ORDER BY a.id LIMIT 3"
                ") sample),'[]'::json)) "
                'FROM chosen JOIN inserted ON inserted."userId"=chosen."userId";'
            )
            selection = json.loads(docker(*psql, data=session_sql.encode()))
            signature = base64.b64encode(hmac.new(
                configuration["BETTER_AUTH_SECRET"].encode(), token.encode(), hashlib.sha256
            ).digest()).decode()
            selection["bearer"] = token + "." + signature
            outsider_id = "restoreoutsider" + secrets.token_hex(16)
            outsider_token = secrets.token_hex(24)
            outsider_session = "restoreoutsidersession" + secrets.token_hex(16)
            outsider_sql = (
                'INSERT INTO "user" (id,name,email,"createdAt","updatedAt") '
                f"VALUES ('{outsider_id}','Synthetic restore outsider',"
                f"'{outsider_id}@example.invalid',now(),now()); "
                'INSERT INTO "session" '
                '("id","token","userId","createdAt","updatedAt","expiresAt") '
                f"VALUES ('{outsider_session}','{outsider_token}','{outsider_id}',"
                "now(),now(),now()+interval '1 hour');"
            )
            docker(*psql, data=outsider_sql.encode())
            outsider_signature = base64.b64encode(hmac.new(
                configuration["BETTER_AUTH_SECRET"].encode(), outsider_token.encode(), hashlib.sha256
            ).digest()).decode()
            selection["outsider"] = {
                "userId": outsider_id,
                "bearer": outsider_token + "." + outsider_signature,
            }
            if transition is not None:
                selection["transition"] = transition
            auth_script = Path(__file__).with_name("restore-auth-smoke.js").read_text(encoding="utf-8")
            auth_result = subprocess.run(
                ["/usr/bin/docker", "exec", "-i", app, "node", "-e", auth_script],
                input=json.dumps(selection).encode(), stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL, timeout=30, env=ENV,
            )
            print(auth_result.stdout.decode("ascii"), end="", flush=True)
            if auth_result.returncode != 0:
                if transition is not None and "auth" in transition:
                    diagnostic = (
                        "const s=require('fs').readFileSync('/tmp/restore-auth.log','utf8');"
                        "for(const [n,r] of Object.entries({"
                        "permission:/permission denied/i,rls:/row.level security/i,"
                        "missing_relation:/relation .{0,120}does not exist/i,"
                        "missing_column:/column .{0,120}does not exist/i,"
                        "prisma:/prisma/i,crypto:/scrypt|cryptographic|hashing/i,"
                        "connection:/connection refused|cannot reach database/i}))"
                        "console.log('auth_log_'+n+'='+Number(r.test(s)));"
                    )
                    result = subprocess.run(
                        ["/usr/bin/docker", "exec", app, "node", "-e", diagnostic],
                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10, env=ENV,
                    )
                    if result.returncode == 0:
                        print(result.stdout.decode("ascii"), end="", flush=True)
                raise RuntimeError("isolated authentication smoke failed")
            try:
                docker("pause", postgres)
                negative = (
                    "fetch('http://127.0.0.1:3100/ready',{signal:AbortSignal.timeout(5000)})"
                    ".then(r=>{if(r.status!==503)process.exit(1)})"
                    ".catch(()=>process.exit(1))"
                )
                result = subprocess.run(
                    ["/usr/bin/docker", "exec", app, "node", "-e", negative],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8, env=ENV,
                )
                if result.returncode != 0:
                    raise RuntimeError("database-unavailable readiness control failed")
                print("paused_database_ready_http=503", flush=True)
            finally:
                state = json.loads(docker("inspect", postgres))[0]["State"]
                if state["Paused"]:
                    docker("unpause", postgres)
            deadline = time.monotonic() + 20
            while True:
                result = subprocess.run(
                    ["/usr/bin/docker", "exec", app, "node", "-e", probe],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8, env=ENV,
                )
                if result.returncode == 0:
                    break
                if time.monotonic() >= deadline:
                    raise RuntimeError("application did not recover after database unpause")
                time.sleep(1)
            print("resumed_database_ready_http=200", flush=True)
        finally:
            containers = docker("ps", "-aq", "--filter", "label=" + label).decode().split()
            for container in containers:
                info = json.loads(docker("inspect", container))[0]
                if info["Image"] != image or info["Config"]["Labels"].get(LABEL) != nonce:
                    raise RuntimeError("unexpected application container")
                docker("rm", "-f", container)
            if docker("ps", "-aq", "--filter", "label=" + label).strip():
                raise RuntimeError("application cleanup failed")
            print("app_container_cleaned=1", flush=True)
