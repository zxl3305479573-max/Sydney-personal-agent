#!/usr/bin/env python3
import importlib.util
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess


DIRECTORY = Path(__file__).parent
spec = importlib.util.spec_from_file_location(
    "workspace_capture_controller", DIRECTORY / "workspace-capture-controller.py")
controller = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controller)


def command(args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=15).strip()


def source_unit(unit):
    if not re.fullmatch(r"[A-Za-z0-9_.@:-]+\.service", unit):
        raise ValueError("invalid source unit")
    result = command(["/usr/bin/systemctl", "show", unit, "-p", "Id", "-p", "LoadState",
                      "-p", "ActiveState", "-p", "MainPID", "-p", "ControlGroup",
                      "-p", "ExecMainStartTimestampMonotonic", "-p", "User"])
    fields = {}
    for line in result.splitlines():
        key, value = line.split("=", 1)
        if key in fields:
            raise ValueError("duplicate unit property")
        fields[key] = value
    if (set(fields) != {"Id", "LoadState", "ActiveState", "MainPID", "ControlGroup",
                       "ExecMainStartTimestampMonotonic", "User"}
            or fields["Id"] != unit or fields["LoadState"] != "loaded"
            or fields["ActiveState"] != "active" or not fields["MainPID"].isdigit()
            or int(fields["MainPID"]) <= 1
            or fields["ControlGroup"] != "/system.slice/" + unit
            or not fields["ExecMainStartTimestampMonotonic"].isdigit()
            or int(fields["ExecMainStartTimestampMonotonic"]) <= 0 or not fields["User"]):
        raise ValueError("source unit unavailable")
    owner = pwd.getpwnam(fields["User"]).pw_uid
    return (int(fields["MainPID"]), fields["ControlGroup"],
            int(fields["ExecMainStartTimestampMonotonic"]), owner)


class Stage:
    def __init__(self, path, backing):
        if (not os.path.isabs(path) or not os.path.isabs(backing)
                or os.path.normpath(path) != path or os.path.normpath(backing) != backing
                or os.readlink("/proc/self/ns/mnt") == os.readlink("/proc/1/ns/mnt")):
            raise ValueError("invalid stage or mount namespace")
        self.path, self.backing = path, backing
        self.fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            self.initial = os.fstat(self.fd)
            self.backing_initial = os.stat(backing, follow_symlinks=False)
            self.verify(0)
        except BaseException:
            os.close(self.fd)
            raise

    def verify(self, reserve):
        info = os.fstat(self.fd)
        current = os.stat(self.path, follow_symlinks=False)
        backing = os.stat(self.backing, follow_symlinks=False)
        if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid()
                or stat.S_IMODE(info.st_mode) != 0o700
                or (info.st_dev, info.st_ino) != (self.initial.st_dev, self.initial.st_ino)
                or (current.st_dev, current.st_ino) != (info.st_dev, info.st_ino)
                or not stat.S_ISREG(backing.st_mode) or backing.st_uid != os.geteuid()
                or stat.S_IMODE(backing.st_mode) != 0o600
                or backing.st_nlink != 1
                or (backing.st_dev, backing.st_ino, backing.st_size)
                != (self.backing_initial.st_dev, self.backing_initial.st_ino,
                    self.backing_initial.st_size)):
            raise ValueError("stage identity changed")
        values = command(["/usr/bin/findmnt", "-n", "-o", "TARGET,SOURCE,FSTYPE,OPTIONS",
                          "--target", self.path]).split()
        if (len(values) != 4 or values[0] != self.path
                or not re.fullmatch(r"/dev/loop[0-9]+", values[1]) or values[2] != "ext4"
                or not {"nodev", "nosuid", "noexec"} <= set(values[3].split(","))):
            raise ValueError("stage mount mismatch")
        real_backing = command(["/usr/sbin/losetup", "-n", "-O", "BACK-FILE", values[1]])
        if os.path.realpath(real_backing) != self.backing:
            raise ValueError("stage backing mismatch")
        space = os.fstatvfs(self.fd)
        if space.f_bavail * space.f_frsize < reserve:
            raise ValueError("stage capacity insufficient")

    def close(self):
        os.close(self.fd)


def capture(unit, source, stage_path, backing, age, recipient, limit, timeout, reserve):
    if type(reserve) is not int or reserve <= 0:
        raise ValueError("invalid reserve")
    initial = source_unit(unit)
    stage = Stage(stage_path, backing)
    try:
        stage.verify(limit + reserve)

        def pre_publish():
            if source_unit(unit) != initial:
                raise ValueError("source service changed")
            stage.verify(reserve)

        return controller.capture(initial[0], source, initial[3], initial[1], stage.fd,
                                  age, recipient, limit, timeout, pre_publish=pre_publish)
    finally:
        stage.close()


if __name__ == "__main__":
    raise SystemExit("Synthetic supervisor only; production capture is disabled.")
