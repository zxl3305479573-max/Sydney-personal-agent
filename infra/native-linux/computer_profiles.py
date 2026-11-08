"""Manage local SSH connection profiles without storing private keys."""

import argparse
import fcntl
import json
import os
import re
import stat
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

from inspect_remote import InspectionError, USER, inspect_remote, validate_host

PROFILE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
MAX_FILE = 256 * 1024
MAX_PROFILES = 100


def validate_profile(profile):
    if not isinstance(profile, dict) or set(profile) != {
        "id", "name", "host", "user", "port", "identity", "known_hosts"
    }:
        raise InspectionError("invalid_profile")
    if not isinstance(profile["id"], str) or not PROFILE_ID.fullmatch(profile["id"]):
        raise InspectionError("invalid_profile")
    if not isinstance(profile["name"], str) or not 1 <= len(profile["name"]) <= 100:
        raise InspectionError("invalid_profile")
    if any(ord(character) < 32 for character in profile["name"]):
        raise InspectionError("invalid_profile")
    if not isinstance(profile["host"], str):
        raise InspectionError("invalid_profile")
    validate_host(profile["host"])
    if not isinstance(profile["user"], str) or not USER.fullmatch(profile["user"]):
        raise InspectionError("invalid_profile")
    if isinstance(profile["port"], bool) or not isinstance(profile["port"], int) or not 1 <= profile["port"] <= 65535:
        raise InspectionError("invalid_profile")
    for key in ("identity", "known_hosts"):
        value = profile[key]
        if not isinstance(value, str) or not os.path.isabs(value) or "\0" in value or len(value) > 4096:
            raise InspectionError("invalid_profile")
    if any(character.isspace() or ord(character) < 32 for character in profile["known_hosts"]):
        raise InspectionError("invalid_profile")
    return profile


def require_private_file(descriptor):
    metadata = os.fstat(descriptor)
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.geteuid() or metadata.st_mode & 0o077:
        raise InspectionError("profile_file_permissions")


@contextmanager
def locked_profiles(path):
    path = Path(path)
    parent = path.parent
    try:
        parent_stat = parent.stat()
        if not stat.S_ISDIR(parent_stat.st_mode) or parent_stat.st_uid != os.geteuid() or parent_stat.st_mode & 0o022:
            raise InspectionError("profile_directory_permissions")
        flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(str(path) + ".lock", flags, 0o600)
        with os.fdopen(descriptor, "r+b") as lock:
            require_private_file(lock.fileno())
            fcntl.flock(lock, fcntl.LOCK_EX)
            yield path
    except OSError as exc:
        raise InspectionError("profile_storage_unavailable") from exc


def read_profiles(path):
    try:
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    except FileNotFoundError:
        return {}
    except OSError as exc:
        raise InspectionError("profile_storage_unavailable") from exc
    with os.fdopen(descriptor, "rb") as file:
        require_private_file(file.fileno())
        raw = file.read(MAX_FILE + 1)
    if len(raw) > MAX_FILE:
        raise InspectionError("invalid_profile_store")
    try:
        document = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InspectionError("invalid_profile_store") from exc
    if not isinstance(document, dict) or document.get("version") != 1 or not isinstance(document.get("profiles"), list):
        raise InspectionError("invalid_profile_store")
    profiles = document["profiles"]
    if len(profiles) > MAX_PROFILES:
        raise InspectionError("invalid_profile_store")
    result = {}
    for profile in profiles:
        validate_profile(profile)
        if profile["id"] in result:
            raise InspectionError("invalid_profile_store")
        result[profile["id"]] = profile
    return result


def write_profiles(path, profiles):
    data = json.dumps(
        {"version": 1, "profiles": list(profiles.values())},
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    if len(data) > MAX_FILE or len(profiles) > MAX_PROFILES:
        raise InspectionError("profile_limit")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".sydney-profiles-", delete=False) as file:
            temporary = file.name
            os.fchmod(file.fileno(), 0o600)
            file.write(data)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
        temporary = None
    except OSError as exc:
        raise InspectionError("profile_storage_unavailable") from exc
    finally:
        if temporary is not None:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass


def add_profile(path, profile):
    validate_profile(profile)
    for key in ("identity", "known_hosts"):
        if not Path(profile[key]).is_file():
            raise InspectionError("credential_file_unavailable")
    with locked_profiles(path) as store:
        profiles = read_profiles(store)
        if profile["id"] in profiles:
            raise InspectionError("profile_already_exists")
        profiles[profile["id"]] = profile
        write_profiles(store, profiles)


def get_profiles(path):
    with locked_profiles(path) as store:
        return read_profiles(store)


def remove_profile(path, profile_id):
    with locked_profiles(path) as store:
        profiles = read_profiles(store)
        if profile_id not in profiles:
            raise InspectionError("profile_not_found")
        del profiles[profile_id]
        write_profiles(store, profiles)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, required=True)
    commands = parser.add_subparsers(dest="command", required=True)
    add = commands.add_parser("add")
    for argument in ("id", "name", "host", "user", "identity", "known-hosts"):
        add.add_argument("--" + argument, required=True)
    add.add_argument("--port", type=int, default=22)
    commands.add_parser("list")
    for name in ("inspect", "remove"):
        command = commands.add_parser(name)
        command.add_argument("--id", required=True)
    args = parser.parse_args()
    try:
        if args.command == "add":
            add_profile(args.file, {
                "id": args.id, "name": args.name, "host": args.host, "user": args.user,
                "port": args.port, "identity": args.identity, "known_hosts": args.known_hosts,
            })
            result = {"ok": True}
        elif args.command == "list":
            result = {"ok": True, "profiles": [
                {"id": profile["id"], "name": profile["name"]}
                for profile in get_profiles(args.file).values()
            ]}
        elif args.command == "remove":
            remove_profile(args.file, args.id)
            result = {"ok": True}
        else:
            profile = get_profiles(args.file).get(args.id)
            if profile is None:
                raise InspectionError("profile_not_found")
            result = {"ok": True, "environment": inspect_remote(
                profile["host"], profile["user"], profile["port"],
                profile["identity"], profile["known_hosts"],
            )}
    except InspectionError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
