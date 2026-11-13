#!/usr/bin/env python3
"""Self-contained synthetic collection experiment; never reads Docker volumes."""

import argparse
import hashlib
import io
import json
import os
import pathlib
import platform
import signal
import stat
import subprocess
import sys
import tarfile
import time


AGE = "/usr/bin/age"
KEYGEN = "/usr/bin/age-keygen"
HELPER = pathlib.Path(__file__).with_name("backup-caddy-volumes-encrypted.py")
ENVIRONMENT = {"PATH": "/usr/bin:/bin", "LC_ALL": "C"}
FIXTURES = {"data": b"synthetic-data\n", "config": b"synthetic-config\n"}
CAPTURE_BOOTSTRAP = """
import runpy, signal, subprocess, sys
signal.pthread_sigmask(signal.SIG_SETMASK, [])
original = subprocess.Popen
class GroupPopen(original):
    def __init__(self, *args, **kwargs):
        kwargs["start_new_session"] = False
        super().__init__(*args, **kwargs)
subprocess.Popen = GroupPopen
sys.argv = sys.argv[1:]
runpy.run_path(sys.argv[0], run_name="__main__")
"""


def parse_args(arguments):
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--max-output-bytes", type=int, default=1048576)
    parser.add_argument("--reserve-bytes", type=int, default=1048576)
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args(arguments)
    if not 16384 <= args.max_output_bytes <= 16777216:
        parser.error("max-output-bytes must be between 16384 and 16777216")
    if not 1 <= args.reserve_bytes <= 1073741824:
        parser.error("reserve-bytes must be between 1 and 1073741824")
    if not 1 <= args.timeout <= 120:
        parser.error("timeout must be between 1 and 120 seconds")
    return args


def check_platform():
    if (not sys.flags.isolated or not sys.flags.no_site
            or sys.platform != "linux" or platform.machine() not in ("x86_64", "aarch64")
            or len(set(os.getresuid())) != 1 or os.getuid() == 0):
        raise ValueError("requires isolated Python, Linux x86_64/aarch64 and an unprivileged identity")
    for path in (AGE, KEYGEN, str(HELPER)):
        info = os.stat(path, follow_symlinks=False)
        if not stat.S_ISREG(info.st_mode):
            raise ValueError("trusted tools and helper must be regular files")


def make_fixture(lab):
    entries = []
    roots = {}
    for root, payload in FIXTURES.items():
        directory = lab / root
        directory.mkdir(mode=0o700)
        directory_info = directory.stat()
        roots[root] = (directory_info.st_uid, directory_info.st_gid,
                       stat.S_IMODE(directory_info.st_mode))
        target = directory / "fixture"
        target.write_bytes(payload)
        target.chmod(0o600)
        info = target.stat()
        entries.append({"root": root, "path": "fixture", "type": "file",
                        "uid": info.st_uid, "gid": info.st_gid, "mode": 0o600,
                        "sha256": hashlib.sha256(payload).hexdigest()})
    manifest = lab / "manifest.json"
    manifest.write_text(json.dumps({"version": 1, "entries": entries}), encoding="utf-8")
    manifest.chmod(0o600)
    output = lab / "output"
    output.mkdir(mode=0o700)
    return entries, roots


def verify_archive(plaintext, entries, roots):
    expected = {"data", "config", "data/fixture", "config/fixture", "MANIFEST.json"}
    with tarfile.open(fileobj=io.BytesIO(plaintext), mode="r:") as archive:
        members = archive.getmembers()
        if len(members) != len(expected) or {member.name for member in members} != expected:
            raise ValueError("unexpected archive members")
        for root, payload in FIXTURES.items():
            directory = archive.getmember(root)
            member = archive.getmember(root + "/fixture")
            metadata = next(item for item in entries if item["root"] == root)
            if (not directory.isdir() or not member.isfile()
                    or (directory.uid, directory.gid, directory.mode) != roots[root]
                    or (member.uid, member.gid, member.mode) !=
                    (metadata["uid"], metadata["gid"], metadata["mode"])
                    or archive.extractfile(member).read() != payload):
                raise ValueError("synthetic archive content or metadata differs")
        manifest = archive.getmember("MANIFEST.json")
        if not manifest.isfile() or json.load(archive.extractfile(manifest)) != {
                "version": 1, "entries": entries}:
            raise ValueError("archive manifest differs")


def run_capture(arguments, descriptors, timeout):
    blocked = {signal.SIGINT, signal.SIGTERM, signal.SIGHUP}
    previous = signal.pthread_sigmask(signal.SIG_BLOCK, blocked)
    handlers = {}
    process = None
    try:
        def interrupted(signum, frame):
            raise InterruptedError(f"capture interrupted by signal {signum}")

        for signum in blocked:
            handlers[signum] = signal.signal(signum, interrupted)
        process = subprocess.Popen(arguments, pass_fds=tuple(descriptors), start_new_session=True,
                                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL, env=ENVIRONMENT, cwd="/")
        signal.pthread_sigmask(signal.SIG_SETMASK, previous)
        deadline = time.monotonic() + timeout
        while True:
            status = os.waitid(os.P_PID, process.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
            if status is not None:
                if status.si_code != os.CLD_EXITED or status.si_status != 0:
                    raise subprocess.CalledProcessError(status.si_status, arguments)
                break
            if time.monotonic() >= deadline:
                raise subprocess.TimeoutExpired(arguments, timeout)
            time.sleep(0.02)
    finally:
        signal.pthread_sigmask(signal.SIG_BLOCK, blocked)
        try:
            if process is not None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=5)
        finally:
            for signum, handler in handlers.items():
                signal.signal(signum, handler)
            signal.pthread_sigmask(signal.SIG_SETMASK, previous)


def collect(args, lab):
    entries, roots = make_fixture(lab)
    identity = lab / "identity"
    subprocess.run([KEYGEN, "-o", str(identity)], check=True, timeout=args.timeout,
                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                   env=ENVIRONMENT, cwd="/")
    recipient = subprocess.run([KEYGEN, "-y", str(identity)], check=True, timeout=args.timeout,
                               stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               env=ENVIRONMENT, cwd="/", text=True).stdout.strip()
    descriptors = []
    try:
        for name in ("data", "config", "manifest.json", "output"):
            flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW
            if name != "manifest.json":
                flags |= os.O_DIRECTORY
            descriptors.append(os.open(lab / name, flags))
        arguments = [sys.executable, "-I", "-S", "-c", CAPTURE_BOOTSTRAP,
                     str(HELPER), "--synthetic-only",
                     "--data-fd", str(descriptors[0]), "--config-fd", str(descriptors[1]),
                     "--manifest-fd", str(descriptors[2]), "--output-dir-fd", str(descriptors[3]),
                     "--max-bytes", "1024", "--max-output-bytes", str(args.max_output_bytes),
                     "--reserve-bytes", str(args.reserve_bytes), "--timeout", str(args.timeout),
                     "--output", "synthetic.age", "--recipient", recipient, "--age", AGE]
        run_capture(arguments, descriptors, args.timeout + 10)
    finally:
        for descriptor in descriptors:
            os.close(descriptor)
    result = subprocess.run([AGE, "-d", "-i", str(identity), str(lab / "output" / "synthetic.age")],
                            check=True, timeout=args.timeout, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            env=ENVIRONMENT, cwd="/")
    verify_archive(result.stdout, entries, roots)


def main(arguments=None):
    parse_args(arguments)
    print("Synthetic collection blocked: external process-tree supervision is not established.",
          file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
