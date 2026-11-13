#!/usr/bin/env python3
"""Transfer the staging-validated image directly between Docker hosts over SSH."""

import hashlib
import subprocess
import sys
import time


IMAGE = "sha256:acc903c111681c8c69b71beb3dca6bebcb9681ef308d776d6723cafbd820fe87"
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
       "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3"]


def main():
    sender = subprocess.Popen(
        SSH + ["sydney-backend-admin",
               "bash -o pipefail -c 'docker image save " + IMAGE + " | zstd -1 -q'"],
        stdout=subprocess.PIPE,
    )
    receiver = subprocess.Popen(
        SSH + ["sydney-cloud-admin",
               "bash -o pipefail -c 'zstd -d -q | docker image load'"],
        stdin=subprocess.PIPE,
    )
    assert sender.stdout is not None and receiver.stdin is not None
    digest = hashlib.sha256()
    transferred = 0
    next_report = 100 * 1024 * 1024
    started = time.monotonic()
    try:
        while True:
            block = sender.stdout.read(1024 * 1024)
            if not block:
                break
            receiver.stdin.write(block)
            digest.update(block)
            transferred += len(block)
            if transferred >= next_report:
                print("transferred_mib=" + str(transferred // (1024 * 1024)), flush=True)
                next_report += 100 * 1024 * 1024
        receiver.stdin.close()
        sender.stdout.close()
        sender_status = sender.wait(timeout=60)
        receiver_status = receiver.wait(timeout=600)
        if sender_status or receiver_status:
            raise RuntimeError("Image stream failed; inspect both hosts before retry")
    except BaseException:
        sender.terminate()
        receiver.terminate()
        sender.wait(timeout=30)
        receiver.wait(timeout=30)
        raise
    result = subprocess.run(
        SSH + ["sydney-cloud-admin", "docker image inspect --format '{{.Id}}' " + IMAGE],
        stdout=subprocess.PIPE, text=True, check=True, timeout=30,
    ).stdout.strip()
    if result != IMAGE:
        raise ValueError("Loaded image ID does not match the validated image")
    print("validated_image_loaded=True", flush=True)
    print("compressed_stream_sha256=" + digest.hexdigest(), flush=True)
    print("elapsed_seconds=" + str(round(time.monotonic() - started)), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
