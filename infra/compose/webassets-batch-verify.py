#!/usr/bin/env python3
import hashlib
import io
import json
import os
import re
import stat
import subprocess
import tarfile


MAX_ENTRIES = 10000
MAX_TOTAL = 512 * 1024 * 1024
MAX_BATCH = 40 * 1024 * 1024
MAX_MANIFEST = 17 * 1024 * 1024


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate manifest key")
        result[key] = value
    return result


def decrypt(directory_fd, name, limit, age, identity):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory_fd)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
                or info.st_mode & 0o077 or not 0 < info.st_size <= limit):
            raise ValueError("invalid encrypted file")
        with os.fdopen(fd, "rb", closefd=False) as source:
            encrypted = source.read(limit + 1)
        if len(encrypted) != info.st_size:
            raise ValueError("encrypted file changed")
    finally:
        os.close(fd)
    result = subprocess.run([age, "-d", "-i", identity], input=encrypted,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            timeout=60, check=False)
    if result.returncode or len(result.stdout) > limit:
        raise ValueError("decryption failed")
    return result.stdout


def relative(path):
    if not isinstance(path, str) or not path.startswith("./"):
        raise ValueError("invalid relative path")
    parts = path[2:].split("/")
    if any(part in ("", ".", "..") or "\0" in part or "\n" in part or "\r" in part
           for part in parts):
        raise ValueError("invalid path component")
    return parts


def validate_manifest(manifest):
    if (not isinstance(manifest, dict) or set(manifest) != {"version", "source", "owner", "entries", "groups"}
            or type(manifest["version"]) is not int or manifest["version"] != 1):
        raise ValueError("invalid manifest")
    source, owner, entries, groups = (manifest[key] for key in ("source", "owner", "entries", "groups"))
    if (not isinstance(source, str) or not source.startswith("/") or source == "/"
            or os.path.normpath(source) != source or "\0" in source
            or type(owner) is not int or not 0 <= owner <= 4294967294
            or not isinstance(entries, dict) or not 1 <= len(entries) <= MAX_ENTRIES
            or not isinstance(groups, list) or not groups):
        raise ValueError("invalid manifest fields")
    files = set()
    total = 0
    for path, entry in entries.items():
        if path != ".":
            parts = relative(path)
            parent = "." if len(parts) == 1 else "./" + "/".join(parts[:-1])
            parent_entry = entries.get(parent)
            if (not isinstance(parent_entry, list) or len(parent_entry) != 2
                    or parent_entry[0] != "directory"):
                raise ValueError("invalid parent")
        if not isinstance(entry, list) or len(entry) not in (2, 3):
            raise ValueError("invalid entry")
        kind, info = entry[:2]
        if (kind not in ("directory", "file") or not isinstance(info, list) or len(info) != 9
                or any(type(value) is not int for value in info)
                or info[3] != owner or not 0 <= info[4] <= 4294967294
                or info[2] & 0o022 or info[6] < 0):
            raise ValueError("invalid entry metadata")
        if kind == "directory":
            if len(entry) != 2 or not stat.S_ISDIR(info[2]):
                raise ValueError("invalid directory")
        else:
            if (len(entry) != 3 or not stat.S_ISREG(info[2]) or info[5] != 1
                    or not isinstance(entry[2], str) or not re.fullmatch("[0-9a-f]{64}", entry[2])):
                raise ValueError("invalid file")
            total += info[6]
            if total > MAX_TOTAL:
                raise ValueError("size limit exceeded")
            files.add(path)
    if entries.get(".", [None])[0] != "directory":
        raise ValueError("missing root")
    seen = set()
    for group in groups:
        if not isinstance(group, list) or not 1 <= len(group) <= 128:
            raise ValueError("invalid group")
        for path in group:
            if not isinstance(path, str) or path not in files or path in seen:
                raise ValueError("invalid group entry")
            seen.add(path)
    if seen != files or not files:
        raise ValueError("incomplete groups")
    return source, entries, groups, total


def verify_part(raw, source, entries, group):
    expected = {os.path.join(source, path[2:])[1:]: path for path in group}
    seen = set()
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:") as archive:
        if archive.pax_headers:
            raise ValueError("global PAX headers unsupported")
        for member in archive:
            if (member.name not in expected or member.name in seen
                    or member.type not in (tarfile.REGTYPE, tarfile.AREGTYPE)
                    or archive.pax_headers or set(member.pax_headers) - {"path"}):
                raise ValueError("unexpected archive member")
            seen.add(member.name)
            entry = entries[expected[member.name]]
            info = entry[1]
            if (member.size != info[6] or member.uid != info[3] or member.gid != info[4]
                    or member.mode != stat.S_IMODE(info[2])
                    or member.mtime != int(info[7] / 1_000_000_000)):
                raise ValueError("archive metadata mismatch")
            content = archive.extractfile(member)
            if content is None:
                raise ValueError("missing content")
            digest = hashlib.sha256()
            remaining = member.size
            while remaining:
                chunk = content.read(min(1024 * 1024, remaining))
                if not chunk:
                    raise ValueError("truncated content")
                digest.update(chunk)
                remaining -= len(chunk)
            if digest.hexdigest() != entry[2]:
                raise ValueError("content mismatch")
    if seen != set(expected):
        raise ValueError("missing archive members")


def verify(directory_fd, age, identity, *, return_manifest=False):
    directory = os.fstat(directory_fd)
    if (not stat.S_ISDIR(directory.st_mode) or directory.st_uid != os.geteuid()
            or stat.S_IMODE(directory.st_mode) != 0o700):
        raise ValueError("invalid backup directory")
    raw = decrypt(directory_fd, "manifest.age", MAX_MANIFEST, age, identity)
    manifest = json.loads(raw.decode("ascii"), object_pairs_hook=no_duplicates)
    source, entries, groups, total = validate_manifest(manifest)
    names = {"manifest.age"} | {f"part-{index:04d}.age" for index in range(len(groups))}
    if set(os.listdir(directory_fd)) != names:
        raise ValueError("missing or unexpected encrypted files")
    for index, group in enumerate(groups):
        raw = decrypt(directory_fd, f"part-{index:04d}.age", MAX_BATCH, age, identity)
        verify_part(raw, source, entries, group)
    result = (len(groups), sum(len(group) for group in groups), total)
    return (result, manifest) if return_manifest else result


if __name__ == "__main__":
    raise SystemExit("Candidate only; production restore is not enabled.")
