#!/usr/bin/env python3
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys


SOURCE = "/var/lib/docker/volumes/rakazo-prod_webassets/_data"
STAGE = "/var/backups/sydney-webassets-staging-20261112"
BACKING = "/var/lib/sydney-backup/webassets-staging-20261112.ext4"
OUTPUT = STAGE + "/capture-20261112"
CODE = "/root/sydney-webassets-code-20261112"
AGE_DIRECTORY = "/root/sydney-image-age-20261111/unpacked/usr/bin"
RECIPIENT = "/root/sydney-image-age-20261111/recipient"
CONTAINER = "bcb599484e7caa153d89a427350329fb3883e2db1338f33fe913fc4f82d16d5a"
HASHES = {
    CODE + "/webassets-batch.py": "8fe93031f6e99195acd920189d5010806751d3aa15031afb62fd676226a0bdf6",
    CODE + "/backup-config-encrypted.sh": "15f43094e84ed4d99179e8a9ea28abf9e1ece37484f0bbe7c00ce6ddffaa0382",
    AGE_DIRECTORY + "/age": "529450dfeaf3055cb24d76789d0b1f5eb8cd23e03dc4add64f84776df1272b02",
    RECIPIENT: "819c1ba8809aef2ef71473102556d2cd3f593d735fb4682ab139152dcf3c59b5",
}


def command(args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=20).strip()


def check_file(path, digest, private):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0
                or info.st_mode & (0o077 if private else 0o022)):
            raise ValueError("untrusted executable or configuration")
        result = hashlib.sha256()
        with os.fdopen(fd, "rb", closefd=False) as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                result.update(chunk)
        if result.hexdigest() != digest:
            raise ValueError("executable or configuration changed")
    finally:
        os.close(fd)


def check_stage():
    info = os.stat(STAGE, follow_symlinks=False)
    backing = os.stat(BACKING, follow_symlinks=False)
    if (not stat.S_ISDIR(info.st_mode) or (info.st_uid, stat.S_IMODE(info.st_mode)) != (0, 0o700)
            or not stat.S_ISREG(backing.st_mode)
            or (backing.st_uid, stat.S_IMODE(backing.st_mode), backing.st_size)
            != (0, 0o600, 768 * 1024 * 1024)):
        raise ValueError("invalid staging permissions")
    fields = command(["/usr/bin/findmnt", "-n", "-o", "TARGET,SOURCE,FSTYPE,OPTIONS",
                      "--target", STAGE]).split()
    if (len(fields) != 4 or fields[0] != STAGE or fields[2] != "ext4"
            or not all(option in fields[3].split(",") for option in ("nodev", "nosuid", "noexec"))
            or not fields[1].startswith("/dev/loop")):
        raise ValueError("invalid staging mount")
    real_backing = command(["/usr/sbin/losetup", "-n", "-O", "BACK-FILE", fields[1]])
    if os.path.realpath(real_backing) != BACKING:
        raise ValueError("invalid staging backing")
    available = os.statvfs(STAGE)
    if available.f_bavail * available.f_frsize < 600 * 1024 * 1024:
        raise ValueError("insufficient staging capacity")
    if os.path.lexists(OUTPUT):
        raise ValueError("capture output already exists")


def check_source():
    inspect = json.loads(command(["/usr/bin/docker", "inspect", CONTAINER]))
    if len(inspect) != 1:
        raise ValueError("invalid web container")
    container = inspect[0]
    labels = container["Config"]["Labels"]
    state = container["State"]
    if (container["Id"] != CONTAINER or not state["Running"]
            or state.get("Health", {}).get("Status") != "healthy"
            or labels.get("com.docker.compose.project") != "rakazo-prod"
            or labels.get("com.docker.compose.service") != "web"):
        raise ValueError("web container identity changed")
    mounts = [mount for mount in container["Mounts"]
              if mount.get("Name") == "rakazo-prod_webassets"
              and mount.get("Destination") == "/app/apps/web/asset-archive"]
    volume = json.loads(command(["/usr/bin/docker", "volume", "inspect", "rakazo-prod_webassets"]))
    if (len(mounts) != 1 or mounts[0].get("Type") != "volume"
            or mounts[0].get("Source") != SOURCE or len(volume) != 1
            or volume[0].get("Driver") != "local" or volume[0].get("Mountpoint") != SOURCE):
        raise ValueError("web volume identity changed")
    source = os.stat(SOURCE, follow_symlinks=False)
    if (not stat.S_ISDIR(source.st_mode)
            or (source.st_uid, source.st_gid, stat.S_IMODE(source.st_mode)) != (1000, 1000, 0o750)):
        raise ValueError("invalid web volume root")
    inside = command(["/usr/bin/docker", "exec", CONTAINER, "stat", "-c", "%d:%i",
                      "/app/apps/web/asset-archive"])
    if inside != f"{source.st_dev}:{source.st_ino}":
        raise ValueError("container and host volume differ")
    return container["Id"], state["StartedAt"], source.st_dev, source.st_ino


def main():
    if os.geteuid() != 0 or sys.argv[1:] not in (["--check"], ["--capture"]):
        raise ValueError("invalid invocation")
    for path, digest in HASHES.items():
        check_file(path, digest, path.startswith(CODE + "/") or path == RECIPIENT)
    check_stage()
    before = check_source()
    if sys.argv[1:] == ["--check"]:
        print("webassets_preflight=passed")
        return
    cgroup = Path("/proc/self/cgroup").read_text(encoding="ascii").splitlines()
    unit = "sydney-webassets-capture-20261112.service"
    if (not os.environ.get("INVOCATION_ID")
            or f"0::/system.slice/{unit}" not in cgroup
            or command(["/usr/bin/systemctl", "show", unit, "-p", "KillMode", "--value"])
            != "control-group"
            or command(["/usr/bin/systemctl", "show", unit, "-p", "RuntimeMaxUSec", "--value"])
            != "15min"):
        raise ValueError("systemd supervision required")
    lock = os.open("/run/lock/sydney-webassets-capture-20261112.lock",
                   os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        lock_info = os.fstat(lock)
        if not stat.S_ISREG(lock_info.st_mode) or lock_info.st_uid != 0:
            raise ValueError("invalid lock")
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        check_stage()
        if check_source() != before:
            raise ValueError("source changed before capture")
        os.mkdir(OUTPUT, 0o700)
        spec = importlib.util.spec_from_file_location("webassets_batch", CODE + "/webassets-batch.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        recipient = Path(RECIPIENT).read_text(encoding="ascii").strip()
        groups, files, size = module.capture(SOURCE, OUTPUT, 1000, recipient,
                                              CODE + "/backup-config-encrypted.sh", AGE_DIRECTORY)
        if check_source() != before:
            raise ValueError("source changed after capture")
        print(f"webassets_capture_complete groups={groups} files={files} bytes={size}")
    finally:
        os.close(lock)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        print("webassets capture or preflight failed; inspect state before retry", file=sys.stderr)
        sys.exit(1)
