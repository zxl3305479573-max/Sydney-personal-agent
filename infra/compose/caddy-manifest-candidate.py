#!/usr/bin/env python3
import importlib.util
import json
import os
from pathlib import Path
import stat


spec = importlib.util.spec_from_file_location(
    "caddy_archive", Path(__file__).with_name("backup-caddy-volumes-encrypted.py"))
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)


def discover(roots, max_bytes, *, sticky_root=False):
    if (set(roots) != {"data", "config"} or type(max_bytes) is not int
            or not 0 < max_bytes <= 1024 * 1024 * 1024):
        raise ValueError("invalid source roots or limit")
    entries = []
    total = 0
    root_ids = set()
    for root_name in ("data", "config"):
        root_fd = roots[root_name]
        root_info = os.fstat(root_fd)
        root_id = root_info.st_dev, root_info.st_ino
        if root_id in root_ids:
            raise ValueError("source roots must be distinct")
        root_ids.add(root_id)
        archive.check_object(root_fd, "directory", sticky_root=sticky_root)
        queue = [(os.dup(root_fd), "", 0)]
        try:
            while queue:
                directory_fd, prefix, depth = queue.pop()
                try:
                    before = archive.check_object(
                        directory_fd, "directory", sticky_root=sticky_root and not prefix)
                    names = archive.bounded_names(directory_fd, archive.MAX_ENTRIES + 1)
                    for name in names:
                        path = prefix + "/" + name if prefix else name
                        if depth + 1 > archive.MAX_DEPTH or len(entries) >= archive.MAX_ENTRIES:
                            raise ValueError("manifest limit exceeded")
                        metadata = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
                        is_directory = stat.S_ISDIR(metadata.st_mode)
                        if not is_directory and not stat.S_ISREG(metadata.st_mode):
                            raise ValueError("unsupported source entry")
                        child_fd = archive.open_child(directory_fd, name, is_directory)
                        try:
                            actual = os.fstat(child_fd)
                            if ((metadata.st_dev, metadata.st_ino) != (actual.st_dev, actual.st_ino)
                                    or actual.st_dev != root_info.st_dev):
                                raise ValueError("source entry changed or crossed device")
                            kind = "directory" if is_directory else "file"
                            initial = archive.check_object(child_fd, kind)
                            entry = {"root": root_name, "path": path, "type": kind,
                                     "uid": actual.st_uid, "gid": actual.st_gid,
                                     "mode": stat.S_IMODE(actual.st_mode)}
                            if is_directory:
                                queue.append((os.dup(child_fd), path, depth + 1))
                            else:
                                total += actual.st_size
                                if total > max_bytes:
                                    raise ValueError("source size exceeded")
                                entry["sha256"] = archive.digest_file(child_fd, actual.st_size)
                            if archive.check_object(child_fd, kind) != initial:
                                raise ValueError("source changed during discovery")
                            entries.append(entry)
                        finally:
                            os.close(child_fd)
                    if (archive.check_object(directory_fd, "directory",
                                             sticky_root=sticky_root and not prefix) != before
                            or archive.bounded_names(directory_fd, archive.MAX_ENTRIES + 1) != names):
                        raise ValueError("source directory changed")
                finally:
                    os.close(directory_fd)
        finally:
            for directory_fd, _, _ in queue:
                os.close(directory_fd)
    raw = json.dumps({"version": 1, "entries": entries}, ensure_ascii=True).encode("utf-8")
    manifest = archive.parse_manifest(raw)
    objects, children = archive.collect(roots, manifest, max_bytes, sticky_root=sticky_root)
    try:
        archive.verify(objects, children, sticky_root=sticky_root)
    finally:
        for value in objects.values():
            os.close(value[0])
    return raw


if __name__ == "__main__":
    raise SystemExit("Synthetic manifest candidate only; production capture is disabled.")
