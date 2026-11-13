import importlib.util
import io
import json
import os
import pathlib
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import types
import unittest
from unittest import mock


SCRIPT = pathlib.Path(__file__).with_name("caddy-synthetic-collection.py")
SPEC = importlib.util.spec_from_file_location("synthetic_collection", SCRIPT)
collection = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collection)


def archive_bytes(entries, roots, altered=False, extra=False, altered_metadata=None):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w") as archive:
        for item in entries:
            directory = tarfile.TarInfo(item["root"])
            directory.type = tarfile.DIRTYPE
            directory.uid, directory.gid, directory.mode = roots[item["root"]]
            if altered_metadata and altered_metadata[0] == item["root"]:
                target = directory if altered_metadata[1] == "directory" else None
                if target is not None:
                    setattr(target, altered_metadata[2], getattr(target, altered_metadata[2]) + 1)
            archive.addfile(directory)
            content = collection.FIXTURES[item["root"]]
            if altered and item["root"] == "data":
                content = b"changed"
            member = tarfile.TarInfo(item["root"] + "/fixture")
            member.uid, member.gid, member.mode = item["uid"], item["gid"], item["mode"]
            if altered_metadata and altered_metadata[:2] == (item["root"], "file"):
                setattr(member, altered_metadata[2], getattr(member, altered_metadata[2]) + 1)
            member.size = len(content)
            archive.addfile(member, io.BytesIO(content))
        payload = json.dumps({"version": 1, "entries": entries}).encode()
        member = tarfile.TarInfo("MANIFEST.json")
        member.size = len(payload)
        archive.addfile(member, io.BytesIO(payload))
        if extra:
            archive.addfile(tarfile.TarInfo("unexpected"))
    return output.getvalue()


class SyntheticCollectionTests(unittest.TestCase):
    def test_configuration_is_bounded_and_no_external_inputs_are_accepted(self):
        self.assertEqual(collection.parse_args([]).max_output_bytes, 1048576)
        for args in (["--max-output-bytes", "16383"], ["--reserve-bytes", "0"],
                     ["--timeout", "121"], ["--data", "/real/volume"],
                     ["--docker-host", "unix:///var/run/docker.sock"]):
            with self.subTest(args=args), mock.patch("sys.stderr", new=io.StringIO()):
                with self.assertRaises(SystemExit):
                    collection.parse_args(args)

    def test_fixture_and_archive_positive_and_negative_controls(self):
        with tempfile.TemporaryDirectory() as directory:
            entries, roots = collection.make_fixture(pathlib.Path(directory))
            collection.verify_archive(archive_bytes(entries, roots), entries, roots)
            for changed in (archive_bytes(entries, roots, altered=True),
                            archive_bytes(entries, roots, extra=True)):
                with self.assertRaises(ValueError):
                    collection.verify_archive(changed, entries, roots)
            for root in collection.FIXTURES:
                for kind in ("directory", "file"):
                    for field in ("uid", "gid", "mode"):
                        with self.subTest(root=root, kind=kind, field=field):
                            changed = archive_bytes(entries, roots, altered_metadata=(root, kind, field))
                            with self.assertRaises(ValueError):
                                collection.verify_archive(changed, entries, roots)

    def test_root_and_non_linux_rejected_before_collection(self):
        for platform, uids in (("win32", (1000, 1000, 1000)), ("linux", (0, 0, 0))):
            with self.subTest(platform=platform), \
                    mock.patch.object(collection.sys, "platform", platform), \
                    mock.patch.object(collection.sys, "flags", types.SimpleNamespace(isolated=1, no_site=1)), \
                    mock.patch.object(collection.platform, "machine", return_value="x86_64"), \
                    mock.patch.object(collection.os, "getresuid", return_value=uids, create=True), \
                    mock.patch.object(collection.os, "getuid", return_value=uids[0], create=True):
                with self.assertRaises(ValueError):
                    collection.check_platform()

    def test_platform_positive_and_saved_uid_negative(self):
        info = types.SimpleNamespace(st_mode=0o100755)
        with mock.patch.object(collection.sys, "platform", "linux"), \
                mock.patch.object(collection.sys, "flags", types.SimpleNamespace(isolated=1, no_site=1)), \
                mock.patch.object(collection.platform, "machine", return_value="x86_64"), \
                mock.patch.object(collection.os, "getresuid", return_value=(1000, 1000, 1000), create=True) as uids, \
                mock.patch.object(collection.os, "getuid", return_value=1000, create=True), \
                mock.patch.object(collection.os, "stat", return_value=info):
            collection.check_platform()
            uids.return_value = (1000, 1000, 0)
            with self.assertRaises(ValueError):
                collection.check_platform()

    def test_cli_is_blocked_before_collection(self):
        with mock.patch.object(collection, "collect") as collect, \
                mock.patch.object(collection, "check_platform") as platform_check, \
                mock.patch("sys.stderr", new=io.StringIO()) as stderr:
            self.assertEqual(collection.main([]), 1)
        collect.assert_not_called()
        platform_check.assert_not_called()
        self.assertIn("blocked", stderr.getvalue())

    @unittest.skipUnless(sys.platform == "linux", "requires Linux process groups and waitid")
    def test_sigterm_kills_actual_worker_and_grandchild(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = pathlib.Path(directory) / "pids"
            worker = (
                "import os,subprocess,sys,time\n"
                "child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(120)'],"
                "start_new_session=True)\n"
                "open(sys.argv[1],'w').write(str(os.getpid())+' '+str(child.pid))\n"
                "time.sleep(120)\n"
            )
            worker_path = pathlib.Path(directory) / "worker.py"
            worker_path.write_text(worker, encoding="utf-8")
            controller = (
                "import importlib.util,sys\n"
                "spec=importlib.util.spec_from_file_location('candidate',sys.argv[1])\n"
                "module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)\n"
                "try: module.run_capture([sys.executable,'-I','-S','-c',module.CAPTURE_BOOTSTRAP,"
                "sys.argv[2],sys.argv[3]],[],60)\n"
                "except InterruptedError: sys.exit(7)\n"
                "sys.exit(8)\n"
            )
            process = subprocess.Popen([sys.executable, "-I", "-S", "-c", controller,
                                        str(SCRIPT), str(worker_path), str(marker)],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            pids = []
            try:
                deadline = time.monotonic() + 10
                while (time.monotonic() < deadline and
                       (not marker.exists() or len(marker.read_text().split()) != 2) and process.poll() is None):
                    time.sleep(0.02)
                self.assertTrue(marker.exists(), process.stderr.read() if process.poll() is not None else b"")
                pids = [int(value) for value in marker.read_text().split()]
                self.assertEqual(len(pids), 2)
                self.assertEqual(os.getpgid(pids[0]), pids[0])
                self.assertEqual(os.getpgid(pids[1]), pids[0])
                process.send_signal(signal.SIGTERM)
                self.assertEqual(process.wait(timeout=10), 7)
                deadline = time.monotonic() + 5
                for pid in pids:
                    while time.monotonic() < deadline:
                        try:
                            state = pathlib.Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[0]
                        except FileNotFoundError:
                            break
                        if state == "Z":
                            break
                        time.sleep(0.02)
                    else:
                        self.fail(f"process {pid} remains running")
                pids = []
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)
                for pid in pids:
                    try:
                        os.kill(pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                if process.stderr is not None:
                    process.stderr.close()


if __name__ == "__main__":
    unittest.main()
