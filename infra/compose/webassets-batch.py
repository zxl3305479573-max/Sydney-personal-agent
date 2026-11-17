#!/usr/bin/env python3
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import types


MAX_FILES = 10000
MAX_BYTES = 512 * 1024 * 1024
MAX_BATCH_FILES = 128
MAX_BATCH_BYTES = 32 * 1024 * 1024
MAX_MANIFEST = 16 * 1024 * 1024


def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def mount_id(fd):
    with open(f"/proc/self/fdinfo/{fd}", encoding="ascii") as source:
        values = [line.split(":", 1)[1].strip() for line in source
                  if line.startswith("mnt_id:")]
    if len(values) != 1 or not values[0].isdigit():
        raise ValueError("missing mount identity")
    return int(values[0])


def scan(root_fd, owner):
    root = os.fstat(root_fd)
    if not stat.S_ISDIR(root.st_mode) or root.st_uid != owner:
        raise ValueError("invalid source root")
    expected_mount = mount_id(root_fd)
    records = {}
    total = 0
    for base, directories, files, directory_fd in os.fwalk(
            ".", dir_fd=root_fd, follow_symlinks=False):
        directory = os.fstat(directory_fd)
        if (directory.st_uid != owner or directory.st_mode & 0o022
                or mount_id(directory_fd) != expected_mount or os.listxattr(directory_fd)):
            raise ValueError("unsupported source directory")
        records[base] = ("directory", identity(directory))
        if len(records) > MAX_FILES:
            raise ValueError("source entry limit exceeded")
        for name in directories + files:
            if "\n" in name or "\r" in name:
                raise ValueError("unsupported source name")
            info = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            if info.st_uid != owner or info.st_mode & 0o022:
                raise ValueError("unsupported source ownership or mode")
            if stat.S_ISDIR(info.st_mode):
                continue
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise ValueError("unsupported source entry")
            if total + info.st_size > MAX_BYTES:
                raise ValueError("source size limit exceeded")
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK,
                         dir_fd=directory_fd)
            try:
                if (identity(os.fstat(fd)) != identity(info) or mount_id(fd) != expected_mount
                        or os.listxattr(fd)):
                    raise ValueError("source entry changed")
                digest = hashlib.sha256()
                with os.fdopen(fd, "rb", closefd=False) as source:
                    remaining = info.st_size
                    while remaining:
                        chunk = source.read(min(1024 * 1024, remaining))
                        if not chunk:
                            raise ValueError("source file truncated")
                        digest.update(chunk)
                        remaining -= len(chunk)
                    if source.read(1):
                        raise ValueError("source file grew")
                if identity(os.fstat(fd)) != identity(info):
                    raise ValueError("source entry changed")
            finally:
                os.close(fd)
            total += info.st_size
            if total > MAX_BYTES:
                raise ValueError("source size limit exceeded")
            path = os.path.join(base, name)
            records[path] = ("file", identity(info), digest.hexdigest())
            if len(records) > MAX_FILES:
                raise ValueError("source entry limit exceeded")
    if identity(os.fstat(root_fd)) != identity(root):
        raise ValueError("source root changed")
    return records, total


def batches(records):
    group = []
    size = 0
    for path in sorted(records, key=os.fsencode):
        item = records[path]
        if item[0] != "file":
            continue
        item_size = item[1][6]
        if item_size > MAX_BATCH_BYTES:
            raise ValueError("file exceeds batch limit")
        if group and (len(group) == MAX_BATCH_FILES or size + item_size > MAX_BATCH_BYTES):
            yield group
            group, size = [], 0
        group.append(path)
        size += item_size
    if group:
        yield group


def load_config_capture(script_path):
    source = Path(script_path).read_text(encoding="utf-8")
    begin = "<<'PY'\n"
    if source.count(begin) != 1 or not source.endswith("\nPY\n"):
        raise ValueError("unexpected configuration capture script")
    body = source.split(begin, 1)[1].rsplit("\nPY\n", 1)[0]
    namespace = {"__name__": "webassets_config_capture"}
    exec(compile(body, str(script_path), "exec"), namespace)
    return namespace["capture"]


def capture(source_path, destination, owner, recipient, config_script, age_directory):
    if (not os.path.isabs(source_path) or not os.path.isabs(destination)
            or os.path.normpath(source_path) != source_path
            or os.path.normpath(destination) != destination
            or not recipient.startswith("age1") or any(char.isspace() for char in recipient)):
        raise ValueError("invalid capture parameters")
    root_fd = os.open(source_path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        dest_fd = os.open(destination, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    except BaseException:
        os.close(root_fd)
        raise
    try:
        dest = os.fstat(dest_fd)
        if (dest.st_uid != os.geteuid() or stat.S_IMODE(dest.st_mode) != 0o700
                or os.listdir(dest_fd)):
            raise ValueError("destination must be empty and private")
        before, size = scan(root_fd, owner)
        groups = list(batches(before))
        if not groups:
            raise ValueError("source contains no files")
        capture_files = load_config_capture(config_script)
        old_path = os.environ.get("PATH")
        os.environ["PATH"] = age_directory + ":/usr/bin:/bin"
        try:
            for index, group in enumerate(groups):
                args = types.SimpleNamespace(
                    file=[os.path.join(source_path, path[2:]) for path in group],
                    recipient=[recipient],
                    output=os.path.join(destination, f"part-{index:04d}.age"),
                    max_bytes=MAX_BATCH_BYTES,
                    max_output_bytes=40 * 1024 * 1024,
                    reserve_bytes=256 * 1024 * 1024,
                    trusted_input_owner_uid=owner,
                )
                with contextlib.redirect_stdout(io.StringIO()):
                    capture_files(args)
        finally:
            if old_path is None:
                os.environ.pop("PATH", None)
            else:
                os.environ["PATH"] = old_path
        after, after_size = scan(root_fd, owner)
        current = os.stat(source_path, follow_symlinks=False)
        if after != before or after_size != size or identity(current) != identity(os.fstat(root_fd)):
            raise ValueError("source changed during capture")
        manifest = json.dumps(
            {"version": 1, "source": source_path, "owner": owner,
             "entries": before, "groups": groups},
            ensure_ascii=True, sort_keys=True, separators=(",", ":"),
        ).encode("ascii")
        if len(manifest) > MAX_MANIFEST:
            raise ValueError("manifest limit exceeded")
        temporary = ".manifest.partial"
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW |
                     os.O_CLOEXEC, 0o600, dir_fd=dest_fd)
        try:
            result = subprocess.run([os.path.join(age_directory, "age"), "-r", recipient],
                                    input=manifest, stdout=fd, stderr=subprocess.DEVNULL,
                                    timeout=30, check=False)
            if result.returncode or os.fstat(fd).st_size <= 0:
                raise ValueError("manifest encryption failed")
            os.fsync(fd)
            os.link(temporary, "manifest.age", src_dir_fd=dest_fd, dst_dir_fd=dest_fd,
                    follow_symlinks=False)
            os.unlink(temporary, dir_fd=dest_fd)
            os.fsync(dest_fd)
        finally:
            os.close(fd)
        return len(groups), sum(1 for item in before.values() if item[0] == "file"), size
    finally:
        os.close(dest_fd)
        os.close(root_fd)


if __name__ == "__main__":
    raise SystemExit("Candidate only; production capture is not enabled.")
