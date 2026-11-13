#!/usr/bin/env python3
"""Deploy IP-based auth and screen links with a timed configuration rollback."""

import base64
import hashlib
import json
import shlex
import subprocess


OVERLAY_SHA256 = "5ceb4aa150aa5068795aa07720f4c89bed374ee426a957d892ce356fbef7e24b"
IMAGE = "sha256:acc903c111681c8c69b71beb3dca6bebcb9681ef308d776d6723cafbd820fe87"
IP_ORIGIN = "https://124.221.182.39"
REMOTE = r'''
import base64, fcntl, hashlib, json, os, secrets, stat, subprocess, sys, tempfile, time

ROOT = "/srv/rakazo"
OVERLAY = "/etc/rakazo/compose/production.overlay.yml"
IMAGE = "sha256:acc903c111681c8c69b71beb3dca6bebcb9681ef308d776d6723cafbd820fe87"
ORIGIN = "https://124.221.182.39"
EXPECTED = "5ceb4aa150aa5068795aa07720f4c89bed374ee426a957d892ce356fbef7e24b"

def run(args, data=None, timeout=30, check=True):
    return subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          check=check, timeout=timeout)

def compose(*args, timeout=120):
    return run(["docker", "compose", "--env-file", ROOT + "/.env",
                "-f", ROOT + "/infra/compose/docker-compose.prod.yml",
                "-f", OVERLAY, *args], timeout=timeout).stdout

def lock():
    fd = os.open(ROOT + "/.deploy.lock", os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC)
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    return fd

def read_overlay():
    fd = os.open(OVERLAY, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o002:
            raise ValueError("Untrusted production overlay")
        data = os.read(fd, 1048577)
        if len(data) > 1048576:
            raise ValueError("Production overlay too large")
        return data, info
    finally:
        os.close(fd)

def replace_overlay(expected, replacement, mode, uid, gid):
    current, info = read_overlay()
    if current != expected or (stat.S_IMODE(info.st_mode), info.st_uid, info.st_gid) != (mode, uid, gid):
        raise ValueError("Overlay changed independently")
    fd, path = tempfile.mkstemp(prefix=".sydney-ip-origins-", dir=os.path.dirname(OVERLAY))
    try:
        os.fchown(fd, uid, gid)
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb") as output:
            fd = -1
            output.write(replacement)
            output.flush()
            os.fsync(output.fileno())
        current, later = read_overlay()
        if current != expected or (later.st_dev, later.st_ino) != (info.st_dev, info.st_ino):
            raise ValueError("Overlay changed before replacement")
        os.replace(path, OVERLAY)
        path = None
        directory = os.open(os.path.dirname(OVERLAY), os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if fd >= 0:
            os.close(fd)
        if path:
            os.unlink(path)

def containers():
    ids = run(["docker", "ps", "-q", "--no-trunc",
               "--filter=label=com.docker.compose.project=rakazo-prod",
               "--filter=label=com.docker.compose.service=api"]).stdout.decode().split()
    result = []
    for identifier in ids:
        item = json.loads(run(["docker", "inspect", identifier]).stdout)[0]
        env = dict(value.split("=", 1) for value in item["Config"].get("Env", []) if "=" in value)
        result.append({"id": item["Id"], "image": item["Image"],
                       "health": item["State"].get("Health", {}).get("Status"),
                       "started": item["State"]["StartedAt"], "env": env})
    return result

def stop_remove(identifier):
    run(["docker", "stop", "--time", "30", identifier], timeout=50)
    run(["docker", "rm", identifier], timeout=20)

def cleanup(name, timer):
    run(["/usr/bin/systemctl", "stop", timer + ".timer"], check=False)
    run(["/usr/bin/systemctl", "stop", timer + ".service"], check=False)
    directory = "/run/" + name
    if os.path.isdir(directory):
        info = os.stat(directory, follow_symlinks=False)
        if stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o700:
            state = directory + "/state.json"
            if os.path.exists(state):
                os.unlink(state)
            os.rmdir(directory)

def healthy(predicate, timeout=180):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        items = containers()
        if any(item["image"] != IMAGE for item in items):
            raise ValueError("Unexpected API image appeared")
        matches = [item for item in items if item["health"] == "healthy" and predicate(item)]
        if len(matches) == 1:
            return matches[0]
        time.sleep(2)
    raise ValueError("Expected API health state not reached")

def original_config_is_healthy():
    return healthy(lambda item: item["env"].get("AUTH_PUBLIC_LINK_ORIGIN") != ORIGIN
                   and item["env"].get("SCREEN_PROXY_PUBLIC_ORIGIN") != ORIGIN)

def candidate_config_is_healthy():
    return healthy(lambda item: item["env"].get("AUTH_PUBLIC_LINK_ORIGIN") == ORIGIN
                   and item["env"].get("SCREEN_PROXY_PUBLIC_ORIGIN") == ORIGIN)

def probe(item):
    code = """
const o='https://124.221.182.39';
const c=await fetch('http://127.0.0.1:3100/api/auth/capabilities',{headers:{origin:o}});
const j=await c.json();
const h=await fetch('http://127.0.0.1:3100/health');
if(!c.ok||j.resetUrl!==o+'/reset-password'||
 c.headers.get('access-control-allow-origin')!==o||!h.ok)process.exit(1);
"""
    run(["docker", "exec", item["id"], "node", "--input-type=module", "-e", code], timeout=20)

def public_health():
    result = run(["docker", "exec", "rakazo-prod-caddy-1", "curl", "-fsS", "--max-time", "8",
                  "--noproxy", "*", "--resolve", "124.221.182.39:443:127.0.0.1",
                  "https://124.221.182.39/health"]).stdout
    if json.loads(result).get("ok") is not True:
        raise ValueError("Public IP health failed")
    old = run(["docker", "exec", "rakazo-prod-caddy-1", "curl", "-fsS", "--max-time", "8",
               "--noproxy", "*", "--resolve", "pc.zxlup.xin:443:127.0.0.1",
               "https://pc.zxlup.xin/health"]).stdout
    if json.loads(old).get("ok") is not True:
        raise ValueError("Existing domain health failed")

def restore(name, locked=False):
    lockfd = None if locked else lock()
    directory = "/run/" + name
    try:
        state_info = os.stat(directory, follow_symlinks=False)
        if not stat.S_ISDIR(state_info.st_mode) or state_info.st_uid != 0 or stat.S_IMODE(state_info.st_mode) != 0o700:
            raise ValueError("Untrusted rollback state directory")
        fd = os.open(directory + "/state.json", os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
                raise ValueError("Untrusted rollback state")
            state = json.loads(os.read(fd, 4194305))
        finally:
            os.close(fd)
        original = base64.b64decode(state["original"], validate=True)
        candidate = base64.b64decode(state["candidate"], validate=True)
        current, _ = read_overlay()
        if current == candidate:
            replace_overlay(candidate, original, state["mode"], state["uid"], state["gid"])
        elif current != original:
            raise ValueError("Overlay changed independently; refusing rollback")
        run(["docker", "compose", "--env-file", ROOT + "/.env", "-f",
             ROOT + "/infra/compose/docker-compose.prod.yml", "-f", OVERLAY,
             "up", "-d", "--no-deps", "--no-recreate", "--no-build", "--pull", "never",
             "--scale", "api=2", "api"], timeout=150)
        old = original_config_is_healthy()
        for item in containers():
            if item["id"] != old["id"]:
                stop_remove(item["id"])
        if len(containers()) != 1:
            raise ValueError("Original API restoration unconfirmed")
        print("Original API configuration restored and healthy", flush=True)
    finally:
        if lockfd is not None:
            os.close(lockfd)

def apply(code):
    if os.geteuid() != 0:
        raise ValueError("Requires root")
    lockfd = lock()
    name = "sydney-ip-origins-" + secrets.token_hex(16)
    timer = name + "-restore"
    directory = "/run/" + name
    try:
        original, info = read_overlay()
        if hashlib.sha256(original).hexdigest() != EXPECTED:
            raise ValueError("Production overlay changed")
        if original.count(b"      EXTRA_TRUSTED_ORIGINS: https://124.221.182.39\n") != 1 or \
           b"AUTH_PUBLIC_LINK_ORIGIN:" in original or b"SCREEN_PROXY_PUBLIC_ORIGIN:" in original:
            raise ValueError("Unexpected API environment configuration")
        current = containers()
        if len(current) != 1 or current[0]["image"] != IMAGE or current[0]["health"] != "healthy":
            raise ValueError("Unexpected production API state")
        original_config_is_healthy()
        public_health()
        anchor = b"      EXTRA_TRUSTED_ORIGINS: https://124.221.182.39\n"
        candidate = original.replace(anchor, anchor +
            b"      AUTH_PUBLIC_LINK_ORIGIN: https://124.221.182.39\n"
            b"      SCREEN_PROXY_PUBLIC_ORIGIN: https://124.221.182.39\n", 1)
        os.mkdir(directory, 0o700)
        state = {"original": base64.b64encode(original).decode(),
                 "candidate": base64.b64encode(candidate).decode(),
                 "mode": stat.S_IMODE(info.st_mode), "uid": info.st_uid, "gid": info.st_gid}
        with os.fdopen(os.open(directory + "/state.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as out:
            json.dump(state, out, separators=(",", ":"))
            out.flush()
            os.fsync(out.fileno())
        encoded = base64.b64encode(code).decode()
        run(["/usr/bin/systemd-run", "--quiet", "--unit=" + timer, "--on-active=600",
             "--timer-property=AccuracySec=1s", "--remain-after-exit", "/usr/bin/python3",
             "-I", "-c", "import base64;exec(base64.b64decode(%r))" % encoded, "restore", name])
        if run(["/usr/bin/systemctl", "is-active", timer + ".timer"]).stdout.strip() != b"active":
            raise ValueError("Rollback timer did not start")
        backup = OVERLAY + ".before-ip-origins-" + name.removeprefix("sydney-ip-origins-")
        with os.fdopen(os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb") as out:
            out.write(original)
            out.flush()
            os.fsync(out.fileno())
        replace_overlay(original, candidate, stat.S_IMODE(info.st_mode), info.st_uid, info.st_gid)
        compose("up", "-d", "--no-deps", "--no-recreate", "--no-build", "--pull", "never",
                "--scale", "api=2", "api")
        new = candidate_config_is_healthy()
        probe(new)
        public_health()
        old = [item for item in containers() if item["id"] != new["id"]]
        if len(old) != 1 or old[0]["health"] != "healthy" or old[0]["started"] != current[0]["started"]:
            raise ValueError("Original API changed during rollout")
        stop_remove(old[0]["id"])
        final = candidate_config_is_healthy()
        probe(final)
        public_health()
        cleanup(name, timer)
        print("IP_AUTH_AND_SCREEN_ORIGINS_DEPLOYED backup=" + backup, flush=True)
    except Exception:
        if os.path.isdir(directory):
            restore(name, locked=True)
            cleanup(name, timer)
        raise
    finally:
        os.close(lockfd)

if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "restore":
        restore(sys.argv[2])
    else:
        payload = json.load(sys.stdin)
        apply(base64.b64decode(payload["remote"], validate=True))
'''


def main():
    compile(REMOTE, "ip-public-origins-deploy", "exec")
    encoded = base64.b64encode(REMOTE.encode()).decode()
    command = "sudo /usr/bin/python3 -I -u -c " + shlex.quote(
        "import base64;exec(base64.b64decode(%r))" % encoded
    )
    process = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
         "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3",
         "sydney-cloud-admin", command],
        input=json.dumps({"remote": encoded}).encode(), timeout=600,
    )
    return process.returncode


if __name__ == "__main__":
    raise SystemExit(main())
