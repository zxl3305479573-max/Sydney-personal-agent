#!/usr/bin/env python3
import os
import re
import select
import stat


def parts(path):
    if (not isinstance(path, str) or not path.startswith("/") or path == "/"
            or os.path.normpath(path) != path or "\0" in path):
        raise ValueError("invalid workspace path")
    result = path[1:].split("/")
    if any(item in ("", ".", "..") for item in result):
        raise ValueError("invalid workspace component")
    return result


def open_components(base_fd, components):
    current = os.dup(base_fd)
    try:
        for component in components:
            child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW |
                            os.O_CLOEXEC, dir_fd=current)
            os.close(current)
            current = child
        return current
    except BaseException:
        os.close(current)
        raise


def mount_id(fd):
    with open(f"/proc/self/fdinfo/{fd}", encoding="ascii") as source:
        values = [line.split(":", 1)[1].strip() for line in source if line.startswith("mnt_id:")]
    if len(values) != 1 or not values[0].isdigit():
        raise ValueError("missing mount identity")
    return int(values[0])


def reject_nested_mounts(data, path):
    root = os.fsencode(path)
    found = False
    for line in data.splitlines():
        fields = line.split(b" ")
        if len(fields) < 10 or b"-" not in fields[6:]:
            raise ValueError("invalid mountinfo")
        encoded = fields[4]
        if re.search(rb"\\(?![0-7]{3})", encoded):
            raise ValueError("invalid mount escape")
        target = re.sub(rb"\\([0-7]{3})", lambda match: bytes([int(match.group(1), 8)]), encoded)
        if not target.startswith(b"/"):
            raise ValueError("invalid mount target")
        found = True
        if target.startswith(root + b"/"):
            raise ValueError("nested workspace mount")
    if not found:
        raise ValueError("empty mountinfo")


def alive(pid_fd):
    poller = select.poll()
    poller.register(pid_fd, select.POLLIN | select.POLLHUP | select.POLLERR)
    return not poller.poll(0)


def process_state(pid, path, owner, cgroup):
    with open(f"/proc/{pid}/status", encoding="ascii") as source:
        uids = [line.split()[1:] for line in source if line.startswith("Uid:")]
    if len(uids) != 1 or len(uids[0]) != 4 or any(value != str(owner) for value in uids[0]):
        raise ValueError("unexpected process owner")
    with open(f"/proc/{pid}/cgroup", encoding="ascii") as source:
        groups = source.read().splitlines()
    if f"0::{cgroup}" not in groups:
        raise ValueError("unexpected process cgroup")
    with open(f"/proc/{pid}/environ", "rb") as source:
        environment = source.read(1024 * 1024 + 1)
    if len(environment) > 1024 * 1024:
        raise ValueError("process environment too large")
    values = [item.split(b"=", 1)[1] for item in environment.split(b"\0")
              if item.startswith(b"SYDNEY_WORKSPACE_ROOT=")]
    if values != [os.fsencode(path)]:
        raise ValueError("unexpected workspace environment")
    for filename in ("/proc/self/mountinfo", f"/proc/{pid}/mountinfo"):
        with open(filename, "rb") as source:
            reject_nested_mounts(source.read(), path)


class PinnedSource:
    def __init__(self, pid, path, owner, cgroup):
        if (type(pid) is not int or pid <= 1 or type(owner) is not int or owner < 0
                or not isinstance(cgroup, str) or not cgroup.startswith("/")):
            raise ValueError("invalid source identity")
        self.pid, self.path, self.owner, self.cgroup = pid, path, owner, cgroup
        self.components = parts(path)
        self.pid_fd = os.pidfd_open(pid)
        self.root_fd = None
        try:
            host = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
            try:
                self.root_fd = open_components(host, self.components)
            finally:
                os.close(host)
            self.initial = os.fstat(self.root_fd)
            self.initial_mount = mount_id(self.root_fd)
            self.verify()
        except BaseException:
            self.close()
            raise

    def verify(self):
        if not alive(self.pid_fd):
            raise ValueError("source process exited")
        pinned = os.fstat(self.root_fd)
        if (not stat.S_ISDIR(pinned.st_mode) or pinned.st_uid != self.owner
                or (pinned.st_dev, pinned.st_ino) != (self.initial.st_dev, self.initial.st_ino)
                or mount_id(self.root_fd) != self.initial_mount):
            raise ValueError("source root changed")
        process_state(self.pid, self.path, self.owner, self.cgroup)
        host = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
        try:
            view = os.open(f"/proc/{self.pid}/root", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
            try:
                host_root = open_components(host, self.components)
                try:
                    view_root = open_components(view, self.components)
                    try:
                        for fd in (host_root, view_root):
                            info = os.fstat(fd)
                            if (info.st_dev, info.st_ino) != (pinned.st_dev, pinned.st_ino):
                                raise ValueError("workspace view changed")
                        if mount_id(host_root) != self.initial_mount:
                            raise ValueError("workspace mount changed")
                    finally:
                        os.close(view_root)
                finally:
                    os.close(host_root)
            finally:
                os.close(view)
        finally:
            os.close(host)
        if not alive(self.pid_fd):
            raise ValueError("source process exited")

    def close(self):
        if self.root_fd is not None:
            os.close(self.root_fd)
            self.root_fd = None
        if self.pid_fd is not None:
            os.close(self.pid_fd)
            self.pid_fd = None


if __name__ == "__main__":
    raise SystemExit("Synthetic source guard only; production capture is disabled.")
