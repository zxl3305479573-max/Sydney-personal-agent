#!/usr/bin/env python3
import importlib.util
import json
import os
from pathlib import Path
import stat
import unittest
from unittest import mock


spec = importlib.util.spec_from_file_location(
    "globals_source_identity", Path(__file__).with_name("globals-source-identity.py"))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

IDENTIFIER = "a" * 64
IMAGE = "sha256:" + "b" * 64
PROJECT = "synthetic-project"
SERVICE = "postgres"
VOLUME = "synthetic-volume"
USER = "synthetic_admin"


class SourceIdentityTest(unittest.TestCase):
    def setUp(self):
        self.container = {
            "Id": IDENTIFIER,
            "Image": IMAGE,
            "Config": {"Labels": {"com.docker.compose.project": PROJECT,
                                  "com.docker.compose.service": SERVICE}},
            "State": {"Running": True, "StartedAt": "synthetic-start", "Pid": os.getpid()},
            "Mounts": [{"Destination": "/var/lib/postgresql", "Type": "volume",
                        "Name": VOLUME, "RW": True, "Source": "/synthetic-volume"}],
        }
        self.volume = {"Name": VOLUME, "Driver": "local", "Options": None,
                       "Mountpoint": "/synthetic-volume"}
        self.database = "180006|f|123456789|t"
        self.daemon = "synthetic-daemon"

    def docker(self, *args):
        if args[:2] == ("info", "--format"):
            return self.daemon
        if args[0] == "ps":
            return IDENTIFIER
        if args[0] == "inspect":
            return json.dumps([self.container])
        if args[:2] == ("volume", "inspect"):
            return json.dumps([self.volume])
        if args[0] == "exec":
            self.assertIn("PGOPTIONS=-c default_transaction_read_only=on", args)
            self.assertIn("/var/run/postgresql", args)
            return self.database
        raise AssertionError("unexpected command")

    def snapshot(self):
        root = mock.Mock(st_mode=stat.S_IFDIR | 0o700, st_dev=17, st_ino=23)
        with mock.patch.object(guard, "socket_identity", return_value=(1, 2, 0, 0, 0o660)), \
             mock.patch.object(guard, "process_identity", return_value=(123, "synthetic", ("a", "b", "c"))), \
             mock.patch.object(guard, "docker", side_effect=self.docker), \
             mock.patch.object(guard.os, "stat", return_value=root):
            return guard.snapshot(PROJECT, SERVICE, IMAGE, VOLUME, USER)

    def test_valid_source_and_changed_identity(self):
        initial = self.snapshot()
        self.container["State"]["StartedAt"] = "new-start"
        self.assertNotEqual(initial, self.snapshot())
        self.container["State"]["StartedAt"] = "synthetic-start"
        self.database = "180006|f|987654321|t"
        self.assertNotEqual(initial, self.snapshot())
        self.database = "180006|f|123456789|t"
        self.daemon = "different-daemon"
        self.assertNotEqual(initial, self.snapshot())

    def test_wrong_volume_image_and_replica_rejected(self):
        self.container["Mounts"][0]["Name"] = "other"
        with self.assertRaises(ValueError):
            self.snapshot()
        self.container["Mounts"][0]["Name"] = VOLUME
        self.container["Image"] = "sha256:" + "c" * 64
        with self.assertRaises(ValueError):
            self.snapshot()
        self.container["Image"] = IMAGE
        self.database = "180006|t|123456789|t"
        with self.assertRaises(ValueError):
            self.snapshot()
        self.database = "180006|f|123456789|f"
        with self.assertRaises(ValueError):
            self.snapshot()

    def test_volume_mountpoint_and_writable_requirement(self):
        self.volume["Mountpoint"] = "/different"
        with self.assertRaises(ValueError):
            self.snapshot()
        self.volume["Mountpoint"] = "/synthetic-volume"
        self.container["Mounts"][0]["RW"] = False
        with self.assertRaises(ValueError):
            self.snapshot()

    def test_source_change_during_query_is_rejected(self):
        original = self.docker
        for change in ("container", "volume", "selection"):
            with self.subTest(change=change):
                self.setUp()
                def changing_docker(*args):
                    if args[0] == "exec":
                        result = original(*args)
                        if change == "container":
                            self.container["State"]["StartedAt"] = "restarted"
                        elif change == "volume":
                            self.volume["Mountpoint"] = "/different"
                        else:
                            self.daemon = "selection-changed"
                        return result
                    if args[0] == "ps" and self.daemon == "selection-changed":
                        return IDENTIFIER + "\n" + "c" * 64
                    return original(*args)
                with mock.patch.object(self, "docker", side_effect=changing_docker):
                    with self.assertRaises(ValueError):
                        self.snapshot()

    def test_pidfd_guard_rechecks_and_closes(self):
        identity = (1, 2, 3, 4, os.getpid())
        with mock.patch.object(guard, "snapshot", return_value=identity) as snapshot:
            source = guard.PinnedSource(PROJECT, SERVICE, IMAGE, VOLUME, USER)
            try:
                source.verify()
                snapshot.return_value = (1, 2, 3, 4, os.getpid(), "changed")
                with self.assertRaises(ValueError):
                    source.verify()
            finally:
                source.close()
            with self.assertRaises(ValueError):
                source.verify()

    def test_invalid_expected_source_rejected_before_docker(self):
        with mock.patch.object(guard, "docker") as docker:
            with self.assertRaises(ValueError):
                guard.snapshot("bad/project", SERVICE, IMAGE, VOLUME, USER)
            docker.assert_not_called()


if __name__ == "__main__":
    unittest.main()
