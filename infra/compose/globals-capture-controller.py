#!/usr/bin/env python3
import importlib.util
import os
from pathlib import Path


DIRECTORY = Path(__file__).parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, DIRECTORY / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


guard = load("globals_source_identity", "globals-source-identity.py")
stream = load("globals_encrypted_stream", "globals-encrypted-stream.py")


def capture(project, service, image, volume, user, directory_fd, age, recipient, limit, timeout,
            *, before_publish=None):
    if (not os.path.isabs(age) or not isinstance(recipient, str)
            or not recipient.startswith("age1") or any(char.isspace() for char in recipient)
            or not 3 <= timeout <= 120
            or (before_publish is not None and not callable(before_publish))):
        raise ValueError("invalid capture parameters")
    source = guard.PinnedSource(project, service, image, volume, user)
    try:
        source.verify()
        inner_timeout = min(90, int(timeout) - 2)
        producer = [guard.DOCKER, "--host", "unix://" + guard.SOCKET,
                    "exec", source.initial[2], "/usr/bin/env", "-i", "PATH=/usr/bin:/bin",
                    "PGOPTIONS=-c default_transaction_read_only=on", "/usr/bin/timeout",
                    "-k", "1", str(inner_timeout), "/usr/bin/pg_dumpall", "-w",
                    "-h", "/var/run/postgresql", "-U", user, "--globals-only"]

        def verify_before_publish():
            source.verify()
            if before_publish is not None:
                before_publish()

        return stream.capture(directory_fd, "globals.age", producer, [age, "-r", recipient],
                              limit, timeout, environment=guard.ENVIRONMENT,
                              pre_publish=verify_before_publish)
    finally:
        source.close()


if __name__ == "__main__":
    raise SystemExit("Synthetic controller only; production capture is disabled.")
