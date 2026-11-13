#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile


STAGE = "/var/backups/sydney-ip-migration/webassets-recv-20261112"
BACKING = "/var/backups/sydney-ip-migration/webassets-recv-20261112.ext4"
BACKUP = STAGE + "/capture-20261112"
CODE = "/root/sydney-webassets-restore-code-20261112"
AGE = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age"
IDENTITY = "/var/lib/sydney-backup-keys/ip-migration.agekey"
HASHES = {
    CODE + "/webassets-batch.py": "8fe93031f6e99195acd920189d5010806751d3aa15031afb62fd676226a0bdf6",
    CODE + "/webassets-batch-verify.py": "b8abbf46d3cc3e07b70e68a3519392eaddb90c818b77bc00cbfb9461db21220f",
    CODE + "/webassets-batch-restore.py": "1f288b7b17279be51cd897c76932476505fd693b68c9fd99ea0ec1c16062db2a",
    AGE: "c5cc613335f0dede26fc501ca1154b28a00df81e0113ff2c2d62c81ee717040a",
}


def command(args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=20).strip()


def trusted_file(path, digest=None, private=True):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0
                or info.st_mode & (0o077 if private else 0o022)):
            raise ValueError("untrusted file")
        if digest is not None:
            result = hashlib.sha256()
            with os.fdopen(fd, "rb", closefd=False) as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    result.update(chunk)
            if result.hexdigest() != digest:
                raise ValueError("file checksum mismatch")
    finally:
        os.close(fd)


def check_environment():
    unit = "sydney-webassets-restore-20261112.service"
    if (os.geteuid() != 0 or not os.environ.get("INVOCATION_ID")
            or f"0::/system.slice/{unit}" not in Path("/proc/self/cgroup").read_text().splitlines()
            or os.readlink("/proc/self/ns/net") == os.readlink("/proc/1/ns/net")
            or os.readlink("/proc/self/ns/mnt") == os.readlink("/proc/1/ns/mnt")
            or command(["/usr/bin/systemctl", "show", unit, "-p", "KillMode", "--value"])
            != "control-group"
            or command(["/usr/bin/systemctl", "show", unit, "-p", "RuntimeMaxUSec", "--value"])
            != "15min"):
        raise ValueError("invalid isolation or supervision")
    fields = command(["/usr/bin/findmnt", "-n", "-o", "TARGET,SOURCE,FSTYPE,OPTIONS",
                      "--target", STAGE]).split()
    if (len(fields) != 4 or fields[0] != STAGE or fields[2] != "ext4"
            or not fields[1].startswith("/dev/loop")
            or not {"nodev", "nosuid", "noexec"} <= set(fields[3].split(","))
            or os.path.realpath(command(["/usr/sbin/losetup", "-n", "-O", "BACK-FILE", fields[1]]))
            != BACKING):
        raise ValueError("invalid backup mount")
    for path, kind, mode in ((STAGE, stat.S_ISDIR, 0o700), (BACKING, stat.S_ISREG, 0o600),
                             (BACKUP, stat.S_ISDIR, 0o700)):
        info = os.stat(path, follow_symlinks=False)
        if not kind(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != mode:
            raise ValueError("invalid backup permissions")
    if command(["/usr/bin/findmnt", "-n", "-o", "FSTYPE", "--target", "/dev/shm"]) != "tmpfs":
        raise ValueError("temporary filesystem unavailable")
    available = os.statvfs("/dev/shm")
    if available.f_bavail * available.f_frsize < 300 * 1024 * 1024:
        raise ValueError("temporary filesystem capacity")
    for path, digest in HASHES.items():
        trusted_file(path, digest, private=path != AGE)
    trusted_file(IDENTITY)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    check_environment()
    scanner = load("webassets_scan", CODE + "/webassets-batch.py")
    restore = load("webassets_restore", CODE + "/webassets-batch-restore.py")
    backup_fd = os.open(BACKUP, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        with tempfile.TemporaryDirectory(prefix="sydney-webassets-restored-", dir="/dev/shm") as target:
            target_fd = os.open(target, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
            try:
                result = restore.restore(backup_fd, target_fd, AGE, IDENTITY)
                raw = restore.verifier.decrypt(backup_fd, "manifest.age",
                                               restore.verifier.MAX_MANIFEST, AGE, IDENTITY)
                manifest = json.loads(raw.decode("ascii"),
                                      object_pairs_hook=restore.verifier.no_duplicates)
                _, expected, _, total = restore.verifier.validate_manifest(manifest)
                actual, actual_total = scanner.scan(target_fd, manifest["owner"])
                if total != actual_total or set(actual) != set(expected):
                    raise ValueError("restored tree mismatch")
                for path, expected_entry in expected.items():
                    actual_entry = actual[path]
                    if expected_entry[0] != actual_entry[0]:
                        raise ValueError("restored entry type mismatch")
                    for index in (2, 3, 4, 7):
                        if expected_entry[1][index] != actual_entry[1][index]:
                            raise ValueError("restored entry metadata mismatch")
                    if (expected_entry[0] == "file"
                            and (expected_entry[1][6], expected_entry[2])
                            != (actual_entry[1][6], actual_entry[2])):
                        raise ValueError("restored file mismatch")
            finally:
                os.close(target_fd)
        print(f"webassets_restore_verified groups={result[0]} files={result[1]} bytes={result[2]}")
    finally:
        os.close(backup_fd)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        print("webassets restore failed; inspect isolated state before retry", file=sys.stderr)
        sys.exit(1)
