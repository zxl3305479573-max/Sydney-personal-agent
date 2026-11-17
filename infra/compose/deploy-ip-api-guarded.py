#!/usr/bin/env python3
"""Roll out the reviewed IP-compatible API with an independent rollback timer."""

import base64
import json
import shlex
import subprocess


REMOTE = r'''
import base64, fcntl, hashlib, json, os, re, secrets, stat, subprocess, sys, tempfile, time

ROOT = "/srv/rakazo"
OVERLAY = "/etc/rakazo/compose/production.overlay.yml"
BASE = "sha256:31167f6506ee1e39f91dfc6435c1530e806426b2b586dcc168ada1fefeafb404"
IMAGE = "sha256:acc903c111681c8c69b71beb3dca6bebcb9681ef308d776d6723cafbd820fe87"
DIGEST = "0263252cee2e8fa62332b67c558d1e8f1811dc883ea5975e42b8706ec0601512"
IP = "124.221.182.39"

def run(args, data=None, timeout=30, check=True):
    return subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          check=check, timeout=timeout)

def compose(*args, timeout=120):
    return run(["docker", "compose", "--env-file", ROOT + "/.env",
                "-f", ROOT + "/infra/compose/docker-compose.prod.yml",
                "-f", OVERLAY, *args], timeout=timeout).stdout

def lock(nonblocking):
    fd = os.open(ROOT + "/.deploy.lock", os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC)
    fcntl.flock(fd, fcntl.LOCK_EX | (fcntl.LOCK_NB if nonblocking else 0))
    return fd

def read_overlay():
    fd = os.open(OVERLAY, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o002:
            raise ValueError("Untrusted overlay")
        raw = os.read(fd, 1048577)
        if len(raw) > 1048576:
            raise ValueError("Overlay exceeds limit")
        return raw, info
    finally:
        os.close(fd)

def replace_overlay(expected, replacement, mode, uid, gid):
    current, info = read_overlay()
    if current != expected or (stat.S_IMODE(info.st_mode), info.st_uid, info.st_gid) != (mode, uid, gid):
        raise ValueError("Overlay changed independently")
    parent = os.path.dirname(OVERLAY)
    fd, path = tempfile.mkstemp(prefix=".sydney-ip-api-", dir=parent)
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
        directory = os.open(parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if fd >= 0:
            os.close(fd)
        if path is not None:
            os.unlink(path)

def api_containers():
    ids = run(["docker", "ps", "-q", "--no-trunc",
               "--filter", "label=com.docker.compose.project=rakazo-prod",
               "--filter", "label=com.docker.compose.service=api"]).stdout.decode().split()
    result = []
    for identifier in ids:
        data = json.loads(run(["docker", "inspect", identifier]).stdout)[0]
        result.append({"id": data["Id"], "image": data["Image"],
                       "health": data["State"].get("Health", {}).get("Status"),
                       "started": data["State"]["StartedAt"]})
    return result

def wait_for(image, timeout=180):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        items = api_containers()
        if any(item["image"] not in (BASE, IMAGE) for item in items):
            raise ValueError("Unexpected API image appeared")
        found = [item for item in items if item["image"] == image and item["health"] == "healthy"]
        if len(found) == 1:
            return found[0]
        if len(found) > 1:
            raise ValueError("Unexpected duplicate API")
        time.sleep(2)
    raise ValueError("API health timeout")

def stop_remove(identifier):
    run(["docker", "stop", "--time", "30", identifier], timeout=50)
    run(["docker", "rm", identifier], timeout=20)

def rollout_original():
    items = api_containers()
    if any(item["image"] not in (BASE, IMAGE) for item in items):
        raise ValueError("Unknown API image; refusing rollback")
    originals = [item for item in items if item["image"] == BASE and item["health"] == "healthy"]
    if not originals:
        count = len(items) + 1
        compose("up", "-d", "--no-deps", "--no-recreate", "--no-build", "--pull", "never",
                "--scale", "api=" + str(count), "api")
        wait_for(BASE)
    for item in api_containers():
        if item["image"] == IMAGE:
            stop_remove(item["id"])
    if len([item for item in api_containers()
            if item["image"] == BASE and item["health"] == "healthy"]) != 1:
        raise ValueError("Original API restoration unconfirmed")

def load_state(name):
    if not re.fullmatch(r"sydney-ip-api-[0-9a-f]{32}", name):
        raise ValueError("Invalid state name")
    directory = "/run/" + name
    info = os.stat(directory, follow_symlinks=False)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError("Untrusted state directory")
    fd = os.open(directory + "/state.json", os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError("Untrusted state")
        return json.loads(os.read(fd, 4194305))
    finally:
        os.close(fd)

def rollback(name, locked=False):
    lockfd = None if locked else lock(False)
    try:
        state = load_state(name)
        original = base64.b64decode(state["original"], validate=True)
        candidate = base64.b64decode(state["candidate"], validate=True)
        current, _ = read_overlay()
        if current == candidate:
            replace_overlay(candidate, original, state["mode"], state["uid"], state["gid"])
        elif current != original:
            raise ValueError("Overlay changed independently; refusing rollback")
        rollout_original()
        print("Original API overlay and healthy API restored.", flush=True)
    finally:
        if lockfd is not None:
            os.close(lockfd)

def direct_probe(identifier):
    script = """
const origin='https://124.221.182.39';
const headers={origin,'content-type':'application/json'};
const session=await fetch('http://127.0.0.1:3100/api/auth/get-session',{headers});
const rpc=await fetch('http://127.0.0.1:3100/rpc/health',{method:'POST',headers,body:'{"json":{}}'});
const body=await rpc.json();
if(session.status!==200||rpc.status!==200||body.json?.ok!==true||
   session.headers.get('access-control-allow-origin')!==origin||
   rpc.headers.get('access-control-allow-origin')!==origin) process.exit(1);
"""
    run(["docker", "exec", identifier, "node", "--input-type=module", "-e", script], timeout=20)

def domain_health():
    info = json.loads(run(["docker", "inspect", "rakazo-prod-caddy-1"]).stdout)[0]
    domains = [line.partition("=")[2] for line in info["Config"]["Env"] if line.startswith("RAKAZO_HOST=")]
    if len(domains) != 1 or not re.fullmatch(r"[A-Za-z0-9.-]+", domains[0]):
        raise ValueError("Unexpected domain")
    body = run(["docker", "exec", "rakazo-prod-caddy-1", "curl", "-fsS", "--max-time", "8",
                "--noproxy", "*", "--resolve", domains[0] + ":443:127.0.0.1",
                "https://" + domains[0] + "/health"]).stdout
    return json.loads(body).get("ok") is True

def apply(code):
    if os.geteuid() != 0:
        raise ValueError("Requires root")
    lockfd = lock(True)
    try:
        original, info = read_overlay()
        if hashlib.sha256(original).hexdigest() != DIGEST:
            raise ValueError("Production overlay changed")
        anchor = b"  api:\n    environment:\n"
        if original.count(anchor) != 1 or b"EXTRA_TRUSTED_ORIGINS:" in original:
            raise ValueError("Unexpected API overlay")
        replacement = ("  api:\n    image: " + IMAGE + "\n    environment:\n"
                       "      EXTRA_TRUSTED_ORIGINS: https://" + IP + "\n").encode()
        candidate = original.replace(anchor, replacement, 1)
        items = api_containers()
        if len(items) != 1 or items[0]["image"] != BASE or items[0]["health"] != "healthy":
            raise ValueError("Unexpected existing API")
        if run(["docker", "image", "inspect", "--format", "{{.Id}}", IMAGE]).stdout.decode().strip() != IMAGE:
            raise ValueError("Candidate image missing")
        baseline = json.loads(compose("config", "--format", "json"))
        original_ref = baseline["services"]["api"]["image"]
        if run(["docker", "image", "inspect", "--format", "{{.Id}}", original_ref]).stdout.decode().strip() != BASE:
            raise ValueError("Original image tag no longer points to baseline")
        fd, path = tempfile.mkstemp(prefix="sydney-ip-api-preflight-", suffix=".yml", dir="/run")
        try:
            with os.fdopen(fd, "wb") as temp:
                temp.write(candidate)
            result = run(["docker", "compose", "--env-file", ROOT + "/.env",
                          "-f", ROOT + "/infra/compose/docker-compose.prod.yml", "-f", path,
                          "config", "--format", "json"])
            proposed = json.loads(result.stdout)
        finally:
            os.unlink(path)
        before_api = baseline["services"]["api"]
        after_api = proposed["services"]["api"]
        if after_api.pop("image") != IMAGE:
            raise ValueError("Unexpected API image")
        before_api.pop("image")
        if after_api["environment"].pop("EXTRA_TRUSTED_ORIGINS") != "https://" + IP or baseline != proposed:
            raise ValueError("Unexpected Compose changes")
        if not domain_health():
            raise ValueError("Existing domain health failed")
        token = secrets.token_hex(16)
        name = "sydney-ip-api-" + token
        directory = "/run/" + name
        timer = name + "-restore"
        state = {"original": base64.b64encode(original).decode(),
                 "candidate": base64.b64encode(candidate).decode(),
                 "mode": stat.S_IMODE(info.st_mode), "uid": info.st_uid, "gid": info.st_gid}
        os.mkdir(directory, 0o700)
        with os.fdopen(os.open(directory + "/state.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as out:
            json.dump(state, out, separators=(",", ":"))
            out.flush()
            os.fsync(out.fileno())
        encoded = base64.b64encode(code).decode()
        run(["/usr/bin/systemd-run", "--quiet", "--unit=" + timer, "--on-active=600",
             "--timer-property=AccuracySec=1s", "--remain-after-exit", "/usr/bin/python3",
             "-I", "-c", "import base64;exec(base64.b64decode(%r))" % encoded, "rollback", name])
        if run(["/usr/bin/systemctl", "is-active", timer + ".timer"]).stdout.strip() != b"active":
            raise ValueError("Rollback timer not active")
        committed = False
        try:
            backup = OVERLAY + ".before-ip-" + token
            with os.fdopen(os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb") as out:
                out.write(original)
                out.flush()
                os.fsync(out.fileno())
            replace_overlay(original, candidate, state["mode"], state["uid"], state["gid"])
            compose("up", "-d", "--no-deps", "--no-recreate", "--no-build", "--pull", "never",
                    "--scale", "api=2", "api")
            new = wait_for(IMAGE)
            direct_probe(new["id"])
            if not domain_health():
                raise ValueError("Existing domain health failed after scale-up")
            old = [item for item in api_containers() if item["image"] == BASE]
            if len(old) != 1 or old[0]["id"] != items[0]["id"] or old[0]["started"] != items[0]["started"]:
                raise ValueError("Original API identity changed")
            stop_remove(old[0]["id"])
            if wait_for(IMAGE)["id"] != new["id"] or not domain_health():
                raise ValueError("New API health failed after replacement")
            direct_probe(new["id"])
            current, _ = read_overlay()
            if current != candidate:
                raise ValueError("Overlay changed after deployment")
            run(["/usr/bin/systemctl", "stop", timer + ".timer"])
            if run(["/usr/bin/systemctl", "show", timer + ".service",
                    "-p", "LoadState", "--value"]).stdout.strip() != b"not-found":
                run(["/usr/bin/systemctl", "stop", timer + ".service"])
            committed = True
            print("API_DEPLOYED backup=" + backup, flush=True)
            print("IP_origin_direct_session_and_rpc_health=passed", flush=True)
        finally:
            if not committed:
                try:
                    rollback(name, locked=True)
                    run(["/usr/bin/systemctl", "stop", timer + ".timer"])
                except Exception as error:
                    print("API_ROLLBACK_UNCONFIRMED " + name + " " + type(error).__name__, flush=True)
    finally:
        os.close(lockfd)

if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "rollback":
        rollback(sys.argv[2])
    else:
        payload = json.load(sys.stdin)
        apply(base64.b64decode(payload["remote"], validate=True))
'''


def main():
    compile(REMOTE, "ip-api-deploy", "exec")
    encoded = base64.b64encode(REMOTE.encode()).decode()
    command = "sudo /usr/bin/python3 -I -u -c " + shlex.quote(
        "import base64;exec(base64.b64decode(%r))" % encoded
    )
    payload = json.dumps({"remote": encoded}).encode()
    process = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
         "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3",
         "sydney-cloud-admin", command],
        input=payload, timeout=600,
    )
    return process.returncode


if __name__ == "__main__":
    raise SystemExit(main())
