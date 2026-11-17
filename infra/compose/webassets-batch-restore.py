#!/usr/bin/env python3
import importlib.util
import io
import os
from pathlib import Path
import stat
import tarfile


spec = importlib.util.spec_from_file_location(
    "webassets_batch_verify", Path(__file__).with_name("webassets-batch-verify.py"))
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


def open_directory(root_fd, components):
    current = os.dup(root_fd)
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


def restore(backup_fd, destination_fd, age, identity):
    target = os.fstat(destination_fd)
    backup = os.fstat(backup_fd)
    if (not stat.S_ISDIR(target.st_mode) or target.st_uid != os.geteuid()
            or stat.S_IMODE(target.st_mode) != 0o700 or os.listdir(destination_fd)
            or (target.st_dev, target.st_ino) == (backup.st_dev, backup.st_ino)):
        raise ValueError("destination must be private and empty")
    result, manifest = verifier.verify(backup_fd, age, identity, return_manifest=True)
    source, entries, groups, _ = verifier.validate_manifest(manifest)
    owner = manifest["owner"]
    if owner != os.geteuid() and os.geteuid() != 0:
        raise ValueError("cannot restore source owner")
    directories = [path for path, entry in entries.items()
                   if entry[0] == "directory" and path != "."]
    directories.sort(key=lambda path: (len(verifier.relative(path)), os.fsencode(path)))
    for path in directories:
        parts = verifier.relative(path)
        parent = open_directory(destination_fd, parts[:-1])
        try:
            os.mkdir(parts[-1], 0o700, dir_fd=parent)
        finally:
            os.close(parent)
    for index, group in enumerate(groups):
        raw = verifier.decrypt(backup_fd, f"part-{index:04d}.age", verifier.MAX_BATCH, age, identity)
        verifier.verify_part(raw, source, entries, group)
        paths = {os.path.join(source, path[2:])[1:]: path for path in group}
        with tarfile.open(fileobj=io.BytesIO(raw), mode="r:") as archive:
            for member in archive:
                path = paths[member.name]
                info = entries[path][1]
                parts = verifier.relative(path)
                parent = open_directory(destination_fd, parts[:-1])
                try:
                    fd = os.open(parts[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                                 os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=parent)
                    with os.fdopen(fd, "wb") as output:
                        content = archive.extractfile(member)
                        remaining = member.size
                        while remaining:
                            chunk = content.read(min(1024 * 1024, remaining))
                            if not chunk:
                                raise ValueError("truncated content")
                            output.write(chunk)
                            remaining -= len(chunk)
                        output.flush()
                        os.fchown(output.fileno(), info[3], info[4])
                        os.fchmod(output.fileno(), stat.S_IMODE(info[2]))
                        os.utime(output.fileno(), ns=(info[7], info[7]))
                        os.fsync(output.fileno())
                finally:
                    os.close(parent)
    for path in reversed(["."] + directories):
        parts = [] if path == "." else verifier.relative(path)
        directory_fd = open_directory(destination_fd, parts)
        try:
            info = entries[path][1]
            os.fchown(directory_fd, info[3], info[4])
            os.fchmod(directory_fd, stat.S_IMODE(info[2]))
            os.utime(directory_fd, ns=(info[7], info[7]))
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    return result


if __name__ == "__main__":
    raise SystemExit("Candidate only; production restore is not enabled.")
