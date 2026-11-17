import contextlib
import io
import os
import pathlib
import subprocess
import sys
import tarfile
import tempfile
import types
import unittest
from unittest import mock


script = pathlib.Path(__file__).with_name("backup-config-encrypted.sh")
source = script.read_text(encoding="utf-8").split("<<'PY'\n", 1)[1].rsplit("\nPY", 1)[0]
draft = {"__name__": "backup_config_test"}
exec(compile(source, str(script), "exec"), draft)


class MemoryPipe(io.BytesIO):
    def close(self):
        self.saved = self.getvalue()
        super().close()


class FakeAge:
    status = 0
    last = None

    def __init__(self, command, stdin, stdout, stderr, close_fds, preexec_fn):
        self.stdin = MemoryPipe()
        self.command = command
        self.running = True
        os.write(stdout, b"age-encryption.org/v1\nsealed")
        FakeAge.last = self

    def wait(self):
        self.running = False
        return self.status

    def poll(self):
        return None if self.running else self.status

    def kill(self):
        self.running = False


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.secret = b"SYNTHETIC-SECRET-NOT-FOR-OUTPUT"
        self.input = self.root / "key"
        self.input.write_bytes(self.secret)
        self.output = self.root / "backup.age"
        self.parent_fd = 918273
        self.fake_os = types.SimpleNamespace(**vars(os))
        self.real_close = os.close
        self.real_stat = os.stat
        self.fake_os.close = lambda fd: None if fd == self.parent_fd else self.real_close(fd)
        self.fake_os.fsync = lambda fd: None if fd == self.parent_fd else os.fsync(fd)
        self.fake_os.stat = lambda name, **kwargs: self.real_stat(self.output) if kwargs.get("dir_fd") == self.parent_fd else self.real_stat(name, **kwargs)
        self.fake_os.unlink = lambda name, **kwargs: self.output.unlink()
        self.args = types.SimpleNamespace(file=["/private/key"], recipient=["age1public"],
                                          output="/private/backup.age", max_bytes=1024,
                                          max_output_bytes=2048, reserve_bytes=100,
                                          trusted_input_owner_uid=None)
        self.patches = [
            mock.patch.dict(draft, {"os": self.fake_os}),
            mock.patch.dict(draft, {"open_input": self.open_input}),
            mock.patch.dict(draft, {"open_output": self.open_output}),
            mock.patch.dict(draft, {"verify_output_parent": mock.Mock()}),
            mock.patch.dict(draft, {"check_capacity": mock.Mock()}),
            mock.patch.object(subprocess, "Popen", FakeAge),
        ]
        for patcher in self.patches:
            patcher.start()
            self.addCleanup(patcher.stop)
        FakeAge.status = 0

    def open_input(self, path, trusted_input_owner_uid=None):
        fd = os.open(self.input, os.O_RDONLY | getattr(os, "O_BINARY", 0))
        return fd, os.fstat(fd)

    def open_output(self, path):
        fd = os.open(self.output, os.O_CREAT | os.O_EXCL | os.O_RDWR | getattr(os, "O_BINARY", 0), 0o600)
        return self.parent_fd, "backup.age", fd

    def test_streams_whitelist_to_age_without_printing_secret(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            draft["capture"](self.args)
        self.assertNotIn(self.secret.decode(), output.getvalue())
        self.assertNotIn(self.secret, self.output.read_bytes())
        self.assertEqual(FakeAge.last.command, ["age", "--encrypt", "-r", "age1public"])
        with tarfile.open(fileobj=io.BytesIO(FakeAge.last.stdin.saved), mode="r:") as archive:
            self.assertEqual(archive.getnames(), ["private/key"])
            self.assertEqual(archive.extractfile("private/key").read(), self.secret)
            info = archive.getmember("private/key")
            self.assertEqual((info.uid, info.gid), (self.input.stat().st_uid, self.input.stat().st_gid))

    def test_replaced_parent_removes_incomplete_output(self):
        with mock.patch.dict(draft, {"verify_output_parent": mock.Mock(side_effect=[None, ValueError()])}):
            with self.assertRaises(ValueError):
                draft["capture"](self.args)
        self.assertFalse(self.output.exists())

    def test_insufficient_capacity_removes_incomplete_output(self):
        with mock.patch.dict(draft, {"check_capacity": mock.Mock(side_effect=ValueError())}):
            with self.assertRaises(ValueError):
                draft["capture"](self.args)
        self.assertFalse(self.output.exists())

    def test_ciphertext_size_limit_is_checked(self):
        self.args.max_output_bytes = 10
        with self.assertRaises(ValueError):
            draft["capture"](self.args)
        self.assertFalse(self.output.exists())

    def test_pseudo_file_with_zero_size_is_not_silently_archived(self):
        fd = os.open(self.input, os.O_RDONLY | getattr(os, "O_BINARY", 0))
        self.addCleanup(os.close, fd)
        info = self.input.stat()
        before = types.SimpleNamespace(st_size=0, st_mode=info.st_mode, st_mtime=info.st_mtime,
                                       st_uid=info.st_uid, st_gid=info.st_gid)
        with self.assertRaises(ValueError):
            draft["stream_archive"](io.BytesIO(), [("/proc/pseudo", fd, before)])

    def test_encryption_failure_removes_incomplete_output(self):
        FakeAge.status = 1
        with self.assertRaises(ValueError):
            draft["capture"](self.args)
        self.assertFalse(self.output.exists())

    def test_existing_output_is_not_overwritten(self):
        self.output.write_bytes(b"existing")
        with self.assertRaises(FileExistsError):
            draft["capture"](self.args)
        self.assertEqual(self.output.read_bytes(), b"existing")

    def test_age_start_failure_removes_incomplete_output(self):
        with mock.patch.object(subprocess, "Popen", side_effect=OSError("unavailable")):
            with self.assertRaises(OSError):
                draft["capture"](self.args)
        self.assertFalse(self.output.exists())

    def test_cleanup_failure_is_reported_without_secret(self):
        FakeAge.status = 1
        self.fake_os.unlink = mock.Mock(side_effect=OSError("sensitive detail"))
        errors = io.StringIO()
        with contextlib.redirect_stderr(errors), self.assertRaises(ValueError):
            draft["capture"](self.args)
        self.assertIn("manual cleanup is required", errors.getvalue())
        self.assertNotIn("sensitive detail", errors.getvalue())
        self.assertTrue(self.output.exists())

    def test_oversize_and_duplicate_input_do_not_create_output(self):
        self.args.max_bytes = 1
        with self.assertRaises(ValueError):
            draft["capture"](self.args)
        self.args.max_bytes = 1024
        self.args.file.append("/another/key")
        with self.assertRaises(ValueError):
            draft["capture"](self.args)
        self.assertFalse(self.output.exists())

    def test_changed_input_fails_and_removes_output(self):
        original = draft["stream_archive"]

        def change(stream, inputs):
            original(stream, inputs)
            self.input.write_bytes(b"changed")

        with mock.patch.dict(draft, {"stream_archive": change}), self.assertRaises(ValueError):
            draft["capture"](self.args)
        self.assertFalse(self.output.exists())

    def test_replaced_input_path_fails_and_removes_output(self):
        replacement = self.root / "replacement"
        replacement.write_bytes(self.secret)
        original = draft["stream_archive"]

        def change(stream, inputs):
            original(stream, inputs)
            self.input = replacement

        with mock.patch.dict(draft, {"stream_archive": change}), self.assertRaises(ValueError):
            draft["capture"](self.args)
        self.assertFalse(self.output.exists())

    def test_trusted_input_owner_applies_to_every_reopen(self):
        calls = []

        def record(path, trusted_input_owner_uid=None):
            calls.append(trusted_input_owner_uid)
            return self.open_input(path, trusted_input_owner_uid)

        self.args.trusted_input_owner_uid = 1234
        with mock.patch.dict(draft, {"open_input": record}), contextlib.redirect_stdout(io.StringIO()):
            draft["capture"](self.args)
        self.assertEqual(calls, [1234, 1234, 1234])


class ArgumentTests(unittest.TestCase):
    def test_explicit_encryption_and_limits_required(self):
        for argv in ([], ["--output", "/out", "--file", "/key", "--max-bytes", "100"],
                     ["--output", "/out", "--file", "/key", "--max-bytes", "100",
                      "--recipient", "-bad"],
                     ["--output", "/out", "--file", "/key", "--max-bytes", "0",
                      "--recipient", "age1test"]):
            with self.subTest(argv=argv), self.assertRaises(ValueError):
                draft["parse_args"](argv)

    def test_paths_must_be_absolute_and_canonical(self):
        for path in ("relative", "/a/../b", "/a//b", "/a/./b", "/a\nb"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                draft["components"](path)
        self.assertEqual(draft["components"]("/a/b"), ["a", "b"])

    def test_capacity_assertion_and_separate_limits_are_mandatory(self):
        base = ["--output", "/out", "--file", "/key", "--recipient", "age1test",
                "--max-bytes", "100", "--max-output-bytes", "200", "--reserve-bytes", "100"]
        with self.assertRaises(ValueError):
            draft["parse_args"](base)
        args = draft["parse_args"](base + ["--confirm-isolated-capacity"])
        self.assertEqual((args.max_bytes, args.max_output_bytes, args.reserve_bytes), (100, 200, 100))
        errors = io.StringIO()
        with contextlib.redirect_stderr(errors):
            self.assertEqual(draft["main"](base), 1)
        self.assertIn("Production use is forbidden", errors.getvalue())

    def test_reopened_parent_identity_must_match_pinned_parent(self):
        fake_os = types.SimpleNamespace(**vars(os))
        fake_os.fstat = lambda fd: types.SimpleNamespace(st_dev=1, st_ino=fd)
        fake_os.close = mock.Mock()
        open_parent = mock.Mock(return_value=(11, "output"))
        with mock.patch.dict(draft, {"os": fake_os, "open_parent": open_parent}):
            with self.assertRaises(ValueError):
                draft["verify_output_parent"]("/trusted/out", 10)
        open_parent.assert_called_once_with("/trusted/out", trusted=True)
        fake_os.close.assert_called_once_with(11)

    def test_ancestor_requires_trusted_owner_and_no_group_or_world_write(self):
        fake_os = types.SimpleNamespace(**vars(os))
        fake_os.geteuid = lambda: 1000
        for owner, mode, accepted in ((0, 0o755, True), (1000, 0o700, True),
                                      (0, 0o1777, False), (1000, 0o770, False),
                                      (1001, 0o700, False)):
            fake_os.fstat = lambda fd: types.SimpleNamespace(st_uid=owner, st_mode=mode)
            with self.subTest(owner=owner, mode=mode), mock.patch.dict(draft, {"os": fake_os}):
                if accepted:
                    draft["check_trusted_directory"](1)
                else:
                    with self.assertRaises(ValueError):
                        draft["check_trusted_directory"](1)

    def test_explicit_input_owner_requires_root_and_never_allows_other_writers(self):
        fake_os = types.SimpleNamespace(**vars(os))
        fake_os.geteuid = lambda: 0
        for owner, mode, explicit, accepted in (
            (1234, 0o755, None, False), (1234, 0o755, 1234, True),
            (1235, 0o755, 1234, False), (1234, 0o775, 1234, False),
            (1234, 0o757, 1234, False), (0, 0o755, 1234, True),
        ):
            fake_os.fstat = lambda fd: types.SimpleNamespace(st_uid=owner, st_mode=mode)
            with self.subTest(owner=owner, mode=mode, explicit=explicit), mock.patch.dict(draft, {"os": fake_os}):
                if accepted:
                    draft["check_trusted_directory"](1, explicit)
                else:
                    with self.assertRaises(ValueError):
                        draft["check_trusted_directory"](1, explicit)
        fake_os.geteuid = lambda: 1000
        with mock.patch.dict(draft, {"os": fake_os}), self.assertRaises(ValueError):
            draft["check_trusted_directory"](1, 1234)

    def test_output_parent_does_not_receive_trusted_input_owner(self):
        fake_os = types.SimpleNamespace(**vars(os))
        fake_os.geteuid = lambda: 0
        fake_os.O_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0x20000)
        fake_os.O_CLOEXEC = getattr(os, "O_CLOEXEC", 0x40000)
        fake_os.fstat = lambda fd: types.SimpleNamespace(st_uid=0, st_mode=0o40700)
        fake_os.open = mock.Mock(return_value=11)
        open_parent = mock.Mock(return_value=(10, "out"))
        with mock.patch.dict(draft, {"os": fake_os, "open_parent": open_parent}):
            self.assertEqual(draft["open_output"]("/secure/out"), (10, "out", 11))
        open_parent.assert_called_once_with("/secure/out", trusted=True)

    def test_optional_uid_argument_requires_root_and_valid_uid(self):
        base = ["--output", "/out", "--file", "/key", "--recipient", "age1test",
                "--max-bytes", "100", "--max-output-bytes", "200", "--reserve-bytes", "100",
                "--confirm-isolated-capacity"]
        fake_os = types.SimpleNamespace(**vars(os))
        fake_os.geteuid = lambda: 0
        with mock.patch.dict(draft, {"os": fake_os}):
            self.assertIsNone(draft["parse_args"](base).trusted_input_owner_uid)
            self.assertEqual(draft["parse_args"](base + ["--trusted-input-owner-uid", "1234"]).trusted_input_owner_uid, 1234)
            for value in ("-1", "4294967295", "not-a-uid"):
                with self.subTest(value=value), self.assertRaises(ValueError):
                    draft["parse_args"](base + ["--trusted-input-owner-uid", value])
        fake_os.geteuid = lambda: 1000
        with mock.patch.dict(draft, {"os": fake_os}), self.assertRaises(ValueError):
            draft["parse_args"](base + ["--trusted-input-owner-uid", "1234"])

    def test_available_capacity_check(self):
        fake_os = types.SimpleNamespace(**vars(os))
        fake_os.fstatvfs = lambda fd: types.SimpleNamespace(f_bavail=10, f_frsize=1024)
        with mock.patch.dict(draft, {"os": fake_os}):
            draft["check_capacity"](1, 10240)
            with self.assertRaises(ValueError):
                draft["check_capacity"](1, 10241)

    def test_child_file_size_limit(self):
        resource = types.SimpleNamespace(RLIMIT_FSIZE=1, RLIM_INFINITY=-1,
                                         getrlimit=lambda key: (100, 1000),
                                         setrlimit=mock.Mock())
        with mock.patch.dict(sys.modules, {"resource": resource}):
            draft["limit_output"](500)
            resource.setrlimit.assert_called_once_with(1, (500, 1000))
            with self.assertRaises(ValueError):
                draft["limit_output"](1001)

    def test_rejects_proc_filesystem(self):
        fake_os = types.SimpleNamespace(**vars(os))
        fake_os.O_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0x20000)
        fake_os.O_CLOEXEC = getattr(os, "O_CLOEXEC", 0x40000)
        fake_os.O_NONBLOCK = getattr(os, "O_NONBLOCK", 0x80000)
        fake_os.open = mock.Mock(return_value=11)
        fake_os.close = mock.Mock()
        fake_os.fstat = mock.Mock(return_value=types.SimpleNamespace(st_mode=0o100644))
        with mock.patch.dict(draft, {"os": fake_os, "open_parent": lambda path, trusted=False, trusted_input_owner_uid=None: (10, "version"),
                                    "filesystem_type": lambda fd: 0x9FA0}):
            with self.assertRaises(ValueError):
                draft["open_input"]("/proc/version")
        fake_os.close.assert_any_call(11)

    def test_each_parent_open_uses_no_follow(self):
        fake_os = types.SimpleNamespace(**vars(os))
        fake_os.O_DIRECTORY = getattr(os, "O_DIRECTORY", 0x10000)
        fake_os.O_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0x20000)
        fake_os.O_CLOEXEC = getattr(os, "O_CLOEXEC", 0x40000)
        fake_os.open = mock.Mock(side_effect=[10, 11, OSError("symlink")])
        fake_os.close = mock.Mock()
        with mock.patch.dict(draft, {"os": fake_os}), self.assertRaises(OSError):
            draft["open_parent"]("/safe/link/key")
        self.assertEqual(fake_os.open.call_count, 3)
        for call in fake_os.open.call_args_list:
            self.assertTrue(call.args[1] & fake_os.O_NOFOLLOW)
        fake_os.close.assert_any_call(11)


@unittest.skipUnless(sys.platform == "linux", "requires Linux descriptor-relative filesystem operations")
class LinuxIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=pathlib.Path.home())
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.root.chmod(0o700)
        try:
            parent, _ = draft["open_parent"](str(self.root / "check"), trusted=True)
            os.close(parent)
        except (OSError, ValueError):
            self.skipTest("No trusted test output ancestry available")
        self.key = self.root / "key"
        self.key.write_text("synthetic secret")
        self.output = self.root / "out.age"
        age = self.root / "age"
        age.write_text("#!/usr/bin/env python3\nimport sys\nsys.stdin.buffer.read()\nsys.stdout.buffer.write(b'age-encryption.org/v1\\nsealed')\n")
        age.chmod(0o700)
        self.env = dict(os.environ, PATH=str(self.root) + os.pathsep + os.environ["PATH"])

    def run_backup(self, input_path=None, output_path=None, output_limit="1048576", trusted_uid=None):
        command = ["bash", str(script), "--output", str(output_path or self.output),
                               "--file", str(input_path or self.key), "--recipient", "age1test",
                               "--max-bytes", "1000", "--max-output-bytes", output_limit,
                               "--reserve-bytes", "1", "--confirm-isolated-capacity"]
        if trusted_uid is not None:
            command.extend(["--trusted-input-owner-uid", str(trusted_uid)])
        return subprocess.run(command, capture_output=True, env=self.env)

    def test_success_and_no_overwrite(self):
        self.assertEqual(self.run_backup().returncode, 0)
        self.assertNotIn(b"synthetic secret", self.output.read_bytes())
        self.assertNotEqual(self.run_backup().returncode, 0)

    def test_rejects_symlink_file_and_parent(self):
        link = self.root / "link"
        link.symlink_to(self.key)
        self.assertNotEqual(self.run_backup(link).returncode, 0)
        directory = self.root / "dir"
        directory.mkdir()
        (directory / "key").write_text("synthetic")
        parent_link = self.root / "parent-link"
        parent_link.symlink_to(directory, target_is_directory=True)
        self.assertNotEqual(self.run_backup(parent_link / "key").returncode, 0)
        self.assertFalse(self.output.exists())

    def test_rejects_writable_output_ancestor_and_proc(self):
        unsafe = self.root / "unsafe"
        unsafe.mkdir(mode=0o777)
        unsafe.chmod(0o777)
        private = unsafe / "private"
        private.mkdir(mode=0o700)
        self.assertNotEqual(self.run_backup(output_path=private / "out.age").returncode, 0)
        self.assertFalse((private / "out.age").exists())
        self.assertNotEqual(self.run_backup(pathlib.Path("/proc/version")).returncode, 0)
        self.assertFalse(self.output.exists())

    def test_rejects_sticky_writable_input_and_output_ancestors(self):
        sticky = self.root / "sticky"
        sticky.mkdir(mode=0o700)
        source = sticky / "key"
        source.write_text("synthetic")
        private = sticky / "private"
        private.mkdir(mode=0o700)
        self.assertEqual(self.run_backup(source).returncode, 0)
        self.output.unlink()
        self.assertEqual(self.run_backup(output_path=private / "out.age").returncode, 0)
        (private / "out.age").unlink()
        sticky.chmod(0o1777)
        self.assertEqual(sticky.stat().st_mode & 0o7777, 0o1777)
        with self.assertRaisesRegex(ValueError, "Untrusted directory ancestor"):
            draft["open_parent"](str(source), trusted=True)
        self.assertNotEqual(self.run_backup(source).returncode, 0)
        self.assertFalse(self.output.exists())
        if os.geteuid() == 0:
            self.assertNotEqual(self.run_backup(source, trusted_uid=1234).returncode, 0)
            self.assertFalse(self.output.exists())
        self.assertNotEqual(self.run_backup(output_path=private / "out.age").returncode, 0)
        self.assertFalse((private / "out.age").exists())

    def test_kernel_ciphertext_limit_cleans_failed_output(self):
        age = self.root / "age"
        age.write_text("#!/usr/bin/env python3\nimport sys\nsys.stdin.buffer.read()\nsys.stdout.buffer.write(b'age-encryption.org/v1\\n' + b'x' * 65536)\n")
        self.assertNotEqual(self.run_backup(output_limit="1024").returncode, 0)
        self.assertFalse(self.output.exists())

    def test_real_input_parent_replacement_fails_capture(self):
        source_dir = self.root / "source"
        source_dir.mkdir(mode=0o700)
        source_key = source_dir / "key"
        source_key.write_text("synthetic original")
        age = self.root / "age"
        age.write_text(
            "#!/usr/bin/env python3\n"
            "import os, pathlib, sys\n"
            "source = pathlib.Path(os.environ['SYNTHETIC_SOURCE'])\n"
            "source.rename(source.with_name('source-old'))\n"
            "source.mkdir(mode=0o700)\n"
            "(source / 'key').write_text('synthetic replacement')\n"
            "sys.stdin.buffer.read()\n"
            "sys.stdout.buffer.write(b'age-encryption.org/v1\\nsealed')\n"
        )
        self.env["SYNTHETIC_SOURCE"] = str(source_dir)
        result = self.run_backup(source_key)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())
        self.assertEqual((self.root / "source-old" / "key").read_text(), "synthetic original")
        self.assertEqual(source_key.read_text(), "synthetic replacement")

    @unittest.skipUnless(hasattr(os, "geteuid") and os.geteuid() == 0, "requires Linux root to create synthetic owners")
    def test_root_explicit_input_owner_and_untrusted_owner(self):
        source_dir = self.root / "synthetic-owner"
        source_dir.mkdir(mode=0o755)
        source_dir.chmod(0o755)
        source_key = source_dir / "key"
        source_key.write_text("synthetic")
        os.chown(source_dir, 1234, -1)
        self.assertNotEqual(self.run_backup(source_key).returncode, 0)
        self.assertEqual(self.run_backup(source_key, trusted_uid=1234).returncode, 0)
        self.output.unlink()
        self.assertNotEqual(self.run_backup(source_key, trusted_uid=1235).returncode, 0)
        source_dir.chmod(0o775)
        self.assertNotEqual(self.run_backup(source_key, trusted_uid=1234).returncode, 0)
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
