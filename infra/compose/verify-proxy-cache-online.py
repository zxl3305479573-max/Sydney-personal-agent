#!/usr/bin/env python3
"""Compare the fixed online cache backup with a later source observation."""

import base64
import json
import shlex
import subprocess
import sys

SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
       "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3"]

SOURCE = r"""
import hashlib,json,os,stat
path = "/var/lib/sydney-mihomo/cache.db"
fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
with os.fdopen(fd, "rb") as file:
    before = os.fstat(file.fileno())
    if not stat.S_ISREG(before.st_mode) or before.st_uid != 999 or before.st_size > 1048576:
        raise ValueError("unexpected source")
    data = file.read(1048577)
    after = os.fstat(file.fileno())
    fields = lambda item: (item.st_dev, item.st_ino, item.st_size, item.st_mtime_ns, item.st_ctime_ns)
    if fields(before) != fields(after) or len(data) != before.st_size:
        raise ValueError("source changed during observation")
print(json.dumps([len(data), before.st_uid, before.st_gid,
                  stat.S_IMODE(before.st_mode), hashlib.sha256(data).hexdigest()]))
"""

TARGET = r"""
import hashlib,io,json,os,re,stat,subprocess,tarfile,tempfile
root = "/var/backups/sydney-ip-migration/image-recv-20261111"
backing = "/var/backups/sydney-ip-migration/image-recv-20261111.ext4"
path = root + "/native-proxy-cache-online-20261112.age"
identity = "/var/lib/sydney-backup-keys/ip-migration.agekey"
age = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age"
def command(args):
    return subprocess.check_output(args, stderr=subprocess.DEVNULL, timeout=15).decode().strip()
if os.readlink("/proc/self/ns/mnt") == os.readlink("/proc/1/ns/mnt"):
    raise ValueError("missing private mount namespace")
fields = command(["/usr/bin/findmnt", "-n", "-o", "TARGET,SOURCE,FSTYPE,OPTIONS",
                  "--target", root]).split()
if (len(fields) != 4 or fields[0] != root or not re.fullmatch(r"/dev/loop[0-9]+", fields[1])
        or fields[2] != "ext4" or not {"nodev", "nosuid", "noexec"} <= set(fields[3].split(","))
        or os.path.realpath(command(["/usr/sbin/losetup", "-n", "-O", "BACK-FILE",
                                    fields[1]])) != backing):
    raise ValueError("mount identity mismatch")
if command(["/usr/bin/findmnt", "-n", "-o", "FSTYPE", "--target", "/dev/shm"]) != "tmpfs":
    raise ValueError("temporary storage is not tmpfs")
for filename in (path, identity):
    info = os.lstat(filename)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError("unsafe input permissions")
with open(path, "rb") as file:
    encrypted = file.read(41161)
if len(encrypted) != 41160 or hashlib.sha256(encrypted).hexdigest() != \
        "69639c30359ecfbe5effd232f88d4fe33d23597db19f35cdd5a16cb753350799":
    raise ValueError("ciphertext mismatch")
result = subprocess.run([age, "-d", "-i", identity], input=encrypted,
                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                        check=True, timeout=30)
if len(result.stdout) > 2 * 1024 * 1024:
    raise ValueError("archive too large")
with tarfile.open(fileobj=io.BytesIO(result.stdout), mode="r:") as archive:
    members = archive.getmembers()
    if (len(members) != 1 or members[0].name != "var/lib/sydney-mihomo/cache.db"
            or not members[0].isfile() or members[0].size > 1048576):
        raise ValueError("unexpected archive")
    member = members[0]
    data = archive.extractfile(member).read()
    if len(data) != member.size:
        raise ValueError("short archive")
with tempfile.TemporaryDirectory(prefix="sydney-cache-restore-", dir="/dev/shm") as directory:
    filename = os.path.join(directory, "cache.db")
    with open(filename, "xb") as file:
        os.fchmod(file.fileno(), 0o600)
        file.write(data)
        file.flush()
        os.fsync(file.fileno())
    with open(filename, "rb") as file:
        restored = file.read(1048577)
    if restored != data:
        raise ValueError("restored bytes differ")
print(json.dumps([len(restored), member.uid, member.gid, member.mode,
                  hashlib.sha256(restored).hexdigest()]))
"""


def observe(host, program):
    encoded = base64.b64encode(program.encode()).decode()
    code = "import base64;exec(base64.b64decode(%r))" % encoded
    command = ("sudo /usr/bin/unshare --mount --propagation private "
               "/usr/bin/python3 -I -c " + shlex.quote(code))
    result = subprocess.run(SSH + [host, command], check=True, stdout=subprocess.PIPE,
                            timeout=60)
    return json.loads(result.stdout)


def main():
    if sys.argv[1:]:
        raise SystemExit("This check accepts no arguments.")
    restored = observe("sydney-backend-admin", TARGET)
    source = observe("sydney-cloud-admin", SOURCE)
    if restored != source:
        raise ValueError("restored metadata or content differs from later source observation")
    print("restored cache bytes and archived numeric metadata match a later source observation")


if __name__ == "__main__":
    main()
