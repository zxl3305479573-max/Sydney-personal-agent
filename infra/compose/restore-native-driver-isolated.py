#!/usr/bin/env python3
"""Exercise a restored driver with disposable workspaces and socket activation."""

import hashlib
import io
import json
import os
from pathlib import Path
import pwd
import re
import socket
import stat
import subprocess
import sys
import tarfile
import tempfile
import time


ARCHIVE = "/var/backups/sydney-ip-migration/image-recv-20261111/native-driver-config.age"
AGE = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age"
IDENTITY = "/var/lib/sydney-backup-keys/ip-migration.agekey"
DRIVER_UID = 64001
DRIVER_GID = 64001
OTHER_UID = 64002
OTHER_GID = 64002


def recovered_driver():
    fd = os.open(ARCHIVE, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0
                or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
            raise ValueError("unsafe archive")
        digest = hashlib.sha256()
        while True:
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            digest.update(chunk)
        if digest.hexdigest() != "bc326e9fa2b63dee3e4c1eb4ae6e93c5cfb8812b7988e4f6cddb68dda7877720":
            raise ValueError("archive mismatch")
        os.lseek(fd, 0, os.SEEK_SET)
        result = subprocess.run(
            [AGE, "-d", "-i", IDENTITY], stdin=fd, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, check=True, timeout=30,
        )
    finally:
        os.close(fd)
    if len(result.stdout) > 1024 * 1024:
        raise ValueError("archive too large")
    with tarfile.open(fileobj=io.BytesIO(result.stdout), mode="r:") as archive:
        members = archive.getmembers()
        matches = [member for member in members
                   if member.name == "opt/sydney-native/driver.py" and member.isfile()]
        if len(members) != 4 or len(matches) != 1:
            raise ValueError("unexpected archive members")
        data = archive.extractfile(matches[0]).read()
    if hashlib.sha256(data).hexdigest() != "e23d9ceb43396be64f5aadb45684c72070d3f21067b86b9a879a33b601ac07c6":
        raise ValueError("driver source mismatch")
    return data


def exchange(path, request, uid, gid):
    client = """
import json, socket, sys
connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
connection.settimeout(3)
connection.connect(sys.argv[1])
connection.sendall(sys.argv[2].encode() + b"\\n")
data = bytearray()
while b"\\n" not in data:
    try:
        chunk = connection.recv(65536)
    except ConnectionResetError:
        break
    if not chunk:
        break
    data.extend(chunk)
if len(data) > 65536:
    raise ValueError("response too large")
sys.stdout.buffer.write(data)
"""
    result = subprocess.run(
        [sys.executable, "-I", "-c", client, path, json.dumps(request)],
        user=uid, group=gid, extra_groups=(), stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True, timeout=10,
    )
    return json.loads(result.stdout) if result.stdout else None


def main():
    host_namespace = os.environ.get("SYDNEY_HOST_NET_NS", "")
    if (os.getuid() != 0 or not re.fullmatch(r"net:\[\d+\]", host_namespace)
            or os.readlink("/proc/self/ns/net") == host_namespace
            or {name for _, name in socket.if_nameindex()} != {"lo"}):
        raise ValueError("private network required")
    if subprocess.check_output(
        ["/usr/bin/findmnt", "-n", "-o", "FSTYPE", "--target", "/dev/shm"],
        text=True, stderr=subprocess.DEVNULL, timeout=10,
    ).strip() != "tmpfs":
        raise ValueError("tmpfs required")
    print("isolation_verified", flush=True)
    control = pwd.getpwnam("nobody")
    if control.pw_uid in (0, DRIVER_UID, OTHER_UID):
        raise ValueError("control identity unavailable")
    source = recovered_driver()
    print("driver_decrypted", flush=True)
    with tempfile.TemporaryDirectory(prefix="sydney-driver-isolated-", dir="/dev/shm") as directory:
        os.chmod(directory, 0o711)
        workspace = Path(directory) / "workspace"
        workspace.mkdir(mode=0o700)
        os.chown(workspace, DRIVER_UID, DRIVER_GID)
        socket_path = str(Path(directory) / "driver.sock")
        listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        listener.bind(socket_path)
        os.chmod(socket_path, 0o666)
        listener.listen(8)
        fd = os.memfd_create("sydney-driver-restored", os.MFD_CLOEXEC)
        try:
            if fd == 3:
                raise ValueError("unexpected descriptor")
            written = os.write(fd, source)
            if written != len(source):
                raise OSError("short write")
            os.fchmod(fd, 0o444)
            wrapper = """
import os, runpy, sys
os.dup2(int(sys.argv[1]), 3, inheritable=True)
os.environ["LISTEN_PID"] = str(os.getpid())
runpy.run_path("/proc/self/fd/" + sys.argv[2], run_name="__main__")
"""
            environment = {
                "PATH": "/usr/bin:/bin", "LC_ALL": "C", "LISTEN_FDS": "1",
                "SYDNEY_CONTROL_USER": "nobody", "SYDNEY_WORKSPACE_ROOT": str(workspace),
                "DISPLAY": ":999", "XAUTHORITY": str(Path(directory) / "absent"),
            }

            def start():
                process = subprocess.Popen(
                    [sys.executable, "-I", "-B", "-c", wrapper, str(listener.fileno()), str(fd)],
                    pass_fds=(listener.fileno(), fd), user=DRIVER_UID, group=DRIVER_GID,
                    extra_groups=(), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL, env=environment, start_new_session=True,
                )
                time.sleep(0.3)
                if process.poll() is not None:
                    raise RuntimeError("driver exited")
                return process

            def stop(process):
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)

            first = start()
            print("first_driver_started", flush=True)
            try:
                request = {"method": "provision", "botId": "synthetic"}
                if exchange(socket_path, request, OTHER_UID, OTHER_GID) is not None:
                    raise ValueError("unauthorized peer accepted")
                print("unauthorized_peer_rejected", flush=True)
                result = exchange(socket_path, request, control.pw_uid, control.pw_gid)
                generation = result["value"]["generation"] if result and result.get("ok") else None
                if not isinstance(generation, str) or not re.fullmatch(r"[0-9a-f]{32}", generation):
                    raise ValueError("provision failed")
                print("synthetic_provision_verified", flush=True)
                status = exchange(
                    socket_path, {"method": "status", "botId": "synthetic",
                                  "generation": generation},
                    control.pw_uid, control.pw_gid,
                )
                if not status or status.get("value", {}).get("generation") != generation:
                    raise ValueError("status failed")
                print("first_status_verified", flush=True)
            finally:
                stop(first)
            second = start()
            print("second_driver_started", flush=True)
            try:
                renewed = exchange(socket_path, request, control.pw_uid, control.pw_gid)
                new_generation = renewed["value"]["generation"] if renewed and renewed.get("ok") else None
                if (not isinstance(new_generation, str)
                        or not re.fullmatch(r"[0-9a-f]{32}", new_generation)
                        or new_generation == generation):
                    raise ValueError("new generation unavailable")
                stale = exchange(
                    socket_path, {"method": "status", "botId": "synthetic",
                                  "generation": generation},
                    control.pw_uid, control.pw_gid,
                )
                if not stale or stale.get("ok") is not False:
                    raise ValueError("old generation accepted")
                current = exchange(
                    socket_path, {"method": "status", "botId": "synthetic",
                                  "generation": new_generation},
                    control.pw_uid, control.pw_gid,
                )
                if not current or current.get("value", {}).get("generation") != new_generation:
                    raise ValueError("new generation rejected")
            finally:
                stop(second)
            print("restored_driver_peer_and_restart_generation_verified", flush=True)
        finally:
            os.close(fd)
            listener.close()


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError, tarfile.TarError) as error:
        print("restored_driver_not_verified type=" + type(error).__name__, file=sys.stderr)
        sys.exit(1)
