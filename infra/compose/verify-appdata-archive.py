#!/usr/bin/env python3
import pathlib
import sys
import tarfile


MAX_ENTRIES = 10000
MAX_BYTES = 256 * 1024 * 1024


def verify(stream):
    names = set()
    files = 0
    total = 0
    with tarfile.open(fileobj=stream, mode="r|gz") as archive:
        for member in archive:
            if len(names) >= MAX_ENTRIES:
                raise ValueError("archive has too many entries")
            name = member.name
            path = pathlib.PurePosixPath(name)
            if not name or path.is_absolute() or ".." in path.parts:
                raise ValueError("archive has an unsafe path")
            normalized = str(path)
            if normalized in names:
                raise ValueError("archive has duplicate paths")
            names.add(normalized)
            if not (member.isdir() or member.isfile()):
                raise ValueError("archive contains an unsupported entry")
            if member.size < 0 or (member.isdir() and member.size != 0):
                raise ValueError("archive has an invalid entry size")
            if member.isfile():
                files += 1
                total += member.size
                if total > MAX_BYTES:
                    raise ValueError("archive exceeds the size limit")
    if not names:
        raise ValueError("archive is empty")
    return len(names), files, total


def main():
    try:
        entries, files, total = verify(sys.stdin.buffer)
    except (ValueError, OSError, tarfile.TarError, EOFError):
        print("Archive rejected; no entry names were displayed.", file=sys.stderr)
        return 1
    print(f"entries={entries} files={files} logical_bytes={total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
