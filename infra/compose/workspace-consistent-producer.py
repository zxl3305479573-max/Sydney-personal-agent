#!/usr/bin/env python3
import hashlib
import importlib.util
from pathlib import Path


spec = importlib.util.spec_from_file_location(
    "workspace_fd_archive", Path(__file__).with_name("workspace-fd-archive.py"))
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)


class DigestWriter:
    def __init__(self, output=None):
        self.output = output
        self.digest = hashlib.sha256()

    def write(self, data):
        if self.output is not None:
            written = self.output.write(data)
            if written != len(data):
                raise OSError("short archive write")
        self.digest.update(data)
        return len(data)


def produce(root_fd, owner, output):
    first = DigestWriter(output)
    first_result = archive.archive(root_fd, first, owner)
    second = DigestWriter()
    second_result = archive.archive(root_fd, second, owner)
    if first_result != second_result or first.digest.digest() != second.digest.digest():
        raise ValueError("workspace changed between archive passes")
    return first_result


if __name__ == "__main__":
    raise SystemExit("Synthetic component only; production capture is disabled.")
