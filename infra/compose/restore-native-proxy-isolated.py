#!/usr/bin/env python3
"""Validate restored proxy materials only inside a disposable network namespace."""

import hashlib
import io
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys
import tarfile
import tempfile
import time

import yaml


ROOT = Path("/var/backups/sydney-ip-migration/image-recv-20261111")
AGE = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age"
IDENTITY = "/var/lib/sydney-backup-keys/ip-migration.agekey"
ARCHIVES = {
    "binary": (
        "native-proxy-binary-20261112.age",
        "bc43a70746673dbf476863d9619c8f670bd56234223c58f1e491f5b8e0b80026",
        85 * 1024 * 1024,
    ),
    "config": (
        "native-proxy-config-20261112.age",
        "cd58d91b295d5e77054c7bba91bc763a04bea80ddf3e512c0112dab0fe4c3be5",
        1024 * 1024,
    ),
    "provider": (
        "native-provider-20261112.age",
        "ca4c24f595b31ddd4c4fc88a70f80cf056c1ebf271b4d6efea9ccedae7b03976",
        1024 * 1024,
    ),
}
ISOLATED_UID = 64000
ISOLATED_GID = 64000


def read_archive(name):
    filename, expected, limit = ARCHIVES[name]
    path = ROOT / filename
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0
                or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
            raise ValueError("unsafe ciphertext")
        digest = hashlib.sha256()
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
        if digest.hexdigest() != expected:
            raise ValueError("ciphertext mismatch")
        os.lseek(fd, 0, os.SEEK_SET)
        result = subprocess.run(
            [AGE, "-d", "-i", IDENTITY], stdin=fd, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, check=True, timeout=60,
        )
        if len(result.stdout) > limit:
            raise ValueError("archive exceeds limit")
    finally:
        os.close(fd)
    with tarfile.open(fileobj=io.BytesIO(result.stdout), mode="r:") as archive:
        members = archive.getmembers()
        if len(members) != 1 or not members[0].isfile() or members[0].size > limit:
            raise ValueError("unexpected archive")
        data = archive.extractfile(members[0]).read()
        if len(data) != members[0].size:
            raise ValueError("incomplete archive")
        return data


def check_isolation():
    host_namespace = os.environ.get("SYDNEY_HOST_NET_NS", "")
    if (os.getuid() != 0 or not re.fullmatch(r"net:\[\d+\]", host_namespace)
            or os.readlink("/proc/self/ns/net") == host_namespace):
        raise ValueError("private network namespace required")
    print("network_namespace_distinct", flush=True)
    if {name for _, name in socket.if_nameindex()} != {"lo"}:
        raise ValueError("unexpected network interface")
    print("network_interfaces_verified", flush=True)
    filesystem = subprocess.check_output(
        ["/usr/bin/findmnt", "-n", "-o", "FSTYPE", "--target", "/dev/shm"],
        text=True, timeout=10, stderr=subprocess.DEVNULL,
    ).strip()
    if filesystem != "tmpfs":
        raise ValueError("tmpfs required")


def main():
    check_isolation()
    print("isolation_verified", flush=True)
    binary = read_archive("binary")
    if hashlib.sha256(binary).hexdigest() != (
        "817f50b3ac6a8b1c4360c5cf2961906057f3a883d970ebbcb0028a01632b620f"
    ):
        raise ValueError("binary mismatch")
    config = yaml.safe_load(read_archive("config"))
    provider_data = read_archive("provider")
    print("archives_decrypted", flush=True)
    if not isinstance(config, dict):
        raise ValueError("invalid configuration")
    providers = config.get("proxy-providers")
    if not isinstance(providers, dict) or len(providers) != 1:
        raise ValueError("unexpected providers")
    provider = next(iter(providers.values()))
    if not isinstance(provider, dict) or provider.get("type") != "http":
        raise ValueError("unexpected provider")

    with tempfile.TemporaryDirectory(prefix="sydney-proxy-isolated-", dir="/dev/shm") as directory:
        directory_path = Path(directory)
        print("temporary_directory_created", flush=True)
        provider_path = directory_path / "provider.yaml"
        provider_path.write_bytes(provider_data)
        os.chmod(provider_path, 0o600)
        provider["path"] = str(provider_path)
        provider["url"] = "http://127.0.0.1:1/unavailable"
        provider["interval"] = 86400
        provider["health-check"] = {"enable": False}
        config["tun"] = {"enable": False}
        config["dns"] = {"enable": False}
        config["allow-lan"] = False
        config["bind-address"] = "127.0.0.1"
        for field in (
            "port", "socks-port", "redir-port", "tproxy-port", "mixed-port",
            "external-controller", "external-controller-unix", "external-controller-pipe",
            "external-ui", "external-ui-url",
        ):
            config.pop(field, None)
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        config["mixed-port"] = port
        config_path = directory_path / "config.yaml"
        config_path.write_text(yaml.safe_dump(config, allow_unicode=True), encoding="utf-8")
        os.chmod(config_path, 0o600)
        os.chown(provider_path, ISOLATED_UID, ISOLATED_GID)
        os.chown(config_path, ISOLATED_UID, ISOLATED_GID)
        os.chown(directory, ISOLATED_UID, ISOLATED_GID)
        print("temporary_materials_created", flush=True)
        fd = os.memfd_create("sydney-proxy-restored", os.MFD_CLOEXEC)
        try:
            view = memoryview(binary)
            while view:
                count = os.write(fd, view)
                if count <= 0:
                    raise OSError("short write")
                view = view[count:]
            os.fchmod(fd, 0o555)
            print("executable_prepared", flush=True)
            os.setgroups([])
            os.setgid(ISOLATED_GID)
            os.setuid(ISOLATED_UID)
            if os.getresuid() != (ISOLATED_UID,) * 3:
                raise ValueError("identity drop failed")
            with open("/proc/self/status", encoding="ascii") as status:
                effective = [line.split()[1] for line in status if line.startswith("CapEff:")]
            if effective != ["0000000000000000"]:
                raise ValueError("capabilities remain")
            print("identity_dropped", flush=True)
            executable = "/proc/self/fd/" + str(fd)
            args = [executable, "-d", directory, "-f", str(config_path)]
            subprocess.run(
                args + ["-t"], pass_fds=(fd,), stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, timeout=30,
                env={"PATH": "/usr/bin:/bin", "HOME": directory, "LC_ALL": "C"},
            )
            print("proxy_config_verified", flush=True)
            process = subprocess.Popen(
                args, pass_fds=(fd,), stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
                env={"PATH": "/usr/bin:/bin", "HOME": directory, "LC_ALL": "C"},
            )
            try:
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        raise RuntimeError("proxy exited")
                    try:
                        with socket.create_connection(("127.0.0.1", port), timeout=1):
                            break
                    except OSError:
                        time.sleep(0.1)
                else:
                    raise TimeoutError("proxy did not listen")
                print("isolated_proxy_config_and_listener_verified", flush=True)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
        finally:
            os.close(fd)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError, tarfile.TarError) as error:
        print("isolated_proxy_not_verified type=" + type(error).__name__, file=sys.stderr)
        sys.exit(1)
