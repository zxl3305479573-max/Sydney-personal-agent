#!/usr/bin/env python3
import json
import os
import secrets
import subprocess
import time
import unittest


IMAGE = "sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6"
LABEL = "sydney.globals.timeout.drill"
ENV = {"PATH": "/usr/bin:/bin", "LC_ALL": "C"}


def docker(*args):
    return subprocess.run(["/usr/bin/docker", *args], stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, env=ENV, timeout=15, check=True).stdout


class DockerTimeoutTest(unittest.TestCase):
    def test_container_timeout_after_client_killed(self):
        self.assertFalse(os.environ.get("DOCKER_HOST") or os.environ.get("DOCKER_CONTEXT"))
        nonce = secrets.token_hex(16)
        label = f"{LABEL}={nonce}"
        container = None
        client = None
        try:
            container = docker(
                "create", "--rm", "--name", f"sydney-globals-timeout-{nonce}",
                "--label", label, "--network", "none", "--read-only",
                "--log-driver", "none", "--memory", "128m", "--pids-limit", "32",
                "--tmpfs", "/var/lib/postgresql:rw,nosuid,nodev,size=16m",
                "--entrypoint", "/bin/sleep", IMAGE, "40",
            ).decode().strip()
            self.assertEqual(len(container), 64)
            info = json.loads(docker("inspect", container))[0]
            self.assertEqual(info["Image"], IMAGE)
            self.assertEqual(info["Config"]["Labels"].get(LABEL), nonce)
            self.assertEqual(info["HostConfig"]["NetworkMode"], "none")
            self.assertTrue(info["HostConfig"]["ReadonlyRootfs"])
            self.assertEqual(info["HostConfig"]["LogConfig"]["Type"], "none")
            self.assertFalse(any(mount["Type"] != "tmpfs" for mount in info["Mounts"]))
            docker("start", container)
            client = subprocess.Popen(
                ["/usr/bin/docker", "exec", container, "/usr/bin/timeout", "-k", "1",
                 "8", "/bin/sleep", "29"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=ENV,
                start_new_session=True,
            )
            deadline = time.monotonic() + 5
            while b"/bin/sleep 29" not in docker("top", container, "-eo", "pid,args"):
                if client.poll() is not None or time.monotonic() >= deadline:
                    self.fail("synthetic command did not start")
                time.sleep(0.1)
            client.kill()
            client.wait(timeout=5)
            self.assertIn(b"/bin/sleep 29", docker("top", container, "-eo", "pid,args"))
            deadline = time.monotonic() + 12
            while b"/bin/sleep 29" in docker("top", container, "-eo", "pid,args"):
                if time.monotonic() >= deadline:
                    self.fail("container timeout did not stop synthetic command")
                time.sleep(0.2)
        finally:
            if client is not None and client.poll() is None:
                client.kill()
                client.wait(timeout=5)
            if container is not None:
                listed = docker("ps", "-aq", "--filter", f"label={label}").decode().split()
                for found in listed:
                    info = json.loads(docker("inspect", found))[0]
                    if info["Id"] != container or info["Image"] != IMAGE or info["Config"]["Labels"].get(LABEL) != nonce:
                        raise RuntimeError("synthetic container identity mismatch")
                    docker("rm", "-f", found)
                if docker("ps", "-aq", "--filter", f"label={label}").strip():
                    raise RuntimeError("synthetic container remains")


if __name__ == "__main__":
    unittest.main()
