#!/usr/bin/env python3
import importlib.util
import json
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
from unittest import mock


spec = importlib.util.spec_from_file_location(
    "globals_source_identity", Path(__file__).with_name("globals-source-identity.py"))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
spec = importlib.util.spec_from_file_location(
    "globals_capture_controller", Path(__file__).with_name("globals-capture-controller.py"))
controller = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controller)
spec = importlib.util.spec_from_file_location(
    "globals_stage_supervisor", Path(__file__).with_name("globals-stage-supervisor.py"))
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)
IMAGE = "sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6"
LABEL = "sydney.globals.identity.drill"
ENV = {"PATH": "/usr/bin:/bin", "HOME": "/nonexistent", "LC_ALL": "C"}
AGE = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age"
KEYGEN = "/root/sydney-sidecar-age-20261111/unpacked/usr/bin/age-keygen"


def docker(*args):
    result = subprocess.run(["/usr/bin/docker", "--host", "unix:///run/docker.sock", *args],
                            env=ENV, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            timeout=30, check=True)
    return result.stdout.decode().strip()


class IdentityDockerTest(unittest.TestCase):
    def test_synthetic_postgres_restart_changes_source(self):
        self.assertEqual(os.geteuid(), 0)
        nonce = secrets.token_hex(12)
        project = "sydney-identity-" + nonce
        volume = project + "-data"
        name = project + "-postgres"
        label = LABEL + "=" + nonce
        container = None
        try:
            self.assertEqual(docker("volume", "create", "--label", label, volume), volume)
            created = docker(
                "create", "--name", name, "--label", label,
                "--label", "com.docker.compose.project=" + project,
                "--label", "com.docker.compose.service=postgres",
                "--network", "none", "--read-only", "--log-driver", "none",
                "--memory", "256m", "--pids-limit", "128",
                "--mount", "type=volume,src=" + volume + ",dst=/var/lib/postgresql",
                "--tmpfs", "/run/postgresql:rw,nosuid,nodev,size=16m",
                "--tmpfs", "/tmp:rw,nosuid,nodev,size=16m",
                "-e", "POSTGRES_USER=synthetic_admin",
                "-e", "POSTGRES_DB=postgres",
                "-e", "POSTGRES_HOST_AUTH_METHOD=trust", IMAGE)
            self.assertEqual(len(created), 64)
            container = created
            inspected = json.loads(docker("inspect", container))[0]
            self.assertEqual(inspected["Image"], IMAGE)
            self.assertEqual(inspected["Config"]["Labels"].get(LABEL), nonce)
            self.assertEqual(inspected["HostConfig"]["NetworkMode"], "none")
            self.assertTrue(inspected["HostConfig"]["ReadonlyRootfs"])
            self.assertEqual(inspected["HostConfig"]["LogConfig"]["Type"], "none")
            self.assertEqual([mount["Name"] for mount in inspected["Mounts"]
                              if mount["Type"] == "volume"], [volume])
            docker("start", container)
            deadline = time.monotonic() + 40
            while True:
                ready = subprocess.run(
                    ["/usr/bin/docker", "--host", "unix:///run/docker.sock", "exec",
                     container, "/usr/bin/pg_isready", "-h", "/var/run/postgresql",
                     "-U", "synthetic_admin", "-d", "postgres"],
                    env=ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    timeout=5, check=False)
                if ready.returncode == 0:
                    break
                if time.monotonic() >= deadline:
                    self.fail("synthetic PostgreSQL did not start")
                time.sleep(0.2)
            source = guard.PinnedSource(project, "postgres", IMAGE, volume, "synthetic_admin")
            try:
                source.verify()
                docker("exec", container, "/usr/bin/psql", "-X", "-w",
                       "-h", "/var/run/postgresql", "-U", "synthetic_admin",
                       "-d", "postgres", "-c", "CREATE ROLE synthetic_capture_role")
                with tempfile.TemporaryDirectory(prefix="sydney-globals-capture-", dir="/dev/shm") as temporary:
                    root = Path(temporary)
                    identity = subprocess.run([KEYGEN], check=True, capture_output=True, env=ENV).stdout
                    recipient = subprocess.run([KEYGEN, "-y"], input=identity, check=True,
                                               capture_output=True, env=ENV).stdout.decode().strip()
                    key = root / "identity"
                    key.write_bytes(identity)
                    key.chmod(0o600)
                    success = root / "success"
                    failure = root / "failure"
                    success.mkdir(mode=0o700)
                    failure.mkdir(mode=0o700)
                    descriptor = os.open(success, os.O_RDONLY | os.O_DIRECTORY)
                    try:
                        size = controller.capture(project, "postgres", IMAGE, volume,
                                                  "synthetic_admin", descriptor, AGE, recipient,
                                                  1024 * 1024, 30)
                    finally:
                        os.close(descriptor)
                    ciphertext = (success / "globals.age").read_bytes()
                    self.assertEqual(size, len(ciphertext))
                    result = subprocess.run([AGE, "-d", "-i", str(key)], input=ciphertext,
                                            capture_output=True, check=True, env=ENV)
                    self.assertIn(b"CREATE ROLE synthetic_capture_role;", result.stdout)

                    stage_base = Path(tempfile.mkdtemp(
                        prefix="sydney-globals-stage-", dir="/var/backups/sydney-ip-migration"))
                    stage_path = stage_base / "stage"
                    backing = stage_base / "stage.ext4"
                    mounted = False
                    image_identity = None
                    try:
                        stage_path.mkdir(mode=0o700)
                        image_fd = os.open(backing, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                        try:
                            os.posix_fallocate(image_fd, 0, 128 * 1024 * 1024)
                            info = os.fstat(image_fd)
                            image_identity = info.st_dev, info.st_ino
                        finally:
                            os.close(image_fd)
                        subprocess.run(["/usr/sbin/mkfs.ext4", "-F", "-m", "0", str(backing)],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       timeout=30, check=True)
                        subprocess.run(["/usr/bin/mount", "-o", "loop,nodev,nosuid,noexec",
                                        str(backing), str(stage_path)], timeout=30, check=True)
                        mounted = True
                        stage_path.chmod(0o700)
                        with self.assertRaises(ValueError):
                            supervisor.capture(project, "postgres", IMAGE, volume,
                                               "synthetic_admin", str(stage_path), str(backing),
                                               AGE, recipient, 1024 * 1024, 30, 1024**3)
                        self.assertEqual({path.name for path in stage_path.iterdir()}, {"lost+found"})
                        stage_size = supervisor.capture(project, "postgres", IMAGE, volume,
                                                        "synthetic_admin", str(stage_path), str(backing),
                                                        AGE, recipient, 1024 * 1024, 30, 16 * 1024 * 1024)
                        stage_ciphertext = (stage_path / "globals.age").read_bytes()
                        self.assertEqual(stage_size, len(stage_ciphertext))
                        stage_result = subprocess.run([AGE, "-d", "-i", str(key)],
                                                      input=stage_ciphertext, capture_output=True,
                                                      check=True, env=ENV)
                        self.assertIn(b"CREATE ROLE synthetic_capture_role;", stage_result.stdout)
                        (stage_path / "globals.age").unlink()

                        stage_checks = []
                        original_stage_verify = supervisor.stage_module.Stage.verify

                        def fail_stage_before_publish(instance, reserve):
                            original_stage_verify(instance, reserve)
                            stage_checks.append(1)
                            if len(stage_checks) == 3:
                                raise ValueError("synthetic stage changed")

                        with mock.patch.object(supervisor.stage_module.Stage, "verify",
                                               autospec=True, side_effect=fail_stage_before_publish):
                            with self.assertRaises(ValueError):
                                supervisor.capture(project, "postgres", IMAGE, volume,
                                                   "synthetic_admin", str(stage_path), str(backing),
                                                   AGE, recipient, 1024 * 1024, 30, 16 * 1024 * 1024)
                        self.assertEqual(len(stage_checks), 3)
                        self.assertEqual({path.name for path in stage_path.iterdir()}, {"lost+found"})
                    finally:
                        if mounted:
                            mount = subprocess.run(
                                ["/usr/bin/findmnt", "-n", "-o", "TARGET,SOURCE",
                                 "--target", str(stage_path)], capture_output=True, text=True,
                                check=True, timeout=15).stdout.split()
                            if len(mount) != 2 or mount[0] != str(stage_path):
                                raise RuntimeError("synthetic stage identity changed")
                            actual = subprocess.run(
                                ["/usr/sbin/losetup", "-n", "-O", "BACK-FILE", mount[1]],
                                capture_output=True, text=True, check=True, timeout=15).stdout.strip()
                            if os.path.realpath(actual) != str(backing):
                                raise RuntimeError("synthetic stage backing changed")
                            subprocess.run(["/usr/bin/umount", str(stage_path)], check=True, timeout=30)
                        if backing.exists():
                            info = backing.lstat()
                            if (info.st_dev, info.st_ino) != image_identity:
                                raise RuntimeError("synthetic stage image changed")
                            backing.unlink()
                        stage_path.rmdir()
                        stage_base.rmdir()

                    barrier_output = root / "kill-before-publish"
                    barrier_output.mkdir(mode=0o700)
                    marker = root / "publication-barrier"
                    capture_unit = "sydney-globals-kill-" + secrets.token_hex(12) + ".service"
                    program = (
                        "import importlib.util,os,sys,time\n"
                        "s=importlib.util.spec_from_file_location('controller',sys.argv[1])\n"
                        "m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n"
                        "fd=os.open(sys.argv[5],os.O_RDONLY|os.O_DIRECTORY)\n"
                        "def barrier():\n"
                        " open(sys.argv[8],'x').close()\n"
                        " time.sleep(45)\n"
                        "m.capture(sys.argv[2],'postgres',sys.argv[3],sys.argv[4],"
                        "'synthetic_admin',fd,sys.argv[6],sys.argv[7],1048576,30,"
                        "before_publish=barrier)\n"
                    )
                    try:
                        subprocess.run(
                            ["/usr/bin/systemd-run", "--unit=" + capture_unit,
                             "--property=RuntimeMaxSec=60s", "--property=KillMode=control-group",
                             sys.executable, "-I", "-B", "-c", program,
                             str(Path(__file__).with_name("globals-capture-controller.py")),
                             project, IMAGE, volume, str(barrier_output), AGE, recipient, str(marker)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            timeout=15, check=True)
                        deadline = time.monotonic() + 20
                        while not marker.exists() and time.monotonic() < deadline:
                            time.sleep(0.1)
                        self.assertTrue(marker.exists(), "capture did not reach publication barrier")
                        candidates = list(barrier_output.iterdir())
                        self.assertEqual(len(candidates), 1)
                        candidate = candidates[0]
                        self.assertTrue(candidate.name.startswith(".capture-"))
                        self.assertTrue(candidate.name.endswith(".partial"))
                        original = candidate.lstat()
                        self.assertFalse((barrier_output / "globals.age").exists())
                        synthetic = subprocess.run([AGE, "-d", "-i", str(key)],
                                                   input=candidate.read_bytes(), capture_output=True,
                                                   check=True, env=ENV)
                        self.assertIn(b"CREATE ROLE synthetic_capture_role;", synthetic.stdout)
                        shown = subprocess.run(
                            ["/usr/bin/systemctl", "show", capture_unit,
                             "-p", "MainPID", "-p", "ActiveState"], capture_output=True,
                            text=True, timeout=15, check=True).stdout
                        fields = dict(line.split("=", 1) for line in shown.splitlines())
                        self.assertEqual(fields["ActiveState"], "active")
                        pid = int(fields["MainPID"])
                        self.assertGreater(pid, 1)
                        pid_fd = os.pidfd_open(pid)
                        try:
                            signal.pidfd_send_signal(pid_fd, signal.SIGKILL)
                            poller = select.poll()
                            poller.register(pid_fd, select.POLLIN | select.POLLHUP | select.POLLERR)
                            self.assertTrue(poller.poll(10000), "capture process did not exit")
                        finally:
                            os.close(pid_fd)
                        subprocess.run(["/usr/bin/systemctl", "stop", capture_unit],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       timeout=15, check=True)
                        self.assertFalse((barrier_output / "globals.age").exists())
                        current = candidate.lstat()
                        self.assertEqual((original.st_dev, original.st_ino),
                                         (current.st_dev, current.st_ino))
                        self.assertEqual(list(barrier_output.iterdir()), [candidate])
                        candidate.unlink()
                    finally:
                        subprocess.run(["/usr/bin/systemctl", "stop", capture_unit],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       timeout=15, check=False)
                        state = subprocess.run(
                            ["/usr/bin/systemctl", "show", capture_unit, "-p", "MainPID",
                             "-p", "ActiveState"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            text=True, timeout=15, check=True).stdout
                        properties = dict(line.split("=", 1) for line in state.splitlines())
                        if properties.get("MainPID") != "0":
                            raise RuntimeError("synthetic capture process remains")
                        if properties.get("ActiveState") == "failed":
                            subprocess.run(["/usr/bin/systemctl", "reset-failed", capture_unit],
                                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                           timeout=15, check=True)

                    waiting_output = root / "kill-during-encryption"
                    waiting_output.mkdir(mode=0o700)
                    blocked_age = root / "synthetic-blocked-age"
                    blocked_age.write_text("#!/bin/sh\nexec /bin/sleep 60\n", encoding="ascii")
                    blocked_age.chmod(0o700)
                    waiting_unit = "sydney-globals-wait-" + secrets.token_hex(12) + ".service"
                    waiting_program = (
                        "import importlib.util,os,sys\n"
                        "s=importlib.util.spec_from_file_location('controller',sys.argv[1])\n"
                        "m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n"
                        "fd=os.open(sys.argv[5],os.O_RDONLY|os.O_DIRECTORY)\n"
                        "m.capture(sys.argv[2],'postgres',sys.argv[3],sys.argv[4],"
                        "'synthetic_admin',fd,sys.argv[6],sys.argv[7],1048576,30)\n"
                    )
                    child_fd = None
                    try:
                        subprocess.run(
                            ["/usr/bin/systemd-run", "--unit=" + waiting_unit,
                             "--property=RuntimeMaxSec=60s", "--property=KillMode=control-group",
                             sys.executable, "-I", "-B", "-c", waiting_program,
                             str(Path(__file__).with_name("globals-capture-controller.py")),
                             project, IMAGE, volume, str(waiting_output), str(blocked_age), recipient],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            timeout=15, check=True)
                        deadline = time.monotonic() + 20
                        main_pid = 0
                        while time.monotonic() < deadline:
                            shown = subprocess.run(
                                ["/usr/bin/systemctl", "show", waiting_unit, "-p", "MainPID",
                                 "-p", "ActiveState", "-p", "ControlGroup"],
                                capture_output=True, text=True, timeout=15, check=True).stdout
                            fields = dict(line.split("=", 1) for line in shown.splitlines())
                            main_pid = int(fields["MainPID"])
                            group = fields["ControlGroup"]
                            if main_pid > 1 and fields["ActiveState"] == "active" and group:
                                try:
                                    members = [int(value) for value in
                                               Path("/sys/fs/cgroup" + group + "/cgroup.procs")
                                               .read_text().split()]
                                except FileNotFoundError:
                                    members = []
                                for member in members:
                                    if member == main_pid:
                                        continue
                                    try:
                                        args = Path(f"/proc/{member}/cmdline").read_bytes()
                                        if args == b"/bin/sleep\0" + b"60\0":
                                            child_fd = os.pidfd_open(member)
                                            break
                                    except (FileNotFoundError, ProcessLookupError):
                                        continue
                            if child_fd is not None:
                                break
                            time.sleep(0.1)
                        self.assertIsNotNone(child_fd, "blocking encryptor did not start")
                        candidates = list(waiting_output.iterdir())
                        self.assertEqual(len(candidates), 1)
                        candidate = candidates[0]
                        self.assertTrue(candidate.name.startswith(".capture-"))
                        self.assertTrue(candidate.name.endswith(".partial"))
                        original = candidate.lstat()
                        self.assertFalse((waiting_output / "globals.age").exists())
                        main_fd = os.pidfd_open(main_pid)
                        try:
                            signal.pidfd_send_signal(main_fd, signal.SIGKILL)
                            for descriptor in (main_fd, child_fd):
                                poller = select.poll()
                                poller.register(descriptor, select.POLLIN | select.POLLHUP | select.POLLERR)
                                self.assertTrue(poller.poll(10000), "tracked process survived")
                        finally:
                            os.close(main_fd)
                        subprocess.run(["/usr/bin/systemctl", "stop", waiting_unit],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       timeout=15, check=True)
                        self.assertFalse((waiting_output / "globals.age").exists())
                        self.assertEqual(list(waiting_output.iterdir()), [candidate])
                        current = candidate.lstat()
                        self.assertEqual((original.st_dev, original.st_ino),
                                         (current.st_dev, current.st_ino))
                        candidate.unlink()
                    finally:
                        if child_fd is not None:
                            os.close(child_fd)
                        subprocess.run(["/usr/bin/systemctl", "stop", waiting_unit],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       timeout=15, check=False)
                        shown = subprocess.run(
                            ["/usr/bin/systemctl", "show", waiting_unit, "-p", "MainPID",
                             "-p", "ActiveState"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            text=True, timeout=15, check=True).stdout
                        properties = dict(line.split("=", 1) for line in shown.splitlines())
                        if properties.get("MainPID") != "0":
                            raise RuntimeError("synthetic waiting capture remains")
                        if properties.get("ActiveState") == "failed":
                            subprocess.run(["/usr/bin/systemctl", "reset-failed", waiting_unit],
                                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                           timeout=15, check=True)

                    real_age_output = root / "kill-real-age"
                    real_age_output.mkdir(mode=0o700)
                    real_age_unit = "sydney-globals-real-age-" + secrets.token_hex(12) + ".service"
                    real_age_program = (
                        "import importlib.util,os,sys\n"
                        "s=importlib.util.spec_from_file_location('controller',sys.argv[1])\n"
                        "m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n"
                        "original=m.stream.subprocess.Popen\n"
                        "def substitute(args,*other,**kwargs):\n"
                        " if args[0]=='/usr/bin/docker' and '--globals-only' in args:\n"
                        "  args=['/usr/bin/docker','--host','unix:///run/docker.sock',"
                        "'exec',sys.argv[8],'/usr/bin/timeout','-k','1','20','/bin/sleep','40']\n"
                        " return original(args,*other,**kwargs)\n"
                        "m.stream.subprocess.Popen=substitute\n"
                        "fd=os.open(sys.argv[5],os.O_RDONLY|os.O_DIRECTORY)\n"
                        "m.capture(sys.argv[2],'postgres',sys.argv[3],sys.argv[4],"
                        "'synthetic_admin',fd,sys.argv[6],sys.argv[7],1048576,30)\n"
                    )
                    tracked = {}
                    try:
                        subprocess.run(
                            ["/usr/bin/systemd-run", "--unit=" + real_age_unit,
                             "--property=RuntimeMaxSec=60s", "--property=KillMode=control-group",
                             sys.executable, "-I", "-B", "-c", real_age_program,
                             str(Path(__file__).with_name("globals-capture-controller.py")),
                             project, IMAGE, volume, str(real_age_output), AGE, recipient, container],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            timeout=15, check=True)
                        deadline = time.monotonic() + 12
                        main_pid = 0
                        while time.monotonic() < deadline:
                            shown = subprocess.run(
                                ["/usr/bin/systemctl", "show", real_age_unit, "-p", "MainPID",
                                 "-p", "ActiveState", "-p", "ControlGroup"], capture_output=True,
                                text=True, timeout=15, check=True).stdout
                            fields = dict(line.split("=", 1) for line in shown.splitlines())
                            main_pid = int(fields["MainPID"])
                            group = fields["ControlGroup"]
                            if main_pid > 1 and fields["ActiveState"] == "active" and group:
                                try:
                                    members = [int(value) for value in
                                               Path("/sys/fs/cgroup" + group + "/cgroup.procs")
                                               .read_text().split()]
                                except FileNotFoundError:
                                    members = []
                                for member in members:
                                    if member == main_pid:
                                        continue
                                    try:
                                        args = Path(f"/proc/{member}/cmdline").read_bytes()
                                        kind = ("age" if args.startswith(os.fsencode(AGE) + b"\0")
                                                else "docker" if args.startswith(b"/usr/bin/docker\0")
                                                and b"/bin/sleep\0" in args else None)
                                        if kind is not None and kind not in tracked:
                                            tracked[kind] = os.pidfd_open(member)
                                    except (FileNotFoundError, ProcessLookupError):
                                        continue
                            if set(tracked) == {"age", "docker"}:
                                if "/bin/sleep 40" in docker("top", container, "-eo", "pid,args"):
                                    break
                            time.sleep(0.1)
                        self.assertEqual(set(tracked), {"age", "docker"})
                        self.assertIn("/bin/sleep 40", docker("top", container, "-eo", "pid,args"))
                        candidates = list(real_age_output.iterdir())
                        self.assertEqual(len(candidates), 1)
                        candidate = candidates[0]
                        self.assertTrue(candidate.name.startswith(".capture-"))
                        self.assertTrue(candidate.name.endswith(".partial"))
                        original = candidate.lstat()
                        self.assertFalse((real_age_output / "globals.age").exists())
                        main_fd = os.pidfd_open(main_pid)
                        try:
                            signal.pidfd_send_signal(main_fd, signal.SIGKILL)
                            for descriptor in [main_fd, *tracked.values()]:
                                poller = select.poll()
                                poller.register(descriptor, select.POLLIN | select.POLLHUP | select.POLLERR)
                                self.assertTrue(poller.poll(10000), "tracked process survived")
                        finally:
                            os.close(main_fd)
                        self.assertIn("/bin/sleep 40", docker("top", container, "-eo", "pid,args"))
                        deadline = time.monotonic() + 25
                        while "/bin/sleep 40" in docker("top", container, "-eo", "pid,args"):
                            if time.monotonic() >= deadline:
                                self.fail("container timeout did not stop synthetic producer")
                            time.sleep(0.2)
                        subprocess.run(["/usr/bin/systemctl", "stop", real_age_unit],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       timeout=15, check=True)
                        self.assertFalse((real_age_output / "globals.age").exists())
                        self.assertEqual(list(real_age_output.iterdir()), [candidate])
                        current = candidate.lstat()
                        self.assertEqual((original.st_dev, original.st_ino),
                                         (current.st_dev, current.st_ino))
                        candidate.unlink()
                    finally:
                        for descriptor in tracked.values():
                            os.close(descriptor)
                        subprocess.run(["/usr/bin/systemctl", "stop", real_age_unit],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       timeout=15, check=False)
                        shown = subprocess.run(
                            ["/usr/bin/systemctl", "show", real_age_unit, "-p", "MainPID",
                             "-p", "ActiveState"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            text=True, timeout=15, check=True).stdout
                        properties = dict(line.split("=", 1) for line in shown.splitlines())
                        if properties.get("MainPID") != "0":
                            raise RuntimeError("synthetic real-age capture remains")
                        if properties.get("ActiveState") == "failed":
                            subprocess.run(["/usr/bin/systemctl", "reset-failed", real_age_unit],
                                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                           timeout=15, check=True)

                    calls = []
                    original_verify = controller.guard.PinnedSource.verify

                    def fail_before_publish(instance):
                        calls.append(1)
                        if len(calls) == 3:
                            raise ValueError("synthetic source changed")
                        return original_verify(instance)

                    descriptor = os.open(failure, os.O_RDONLY | os.O_DIRECTORY)
                    try:
                        with mock.patch.object(controller.guard.PinnedSource, "verify",
                                               autospec=True, side_effect=fail_before_publish):
                            with self.assertRaises(ValueError):
                                controller.capture(project, "postgres", IMAGE, volume,
                                                   "synthetic_admin", descriptor, AGE, recipient,
                                                   1024 * 1024, 30)
                    finally:
                        os.close(descriptor)
                    self.assertEqual(len(calls), 3)
                    self.assertEqual(list(failure.iterdir()), [])
                docker("restart", container)
                with self.assertRaises(ValueError):
                    source.verify()
            finally:
                source.close()
        finally:
            containers = docker("ps", "-aq", "--no-trunc", "--filter", "label=" + label).split()
            for found in containers:
                item = json.loads(docker("inspect", found))[0]
                if (item["Image"] != IMAGE or item["Config"]["Labels"].get(LABEL) != nonce
                        or (container is not None and found != container)):
                    raise RuntimeError("synthetic container identity mismatch")
                docker("rm", "-f", found)
            if docker("ps", "-aq", "--no-trunc", "--filter", "label=" + label):
                raise RuntimeError("synthetic container remains")
            volumes = docker("volume", "ls", "-q", "--filter", "label=" + label).split()
            for found in volumes:
                info = json.loads(docker("volume", "inspect", found))[0]
                if (found != volume or info["Name"] != volume
                        or (info.get("Labels") or {}).get(LABEL) != nonce
                        or docker("ps", "-aq", "--filter", "volume=" + volume)):
                    raise RuntimeError("synthetic volume identity mismatch")
                docker("volume", "rm", volume)
            if docker("volume", "ls", "-q", "--filter", "label=" + label):
                raise RuntimeError("synthetic volume remains")


if __name__ == "__main__":
    unittest.main()
