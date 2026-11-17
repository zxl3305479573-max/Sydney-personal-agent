#!/usr/bin/env python3
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import unittest


spec = importlib.util.spec_from_file_location(
    "globals_encrypted_stream", Path(__file__).with_name("globals-encrypted-stream.py")
)
stream = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stream)
IMAGE = "sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6"
AGE = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age"
KEYGEN = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age-keygen"
LABEL = "sydney.globals.stream.drill"
ENV = {"PATH": "/usr/bin:/bin", "LC_ALL": "C"}


def docker(*args, input_data=None, timeout=30):
    return subprocess.run(
        ["/usr/bin/docker", *args], input=input_data, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, timeout=timeout, check=True, env=ENV,
    ).stdout


class PostgreSQLSyntheticTest(unittest.TestCase):
    def test_capture_and_restore_synthetic_globals(self):
        self.assertFalse(os.environ.get("DOCKER_HOST") or os.environ.get("DOCKER_CONTEXT"))
        nonce = secrets.token_hex(16)
        label = f"{LABEL}={nonce}"
        containers = []
        with tempfile.TemporaryDirectory(dir="/dev/shm") as temporary:
            root = Path(temporary)
            try:
                for suffix in ("source", "target"):
                    name = f"sydney-globals-stream-{nonce}-{suffix}"
                    created = docker(
                        "create", "--name", name, "--label", label,
                        "--network", "none", "--read-only", "--log-driver", "none",
                        "--memory", "256m", "--pids-limit", "128",
                        "--tmpfs", "/var/lib/postgresql:rw,nosuid,nodev,size=128m",
                        "--tmpfs", "/run/postgresql:rw,nosuid,nodev,size=16m",
                        "--tmpfs", "/tmp:rw,nosuid,nodev,size=16m",
                        "-e", "POSTGRES_USER=drill_admin",
                        "-e", "POSTGRES_DB=drill",
                        "-e", "POSTGRES_HOST_AUTH_METHOD=trust", IMAGE,
                    ).decode().strip()
                    self.assertEqual(len(created), 64)
                    containers.append(created)
                    info = json.loads(docker("inspect", created))[0]
                    self.assertEqual(info["Image"], IMAGE)
                    self.assertEqual(info["Config"]["Labels"].get(LABEL), nonce)
                    self.assertEqual(info["HostConfig"]["NetworkMode"], "none")
                    self.assertTrue(info["HostConfig"]["ReadonlyRootfs"])
                    self.assertEqual(info["HostConfig"]["LogConfig"]["Type"], "none")
                    self.assertFalse(info["HostConfig"]["PortBindings"])
                    self.assertEqual(set(info["HostConfig"]["Tmpfs"]),
                                     {"/var/lib/postgresql", "/run/postgresql", "/tmp"})
                    self.assertFalse(any(mount["Type"] != "tmpfs" for mount in info["Mounts"]))
                    docker("start", created)
                    deadline = time.monotonic() + 30
                    while True:
                        ready = subprocess.run(
                            ["/usr/bin/docker", "exec", created, "pg_isready",
                             "-h", "/var/run/postgresql", "-U", "drill_admin", "-d", "drill"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=ENV,
                            timeout=5,
                        )
                        if ready.returncode == 0:
                            break
                        if time.monotonic() >= deadline:
                            self.fail("synthetic database startup timed out")
                        time.sleep(0.2)

                source, target = containers
                sql = (b"SET password_encryption='scram-sha-256';"
                       b"CREATE ROLE synthetic_group NOLOGIN;"
                       b"CREATE ROLE synthetic_user LOGIN PASSWORD 'synthetic-password-only';"
                       b"GRANT synthetic_group TO synthetic_user;")
                docker("exec", "-i", source, "psql", "-X", "-v", "ON_ERROR_STOP=1",
                       "-h", "/var/run/postgresql", "-U", "drill_admin", "-d", "drill",
                       input_data=sql)
                identity = subprocess.run([KEYGEN], check=True, capture_output=True, env=ENV).stdout
                recipient = subprocess.run([KEYGEN, "-y"], input=identity, check=True,
                                           capture_output=True, env=ENV).stdout.decode().strip()
                identity_path = root / "identity"
                identity_fd = os.open(identity_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(identity_fd, "wb") as identity_file:
                    identity_file.write(identity)
                root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    stream.capture(
                        root_fd, "globals.age",
                        ["/usr/bin/docker", "exec", source, "pg_dumpall",
                         "-h", "/var/run/postgresql", "-U", "drill_admin", "--globals-only"],
                        [AGE, "-r", recipient], 1024 * 1024, 30,
                    )
                finally:
                    os.close(root_fd)
                decrypted = subprocess.run(
                    [AGE, "-d", "-i", str(identity_path)], input=(root / "globals.age").read_bytes(),
                    check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=ENV,
                ).stdout
                marker = b"CREATE ROLE drill_admin;\n"
                self.assertEqual(decrypted.count(marker), 1)
                decrypted = decrypted.replace(marker, b"", 1)
                docker("exec", "-i", target, "psql", "-X", "-v", "ON_ERROR_STOP=1",
                       "-h", "/var/run/postgresql", "-U", "drill_admin", "-d", "drill",
                       input_data=decrypted)
                query = (b"SELECT rolname, rolcanlogin, rolpassword FROM pg_authid "
                         b"WHERE rolname IN ('synthetic_group','synthetic_user') ORDER BY rolname;"
                         b"SELECT count(*) FROM pg_auth_members m "
                         b"JOIN pg_roles g ON g.oid=m.roleid "
                         b"JOIN pg_roles u ON u.oid=m.member "
                         b"WHERE g.rolname='synthetic_group' AND u.rolname='synthetic_user';")
                results = []
                for container in (source, target):
                    results.append(docker(
                        "exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1",
                        "-h", "/var/run/postgresql", "-U", "drill_admin", "-d", "drill",
                        "-At", input_data=query,
                    ))
                self.assertTrue(results[0] == results[1], "role metadata differs")
                self.assertTrue(b"SCRAM-SHA-256$" in results[0], "password hash missing")
                self.assertTrue(results[0].endswith(b"\n1\n"))
                hba = (b"local all all trust\n"
                       b"host all all 127.0.0.1/32 scram-sha-256\n")
                for container in (source, target):
                    docker("exec", "-i", "-u", "postgres", container, "sh", "-c",
                           'cat > "$PGDATA/pg_hba.conf"', input_data=hba)
                    errors = docker(
                        "exec", container, "psql", "-X", "-v", "ON_ERROR_STOP=1",
                        "-h", "/var/run/postgresql", "-U", "drill_admin", "-d", "drill",
                        "-Atc", "SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL;",
                    ).strip()
                    self.assertEqual(errors, b"0")
                    reloaded = docker(
                        "exec", container, "psql", "-X", "-v", "ON_ERROR_STOP=1",
                        "-h", "/var/run/postgresql", "-U", "drill_admin", "-d", "drill",
                        "-Atc", "SELECT pg_reload_conf();",
                    ).strip()
                    self.assertEqual(reloaded, b"t")
                    for password, should_succeed in (
                            ("synthetic-password-only", True), ("wrong-synthetic-password", False)):
                        result = subprocess.run(
                            ["/usr/bin/docker", "exec", "-e", f"PGPASSWORD={password}",
                             "-e", "PGSSLMODE=disable", container, "psql", "-X", "-w",
                             "-h", "127.0.0.1", "-U", "synthetic_user", "-d", "drill",
                             "-Atc", "SELECT current_user;"],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=ENV, timeout=10,
                        )
                        if should_succeed:
                            self.assertEqual(result.returncode, 0)
                            self.assertEqual(result.stdout.strip(), b"synthetic_user")
                        else:
                            self.assertNotEqual(result.returncode, 0)
                            self.assertIn(b"password authentication failed", result.stderr)
            finally:
                listed = docker("ps", "-aq", "--filter", f"label={label}").decode().split()
                for container in listed:
                    info = json.loads(docker("inspect", container))[0]
                    if (info["Image"] != IMAGE or info["Config"]["Labels"].get(LABEL) != nonce):
                        raise RuntimeError("synthetic container identity mismatch")
                    docker("rm", "-f", container)
                if docker("ps", "-aq", "--filter", f"label={label}").strip():
                    raise RuntimeError("synthetic containers remain")


if __name__ == "__main__":
    unittest.main()
