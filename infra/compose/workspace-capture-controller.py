#!/usr/bin/env python3
import importlib.util
import os
from pathlib import Path
import secrets
import stat
import sys


DIRECTORY = Path(__file__).parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, DIRECTORY / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


guard = load("workspace_source_identity", "workspace-source-identity.py")
stream = load("workspace_encrypted_stream", "globals-encrypted-stream.py")


def capture(pid, path, owner, cgroup, output_fd, age, recipient, limit, timeout,
            *, pre_publish=None):
    output = os.fstat(output_fd)
    if (not stat.S_ISDIR(output.st_mode) or output.st_uid != os.geteuid()
            or stat.S_IMODE(output.st_mode) != 0o700
            or not os.path.isabs(age) or not recipient.startswith("age1")
            or any(char.isspace() for char in recipient)
            or (pre_publish is not None and not callable(pre_publish))):
        raise ValueError("invalid capture destination or encryption")
    try:
        os.stat("workspace.age", dir_fd=output_fd, follow_symlinks=False)
    except FileNotFoundError:
        pass
    else:
        raise FileExistsError("workspace.age")
    intermediate = ".workspace-" + secrets.token_hex(16) + ".age"
    candidate_identity = None
    published = False
    complete = False
    pinned = guard.PinnedSource(pid, path, owner, cgroup)
    try:
        program = (
            "import importlib.util,sys;"
            "spec=importlib.util.spec_from_file_location('producer',sys.argv[2]);"
            "module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);"
            "module.produce(int(sys.argv[1]),int(sys.argv[3]),sys.stdout.buffer)"
        )
        producer = [sys.executable, "-I", "-c", program, str(pinned.root_fd),
                    str(DIRECTORY / "workspace-consistent-producer.py"), str(owner)]
        size = stream.capture_workspace(output_fd, intermediate, producer, [age, "-r", recipient],
                                        limit, timeout, producer_fds=(pinned.root_fd,))
        candidate = os.stat(intermediate, dir_fd=output_fd, follow_symlinks=False)
        candidate_identity = candidate.st_dev, candidate.st_ino
        if (not stat.S_ISREG(candidate.st_mode) or candidate.st_uid != os.geteuid()
                or stat.S_IMODE(candidate.st_mode) != 0o600 or candidate.st_nlink != 1
                or candidate.st_size != size):
            raise ValueError("invalid candidate ciphertext")
        pinned.verify()
        if pre_publish is not None:
            pre_publish()
        current = os.stat(intermediate, dir_fd=output_fd, follow_symlinks=False)
        if (current.st_dev, current.st_ino) != candidate_identity:
            raise ValueError("candidate ciphertext changed")
        os.link(intermediate, "workspace.age", src_dir_fd=output_fd, dst_dir_fd=output_fd,
                follow_symlinks=False)
        published = True
        os.unlink(intermediate, dir_fd=output_fd)
        os.fsync(output_fd)
        complete = True
        return size
    finally:
        pinned.close()
        if candidate_identity is not None and not complete:
            for name in ([intermediate, "workspace.age"] if published else [intermediate]):
                try:
                    current = os.stat(name, dir_fd=output_fd, follow_symlinks=False)
                    if (current.st_dev, current.st_ino) != candidate_identity:
                        raise RuntimeError("candidate ciphertext replaced")
                    os.unlink(name, dir_fd=output_fd)
                except FileNotFoundError:
                    pass
            os.fsync(output_fd)


if __name__ == "__main__":
    raise SystemExit("Synthetic controller only; production capture is disabled.")
