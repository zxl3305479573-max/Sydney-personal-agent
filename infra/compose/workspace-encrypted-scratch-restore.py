#!/usr/bin/env python3
import importlib.util
import os
from pathlib import Path
import resource
import stat
import subprocess


DIRECTORY = Path(__file__).parent
MAX_ARCHIVE = 768 * 1024 * 1024


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, DIRECTORY / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


extractor = load("workspace_safe_extract", "workspace-safe-extract.py")
archiver = load("workspace_fd_archive", "workspace-fd-archive.py")


class BoundedOutput:
    def __init__(self, output, limit):
        self.output = output
        self.limit = limit
        self.size = 0

    def write(self, data):
        if self.size + len(data) > self.limit:
            raise ValueError("regenerated archive exceeds limit")
        written = self.output.write(data)
        if written != len(data):
            raise OSError("short archive write")
        self.size += written
        return written


def restore(cipher_fd, scratch_fd, target_fd, age, identity, owner, *, limit, timeout):
    scratch = os.fstat(scratch_fd)
    target = os.fstat(target_fd)
    ciphertext = os.fstat(cipher_fd)
    if (not stat.S_ISDIR(scratch.st_mode) or scratch.st_uid != os.geteuid()
            or stat.S_IMODE(scratch.st_mode) != 0o700
            or not stat.S_ISDIR(target.st_mode) or target.st_uid != os.geteuid()
            or stat.S_IMODE(target.st_mode) != 0o700 or os.listdir(target_fd)
            or extractor.mount_id(scratch_fd) != extractor.mount_id(target_fd)
            or (scratch.st_dev, scratch.st_ino) == (target.st_dev, target.st_ino)
            or not stat.S_ISREG(ciphertext.st_mode) or ciphertext.st_size <= 0
            or not os.path.isabs(age) or not os.path.isabs(identity)
            or type(limit) is not int or not 0 < limit <= MAX_ARCHIVE
            or not 0 < timeout <= 900):
        raise ValueError("invalid isolated recovery arguments")
    plaintext_fd = os.open(".", os.O_TMPFILE | os.O_RDWR | os.O_CLOEXEC, 0o600,
                           dir_fd=scratch_fd)
    try:
        def restrict():
            resource.setrlimit(resource.RLIMIT_FSIZE, (limit, limit))

        os.lseek(cipher_fd, 0, os.SEEK_SET)
        result = subprocess.run([age, "-d", "-i", identity], stdin=cipher_fd,
                                stdout=plaintext_fd, stderr=subprocess.DEVNULL,
                                timeout=timeout, check=False, preexec_fn=restrict)
        if result.returncode or not 0 < os.fstat(plaintext_fd).st_size <= limit:
            raise ValueError("archive authentication or decryption failed")
        with os.fdopen(os.dup(plaintext_fd), "rb") as source:
            expected = extractor.extract(source, target_fd, owner,
                                         privileged_owner=(owner != os.geteuid()))
        os.close(plaintext_fd)
        plaintext_fd = None
        regenerated_fd = os.open(".", os.O_TMPFILE | os.O_RDWR | os.O_CLOEXEC, 0o600,
                                 dir_fd=scratch_fd)
        try:
            with os.fdopen(os.dup(regenerated_fd), "wb") as output:
                archiver.archive(target_fd, BoundedOutput(output, limit), owner)
                output.flush()
            if os.fstat(regenerated_fd).st_size > limit:
                raise ValueError("regenerated archive exceeds limit")
            os.lseek(regenerated_fd, 0, os.SEEK_SET)
            with os.fdopen(os.dup(regenerated_fd), "rb") as source:
                actual = extractor.verify_module.verify(source, owner)
            if actual != expected:
                raise ValueError("restored archive differs")
        finally:
            os.close(regenerated_fd)
        return expected
    finally:
        if plaintext_fd is not None:
            os.close(plaintext_fd)


if __name__ == "__main__":
    raise SystemExit("Synthetic component only; production restore is disabled.")
