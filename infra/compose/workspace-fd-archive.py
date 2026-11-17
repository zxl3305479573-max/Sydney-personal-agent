#!/usr/bin/env python3
import hashlib
import os
import stat
import tarfile


MAX_ENTRIES = 200000
MAX_BYTES = 700 * 1024 * 1024
MAX_PATH = 4096
MAX_DEPTH = 128


def identity(info):
    return (
        info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
        info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns,
    )


def mount_id(fd):
    with open(f"/proc/self/fdinfo/{fd}", encoding="ascii") as source:
        values = [line.split(":", 1)[1].strip() for line in source
                  if line.startswith("mnt_id:")]
    if len(values) != 1 or not values[0].isdigit():
        raise ValueError("missing mount identity")
    return int(values[0])


def no_xattrs(fd):
    if os.listxattr(fd):
        raise ValueError("extended attributes unsupported")


def no_link_xattrs(parent_fd, name, expected):
    path = f"/proc/self/fd/{parent_fd}/" + name
    if os.listxattr(path, follow_symlinks=False):
        raise ValueError("extended attributes unsupported")
    if identity(os.stat(name, dir_fd=parent_fd, follow_symlinks=False)) != identity(expected):
        raise ValueError("entry changed")


class DigestReader:
    def __init__(self, source):
        self.source = source
        self.digest = hashlib.sha256()

    def read(self, size):
        data = self.source.read(size)
        self.digest.update(data)
        return data


def archive(root_fd, output, owner):
    root = os.fstat(root_fd)
    if not stat.S_ISDIR(root.st_mode) or root.st_uid != owner:
        raise ValueError("invalid root")
    root_mount = mount_id(root_fd)
    state = {"entries": 0, "bytes": 0}

    def add(archive_file, parent_fd, name, path, depth):
        if depth > MAX_DEPTH or len(os.fsencode(path)) > MAX_PATH:
            raise ValueError("path limit exceeded")
        flags = os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC
        fd = os.open(name, flags, dir_fd=parent_fd)
        try:
            info = os.fstat(fd)
            if info.st_uid != owner or mount_id(fd) != root_mount:
                raise ValueError("unexpected owner or mount")
            if identity(os.stat(name, dir_fd=parent_fd, follow_symlinks=False)) != identity(info):
                raise ValueError("entry changed")
            state["entries"] += 1
            if state["entries"] > MAX_ENTRIES:
                raise ValueError("entry limit exceeded")
            item = tarfile.TarInfo(path)
            item.uid = info.st_uid
            item.gid = info.st_gid
            item.mode = stat.S_IMODE(info.st_mode)
            item.mtime = info.st_mtime_ns // 1000000000
            magnitude = abs(info.st_mtime_ns)
            sign = "-" if info.st_mtime_ns < 0 else ""
            item.pax_headers = {"mtime": f"{sign}{magnitude // 1000000000}.{magnitude % 1000000000:09d}"}
            if stat.S_ISLNK(info.st_mode):
                item.type = tarfile.SYMTYPE
                item.linkname = os.readlink(name, dir_fd=parent_fd)
                if len(os.fsencode(item.linkname)) > MAX_PATH:
                    raise ValueError("link target too long")
                no_link_xattrs(parent_fd, name, info)
                archive_file.addfile(item)
            elif stat.S_ISREG(info.st_mode):
                if info.st_nlink != 1:
                    raise ValueError("hard links unsupported")
                state["bytes"] += info.st_size
                if state["bytes"] > MAX_BYTES:
                    raise ValueError("size limit exceeded")
                read_fd = os.open(f"/proc/self/fd/{fd}", os.O_RDONLY | os.O_CLOEXEC)
                with os.fdopen(read_fd, "rb") as source:
                    if identity(os.fstat(source.fileno())) != identity(info):
                        raise ValueError("file changed")
                    no_xattrs(source.fileno())
                    item.size = info.st_size
                    captured = DigestReader(source)
                    archive_file.addfile(item, captured)
                    if identity(os.fstat(source.fileno())) != identity(info):
                        raise ValueError("file changed")
                    source.seek(0)
                    checked = hashlib.sha256()
                    remaining = info.st_size
                    while remaining:
                        chunk = source.read(min(1024 * 1024, remaining))
                        if not chunk:
                            raise ValueError("file truncated")
                        checked.update(chunk)
                        remaining -= len(chunk)
                    if source.read(1) or checked.digest() != captured.digest.digest():
                        raise ValueError("file content changed")
                    if identity(os.fstat(source.fileno())) != identity(info):
                        raise ValueError("file changed")
                    no_xattrs(source.fileno())
            elif stat.S_ISDIR(info.st_mode):
                directory_fd = os.open(
                    name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                    dir_fd=parent_fd,
                )
                try:
                    if identity(os.fstat(directory_fd)) != identity(info) or mount_id(directory_fd) != root_mount:
                        raise ValueError("directory changed")
                    no_xattrs(directory_fd)
                    item.type = tarfile.DIRTYPE
                    archive_file.addfile(item)
                    with os.scandir(directory_fd) as children:
                        names = []
                        for child in children:
                            names.append(child.name)
                            if len(names) > MAX_ENTRIES - state["entries"]:
                                raise ValueError("entry limit exceeded")
                    for child in sorted(names, key=os.fsencode):
                        add(archive_file, directory_fd, child, path + "/" + child, depth + 1)
                    if identity(os.fstat(directory_fd)) != identity(info):
                        raise ValueError("directory changed")
                    no_xattrs(directory_fd)
                finally:
                    os.close(directory_fd)
            else:
                raise ValueError("special entry unsupported")
            if identity(os.stat(name, dir_fd=parent_fd, follow_symlinks=False)) != identity(info):
                raise ValueError("entry changed")
        finally:
            os.close(fd)

    with tarfile.open(fileobj=output, mode="w|", format=tarfile.PAX_FORMAT) as archive_file:
        add(archive_file, root_fd, ".", ".", 0)
    if identity(os.fstat(root_fd)) != identity(root):
        raise ValueError("root changed")
    return state["entries"], state["bytes"]


if __name__ == "__main__":
    raise SystemExit("Synthetic component only; production capture is disabled.")
