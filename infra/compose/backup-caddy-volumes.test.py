import os
import hashlib
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import io
import contextlib
import json
import secrets
import tarfile
from unittest import mock


SCRIPT = pathlib.Path(__file__).with_name("backup-caddy-volumes.sh")
TOOLS = ("bash", "age", "age-keygen", "tar", "python3", "setfacl", "getfacl")
source = SCRIPT.read_text(encoding="utf-8")
candidate = source.split("exec /usr/bin/python3 -I -c \"$(/usr/bin/cat <<'PY'\n", 1)[1].split("\nPY\n)\"", 1)[0]
functions = {"__name__": "candidate_test"}
exec(compile(candidate, str(SCRIPT), "exec"), functions)
EXPECTED_NAMES = {"/data": "synthetic-data", "/config": "synthetic-config"}


def record_unknown(uncertain, token, kind, name):
    description = f"{kind} {name}; label sydney.synthetic={token}"
    uncertain.append(description)
    print("Synthetic Docker operation outcome unknown; late resources may remain: " + description,
          file=sys.stderr, flush=True)


def tracked_docker(docker, uncertain, token, kind, name, *args, input_data=None):
    try:
        return docker(*args, input_data=input_data)
    except BaseException:
        record_unknown(uncertain, token, kind, name)
        raise


class CandidateGuardTests(unittest.TestCase):
    def container(self):
        return [{"Id": "a" * 64, "State": {"Running": True, "Pid": 123, "StartedAt": "start"},
                 "Config": {"Labels": {"com.docker.compose.project": "synthetic",
                                       "com.docker.compose.service": "caddy"}},
                 "Mounts": [
                     {"Destination": "/data", "Type": "volume", "Name": "synthetic-data",
                      "Source": "/synthetic/data"},
                     {"Destination": "/config", "Type": "volume", "Name": "synthetic-config",
                      "Source": "/synthetic/config"}]}]

    def test_container_identity_rejects_wrong_project_and_stopped(self):
        document = self.container()
        self.assertEqual(functions["container_identity"](document, "synthetic", "caddy")[1], 123)
        with self.assertRaises(ValueError):
            functions["container_identity"](document, "other", "caddy")
        document[0]["State"]["Running"] = False
        with self.assertRaises(ValueError):
            functions["container_identity"](document, "synthetic", "caddy")

    def test_volume_source_and_driver_must_match(self):
        document = self.container()
        volumes = {name: {"Name": name, "Mountpoint": "/synthetic/" + suffix,
                          "Driver": "local", "Options": None}
                   for name, suffix in (("synthetic-data", "data"), ("synthetic-config", "config"))}
        self.assertEqual(len(functions["volume_identity"](document, volumes, EXPECTED_NAMES)), 2)
        volumes["synthetic-data"]["Mountpoint"] = "/different"
        with self.assertRaises(ValueError):
            functions["volume_identity"](document, volumes, EXPECTED_NAMES)

    def test_initial_swapped_volumes_are_rejected(self):
        document = self.container()
        volumes = {name: {"Name": name, "Mountpoint": "/synthetic/" + suffix,
                          "Driver": "local", "Options": None}
                   for name, suffix in (("synthetic-data", "data"), ("synthetic-config", "config"))}
        identity = functions["volume_identity"]
        self.assertEqual(len(identity(document, volumes, EXPECTED_NAMES)), 2)
        document[0]["Mounts"][0]["Destination"] = "/config"
        document[0]["Mounts"][1]["Destination"] = "/data"
        with self.assertRaisesRegex(ValueError, "expected volume name mismatch"):
            identity(document, volumes, EXPECTED_NAMES)
        for invalid in ({}, {"/data": "synthetic-data", "/config": "synthetic-data"},
                        {"/data": "", "/config": "synthetic-config"}):
            with self.assertRaisesRegex(ValueError, "invalid expected volume names"):
                identity(self.container(), volumes, invalid)

    def test_rejects_nested_mount_including_escaped_space(self):
        root = "1 0 0:1 / / rw - tmpfs tmpfs rw\n"
        nested = "2 1 0:1 / /synthetic/data/child\\040dir rw - tmpfs tmpfs rw\n"
        functions["reject_nested_mounts"](root, "/synthetic/data")
        with self.assertRaisesRegex(ValueError, "nested mount"):
            functions["reject_nested_mounts"](root + nested, "/synthetic/data")
        stacked = ("2 1 0:1 / /synthetic/data rw - tmpfs tmpfs rw\n"
                   "3 1 0:1 / /synthetic/data rw - tmpfs tmpfs rw\n")
        with self.assertRaisesRegex(ValueError, "stacked"):
            functions["reject_nested_mounts"](root + stacked, "/synthetic/data", 3)
        with self.assertRaisesRegex(ValueError, "mount ID"):
            functions["reject_nested_mounts"](root, "/synthetic/data", 999)

    def test_candidate_remains_blocked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            result = subprocess.run(["bash", "-p", str(SCRIPT), "--candidate"], cwd=root,
                                    env={**os.environ, "TMPDIR": str(root)},
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Production capture remains blocked", result.stderr)
            self.assertEqual(list(root.iterdir()), [])
        monitored = {name: mock.Mock(name=name) for name in
                     ("collect_candidate", "inspect_sources", "GuardedDocker", "open_private_output")}
        with mock.patch.dict(functions, monitored):
            with mock.patch.object(sys, "argv", ["-c", str(SCRIPT), "--candidate"]):
                with contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(functions["main"](), 1)
                for monitored_mock in monitored.values():
                    monitored_mock.assert_not_called()
            with mock.patch.object(sys, "argv", ["-c", str(SCRIPT), "--guard-check-internal"]):
                with mock.patch.dict(os.environ, {"_RAKAZO_SOCKET_FD": "123"}):
                    with mock.patch.object(functions["os"], "geteuid", return_value=0):
                        with mock.patch.dict(functions, {"load_guard_source": mock.Mock(return_value="guard")}):
                            with contextlib.redirect_stdout(io.StringIO()):
                                self.assertEqual(functions["main"](), 0)
                monitored["GuardedDocker"].assert_called_once_with("guard", 123)
                monitored["GuardedDocker"].return_value.verify.assert_called_once_with()
            for name, monitored_mock in monitored.items():
                monitored_mock.reset_mock()
                functions[name]()
                monitored_mock.assert_called_once_with()

    def test_unprotected_bash_may_execute_bash_env_before_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            marker = root / "executed"
            startup = root / "startup"
            startup.write_text("touch \"$BASH_ENV_MARKER\"\n")
            environment = os.environ.copy()
            environment.update({"BASH_ENV": str(startup), "BASH_ENV_MARKER": str(marker)})
            result = subprocess.run(["bash", str(SCRIPT), "--candidate"], env=environment,
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertTrue(marker.exists())
            self.assertIn("may already have executed BASH_ENV", result.stderr)
            marker.unlink()
            protected = subprocess.run(["bash", "-p", str(SCRIPT), "--candidate"], env=environment,
                                       capture_output=True, text=True)
            self.assertNotEqual(protected.returncode, 0)
            self.assertIn("Production capture remains blocked", protected.stderr)
            self.assertFalse(marker.exists())

    def test_guard_python_uses_isolated_mode_and_safe_working_directory(self):
        completed = subprocess.CompletedProcess([], 0)
        with mock.patch.dict(os.environ, {"_RAKAZO_SOCKET_FD": "123", "_RAKAZO_DAEMON_ID": "[]",
                                          "PYTHONPATH": "/untrusted"}):
            with mock.patch.object(functions["subprocess"], "run", return_value=completed) as run:
                functions["GuardedDocker"]("synthetic", 123).verify()
        self.assertIn("-I", run.call_args.args[0])
        self.assertEqual(run.call_args.kwargs["cwd"], "/")
        self.assertNotIn("PYTHONPATH", run.call_args.kwargs["env"])


class SourceCheckTests(unittest.TestCase):
    arguments = ["a" * 64, "synthetic", "caddy", "synthetic-data", "synthetic-config"]

    def test_unknown_docker_create_is_recorded_even_if_later_cleanup_succeeds(self):
        uncertain = []
        docker = mock.Mock(side_effect=subprocess.TimeoutExpired("docker", 30))
        with contextlib.redirect_stderr(io.StringIO()) as stderr:
            with self.assertRaises(subprocess.TimeoutExpired):
                tracked_docker(docker, uncertain, "token", "container creation", "fixture", "create")
        self.assertEqual(uncertain, ["container creation fixture; label sydney.synthetic=token"])
        self.assertIn("late resources may remain", stderr.getvalue())
        success = mock.Mock(return_value="fixture")
        self.assertEqual(tracked_docker(success, uncertain, "token", "cleanup", "fixture", "rm"),
                         "fixture")
        self.assertEqual(len(uncertain), 1)

    def test_validate_explicit_arguments(self):
        validate = functions["validate_source_arguments"]
        self.assertEqual(validate(self.arguments)[3], EXPECTED_NAMES)
        for index, value in ((0, "caddy"), (1, "-p"), (2, "Caddy"),
                             (3, "../data"), (4, "synthetic-data")):
            values = list(self.arguments)
            values[index] = value
            with self.subTest(index=index), self.assertRaises(ValueError):
                validate(values)
        for value in (None, {}, self.arguments[:-1], self.arguments + ["extra"]):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate(value)

    def test_source_check_rechecks_identity_roots_and_closes_fds(self):
        identity = ("a" * 64, 123, "start")
        sources = {"/data": ("synthetic-data", "/fixture/data"),
                   "/config": ("synthetic-config", "/fixture/config")}
        backend = mock.Mock()
        fake_flags = {"O_DIRECTORY": 1, "O_NOFOLLOW": 2, "O_CLOEXEC": 4}
        with mock.patch.multiple(os, create=True, **fake_flags), \
                mock.patch.object(os, "open", side_effect=[10, 11]) as open_fd, \
                mock.patch.object(os, "close") as close_fd, \
                mock.patch.dict(functions, {
                    "inspect_sources": mock.Mock(return_value=(identity, sources)),
                    "check_roots": mock.Mock(),
                    "collect_candidate": mock.Mock(),
                    "encrypted_archive": mock.Mock(),
                    "open_private_output": mock.Mock(),
                }):
            functions["check_sources"](backend, *functions["validate_source_arguments"](self.arguments))
            self.assertEqual(functions["inspect_sources"].call_count, 2)
            self.assertEqual(functions["check_roots"].call_count, 2)
            self.assertEqual(open_fd.call_count, 2)
            self.assertEqual(close_fd.call_args_list, [mock.call(10), mock.call(11)])
            backend.verify.assert_called_once_with()
            for name in ("collect_candidate", "encrypted_archive", "open_private_output"):
                functions[name].assert_not_called()

    def test_identity_change_and_open_failure_close_fds(self):
        identity = ("a" * 64, 123, "start")
        sources = {"/data": ("synthetic-data", "/fixture/data"),
                   "/config": ("synthetic-config", "/fixture/config")}
        backend = mock.Mock()
        fake_flags = {"O_DIRECTORY": 1, "O_NOFOLLOW": 2, "O_CLOEXEC": 4}
        with mock.patch.multiple(os, create=True, **fake_flags), \
                mock.patch.object(os, "open", side_effect=[10, 11, 12, OSError("failed")]), \
                mock.patch.object(os, "close") as close_fd, \
                mock.patch.dict(functions, {
                    "inspect_sources": mock.Mock(side_effect=[
                        (identity, sources), (("a" * 64, 123, "changed"), sources),
                        (identity, sources)]),
                    "check_roots": mock.Mock()}):
            args = (backend, *functions["validate_source_arguments"](self.arguments))
            with self.assertRaisesRegex(ValueError, "identity changed"):
                functions["check_sources"](*args)
            with self.assertRaises(OSError):
                functions["check_sources"](*args)
            self.assertEqual(close_fd.call_args_list, [mock.call(10), mock.call(11), mock.call(12)])

    def test_entry_bootstraps_guard_and_internal_checks_sources(self):
        digests = ["1" * 64, "2" * 64]
        with mock.patch.object(sys, "argv", ["-c", str(SCRIPT), "--source-check", *self.arguments, *digests]), \
                mock.patch.object(os, "geteuid", return_value=0, create=True), \
                mock.patch.object(os, "execve", side_effect=SystemExit(42), create=True) as execute, \
                mock.patch.dict(functions, {"prepare_source_snapshot": mock.Mock(return_value=(21, 22, "guard"))}):
            with self.assertRaises(SystemExit):
                functions["main"]()
            self.assertEqual(execute.call_args.args[1][-2:], ["start", "/proc/self/fd/21"])
            self.assertEqual(json.loads(execute.call_args.args[2]["_RAKAZO_SOURCE_ARGS"]), self.arguments)
            self.assertEqual(execute.call_args.args[2]["_RAKAZO_SOURCE_SCRIPT_SHA256"], digests[0])
            self.assertEqual(execute.call_args.args[2]["_RAKAZO_SOURCE_BACKUP_SHA256"], digests[1])
        environment = {"_RAKAZO_SOCKET_FD": "123", "_RAKAZO_SOURCE_ARGS": json.dumps(self.arguments)}
        monitored = {"restore_source_snapshot": mock.Mock(return_value="guard"),
                     "GuardedDocker": mock.Mock(), "check_sources": mock.Mock(),
                     "collect_candidate": mock.Mock(), "open_private_output": mock.Mock()}
        with mock.patch.object(sys, "argv", ["-c", str(SCRIPT), "--source-check-internal"]), \
                mock.patch.object(os, "geteuid", return_value=0, create=True), \
                mock.patch.dict(os.environ, environment, clear=True), \
                mock.patch.dict(functions, monitored), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(functions["main"](), 0)
            monitored["check_sources"].assert_called_once_with(
                monitored["GuardedDocker"].return_value, *functions["validate_source_arguments"](self.arguments))
            monitored["collect_candidate"].assert_not_called()
            monitored["open_private_output"].assert_not_called()

    def test_guard_bootstrap_preserves_protected_bash_and_internal_mode(self):
        backup = SCRIPT.with_name("backup-manual-encrypted.sh").read_text(encoding="utf-8")
        with mock.patch.dict(functions, {"read_trusted_file": mock.Mock(side_effect=["script", backup])}):
            guard = functions["load_guard_source"]("/trusted/backup-caddy-volumes.sh",
                                                    "--source-check-internal")
        self.assertIn('["/bin/bash", "-p", sys.argv[2], \'--source-check-internal\']', guard)
        self.assertNotIn('os.execvpe("bash", ["bash", sys.argv[2]], env)', guard)

    def test_internal_missing_guard_and_invalid_input_fail_closed(self):
        monitored = {"restore_source_snapshot": mock.Mock(return_value="guard"),
                     "GuardedDocker": mock.Mock(), "check_sources": mock.Mock()}
        for environment in ({"_RAKAZO_SOURCE_ARGS": json.dumps(self.arguments)},
                            {"_RAKAZO_SOCKET_FD": "123", "_RAKAZO_SOURCE_ARGS": "[]"}):
            with mock.patch.object(sys, "argv", ["-c", str(SCRIPT), "--source-check-internal"]), \
                    mock.patch.object(os, "geteuid", return_value=0, create=True), \
                    mock.patch.dict(os.environ, environment, clear=True), \
                    mock.patch.dict(functions, monitored), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(functions["main"](), 1)
        monitored["check_sources"].assert_not_called()

    def test_guard_failure_prevents_any_container_inspection(self):
        backend = mock.Mock()
        backend.verify.side_effect = ValueError("guard failed")
        with self.assertRaisesRegex(ValueError, "guard failed"):
            functions["check_sources"](backend, *functions["validate_source_arguments"](self.arguments))
        backend.container.assert_not_called()
        backend.volume.assert_not_called()

    def test_internal_reports_only_controlled_volume_mismatch(self):
        environment = {"_RAKAZO_SOCKET_FD": "123", "_RAKAZO_SOURCE_ARGS": json.dumps(self.arguments)}
        for error, expected in ((ValueError("expected volume name mismatch"),
                                 "Source check failed: expected volume name mismatch."),
                                (ValueError("guard failed"),
                                 "Source check failed; no capture was performed.")):
            with self.subTest(error=error), \
                    mock.patch.object(sys, "argv", ["-c", str(SCRIPT), "--source-check-internal"]), \
                    mock.patch.object(os, "geteuid", return_value=0, create=True), \
                    mock.patch.dict(os.environ, environment, clear=True), \
                    mock.patch.dict(functions, {"restore_source_snapshot": mock.Mock(return_value="guard"),
                                                "GuardedDocker": mock.Mock(),
                                                "check_sources": mock.Mock(side_effect=error)}), \
                    contextlib.redirect_stderr(io.StringIO()) as stderr:
                self.assertEqual(functions["main"](), 1)
                self.assertEqual(stderr.getvalue().strip(), expected)

    def test_inspected_container_must_match_explicit_full_id(self):
        identity = ("b" * 64, 123, "start")
        with mock.patch.dict(functions, {"inspect_sources": mock.Mock(return_value=(identity, {}))}), \
                mock.patch.object(os, "open") as open_fd:
            with self.assertRaisesRegex(ValueError, "container ID mismatch"):
                functions["check_sources"](mock.Mock(), *functions["validate_source_arguments"](self.arguments))
        open_fd.assert_not_called()

    def test_production_candidate_still_blocked(self):
        with mock.patch.object(sys, "argv", ["-c", str(SCRIPT), "--candidate"]), \
                mock.patch.dict(functions, {"check_sources": mock.Mock(),
                                            "collect_candidate": mock.Mock()}), \
                contextlib.redirect_stderr(io.StringIO()) as stderr:
            self.assertEqual(functions["main"](), 1)
            functions["check_sources"].assert_not_called()
            functions["collect_candidate"].assert_not_called()
            self.assertIn("Production capture remains blocked", stderr.getvalue())


@unittest.skipUnless(sys.platform.startswith("linux") and hasattr(os, "memfd_create"),
                     "Linux memfd seals are required")
class RealPythonSourceBindingTests(unittest.TestCase):
    def test_real_python_c_binding_digest_and_seals(self):
        harness = '''
if os.environ.get("CADDY_BINDING_TEST") == "1":
    import fcntl
    reviewed = bytes.fromhex(os.environ["CADDY_REVIEWED_HEX"])
    digest = os.environ["CADDY_REVIEWED_DIGEST"]
    scenario = os.environ["CADDY_BINDING_SCENARIO"]
    try:
        fd = seal_snapshot(reviewed, digest, "caddy-source-script")
    except ValueError as error:
        if scenario == "different-code" and str(error) == "executed bootstrap differs from reviewed script":
            sys.exit(0)
        if scenario == "wrong-digest" and str(error) == "reviewed snapshot digest mismatch":
            sys.exit(0)
        raise
    try:
        if scenario != "valid":
            raise AssertionError("invalid snapshot accepted")
        if read_sealed_snapshot(fd, digest) != reviewed:
            raise AssertionError("snapshot changed")
        for operation in (lambda: os.pwrite(fd, b"X", 0),
                          lambda: os.ftruncate(fd, 0),
                          lambda: os.ftruncate(fd, len(reviewed) + 1)):
            try:
                operation()
            except OSError:
                pass
            else:
                raise AssertionError("sealed snapshot was modified")
        try:
            read_sealed_snapshot(fd, "0" * 64)
        except ValueError as error:
            if str(error) != "reviewed snapshot digest mismatch":
                raise
        else:
            raise AssertionError("wrong digest accepted")
        unsealed = os.memfd_create("unsealed-test", os.MFD_ALLOW_SEALING)
        try:
            os.write(unsealed, reviewed)
            try:
                read_sealed_snapshot(unsealed, digest)
            except ValueError as error:
                if str(error) != "snapshot seals missing":
                    raise
            else:
                raise AssertionError("unsealed snapshot accepted")
        finally:
            os.close(unsealed)
    finally:
        os.close(fd)
    sys.exit(0)
'''
        instrumented = source.replace('if __name__ == "__main__":', harness + '\nif __name__ == "__main__":', 1)
        embedded = instrumented.split("exec /usr/bin/python3 -I -c \"$(/usr/bin/cat <<'PY'\n", 1)[1].split(
            "\nPY\n)\"", 1)[0]
        reviewed = instrumented.encode("utf-8")
        digest = hashlib.sha256(reviewed).hexdigest()
        for scenario in ("valid", "different-code", "wrong-digest"):
            with self.subTest(scenario=scenario):
                environment = dict(os.environ, CADDY_BINDING_TEST="1", CADDY_REVIEWED_HEX=reviewed.hex(),
                                   CADDY_REVIEWED_DIGEST="0" * 64 if scenario == "wrong-digest" else digest,
                                   CADDY_BINDING_SCENARIO=scenario)
                executed = embedded + ("\npass\n" if scenario == "different-code" else "")
                result = subprocess.run([sys.executable, "-I", "-c", executed], env=environment,
                                        capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(os.geteuid() == 0, "trusted root-owned fixture required")
    def test_real_python_c_wrong_digest_has_controlled_summary(self):
        with tempfile.TemporaryDirectory(prefix="caddy-source-test-", dir="/root") as directory:
            fixture = pathlib.Path(directory)
            script = fixture / SCRIPT.name
            script.write_bytes(SCRIPT.read_bytes())
            backup = SCRIPT.with_name("backup-manual-encrypted.sh").read_bytes()
            (fixture / "backup-manual-encrypted.sh").write_bytes(backup)
            result = subprocess.run(
                [sys.executable, "-I", "-c", candidate, str(script), "--source-check",
                 *SourceCheckTests.arguments, "0" * 64, hashlib.sha256(backup).hexdigest()],
                capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(result.stdout, "")
            self.assertEqual(result.stderr.strip(), "Source check failed; no capture was performed.")


@unittest.skipUnless(os.name == "posix" and all(shutil.which(tool) for tool in TOOLS),
                     "Linux synthetic test dependencies are required")
class SyntheticBackupTests(unittest.TestCase):
    def setUp(self):
        self.binaries = mock.patch.dict(functions, {"AGE_BINARY": shutil.which("age"),
                                                     "TAR_BINARY": shutil.which("tar")})
        self.binaries.start()
        self.addCleanup(self.binaries.stop)

    def run_script(self, *args, limit=None):
        environment = os.environ.copy()
        environment.pop("SYNTHETIC_LIMIT_KIB", None)
        if limit is not None:
            environment["SYNTHETIC_LIMIT_KIB"] = str(limit)
        return subprocess.run(["bash", "-p", str(SCRIPT), *args], env=environment,
                              capture_output=True, text=True, timeout=30)

    def test_requires_synthetic_mode(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 2)
        self.assertIn("Production input is not supported", result.stderr)

    def test_real_age_capture(self):
        result = self.run_script("--synthetic")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Synthetic capture and limited synthetic restore checks completed", result.stdout)
        self.assertIn("production recovery is unverified", result.stdout)
        self.assertIn("Synthetic mode inherits PATH", result.stdout)

    def test_ciphertext_limit_fails_closed(self):
        result = self.run_script("--synthetic", limit=1)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Synthetic encrypted capture failed", result.stderr)
        self.assertNotIn("Synthetic capture and limited synthetic restore checks completed", result.stdout)

    def test_candidate_stream_limit_and_exclusive_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source_dir = root / "source"
            output_dir = root / "output"
            source_dir.mkdir()
            output_dir.mkdir()
            (source_dir / "file").write_bytes(os.urandom(256 * 1024))
            identity = root / "identity"
            with identity.open("wb") as destination:
                subprocess.run(["age-keygen"], stdout=destination, stderr=subprocess.DEVNULL, check=True)
            recipient = subprocess.check_output(["age-keygen", "-y", str(identity)], text=True).strip()
            source_fd = os.open(source_dir, os.O_RDONLY | os.O_DIRECTORY)
            output_fd = os.open(output_dir, os.O_RDONLY | os.O_DIRECTORY)
            try:
                capture = functions["encrypted_archive"]
                with self.assertRaisesRegex(ValueError, "insufficient free space"):
                    capture(source_fd, output_fd, "config.tar.age", recipient, 1024, 1 << 100)
                self.assertFalse((output_dir / "config.tar.age").exists())
                size = capture(source_fd, output_fd, "data.tar.age", recipient, 1024 * 1024, 0)
                self.assertGreater(size, 0)
                self.assertTrue((output_dir / "data.tar.age").read_bytes().startswith(b"age-encryption.org/v1"))
                with self.assertRaises(FileExistsError):
                    capture(source_fd, output_fd, "data.tar.age", recipient, 1024 * 1024, 0)
                with self.assertRaisesRegex(RuntimeError, "partial ciphertext"):
                    capture(source_fd, output_fd, "config.tar.age", recipient, 1024, 0)
                self.assertLessEqual((output_dir / "config.tar.age").stat().st_size, 1024)
            finally:
                os.close(source_fd)
                os.close(output_fd)

    def test_untrusted_path_and_tar_options_are_not_used(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source_dir, output_dir = root / "source", root / "output"
            source_dir.mkdir()
            output_dir.mkdir()
            (source_dir / "file").write_text("synthetic")
            identity = root / "identity"
            with identity.open("wb") as destination:
                subprocess.run(["age-keygen"], stdout=destination, stderr=subprocess.DEVNULL, check=True)
            recipient = subprocess.check_output(["age-keygen", "-y", str(identity)], text=True).strip()
            marker = root / "executed"
            fake = root / "tar"
            fake.write_text("#!/bin/sh\ntouch " + str(marker) + "\nexit 1\n")
            fake.chmod(0o700)
            source_fd = os.open(source_dir, os.O_RDONLY | os.O_DIRECTORY)
            output_fd = os.open(output_dir, os.O_RDONLY | os.O_DIRECTORY)
            try:
                with mock.patch.dict(os.environ, {"PATH": str(root),
                        "TAR_OPTIONS": "--definitely-invalid-option"}):
                    functions["encrypted_archive"](source_fd, output_fd, "data.tar.age",
                                                   recipient, 1024 * 1024, 0)
                self.assertFalse(marker.exists())
            finally:
                os.close(source_fd)
                os.close(output_fd)

    def test_encryptor_timeout_terminates_process_group(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / "source").mkdir()
            (root / "output").mkdir()
            fake = root / "age"
            fake.write_text("#!/bin/sh\nsleep 30\n")
            fake.chmod(0o700)
            source_fd = os.open(root / "source", os.O_RDONLY | os.O_DIRECTORY)
            output_fd = os.open(root / "output", os.O_RDONLY | os.O_DIRECTORY)
            try:
                started = time.monotonic()
                with mock.patch.dict(functions, {"AGE_BINARY": str(fake), "PROCESS_TIMEOUT": 0.5}):
                    with self.assertRaises(subprocess.TimeoutExpired):
                        functions["encrypted_archive"](source_fd, output_fd, "data.tar.age",
                                                       "age1synthetic", 1024 * 1024, 0)
                self.assertLess(time.monotonic() - started, 8)
            finally:
                os.close(source_fd)
                os.close(output_fd)

    def test_exited_leader_does_not_leave_running_child(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / "source").mkdir()
            (root / "output").mkdir()
            pidfile = root / "pid"
            fake = root / "age"
            fake.write_text("#!/bin/sh\nsleep 30 &\necho $! > " + str(pidfile) + "\nexit 1\n")
            fake.chmod(0o700)
            source_fd = os.open(root / "source", os.O_RDONLY | os.O_DIRECTORY)
            output_fd = os.open(root / "output", os.O_RDONLY | os.O_DIRECTORY)
            try:
                with mock.patch.dict(functions, {"AGE_BINARY": str(fake)}):
                    with self.assertRaises(RuntimeError):
                        functions["encrypted_archive"](source_fd, output_fd, "data.tar.age",
                                                       "age1synthetic", 1024 * 1024, 0)
                pid = int(pidfile.read_text())
                status = pathlib.Path(f"/proc/{pid}/stat")
                for _ in range(50):
                    try:
                        if status.read_text().split(") ", 1)[1][0] == "Z":
                            break
                    except FileNotFoundError:
                        break
                    time.sleep(0.02)
                else:
                    self.fail("synthetic child remained running")
            finally:
                os.close(source_fd)
                os.close(output_fd)

    def test_candidate_flow_and_identity_change_leave_explicit_residue(self):
        class Backend:
            def __init__(self, root):
                self.root = root
                self.changed = False
                self.swapped = False

            def verify(self):
                pass

            def container(self, identifier):
                document = CandidateGuardTests().container()
                document[0]["State"]["StartedAt"] = "changed" if self.changed else "start"
                for mount in document[0]["Mounts"]:
                    mount["Source"] = str(self.root / mount["Destination"].lstrip("/"))
                if self.swapped:
                    document[0]["Mounts"][0]["Destination"] = "/config"
                    document[0]["Mounts"][1]["Destination"] = "/data"
                return document

            def volume(self, name):
                suffix = name.removeprefix("synthetic-")
                return {"Name": name, "Mountpoint": str(self.root / suffix),
                        "Driver": "local", "Options": None}

            def mountinfo(self, pid=None):
                return pathlib.Path("/proc/self/mountinfo").read_text()

            def container_path(self, pid, destination):
                return str(self.root / destination.lstrip("/"))

            def mount_root(self, pid, destination):
                return self.container_path(pid, destination)

        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for name in ("data", "config", "output"):
                (root / name).mkdir()
            for name in ("data", "config"):
                (root / name / "file").write_bytes(os.urandom(65536))
            identity = root / "identity"
            with identity.open("wb") as destination:
                subprocess.run(["age-keygen"], stdout=destination, stderr=subprocess.DEVNULL, check=True)
            recipient = subprocess.check_output(["age-keygen", "-y", str(identity)], text=True).strip()
            backend = Backend(root)
            collect = functions["collect_candidate"]
            fake_open = lambda path: os.open(path, os.O_RDONLY | os.O_DIRECTORY)
            with mock.patch.dict(functions, {"open_private_output": fake_open}):
                output_path = str(root / "output")
                backend.swapped = True
                with self.assertRaisesRegex(ValueError, "expected volume name mismatch"):
                    collect(backend, "a" * 64, "synthetic", "caddy", EXPECTED_NAMES, output_path,
                            "swapped", recipient, 1024 * 1024, 0)
                self.assertEqual(list((root / "output").iterdir()), [])
                backend.swapped = False
                size = collect(backend, "a" * 64, "synthetic", "caddy", EXPECTED_NAMES, output_path,
                               "success", recipient, 1024 * 1024, 0)
                archives = list((root / "output" / "success").iterdir())
                self.assertEqual({item.name for item in archives}, {"data.tar.age", "config.tar.age"})
                self.assertEqual(size, sum(item.stat().st_size for item in archives))
                self.assertLessEqual(size, 1024 * 1024)
                with self.assertRaisesRegex(RuntimeError, "encrypted directory remains"):
                    collect(backend, "a" * 64, "synthetic", "caddy", EXPECTED_NAMES, output_path,
                            "success", recipient, 1024 * 1024, 0)

                original = functions["encrypted_archive"]

                def change_after_first(*args):
                    result = original(*args)
                    backend.changed = True
                    return result

                with mock.patch.dict(functions, {"encrypted_archive": change_after_first}):
                    with self.assertRaisesRegex(RuntimeError, "encrypted directory remains"):
                        collect(backend, "a" * 64, "synthetic", "caddy", EXPECTED_NAMES, output_path,
                                "changed", recipient, 1024 * 1024, 0)
                self.assertFalse((root / "output" / "changed").exists())
                incomplete = list((root / "output").glob(".incomplete-*"))
                self.assertEqual(len(incomplete), 2)
                self.assertTrue(all(item.is_dir() for item in incomplete))
                backend.changed = False
                with self.assertRaisesRegex(RuntimeError, "encrypted directory remains"):
                    collect(backend, "a" * 64, "synthetic", "caddy", EXPECTED_NAMES, output_path,
                            "limited", recipient, 70000, 0)
                self.assertFalse((root / "output" / "limited").exists())
                with mock.patch.object(backend, "container_path", return_value=str(root / "output")):
                    with self.assertRaisesRegex(ValueError, "root identity changed"):
                        collect(backend, "a" * 64, "synthetic", "caddy", EXPECTED_NAMES, output_path,
                                "wrong-root", recipient, 1024 * 1024, 0)
                self.assertFalse((root / "output" / "wrong-root").exists())
                with self.assertRaisesRegex(ValueError, "inside an input volume"):
                    collect(backend, "a" * 64, "synthetic", "caddy", EXPECTED_NAMES, str(root / "data"),
                            "inside", recipient, 1024 * 1024, 0)
                original_archive = functions["encrypted_archive"]
                def lose_reserve(*args):
                    result = original_archive(*args)
                    if args[2] == "config.tar.age":
                        space = os.statvfs(output_path)
                        altered = mock.Mock(f_bavail=0, f_frsize=space.f_frsize)
                        functions["os"].fstatvfs = lambda fd: altered
                    return result
                with mock.patch.object(functions["os"], "fstatvfs", wraps=os.fstatvfs):
                    with mock.patch.dict(functions, {"encrypted_archive": lose_reserve}):
                        with self.assertRaisesRegex(RuntimeError, "encrypted directory remains") as failure:
                            collect(backend, "a" * 64, "synthetic", "caddy", EXPECTED_NAMES, output_path,
                                    "reserve", recipient, 1024 * 1024, 1)
                self.assertIn("reserve", str(failure.exception.__cause__))
                self.assertFalse((root / "output" / "reserve").exists())


def real_docker_synthetic(source_only=False):
    script = str(SCRIPT.resolve())
    guard = functions["load_guard_source"](script)
    socket_fd = int(os.environ["_RAKAZO_SOCKET_FD"])
    backend = functions["GuardedDocker"](guard, socket_fd)
    if source_only:
        with open("/etc/machine-id", "rb") as identity_file:
            machine_hash = hashlib.sha256(identity_file.read(4097)).hexdigest()
        if machine_hash != "a549400a11c795ec5f10861037d168dab3fc06a4dde8b57ff6814b4ee52df52f":
            raise RuntimeError("Synthetic source check refused: unexpected maintenance host")
        if backend.docker("info", "--format", "{{json .ID}}") != "d78f85ff-124f-4363-b925-10629b517a5a":
            raise RuntimeError("Synthetic source check refused: unexpected maintenance Docker daemon")
    token = secrets.token_hex(12)
    project = "sydney-synthetic-" + token
    names = [project + "-data", project + "-config"]
    container_name = project + "-container"
    image_id = None
    import_attempted = False
    container_attempts = []
    volume_attempts = []
    work = pathlib.Path(tempfile.mkdtemp(prefix="caddy-real-synthetic-", dir="/root"))
    errors = []
    uncertain = []
    print(f"Synthetic fixture identity: project={project} label=sydney.synthetic={token}",
          file=sys.stderr, flush=True)

    def docker(*args, input_data=None):
        backend.verify()
        result = subprocess.run(["/usr/bin/docker", "--host", f"unix:///proc/self/fd/{socket_fd}", *args],
                                input=input_data, stdin=subprocess.DEVNULL if input_data is None else None,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                pass_fds=(socket_fd,), env=functions["SAFE_ENV"], cwd="/", timeout=30, check=True)
        backend.verify()
        return result.stdout.decode().strip()

    def tracked(kind, name, *args, input_data=None):
        return tracked_docker(docker, uncertain, token, kind, name, *args, input_data=input_data)

    try:
        source = work / "synthetic.c"
        source.write_text("#include <unistd.h>\nint main(void){for(;;) pause();}\n")
        executable = work / "synthetic"
        subprocess.run(["/usr/bin/gcc", "-static", "-o", str(executable), str(source)],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode="w") as archive:
            archive.add(executable, arcname="bin/synthetic")
            info = tarfile.TarInfo("nonce")
            value = token.encode()
            info.size = len(value)
            archive.addfile(info, io.BytesIO(value))
        import_attempted = True
        image_id = tracked("image import", "unknown ID", "import", "--change",
                                  "LABEL sydney.synthetic=" + token, "-", input_data=stream.getvalue())
        if not image_id.startswith("sha256:") or len(image_id) != 71:
            record_unknown(uncertain, token, "image import returned invalid ID", "unknown ID")
            raise AssertionError("synthetic image ID invalid")
        for name in names:
            volume_attempts.append(name)
            if tracked("volume creation", name, "volume", "create", "--label",
                              "sydney.synthetic=" + token, name) != name:
                record_unknown(uncertain, token, "volume creation returned unexpected name", name)
                raise AssertionError("synthetic volume creation mismatch")
        container_attempts.append((container_name, None))
        container_id = tracked(
            "container creation", container_name, "create", "--name", container_name,
            "--label", "sydney.synthetic=" + token,
            "--label", "com.docker.compose.project=" + project,
            "--label", "com.docker.compose.service=caddy", "--network", "none", "--read-only",
            "--mount", f"type=volume,src={names[0]},dst=/data",
            "--mount", f"type=volume,src={names[1]},dst=/config",
            "--entrypoint", "/bin/synthetic", image_id)
        container_attempts[-1] = (container_name, container_id)
        if len(container_id) != 64:
            record_unknown(uncertain, token, "container creation returned invalid ID", container_name)
            raise AssertionError("synthetic container ID invalid")
        tracked("container start", container_name, "start", container_id)
        for index, name in enumerate(names):
            volume = backend.volume(name)
            expected = f"/var/lib/docker/volumes/{name}/_data"
            if (volume.get("Name") != name or volume.get("Driver") != "local"
                    or volume.get("Mountpoint") != expected
                    or (volume.get("Labels") or {}).get("sydney.synthetic") != token
                    or os.path.realpath(expected) != expected):
                raise AssertionError("synthetic volume identity mismatch")
            pathlib.Path(expected, "synthetic").write_text(f"synthetic-{index}-{token}")
        output = work / "output"
        output.mkdir(mode=0o700)
        source_command = ["/bin/bash", "-p", script, "--source-check", container_id,
                          project, "caddy", names[0], names[1],
                          hashlib.sha256(pathlib.Path(script).read_bytes()).hexdigest(),
                          hashlib.sha256(pathlib.Path(script).with_name(
                              "backup-manual-encrypted.sh").read_bytes()).hexdigest()]
        before = set(work.iterdir())
        checked = subprocess.run(source_command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, env=functions["SAFE_ENV"], cwd="/",
                                 timeout=60)
        if checked.returncode != 0 or b"Source identity and mount checks passed" not in checked.stdout:
            raise AssertionError("guarded synthetic source check failed")
        if set(work.iterdir()) != before or list(output.iterdir()):
            raise AssertionError("source check created output")
        if not source_only:
            identity = work / "identity"
            age = os.path.join(os.path.dirname(sys.argv[2]), "age")
            keygen = os.path.join(os.path.dirname(age), "age-keygen")
            with identity.open("wb") as target:
                subprocess.run([keygen], stdout=target, stderr=subprocess.DEVNULL, check=True)
            recipient = subprocess.check_output([keygen, "-y", str(identity)], text=True).strip()
            with mock.patch.dict(functions, {"AGE_BINARY": age}):
                size = functions["collect_candidate"](backend, container_id, project, "caddy",
                                                       {"/data": names[0], "/config": names[1]}, str(output),
                                                       "complete", recipient, 1024 * 1024, 1024)
            if not 0 < size <= 1024 * 1024:
                raise AssertionError("synthetic size invalid")
            for index, name in enumerate(("data.tar.age", "config.tar.age")):
                plaintext = subprocess.check_output([age, "-d", "-i", str(identity),
                                                     str(output / "complete" / name)])
                with tarfile.open(fileobj=io.BytesIO(plaintext)) as archive:
                    if archive.extractfile("./synthetic").read() != f"synthetic-{index}-{token}".encode():
                        raise AssertionError("synthetic restoration mismatch")
        swapped_name = project + "-swapped"
        container_attempts.append((swapped_name, None))
        swapped_id = tracked(
            "container creation", swapped_name, "create", "--name", swapped_name,
            "--label", "sydney.synthetic=" + token,
            "--label", "com.docker.compose.project=" + project,
            "--label", "com.docker.compose.service=caddy", "--network", "none", "--read-only",
            "--mount", f"type=volume,src={names[1]},dst=/data",
            "--mount", f"type=volume,src={names[0]},dst=/config",
            "--entrypoint", "/bin/synthetic", image_id)
        container_attempts[-1] = (swapped_name, swapped_id)
        if len(swapped_id) != 64:
            record_unknown(uncertain, token, "container creation returned invalid ID", swapped_name)
            raise AssertionError("swapped container ID invalid")
        tracked("container start", swapped_name, "start", swapped_id)
        swapped_command = list(source_command)
        swapped_command[4] = swapped_id
        checked = subprocess.run(swapped_command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, env=functions["SAFE_ENV"], cwd="/",
                                 timeout=60)
        if (checked.returncode != 1 or checked.stdout
                or checked.stderr.strip() != b"Source check failed: expected volume name mismatch."):
            raise AssertionError("guarded source check did not reject the expected volume mismatch")
        existing = set(output.iterdir())
        if not source_only:
            try:
                functions["collect_candidate"](backend, swapped_id, project, "caddy",
                                               {"/data": names[0], "/config": names[1]}, str(output),
                                               "swapped", recipient, 1024 * 1024, 1024)
            except ValueError as error:
                if str(error) != "expected volume name mismatch":
                    raise
            else:
                raise AssertionError("initially swapped real Docker volumes were accepted")
        if set(output.iterdir()) != existing:
            raise AssertionError("swapped volumes created output")
    finally:
        for attempted_name, attempted_id in container_attempts:
            try:
                item = backend.container(attempted_id or attempted_name)[0]
                actual_id = item["Id"]
                if ((attempted_id and actual_id != attempted_id)
                        or item["Config"]["Labels"].get("sydney.synthetic") != token):
                    raise ValueError("container identity")
                tracked("container removal", attempted_name, "rm", "-f", actual_id)
            except Exception:
                errors.append("container")
        for name in volume_attempts:
            try:
                volume = backend.volume(name)
            except Exception:
                errors.append("volume identity unavailable")
                continue
            try:
                if volume.get("Name") != name or (volume.get("Labels") or {}).get("sydney.synthetic") != token:
                    raise ValueError("volume identity")
                tracked("volume removal", name, "volume", "rm", name)
            except Exception:
                errors.append("volume")
        if image_id:
            try:
                image = json.loads(docker("image", "inspect", image_id))[0]
                if image["Id"] != image_id or (image["Config"].get("Labels") or {}).get("sydney.synthetic") != token:
                    raise ValueError("image identity")
                tracked("image removal", image_id, "image", "rm", image_id)
            except Exception:
                errors.append("image")
        elif import_attempted:
            errors.append("image identity unavailable")
        if source_only:
            for kind, arguments in (
                ("container", ("ps", "-a", "--no-trunc", "--filter", "label=sydney.synthetic=" + token,
                               "--format", "{{.ID}}")),
                ("volume", ("volume", "ls", "--filter", "label=sydney.synthetic=" + token,
                            "--format", "{{.Name}}")),
                ("image", ("image", "ls", "-a", "--no-trunc", "--filter", "label=sydney.synthetic=" + token,
                           "--format", "{{.ID}}")),
            ):
                try:
                    if docker(*arguments):
                        errors.append(kind + " remains with synthetic label")
                except Exception:
                    errors.append(kind + " cleanup verification unavailable")
        shutil.rmtree(work)
        if uncertain:
            errors.append("unknown outcomes; late resources may remain: " + "; ".join(uncertain))
        if errors:
            raise RuntimeError("Synthetic Docker cleanup failed: " + ", ".join(errors))
    print("Guarded synthetic source checks and swapped-volume rejection passed; cleanup completed."
          if source_only else
          "Guarded Docker synthetic capture, decryption and swapped-volume rejection passed; cleanup completed.")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--docker-child":
        real_docker_synthetic()
    elif len(sys.argv) == 2 and sys.argv[1] == "--source-only-docker-child":
        real_docker_synthetic(source_only=True)
    else:
        unittest.main()
