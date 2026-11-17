#!/usr/bin/env python3
import decimal
import importlib.util
import os
from pathlib import Path
import stat
import tarfile


spec = importlib.util.spec_from_file_location(
    "workspace_archive_verify", Path(__file__).with_name("workspace-archive-verify.py")
)
verify_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify_module)


def mount_id(fd):
    with open(f"/proc/self/fdinfo/{fd}", encoding="ascii") as source:
        values = [line.split(":", 1)[1].strip() for line in source if line.startswith("mnt_id:")]
    if len(values) != 1 or not values[0].isdigit():
        raise ValueError("missing mount identity")
    return int(values[0])


def open_directory(root_fd, parts, expected_mount):
    current = os.dup(root_fd)
    try:
        for part in parts:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                            dir_fd=current)
            os.close(current)
            current = child
            if mount_id(current) != expected_mount:
                raise ValueError("unexpected mount")
        return current
    except BaseException:
        os.close(current)
        raise


def timestamp(member):
    value = member.pax_headers.get("mtime", str(member.mtime))
    if not verify_module.MTIME.fullmatch(value):
        raise ValueError("invalid timestamp")
    return int(decimal.Decimal(value) * 1_000_000_000)


def extract(source, root_fd, owner, *, privileged_owner=False):
    root = os.fstat(root_fd)
    caller = os.geteuid()
    if (type(privileged_owner) is not bool or type(owner) is not int or owner < 0
            or owner > 4294967294
            or (privileged_owner and (caller != 0 or owner == 0))
            or (not privileged_owner and owner != caller)
            or not stat.S_ISDIR(root.st_mode) or root.st_uid != caller
            or stat.S_IMODE(root.st_mode) != 0o700 or os.listdir(root_fd)):
        raise ValueError("destination must be a private empty directory")
    source.seek(0)
    expected = verify_module.verify(source, owner)
    source.seek(0)
    root_mount = mount_id(root_fd)
    directories = []
    seen = set()
    total = 0
    with tarfile.open(fileobj=source, mode="r|") as archive:
        for member in archive:
            path = verify_module.normalize(member.name)
            if (path in seen or len(seen) >= verify_module.MAX_ENTRIES
                    or member.uid != owner or not 0 <= member.gid <= 4294967294
                    or not 0 <= member.mode <= 0o7777
                    or archive.pax_headers or set(member.pax_headers) - verify_module.ALLOWED_PAX):
                raise ValueError("invalid archive entry")
            seen.add(path)
            mtime = timestamp(member)
            if not path:
                if not member.isdir():
                    raise ValueError("invalid root")
                directories.append(((), member.uid, member.gid, member.mode, mtime))
                continue
            parts = tuple(path.split(b"/"))
            parent = open_directory(root_fd, parts[:-1], root_mount)
            try:
                if member.isdir():
                    if member.size != 0:
                        raise ValueError("invalid directory size")
                    os.mkdir(parts[-1], 0o700, dir_fd=parent)
                    directories.append((parts, member.uid, member.gid, member.mode, mtime))
                elif member.isreg():
                    if member.size < 0:
                        raise ValueError("invalid file size")
                    total += member.size
                    if total > verify_module.MAX_BYTES:
                        raise ValueError("size limit exceeded")
                    fd = os.open(parts[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
                                 | os.O_CLOEXEC, 0o600, dir_fd=parent)
                    with os.fdopen(fd, "wb") as output:
                        data = archive.extractfile(member)
                        if data is None:
                            raise ValueError("missing file data")
                        remaining = member.size
                        while remaining:
                            chunk = data.read(min(1024 * 1024, remaining))
                            if not chunk:
                                raise ValueError("truncated file")
                            output.write(chunk)
                            remaining -= len(chunk)
                        output.flush()
                        os.fchown(output.fileno(), member.uid, member.gid)
                        os.fchmod(output.fileno(), member.mode)
                        os.utime(output.fileno(), ns=(mtime, mtime))
                        os.fsync(output.fileno())
                elif member.issym():
                    target = os.fsencode(member.linkname)
                    if member.size != 0 or not target or len(target) > verify_module.MAX_PATH:
                        raise ValueError("invalid link")
                    os.symlink(target, parts[-1], dir_fd=parent)
                    os.chown(parts[-1], member.uid, member.gid, dir_fd=parent,
                             follow_symlinks=False)
                    os.utime(parts[-1], ns=(mtime, mtime), dir_fd=parent,
                             follow_symlinks=False)
                else:
                    raise ValueError("unsupported member")
            finally:
                os.close(parent)
    if not directories or directories[0][0] != ():
        raise ValueError("missing root")
    for parts, uid, gid, mode, mtime in reversed(directories):
        directory = open_directory(root_fd, parts, root_mount)
        try:
            os.fchown(directory, uid, gid)
            os.fchmod(directory, mode)
            os.utime(directory, ns=(mtime, mtime))
            os.fsync(directory)
        finally:
            os.close(directory)
    source.seek(0)
    if verify_module.verify(source, owner) != expected:
        raise ValueError("archive changed during extraction")
    return expected


if __name__ == "__main__":
    raise SystemExit("Synthetic component only; production restore is disabled.")
