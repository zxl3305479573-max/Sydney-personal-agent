#!/usr/bin/env python3
import hashlib
import os
import re
import tarfile


MAX_ENTRIES = 200000
MAX_BYTES = 700 * 1024 * 1024
MAX_PATH = 4096
ALLOWED_PAX = frozenset(("path", "linkpath", "mtime"))
MTIME = re.compile(r"-?[0-9]{1,20}(?:\.[0-9]{1,9})?\Z")


def normalize(name):
    raw = os.fsencode(name)
    if not raw or len(raw) > MAX_PATH or raw.startswith(b"/"):
        raise ValueError("invalid archive path")
    if raw == b".":
        return b""
    if not raw.startswith(b"./"):
        raise ValueError("archive path lacks root")
    parts = raw[2:].split(b"/")
    if any(part in (b"", b".", b"..") for part in parts):
        raise ValueError("invalid archive component")
    return b"/".join(parts)


def verify(stream, owner):
    records = {}
    total = 0
    with tarfile.open(fileobj=stream, mode="r|") as archive:
        if archive.pax_headers:
            raise ValueError("global PAX headers unsupported")
        for member in archive:
            if len(records) >= MAX_ENTRIES:
                raise ValueError("entry limit exceeded")
            if archive.pax_headers or set(member.pax_headers) - ALLOWED_PAX:
                raise ValueError("unsupported PAX header")
            path = normalize(member.name)
            if path in records:
                raise ValueError("duplicate path")
            if type(member.uid) is not int or member.uid != owner:
                raise ValueError("unexpected owner")
            if (type(member.gid) is not int or not 0 <= member.gid <= 4294967294
                    or type(member.mode) is not int or not 0 <= member.mode <= 0o7777):
                raise ValueError("invalid metadata")
            mtime = member.pax_headers.get("mtime", str(member.mtime))
            if not MTIME.fullmatch(mtime):
                raise ValueError("invalid timestamp")
            content_hash = b""
            target = b""
            if member.isdir():
                kind = b"d"
                if member.size != 0:
                    raise ValueError("invalid directory")
            elif member.isreg():
                kind = b"f"
                if type(member.size) is not int or member.size < 0:
                    raise ValueError("invalid size")
                total += member.size
                if total > MAX_BYTES:
                    raise ValueError("size limit exceeded")
                source = archive.extractfile(member)
                if source is None:
                    raise ValueError("file missing")
                digest = hashlib.sha256()
                remaining = member.size
                while remaining:
                    data = source.read(min(1024 * 1024, remaining))
                    if not data:
                        raise ValueError("truncated file")
                    digest.update(data)
                    remaining -= len(data)
                content_hash = digest.digest()
            elif member.issym():
                kind = b"l"
                target = os.fsencode(member.linkname)
                if member.size != 0 or not target or len(target) > MAX_PATH:
                    raise ValueError("invalid link")
            else:
                raise ValueError("unsupported member")
            if path == b"":
                if kind != b"d":
                    raise ValueError("root is not a directory")
            else:
                parent = path.rpartition(b"/")[0]
                if parent not in records or records[parent][0] != b"d":
                    raise ValueError("invalid parent")
            fields = (kind, str(member.uid).encode(), str(member.gid).encode(),
                      str(member.mode).encode(), str(member.size).encode(),
                      mtime.encode(), target, content_hash)
            records[path] = fields
    if b"" not in records:
        raise ValueError("missing root")
    digest = hashlib.sha256()
    for path in sorted(records):
        for field in (path,) + records[path]:
            digest.update(len(field).to_bytes(8, "big"))
            digest.update(field)
    return len(records), total, digest.hexdigest()


if __name__ == "__main__":
    raise SystemExit("Synthetic component only; production restore is disabled.")
