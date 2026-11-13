import hashlib
import importlib.util
import json
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import types
import unittest
import io
from unittest import mock


SCRIPT = pathlib.Path(__file__).with_name("backup-caddy-volumes-encrypted.py")
SPEC = importlib.util.spec_from_file_location("caddy_backup", SCRIPT)
backup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backup)


def entry(root="data", path="file", kind="file"):
    result = {"root": root, "path": path, "type": kind, "uid": 1000, "gid": 1000, "mode": 0o600}
    if kind == "file":
        result["sha256"] = hashlib.sha256(b"synthetic").hexdigest()
    return result


def manifest(entries):
    return json.dumps({"version": 1, "entries": entries}).encode()


class ManifestTests(unittest.TestCase):
    def test_valid_manifest_and_empty_directory(self):
        directory = entry(path="empty", kind="directory")
        self.assertEqual(len(backup.parse_manifest(manifest([entry(), directory]))), 2)

    def test_rejects_escape_duplicates_and_missing_parent(self):
        for path in ("../file", "/file", "a//b", "a/./b", "a\nb", "missing/file"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                backup.parse_manifest(manifest([entry(path=path)]))
        with self.assertRaises(ValueError):
            backup.parse_manifest(manifest([entry(), entry()]))
        with self.assertRaises(ValueError):
            backup.parse_manifest(b'{"version":1,"version":1,"entries":[]}')

    def test_rejects_malformed_hash_and_unknown_fields(self):
        bad = entry()
        bad["sha256"] = "not-a-digest"
        with self.assertRaises(ValueError):
            backup.parse_manifest(manifest([bad]))
        bad = entry()
        bad["extra"] = 1
        with self.assertRaises(ValueError):
            backup.parse_manifest(manifest([bad]))

    def test_directory_enumeration_stops_at_first_extra_entry(self):
        items = [type("Entry", (), {"name": str(index)})() for index in range(1000)]
        iterator = mock.MagicMock()
        iterator.__enter__.return_value = iter(items)
        with mock.patch.object(backup.os, "scandir", return_value=iterator), \
                mock.patch.object(backup.os, "lseek"):
            with self.assertRaisesRegex(ValueError, "too many directory entries"):
                backup.bounded_names(123, 2)
        iterator.__exit__.assert_called_once()
        remaining = list(iterator.__enter__.return_value)
        self.assertEqual(len(remaining), 997)

    def test_encryptor_limits_and_inherited_hard_limit(self):
        limits = types.SimpleNamespace(RLIMIT_FSIZE=1, RLIMIT_AS=2, RLIMIT_NPROC=3,
                                       RLIM_INFINITY=-1)
        limits.getrlimit = mock.Mock(return_value=(10, limits.RLIM_INFINITY))
        limits.setrlimit = mock.Mock()
        with mock.patch.object(backup, "resource", limits):
            backup.set_limits(1024, 4294967296, 256)
            self.assertEqual(limits.setrlimit.call_args_list, [
                mock.call(1, (1024, 1024)),
                mock.call(2, (4294967296, 4294967296)),
                mock.call(3, (256, 256)),
            ])
            limits.getrlimit.return_value = (10, 100)
            with self.assertRaisesRegex(ValueError, "inherited hard limit"):
                backup.set_limits(1024, 4294967296, 256)

    def test_rejects_each_capability_set_and_missing_or_duplicate_fields(self):
        names = ("CapInh", "CapPrm", "CapEff", "CapAmb")

        def status(changed=None):
            return "\n".join(f"{name}:\t{'0000000001000000' if name == changed else '0'}"
                             for name in names) + "\nCapBnd:\tffffffffffffffff\n"

        backup.validate_capability_status(status())
        for name in names:
            with self.subTest(capability_set=name), self.assertRaisesRegex(
                    ValueError, "capability-bearing process forbidden"):
                backup.validate_capability_status(status(name))
        for bad in (status().replace("CapAmb:\t0\n", ""),
                    status() + "CapPrm:\t0\n", status().replace("CapPrm:\t0", "CapPrm:\txyz")):
            with self.subTest(status=bad), self.assertRaises(ValueError):
                backup.validate_capability_status(bad)

    def test_saved_uid_must_equal_nonroot_real_and_effective(self):
        status = "CapInh:\t0\nCapPrm:\t0\nCapEff:\t0\nCapAmb:\t0\n"
        with mock.patch.object(backup.os, "getresuid", create=True, return_value=(1234, 1234, 1234)), \
                mock.patch("builtins.open", mock.mock_open(read_data=status)):
            backup.check_unprivileged()
        for uids in ((0, 0, 0), (1234, 1234, 0), (1234, 1235, 1234)):
            with self.subTest(uids=uids), \
                    mock.patch.object(backup.os, "getresuid", create=True, return_value=uids), \
                    self.assertRaisesRegex(ValueError, "equal non-root"):
                backup.check_unprivileged()

    def test_no_new_privileges_is_set_and_verified(self):
        libc = types.SimpleNamespace(prctl=mock.Mock(side_effect=[0, 1]))
        with mock.patch.object(backup.ctypes, "CDLL", return_value=libc):
            backup.set_no_new_privileges()
        self.assertEqual(libc.prctl.call_args_list, [mock.call(38, 1, 0, 0, 0),
                                                    mock.call(39, 0, 0, 0, 0)])
        for outcomes in ([1], [0, 0]):
            libc = types.SimpleNamespace(prctl=mock.Mock(side_effect=outcomes))
            with mock.patch.object(backup.ctypes, "CDLL", return_value=libc), self.assertRaises(OSError):
                backup.set_no_new_privileges()

    def test_prepare_encryptor_checks_before_and_after_filter(self):
        calls = []
        with mock.patch.object(backup, "set_no_new_privileges", side_effect=lambda: calls.append("nnp")), \
                mock.patch.object(backup, "check_unprivileged", side_effect=lambda: calls.append("caps")), \
                mock.patch.object(backup, "set_limits", side_effect=lambda *args: calls.append("limits")), \
                mock.patch.object(backup, "restrict_children", side_effect=lambda: calls.append("filter")):
            backup.prepare_encryptor(1024, 4294967296, 256)
        self.assertEqual(calls, ["nnp", "caps", "limits", "filter", "caps"])


@unittest.skipUnless(sys.platform == "linux", "requires Linux descriptor operations")
class LinuxSyntheticTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.data = self.root / "data"
        self.config = self.root / "config"
        self.data.mkdir(mode=0o700)
        self.config.mkdir(mode=0o700)
        self.file = self.data / "file"
        self.file.write_bytes(b"synthetic")
        self.file.chmod(0o600)
        self.data_fd = os.open(self.data, os.O_RDONLY | os.O_DIRECTORY)
        self.config_fd = os.open(self.config, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, self.data_fd)
        self.addCleanup(os.close, self.config_fd)
        self.roots = {"data": self.data_fd, "config": self.config_fd}
        self.item = entry()
        info = self.file.stat()
        self.item.update(uid=info.st_uid, gid=info.st_gid, mode=stat.S_IMODE(info.st_mode))
        self.entries = backup.parse_manifest(manifest([self.item]))

    def collect(self):
        objects, children = backup.collect(self.roots, self.entries, 1000)
        self.addCleanup(lambda: [os.close(value[0]) for value in objects.values()])
        return objects, children

    def test_success_and_detects_path_replacement(self):
        objects, children = self.collect()
        backup.verify(objects, children)
        self.file.rename(self.data / "old")
        self.file.write_bytes(b"synthetic")
        with self.assertRaises((ValueError, OSError)):
            backup.verify(objects, children)

    def test_rejects_unlisted_and_wrong_hash(self):
        (self.data / "extra").write_text("synthetic")
        with self.assertRaises(ValueError):
            self.collect()
        (self.data / "extra").unlink()
        self.file.write_bytes(b"other")
        with self.assertRaises(ValueError):
            self.collect()

    def test_rejects_symlink_hardlink_and_writable_file(self):
        self.collect()
        self.file.unlink()
        self.file.symlink_to(self.config)
        with self.assertRaises((ValueError, OSError)):
            self.collect()
        self.file.unlink()
        self.file.write_bytes(b"synthetic")
        os.link(self.file, self.config / "hardlink")
        with self.assertRaises(ValueError):
            self.collect()
        (self.config / "hardlink").unlink()
        self.file.chmod(0o620)
        self.item["mode"] = 0o620
        with self.assertRaisesRegex(ValueError, "untrusted owner or writable object"):
            self.collect()

    def test_rejects_fifo_and_xattr(self):
        self.collect()
        self.file.unlink()
        os.mkfifo(self.file)
        with self.assertRaises((ValueError, OSError)):
            self.collect()
        self.file.unlink()
        self.file.write_bytes(b"synthetic")
        self.file.chmod(0o600)
        self.collect()
        try:
            os.setxattr(self.file, "user.synthetic", b"value")
        except OSError as error:
            self.skipTest(f"xattrs unavailable: {error}")
        with self.assertRaisesRegex(ValueError, "ACL or xattr unsupported"):
            self.collect()
        os.removexattr(self.file, "user.synthetic")
        self.collect()

    def test_enumeration_limit_and_rewind(self):
        objects, children = self.collect()
        backup.verify(objects, children)
        backup.verify(objects, children)
        (self.data / "extra").write_text("synthetic")
        with self.assertRaises(ValueError):
            backup.verify(objects, children)

    def test_root_directory_offsets_remain_unchanged(self):
        try:
            data_offset = os.lseek(self.data_fd, 1, os.SEEK_SET)
            config_offset = os.lseek(self.config_fd, 1, os.SEEK_SET)
        except OSError as error:
            self.skipTest(f"filesystem does not support directory seek: {error}")
        if data_offset == 0 or config_offset == 0:
            self.skipTest("filesystem did not retain a nonzero directory offset")
        duplicate = os.dup(self.data_fd)
        try:
            os.lseek(duplicate, 0, os.SEEK_SET)
            self.assertEqual(os.lseek(self.data_fd, 0, os.SEEK_CUR), 0)
        finally:
            os.close(duplicate)
        self.assertEqual(os.lseek(self.data_fd, data_offset, os.SEEK_SET), data_offset)
        objects, children = self.collect()
        backup.verify(objects, children)
        self.assertEqual(os.lseek(self.data_fd, 0, os.SEEK_CUR), data_offset)
        self.assertEqual(os.lseek(self.config_fd, 0, os.SEEK_CUR), config_offset)

    def test_seccomp_allows_threads_but_blocks_process_creation(self):
        code = (
            "import ctypes, errno, os, threading\n"
            "results = []\n"
            "def probe():\n"
            "    try:\n"
            "        pid = os.fork()\n"
            "    except OSError as error:\n"
            "        results.append(error.errno)\n"
            "    else:\n"
            "        if pid == 0: os._exit(0)\n"
            "        os.waitpid(pid, 0)\n"
            "        results.append('fork allowed')\n"
            "thread = threading.Thread(target=probe)\n"
            "thread.start(); thread.join()\n"
            "assert results == [errno.EPERM], results\n"
            "try:\n"
            "    os.fork()\n"
            "except OSError as error:\n"
            "    assert error.errno == errno.EPERM\n"
            "else:\n"
            "    os._exit(19)\n"
            "libc = ctypes.CDLL(None, use_errno=True)\n"
            "assert libc.syscall(435, 0, 0) == -1\n"
            "assert ctypes.get_errno() == errno.ENOSYS\n"
        )
        result = subprocess.run([sys.executable, "-c", code], preexec_fn=backup.restrict_children,
                                capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipIf(hasattr(os, "geteuid") and os.geteuid() == 0, "requires non-root")
    def test_no_capabilities_and_no_new_privileges_after_exec(self):
        code = (
            "import os\n"
            "assert len(set(os.getresuid())) == 1 and os.getuid() != 0\n"
            "fields = {}\n"
            "for line in open('/proc/self/status', encoding='ascii'):\n"
            "    key, sep, value = line.partition(':')\n"
            "    if sep: fields[key] = value.strip()\n"
            "for key in ('CapInh', 'CapPrm', 'CapEff', 'CapAmb'):\n"
            "    assert int(fields[key], 16) == 0, key\n"
            "assert fields['NoNewPrivs'] == '1'\n"
        )
        result = subprocess.run([sys.executable, "-c", code],
                                preexec_fn=lambda: backup.prepare_encryptor(1048576, 4294967296, 256),
                                capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_output_inside_root(self):
        nested = self.data / "nested"
        nested.mkdir()
        fd = os.open(nested, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, fd)
        with self.assertRaises(ValueError):
            backup.reject_output_in_roots(fd, [os.fstat(self.data_fd), os.fstat(self.config_fd)])

    @unittest.skipIf(hasattr(os, "geteuid") and os.geteuid() == 0, "synthetic CLI rejects root")
    @unittest.skipUnless(shutil.which("age") and shutil.which("age-keygen"), "real age unavailable")
    def test_real_age_default_limits_encrypt_and_decrypt(self):
        identity = self.root / "identity"
        subprocess.run([shutil.which("age-keygen"), "-o", str(identity)],
                       check=True, capture_output=True, timeout=10)
        recipient = subprocess.run([shutil.which("age-keygen"), "-y", str(identity)],
                                   check=True, capture_output=True, text=True, timeout=10).stdout.strip()
        output = self.root / "out"
        output.mkdir(mode=0o700)
        manifest_path = self.root / "manifest"
        manifest_path.write_bytes(manifest([self.item]))
        output_fd = os.open(output, os.O_RDONLY | os.O_DIRECTORY)
        manifest_fd = os.open(manifest_path, os.O_RDONLY)
        self.addCleanup(os.close, output_fd)
        self.addCleanup(os.close, manifest_fd)
        args = [sys.executable, str(SCRIPT), "--synthetic-only",
                "--data-fd", str(self.data_fd), "--config-fd", str(self.config_fd),
                "--manifest-fd", str(manifest_fd), "--output-dir-fd", str(output_fd),
                "--max-bytes", "1000", "--max-output-bytes", "1048576",
                "--reserve-bytes", "1", "--timeout", "15", "--output", "result.age",
                "--recipient", recipient, "--age", shutil.which("age")]
        result = subprocess.run(args, pass_fds=(self.data_fd, self.config_fd, output_fd, manifest_fd),
                                capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        decrypted = subprocess.run([shutil.which("age"), "-d", "-i", str(identity),
                                    str(output / "result.age")],
                                   check=True, capture_output=True, timeout=10).stdout
        with tarfile.open(fileobj=io.BytesIO(decrypted), mode="r:") as archive:
            self.assertEqual(archive.extractfile("data/file").read(), b"synthetic")

    @unittest.skipIf(hasattr(os, "geteuid") and os.geteuid() == 0, "synthetic CLI rejects root")
    def test_synthetic_cli_mock_encryption_and_failure_cleanup(self):
        output = self.root / "out"
        output.mkdir(mode=0o700)
        manifest_path = self.root / "manifest"
        manifest_path.write_bytes(manifest([self.item]))
        fake_age = self.root / "fake-age"
        fake_age.write_text(
            f"#!{sys.executable}\n"
            "import sys\n"
            "sys.stdout.buffer.write(b'age-encryption.org/v1\\n')\n"
            "sys.stdout.buffer.write(sys.stdin.buffer.read())\n"
        )
        fake_age.chmod(0o700)
        output_fd = os.open(output, os.O_RDONLY | os.O_DIRECTORY)
        manifest_fd = os.open(manifest_path, os.O_RDONLY)
        self.addCleanup(os.close, output_fd)
        self.addCleanup(os.close, manifest_fd)
        args = [sys.executable, str(SCRIPT), "--synthetic-only",
                "--data-fd", str(self.data_fd), "--config-fd", str(self.config_fd),
                "--manifest-fd", str(manifest_fd), "--output-dir-fd", str(output_fd),
                "--max-bytes", "1000", "--max-output-bytes", "1048576",
                "--reserve-bytes", "1", "--timeout", "10", "--output", "result.age",
                "--recipient", "age1synthetic", "--age", str(fake_age)]
        inherited = (self.data_fd, self.config_fd, output_fd, manifest_fd)
        result = subprocess.run(args, pass_fds=inherited, capture_output=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((output / "result.age").exists())
        os.lseek(manifest_fd, 0, os.SEEK_SET)
        result = subprocess.run(args, pass_fds=inherited, capture_output=True, timeout=15)
        self.assertNotEqual(result.returncode, 0)
        (output / "result.age").unlink()
        fake_age.write_text(f"#!{sys.executable}\nraise SystemExit(1)\n")
        os.lseek(manifest_fd, 0, os.SEEK_SET)
        result = subprocess.run(args, pass_fds=inherited, capture_output=True, timeout=15)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((output / "result.age").exists())

        marker = self.root / "fork-blocked"
        fake_age.write_text(
            f"#!{sys.executable}\n"
            "import errno, os, pathlib\n"
            "try:\n"
            "    pid = os.fork()\n"
            "except OSError as error:\n"
            "    if error.errno == errno.EPERM:\n"
            f"        pathlib.Path({str(marker)!r}).write_text('blocked')\n"
            "        raise SystemExit(17)\n"
            "    raise\n"
            "if pid == 0:\n"
            "    os._exit(0)\n"
            "os.waitpid(pid, 0)\n"
            "raise SystemExit(18)\n"
        )
        os.lseek(manifest_fd, 0, os.SEEK_SET)
        result = subprocess.run(args, pass_fds=inherited, capture_output=True, timeout=15)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(marker.read_text(), "blocked")
        self.assertFalse((output / "result.age").exists())

        fake_age.write_text(
            f"#!{sys.executable}\n"
            "import sys, time\n"
            "sys.stdin.buffer.read()\n"
            "time.sleep(30)\n"
        )
        args[args.index("--timeout") + 1] = "1"
        os.lseek(manifest_fd, 0, os.SEEK_SET)
        result = subprocess.run(args, pass_fds=inherited, capture_output=True, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((output / "result.age").exists())


if __name__ == "__main__":
    unittest.main()
