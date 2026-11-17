#!/usr/bin/env python3
"""Transfer one fixed encrypted online cache observation between trusted hosts."""

import base64
import hashlib
import shlex
import subprocess
import sys

SIZE = 41160
DIGEST = "69639c30359ecfbe5effd232f88d4fe33d23597db19f35cdd5a16cb753350799"
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
       "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3"]

REMOTE = r"""
import hashlib, os, re, stat, subprocess, sys

size = 41160
digest = "69639c30359ecfbe5effd232f88d4fe33d23597db19f35cdd5a16cb753350799"
source = sys.argv[1] == "source"
if sys.argv[1:] not in (["source"], ["target"]):
    raise ValueError("invalid operation")
if os.readlink("/proc/self/ns/mnt") == os.readlink("/proc/1/ns/mnt"):
    raise ValueError("missing private mount namespace")
stage = ("/var/backups/sydney-ip-staging" if source
         else "/var/backups/sydney-ip-migration/image-recv-20261111")
backing = ("/var/lib/sydney-backup/ip-staging.ext4" if source
           else "/var/backups/sydney-ip-migration/image-recv-20261111.ext4")
def command(args):
    return subprocess.check_output(args, stderr=subprocess.DEVNULL, timeout=15).decode().strip()
fields = command(["/usr/bin/findmnt", "-n", "-o", "TARGET,SOURCE,FSTYPE,OPTIONS",
                  "--target", stage]).split()
if (len(fields) != 4 or fields[0] != stage or not re.fullmatch(r"/dev/loop[0-9]+", fields[1])
        or fields[2] != "ext4" or not {"nodev", "nosuid", "noexec"} <= set(fields[3].split(","))
        or os.path.realpath(command(["/usr/sbin/losetup", "-n", "-O", "BACK-FILE",
                                    fields[1]])) != backing):
    raise ValueError("mount identity mismatch")
for path, check, mode in ((stage, stat.S_ISDIR, 0o700), (backing, stat.S_ISREG, 0o600)):
    info = os.lstat(path)
    if not check(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != mode:
        raise ValueError("mount permissions mismatch")
if source:
    directory = stage + "/native-proxy-cache-online-20261112"
    parent = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    info = os.fstat(parent)
    if info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError("source directory mismatch")
    fd = os.open("cache.age", os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError("source file mismatch")
    with os.fdopen(fd, "rb") as file:
        data = file.read(size + 1)
    os.close(parent)
    if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
        raise ValueError("source digest mismatch")
    sys.stdout.buffer.write(data)
else:
    space = os.statvfs(stage)
    if space.f_bavail * space.f_frsize < 10 * 1024 * 1024:
        raise ValueError("insufficient space")
    data = sys.stdin.buffer.read(size + 1)
    if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
        raise ValueError("received digest mismatch")
    parent = os.open(stage, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    name = "native-proxy-cache-online-20261112.age"
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
    with os.fdopen(fd, "wb") as file:
        file.write(data)
        file.flush()
        os.fsync(file.fileno())
    os.fsync(parent)
    os.close(parent)
    print("received", len(data), hashlib.sha256(data).hexdigest())
"""


def remote_command(operation):
    encoded = base64.b64encode(REMOTE.encode()).decode()
    code = "import base64;exec(base64.b64decode(%r))" % encoded
    return ("sudo /usr/bin/unshare --mount --propagation private "
            "/usr/bin/python3 -I -c " + shlex.quote(code) + " " + operation)


def main():
    if sys.argv[1:]:
        raise SystemExit("This transfer accepts no arguments.")
    result = subprocess.run(SSH + ["sydney-cloud-admin", remote_command("source")],
                            check=True, stdout=subprocess.PIPE, timeout=60)
    data = result.stdout
    if len(data) != SIZE or hashlib.sha256(data).hexdigest() != DIGEST:
        raise ValueError("local ciphertext digest mismatch")
    subprocess.run(SSH + ["sydney-backend-admin", remote_command("target")],
                   input=data, check=True, timeout=60)


if __name__ == "__main__":
    main()
