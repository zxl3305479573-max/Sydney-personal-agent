import io
import json
import pathlib
import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

script = pathlib.Path(__file__).with_name("backup-manual-encrypted.sh").read_text()
source = script.split('guard_source="$(cat <<\'PY\'\n', 1)[1].split("\nPY\n)", 1)[0]
guard = {"__name__": "backup_guard_test"}
with patch.dict(sys.modules, {"fcntl": sys.modules.get("fcntl") or types.ModuleType("fcntl")}):
    exec(compile(source, "backup-guard", "exec"), guard)


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.original = {name: guard[name] for name in ("start_time", "listener_inode", "main_pid", "os", "socket")}
        guard["os"] = MagicMock(wraps=self.original["os"])
        guard["os"].path = self.original["os"].path
        guard["os"].environ = self.original["os"].environ
        guard["socket"] = MagicMock(wraps=self.original["socket"])
        guard["socket"].AF_UNIX = 1
        guard["socket"].SO_PEERCRED = 17
        self.socket_object = MagicMock()
        self.socket_object.__enter__.return_value = self.socket_object
        self.socket_object.getsockopt.return_value = guard["struct"].pack("3i", 42, 0, 0)
        self.stats = {
            "/var/run/docker.sock": SimpleNamespace(st_dev=1, st_ino=2, st_mode=0o140600),
            "/proc/42/exe": SimpleNamespace(st_dev=1, st_ino=3),
            "/usr/bin/dockerd": SimpleNamespace(st_dev=1, st_ino=3),
            "/usr/lib/systemd/systemd": SimpleNamespace(st_dev=1, st_ino=4),
            "/proc/42/ns/mnt": SimpleNamespace(st_dev=1, st_ino=5),
            "/proc/self/ns/mnt": SimpleNamespace(st_dev=1, st_ino=5),
        }
        self.patches = [
            patch.object(guard["socket"], "socket", return_value=self.socket_object),
            patch.object(guard["os"], "fstat", return_value=self.stats["/var/run/docker.sock"]),
            patch.object(guard["os"], "stat", side_effect=lambda path: self.stats[path]),
            patch.object(guard["os"], "listdir", return_value=["7"]),
            patch.object(guard["os"], "readlink", return_value="socket:[123]"),
        ]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)
        guard["start_time"] = lambda pid: "start"
        guard["listener_inode"] = lambda fd: "123"
        guard["main_pid"] = lambda: 42
        self.addCleanup(lambda: guard.update(self.original))

    def systemd(self):
        self.socket_object.getsockopt.return_value = guard["struct"].pack("3i", 1, 0, 0)
        self.stats["/proc/1/exe"] = self.stats["/usr/lib/systemd/systemd"]

    def test_direct_and_systemd(self):
        self.assertEqual(guard["inspect"](100)[:2], ["direct", 42])
        self.systemd()
        self.assertEqual(guard["inspect"](100)[:2], ["systemd", 42])

    def test_rejects_untrusted_peer_or_daemon_executable(self):
        self.socket_object.getsockopt.return_value = guard["struct"].pack("3i", 42, 1000, 0)
        with self.assertRaises(ValueError):
            guard["inspect"](100)
        self.systemd()
        self.stats["/proc/42/exe"] = SimpleNamespace(st_dev=1, st_ino=99)
        with self.assertRaises(ValueError):
            guard["inspect"](100)

    def test_rejects_missing_listener_and_wrong_namespace(self):
        guard["os"].readlink.return_value = "socket:[999]"
        with self.assertRaises(ValueError):
            guard["inspect"](100)
        guard["os"].readlink.return_value = "socket:[123]"
        self.stats["/proc/42/ns/mnt"] = SimpleNamespace(st_dev=1, st_ino=99)
        with self.assertRaises(ValueError):
            guard["inspect"](100)

    def test_rejects_restart_and_replacement(self):
        self.systemd()
        guard["main_pid"] = MagicMock(side_effect=[42, 43])
        with self.assertRaises(ValueError):
            guard["inspect"](100)
        self.stats["/var/run/docker.sock"] = SimpleNamespace(st_dev=1, st_ino=99, st_mode=0o140600)
        with self.assertRaises(ValueError):
            guard["inspect"](100)

    def test_listener_parsing_requires_unique_listening_inode(self):
        guard["listener_inode"] = self.original["listener_inode"]
        entry = "000: 00000002 00000000 00010000 0001 01 123 /var/run/docker.sock\n"
        with patch("builtins.open", return_value=io.StringIO("header\n" + entry)):
            self.assertEqual(guard["listener_inode"](100), "123")
        with patch("builtins.open", return_value=io.StringIO("header\n" + entry + entry)):
            with self.assertRaises(ValueError):
                guard["listener_inode"](100)

    def test_check_rejects_changed_identity(self):
        guard["inspect"] = lambda fd: ["direct", 42, "new", "123", 1, 2]
        self.addCleanup(lambda: guard.update({"inspect": inspect_original}))
        with patch.dict(guard["os"].environ, {"_RAKAZO_SOCKET_FD": "100", "_RAKAZO_DAEMON_ID": json.dumps(["direct", 42, "old", "123", 1, 2])}):
            with patch.object(guard["sys"], "argv", ["guard", "check"]):
                with self.assertRaises(ValueError):
                    guard["run"]()


class NestedMountTests(unittest.TestCase):
    def check_mounts(self, content, root="/data"):
        with patch("builtins.open", return_value=io.StringIO(content)):
            guard["reject_nested_mounts"]("mountinfo", root)

    def test_rejects_nested_and_escaped_mountpoints(self):
        base = "1 0 0:1 / / rw - ext4 /dev/root rw\n"
        self.check_mounts(base + "2 1 0:2 / /database rw - tmpfs tmpfs rw\n")
        for path in ("/data/child", "/data/space\\040name", "/data/child/grandchild"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                self.check_mounts(base + f"2 1 0:2 / {path} rw - tmpfs tmpfs rw\n")
        with self.assertRaises(ValueError):
            self.check_mounts(base + "2 1 0:2 / /host/data/child rw - tmpfs tmpfs rw\n", "/host/data")

    def test_rejects_unreadable_empty_and_malformed_mountinfo(self):
        for content in ("", "invalid\n", "1 0 0:1 / /data/bad\\xyz rw - tmpfs tmpfs rw\n"):
            with self.subTest(content=content), self.assertRaises(ValueError):
                self.check_mounts(content)
        with patch("builtins.open", side_effect=OSError("unreadable")):
            with self.assertRaises(OSError):
                guard["reject_nested_mounts"]("mountinfo", "/data")

    def test_mount_mode_checks_host_and_container(self):
        with patch.dict(guard, {"reject_nested_mounts": MagicMock()}) as patched:
            with patch.object(guard["sys"], "argv", ["guard", "mounts", "/host/data", "42"]):
                guard["run"]()
            self.assertEqual(
                patched["reject_nested_mounts"].call_args_list,
                [unittest.mock.call("/proc/self/mountinfo", "/host/data"),
                 unittest.mock.call("/proc/42/mountinfo", "/data")],
            )


inspect_original = guard["inspect"]

if __name__ == "__main__":
    unittest.main()
