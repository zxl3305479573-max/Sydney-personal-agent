#!/usr/bin/env python3
import os
from pathlib import Path
import secrets
import select
import signal
import subprocess
import sys
import tempfile
import time
import unittest


DIRECTORY = Path(__file__).parent
AGE = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age"
KEYGEN = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age-keygen"


def command(args):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, text=True, timeout=15).stdout.strip()


@unittest.skipUnless(os.geteuid() == 0 and Path(AGE).is_file(), "root and real age required")
class CaptureKillTest(unittest.TestCase):
    def test_controller_killed_before_publish_leaves_no_final(self):
        with tempfile.TemporaryDirectory(prefix="sydney-workspace-controller-kill-", dir="/dev/shm") as temporary:
            root = Path(temporary)
            source = root / "source"
            output = root / "output"
            source.mkdir(mode=0o700)
            output.mkdir(mode=0o700)
            (source / "project").write_bytes(b"synthetic controller data")
            identity = subprocess.run([KEYGEN], check=True, capture_output=True).stdout
            recipient = subprocess.run([KEYGEN, "-y"], input=identity, check=True,
                                       capture_output=True).stdout.decode().strip()
            nonce = secrets.token_hex(12)
            source_unit = "sydney-controller-source-" + nonce + ".service"
            capture_unit = "sydney-controller-kill-" + nonce + ".service"
            program = (
                "import importlib.util,os,sys,time\n"
                "s=importlib.util.spec_from_file_location('controller',sys.argv[1])\n"
                "m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n"
                "fd=os.open(sys.argv[4],os.O_RDONLY|os.O_DIRECTORY)\n"
                "def pause():\n"
                " open(sys.argv[7],'x').close()\n"
                " time.sleep(60)\n"
                "m.capture(int(sys.argv[2]),sys.argv[3],0,sys.argv[5],fd,"
                "sys.argv[6],sys.argv[8],65536,30,pre_publish=pause)\n"
            )
            marker = root / "ready"
            try:
                command(["/usr/bin/systemd-run", "--unit=" + source_unit,
                         "--setenv=SYDNEY_WORKSPACE_ROOT=" + str(source),
                         "--property=User=root", "--property=RuntimeMaxSec=90s",
                         "/usr/bin/sleep", "80"])
                fields = dict(line.split("=", 1) for line in command(
                    ["/usr/bin/systemctl", "show", source_unit, "-p", "MainPID",
                     "-p", "ControlGroup"]).splitlines())
                self.assertGreater(int(fields["MainPID"]), 1)
                command(["/usr/bin/systemd-run", "--unit=" + capture_unit,
                         "--property=RuntimeMaxSec=60s", "--property=KillMode=control-group",
                         sys.executable, "-I", "-c", program,
                         str(DIRECTORY / "workspace-capture-controller.py"),
                         fields["MainPID"], str(source), str(output), fields["ControlGroup"],
                         AGE, str(marker), recipient])
                deadline = time.monotonic() + 15
                while not marker.exists() and time.monotonic() < deadline:
                    time.sleep(0.1)
                self.assertTrue(marker.exists(), "controller did not reach publication barrier")
                candidates = list(output.glob(".workspace-*.age"))
                self.assertEqual(len(candidates), 1)
                candidate = candidates[0]
                before = candidate.stat()
                self.assertFalse((output / "workspace.age").exists())
                state = dict(line.split("=", 1) for line in command(
                    ["/usr/bin/systemctl", "show", capture_unit, "-p", "MainPID",
                     "-p", "ActiveState"]).splitlines())
                self.assertEqual(state["ActiveState"], "active")
                pid = int(state["MainPID"])
                self.assertGreater(pid, 1)
                pid_fd = os.pidfd_open(pid)
                try:
                    os.kill(pid, signal.SIGKILL)
                    poller = select.poll()
                    poller.register(pid_fd, select.POLLIN | select.POLLHUP | select.POLLERR)
                    self.assertTrue(poller.poll(10000), "controller did not exit")
                finally:
                    os.close(pid_fd)
                command(["/usr/bin/systemctl", "stop", capture_unit])
                self.assertFalse((output / "workspace.age").exists())
                after = candidate.lstat()
                self.assertEqual((before.st_dev, before.st_ino), (after.st_dev, after.st_ino))
                self.assertEqual([path.name for path in output.iterdir()], [candidate.name])
                candidate.unlink()
            finally:
                for unit in (capture_unit, source_unit):
                    subprocess.run(["/usr/bin/systemctl", "stop", unit],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
                    subprocess.run(["/usr/bin/systemctl", "reset-failed", unit],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)

    def test_main_kill_reaps_children_and_does_not_publish(self):
        with tempfile.TemporaryDirectory(prefix="sydney-workspace-kill-", dir="/dev/shm") as temporary:
            root = Path(temporary)
            output = root / "output"
            output.mkdir(mode=0o700)
            identity = subprocess.run([KEYGEN], check=True, capture_output=True).stdout
            recipient = subprocess.run([KEYGEN, "-y"], input=identity, check=True,
                                       capture_output=True).stdout.decode().strip()
            unit = "sydney-workspace-kill-" + secrets.token_hex(12) + ".service"
            program = (
                "import importlib.util,os,sys;"
                "s=importlib.util.spec_from_file_location('stream',sys.argv[1]);"
                "m=importlib.util.module_from_spec(s);s.loader.exec_module(m);"
                "fd=os.open(sys.argv[2],os.O_RDONLY|os.O_DIRECTORY);"
                "p=[sys.executable,'-c','import time;time.sleep(60)'];"
                "m.capture_workspace(fd,'workspace.age',p,[sys.argv[3],'-r',sys.argv[4]],"
                "65536,60)"
            )
            main_pid = 0
            tracked = []
            try:
                command(["/usr/bin/systemd-run", "--unit=" + unit,
                         "--property=RuntimeMaxSec=90s", "--property=KillMode=control-group",
                         sys.executable, "-I", "-c", program,
                         str(DIRECTORY / "globals-encrypted-stream.py"),
                         str(output), AGE, recipient])
                deadline = time.monotonic() + 10
                while time.monotonic() < deadline:
                    properties = command(["/usr/bin/systemctl", "show", unit,
                                          "-p", "MainPID", "-p", "ControlGroup"]).splitlines()
                    fields = dict(line.split("=", 1) for line in properties)
                    main_pid = int(fields["MainPID"])
                    cgroup = fields["ControlGroup"]
                    if main_pid > 1 and cgroup:
                        try:
                            pids = [int(value) for value in Path(
                                "/sys/fs/cgroup" + cgroup + "/cgroup.procs").read_text().split()]
                        except FileNotFoundError:
                            pids = []
                        children = [pid for pid in pids if pid != main_pid]
                        if len(children) >= 2:
                            tracked = [os.pidfd_open(pid) for pid in children]
                            break
                    time.sleep(0.1)
                self.assertGreaterEqual(len(tracked), 2)
                os.kill(main_pid, signal.SIGKILL)
                deadline = time.monotonic() + 10
                while time.monotonic() < deadline:
                    events = []
                    for fd in tracked:
                        poller = select.poll()
                        poller.register(fd, select.POLLIN | select.POLLHUP | select.POLLERR)
                        events.append(bool(poller.poll(0)))
                    if all(events):
                        break
                    time.sleep(0.1)
                self.assertTrue(all(events), "tracked children survived")
                self.assertFalse((output / "workspace.age").exists())
                leftovers = list(output.iterdir())
                self.assertTrue(all(path.name.startswith(".capture-") and
                                    path.name.endswith(".partial") for path in leftovers))
            finally:
                for fd in tracked:
                    os.close(fd)
                subprocess.run(["/usr/bin/systemctl", "stop", unit],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
                subprocess.run(["/usr/bin/systemctl", "reset-failed", unit],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15,
                               check=True)


if __name__ == "__main__":
    unittest.main()
