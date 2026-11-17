#!/usr/bin/env python3
import json
import os
import re
import select
import stat
import subprocess


DOCKER = "/usr/bin/docker"
SOCKET = "/run/docker.sock"
ENVIRONMENT = {"PATH": "/usr/bin:/bin", "HOME": "/nonexistent", "LC_ALL": "C"}
SQL = ("SELECT current_setting('server_version_num'), pg_is_in_recovery(), "
       "(pg_control_system()).system_identifier, "
       "COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),false)")


def command(arguments, timeout=15):
    result = subprocess.run(arguments, env=ENVIRONMENT, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            timeout=timeout, check=False)
    if result.returncode != 0 or len(result.stdout) > 1024 * 1024:
        raise ValueError("source inspection failed")
    return result.stdout.decode("utf-8").strip()


def docker(*arguments):
    return command([DOCKER, "--host", "unix://" + SOCKET, *arguments])


def socket_identity():
    info = os.lstat(SOCKET)
    if (not stat.S_ISSOCK(info.st_mode) or info.st_uid != 0
            or stat.S_IMODE(info.st_mode) & 0o007):
        raise ValueError("unsafe Docker socket")
    return info.st_dev, info.st_ino, info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)


def process_identity(pid):
    if type(pid) is not int or pid <= 1:
        raise ValueError("invalid container process")
    with open(f"/proc/{pid}/stat", encoding="ascii") as source:
        value = source.read()
    suffix = value.rsplit(")", 1)
    if len(suffix) != 2:
        raise ValueError("invalid process identity")
    fields = suffix[1].split()
    if len(fields) <= 19 or not fields[19].isdigit():
        raise ValueError("invalid process start time")
    with open(f"/proc/{pid}/cgroup", encoding="utf-8") as source:
        cgroup = source.read()
    if not cgroup or len(cgroup) > 65536:
        raise ValueError("invalid process cgroup")
    namespaces = tuple(os.readlink(f"/proc/{pid}/ns/{name}") for name in ("pid", "mnt", "net"))
    return int(fields[19]), cgroup, namespaces


def snapshot(project, service, image, volume, user):
    if (not all(isinstance(item, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", item)
                for item in (project, service, volume))
            or not re.fullmatch(r"sha256:[0-9a-f]{64}", image)
            or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_$-]{0,62}", user)):
        raise ValueError("invalid expected source")
    socket_before = socket_identity()
    daemon_before = docker("info", "--format", "{{.ID}}")
    if not daemon_before or len(daemon_before) > 128:
        raise ValueError("invalid daemon identity")
    containers = docker("ps", "-q", "--no-trunc", "--filter",
                        "label=com.docker.compose.project=" + project, "--filter",
                        "label=com.docker.compose.service=" + service).split()
    if len(containers) != 1 or not re.fullmatch(r"[0-9a-f]{64}", containers[0]):
        raise ValueError("expected one database container")
    identifier = containers[0]
    inspected = json.loads(docker("inspect", identifier))
    if not isinstance(inspected, list) or len(inspected) != 1:
        raise ValueError("invalid container inspection")
    item = inspected[0]
    labels = item["Config"].get("Labels") or {}
    state = item["State"]
    if (item["Id"] != identifier or item["Image"] != image
            or labels.get("com.docker.compose.project") != project
            or labels.get("com.docker.compose.service") != service
            or state.get("Running") is not True or not state.get("StartedAt")):
        raise ValueError("database container identity mismatch")
    pid = state["Pid"]
    process = process_identity(pid)
    mounts = [mount for mount in item["Mounts"]
              if mount.get("Destination") == "/var/lib/postgresql"]
    if (len(mounts) != 1 or mounts[0].get("Type") != "volume"
            or mounts[0].get("Name") != volume or mounts[0].get("RW") is not True):
        raise ValueError("database volume mismatch")
    volume_info = json.loads(docker("volume", "inspect", volume))
    if not isinstance(volume_info, list) or len(volume_info) != 1:
        raise ValueError("invalid volume inspection")
    observed = volume_info[0]
    path = mounts[0].get("Source")
    if (observed.get("Name") != volume or observed.get("Driver") != "local"
            or observed.get("Options") or observed.get("Mountpoint") != path
            or not isinstance(path, str) or not path.startswith("/")
            or os.path.normpath(path) != path or path == "/"):
        raise ValueError("database volume identity mismatch")
    root = os.stat(path, follow_symlinks=False)
    if not stat.S_ISDIR(root.st_mode):
        raise ValueError("database volume root unavailable")
    result = docker("exec", identifier, "/usr/bin/env", "-i", "PATH=/usr/bin:/bin",
                    "PGOPTIONS=-c default_transaction_read_only=on",
                    "/usr/bin/timeout", "-k", "1", "10", "/usr/bin/psql",
                    "-X", "-w", "-h", "/var/run/postgresql", "-U", user,
                    "-d", "postgres", "-At", "-F", "|", "-c", SQL).split("|")
    if (len(result) != 4 or not result[0].isdigit() or result[1] != "f"
            or not result[2].isdigit() or result[3] != "t"):
        raise ValueError("PostgreSQL source unavailable")
    containers_after = docker("ps", "-q", "--no-trunc", "--filter",
                              "label=com.docker.compose.project=" + project, "--filter",
                              "label=com.docker.compose.service=" + service).split()
    inspected_after = json.loads(docker("inspect", identifier))
    volume_after = json.loads(docker("volume", "inspect", volume))
    root_after = os.stat(path, follow_symlinks=False)
    if (socket_identity() != socket_before or docker("info", "--format", "{{.ID}}") != daemon_before
            or process_identity(pid) != process or containers_after != [identifier]
            or not isinstance(inspected_after, list) or len(inspected_after) != 1
            or inspected_after[0].get("Id") != identifier
            or inspected_after[0].get("Image") != image
            or inspected_after[0].get("State", {}).get("Running") is not True
            or inspected_after[0].get("State", {}).get("Pid") != pid
            or inspected_after[0].get("State", {}).get("StartedAt") != state["StartedAt"]
            or (inspected_after[0].get("Config", {}).get("Labels") or {}).get(
                "com.docker.compose.project") != project
            or (inspected_after[0].get("Config", {}).get("Labels") or {}).get(
                "com.docker.compose.service") != service
            or [mount for mount in inspected_after[0].get("Mounts", [])
                if mount.get("Destination") == "/var/lib/postgresql"] != mounts
            or volume_after != volume_info or not stat.S_ISDIR(root_after.st_mode)
            or (root_after.st_dev, root_after.st_ino) != (root.st_dev, root.st_ino)):
        raise ValueError("database source changed during inspection")
    return (socket_before, daemon_before, identifier, image, pid, state["StartedAt"],
            process, volume, path, root.st_dev, root.st_ino, tuple(result))


class PinnedSource:
    def __init__(self, project, service, image, volume, user):
        self.arguments = project, service, image, volume, user
        self.pid_fd = None
        self.initial = snapshot(*self.arguments)
        try:
            self.pid_fd = os.pidfd_open(self.initial[4])
            self.verify()
        except BaseException:
            self.close()
            raise

    def verify(self):
        if self.pid_fd is None:
            raise ValueError("source guard is closed")
        poller = select.poll()
        poller.register(self.pid_fd, select.POLLIN | select.POLLHUP | select.POLLERR)
        if poller.poll(0) or snapshot(*self.arguments) != self.initial or poller.poll(0):
            raise ValueError("database source changed")

    def close(self):
        if self.pid_fd is not None:
            os.close(self.pid_fd)
            self.pid_fd = None


if __name__ == "__main__":
    raise SystemExit("Synthetic identity component only; production capture is disabled.")
