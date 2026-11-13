#!/usr/bin/env python3
import hashlib
import re
import sys


MAX_INPUT = 64 * 1024 * 1024
MAX_ENTRIES = 200000
MAX_BYTES = 700 * 1024 * 1024
FIELDS = 10
NUMBER = re.compile(rb"[0-9]{1,20}\Z")
TIME = re.compile(rb"-?[0-9]{1,20}\.[0-9]{1,12}\Z")
MODE = re.compile(rb"[0-7]{1,4}\Z")


def parse(raw, owner):
    if len(raw) > MAX_INPUT or not raw.endswith(b"\0"):
        raise ValueError("invalid input")
    fields = raw[:-1].split(b"\0")
    if len(fields) % FIELDS:
        raise ValueError("incomplete record")
    count = len(fields) // FIELDS
    if not 1 <= count <= MAX_ENTRIES:
        raise ValueError("invalid count")
    records = {}
    total = 0
    for offset in range(0, len(fields), FIELDS):
        record = tuple(fields[offset : offset + FIELDS])
        path, kind, uid, gid, mode, size, mtime, ctime, links, target = record
        if len(path) > 4096 or path.startswith(b"/"):
            raise ValueError("invalid path")
        if path and any(part in (b"", b".", b"..") for part in path.split(b"/")):
            raise ValueError("invalid component")
        if path in records or kind not in (b"f", b"d", b"l"):
            raise ValueError("duplicate or unsupported entry")
        if not all(NUMBER.fullmatch(value) for value in (uid, gid, size, links)):
            raise ValueError("invalid numeric field")
        if not MODE.fullmatch(mode) or not TIME.fullmatch(mtime) or not TIME.fullmatch(ctime):
            raise ValueError("invalid metadata")
        if int(uid) != owner or len(target) > 4096:
            raise ValueError("unexpected owner or target")
        if kind == b"l":
            if not target:
                raise ValueError("empty link")
        elif target:
            raise ValueError("unexpected link target")
        if kind == b"f":
            if int(links) != 1:
                raise ValueError("hard links unsupported")
            total += int(size)
            if total > MAX_BYTES:
                raise ValueError("workspace too large")
        records[path] = record
    if b"" not in records or records[b""][1] != b"d":
        raise ValueError("missing root")
    for path in records:
        if not path:
            continue
        parent = path.rpartition(b"/")[0]
        if parent not in records or records[parent][1] != b"d":
            raise ValueError("invalid parent")
    digest = hashlib.sha256()
    for path in sorted(records):
        for field in records[path]:
            digest.update(len(field).to_bytes(8, "big"))
            digest.update(field)
    return count, total, digest.hexdigest()


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r"[0-9]{1,10}", sys.argv[1]):
        raise ValueError("invalid owner")
    owner = int(sys.argv[1])
    if owner > 4294967294:
        raise ValueError("invalid owner")
    raw = sys.stdin.buffer.read(MAX_INPUT + 1)
    count, total, digest = parse(raw, owner)
    print(f"{count}:{total}:{digest}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, OverflowError):
        print("Workspace metadata verification failed.", file=sys.stderr)
        sys.exit(1)
