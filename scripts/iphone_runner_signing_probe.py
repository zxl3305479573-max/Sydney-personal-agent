import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import struct
import subprocess
import tempfile
import zipfile


RUNNER_SHA256 = "67450de1524837b137b1ba0175ed16c8850b951ef0127c7c765aa8f3c4702652"
APP_ROOT = "Payload/iCTRLUITests-Runner.app/"
TEST_ROOT = APP_ROOT + "PlugIns/iCTRLUITests.xctest/"
SYNTHETIC_BUNDLE_ID = "org.sydney.synthetic.iphone.runner"
MAX_IPA_BYTES = 32 * 1024 * 1024
MAX_MEMBER_BYTES = 32 * 1024 * 1024


def code_directories(binary, signature_offset, blob, info_bytes, bundle_identifier, resources):
    if len(blob) < 12:
        return {"status": "unsupported"}
    magic, size, count = struct.unpack_from(">III", blob)
    if magic != 0xFADE0CC0:
        return {"status": "unsupported"}
    if size > len(blob) or size < 12 or count > (size - 12) // 8:
        raise ValueError("invalid signature superblob")
    directories = []
    for index in range(count):
        slot, offset = struct.unpack_from(">II", blob, 12 + index * 8)
        if slot != 0 and not 0x1000 <= slot <= 0x1005:
            continue
        if offset < 12 + count * 8 or offset + 44 > size:
            raise ValueError("invalid code directory offset")
        values = struct.unpack_from(">9I4BI", blob, offset)
        cd_magic, cd_size, version, flags, hash_offset, ident_offset, special, code_slots, limit = values[:9]
        hash_size, hash_type, _platform, page_exponent = values[9:13]
        if cd_magic != 0xFADE0C02 or cd_size < 44 or offset + cd_size > size:
            raise ValueError("invalid code directory")
        directory = blob[offset : offset + cd_size]
        if not 44 <= ident_offset < cd_size:
            raise ValueError("invalid code directory identifier")
        terminator = directory.find(b"\0", ident_offset)
        if terminator < 0:
            raise ValueError("unterminated code directory identifier")
        identifier = directory[ident_offset:terminator].decode("utf-8")
        result = {
            "slot": slot,
            "ad_hoc": bool(flags & 2),
            "identifier_matches_plist": (
                identifier == bundle_identifier if bundle_identifier is not None else None
            ),
            "code_slots_match": None,
            "info_plist_matches": None,
            "resource_directory_matches": None,
        }
        algorithms = {1: "sha1", 2: "sha256", 3: "sha256", 4: "sha384"}
        algorithm = algorithms.get(hash_type)
        if version >= 0x20100 and cd_size < 48:
            raise ValueError("truncated code directory version fields")
        scatter = struct.unpack_from(">I", directory, 44)[0] if version >= 0x20100 else 0
        if (
            algorithm is None
            or hash_size == 0
            or hash_size > hashlib.new(algorithm).digest_size
            or scatter != 0
            or page_exponent > 30
            or limit == 0
            or limit > signature_offset
        ):
            result["hash_status"] = "unsupported"
            directories.append(result)
            continue
        if (
            hash_offset < 44 + special * hash_size
            or hash_offset + code_slots * hash_size > cd_size
        ):
            raise ValueError("invalid code directory hash range")
        page_size = 1 << page_exponent if page_exponent else limit
        if code_slots != (limit + page_size - 1) // page_size:
            raise ValueError("invalid code slot count")

        def digest(data):
            return hashlib.new(algorithm, data).digest()[:hash_size]

        result["code_slots_match"] = all(
            digest(binary[position : min(position + page_size, limit)])
            == directory[hash_offset + index * hash_size : hash_offset + (index + 1) * hash_size]
            for index, position in enumerate(range(0, limit, page_size))
        )
        if info_bytes is not None and special >= 1:
            recorded = directory[hash_offset - hash_size : hash_offset]
            if any(recorded):
                result["info_plist_matches"] = digest(info_bytes) == recorded
        if resources is not None and special >= 3:
            recorded = directory[hash_offset - 3 * hash_size : hash_offset - 2 * hash_size]
            if any(recorded):
                result["resource_directory_matches"] = digest(resources) == recorded
        result["hash_status"] = "checked"
        directories.append(result)
    return {"status": "inspected" if directories else "unsupported", "directories": directories}


def signature_blob(binary, info_bytes=None, bundle_identifier=None, resources=None):
    if binary[:4] != b"\xcf\xfa\xed\xfe" or len(binary) < 32:
        return {"format": "unsupported", "present": None}
    command_count, command_bytes = struct.unpack_from("<II", binary, 16)
    command_end = 32 + command_bytes
    if command_end > len(binary) or command_count > command_bytes // 8:
        raise ValueError("invalid Mach-O load commands")
    position = 32
    for _ in range(command_count):
        if position + 8 > command_end:
            raise ValueError("truncated Mach-O load command")
        command, size = struct.unpack_from("<II", binary, position)
        if size < 8 or position + size > command_end:
            raise ValueError("invalid Mach-O load command")
        if command == 0x1D:
            if size < 16:
                raise ValueError("invalid Mach-O signature command")
            offset, length = struct.unpack_from("<II", binary, position + 8)
            if length == 0 or offset + length > len(binary):
                raise ValueError("invalid Mach-O signature range")
            blob = binary[offset : offset + length]
            return {
                "format": "thin-macho64-le",
                "present": True,
                "blob_sha256": hashlib.sha256(blob).hexdigest(),
                "code_directories": code_directories(
                    binary, offset, blob, info_bytes, bundle_identifier, resources
                ),
            }
        position += size
    return {"format": "thin-macho64-le", "present": False}


def archive_member(archive, name):
    info = archive.getinfo(name)
    if info.file_size > MAX_MEMBER_BYTES:
        raise ValueError("archive member exceeds size limit")
    return archive.read(info)


def inspect_resource_manifest(archive, root, resources):
    if resources is None:
        return {"status": "unavailable"}
    manifest = plistlib.loads(resources)
    if not isinstance(manifest, dict):
        return {"status": "unsupported"}
    files = manifest.get("files2")
    if not isinstance(files, dict):
        return {"status": "unsupported"}
    if len(files) > 10000:
        raise ValueError("resource manifest has too many entries")
    result = {
        "status": "inspected",
        "matched": 0,
        "mismatched": 0,
        "missing": 0,
        "optional_missing": 0,
        "unsupported": 0,
    }
    for name, details in files.items():
        if not isinstance(name, str) or not name or "\\" in name:
            raise ValueError("invalid resource path")
        path = PurePosixPath(name)
        if path.is_absolute() or ".." in path.parts or str(path) != name:
            raise ValueError("invalid resource path")
        if not isinstance(details, dict) or "cdhash" in details or "symlink" in details:
            result["unsupported"] += 1
            continue
        if isinstance(details.get("hash2"), bytes) and len(details["hash2"]) == 32:
            algorithm, expected = "sha256", details["hash2"]
        elif isinstance(details.get("hash"), bytes) and len(details["hash"]) == 20:
            algorithm, expected = "sha1", details["hash"]
        else:
            result["unsupported"] += 1
            continue
        try:
            contents = archive_member(archive, root + name)
        except KeyError:
            result["optional_missing" if details.get("optional") is True else "missing"] += 1
            continue
        outcome = "matched" if hashlib.new(algorithm, contents).digest() == expected else "mismatched"
        result[outcome] += 1
    return result


def bundle_info(archive, root):
    try:
        info_bytes = archive_member(archive, root + "Info.plist")
        info = plistlib.loads(info_bytes)
    except KeyError:
        return None
    identifier = info.get("CFBundleIdentifier")
    executable = info.get("CFBundleExecutable")
    if not isinstance(identifier, str) or not isinstance(executable, str):
        raise ValueError("bundle metadata is incomplete")
    if not executable or "/" in executable or "\\" in executable or executable in {".", ".."}:
        raise ValueError("invalid executable name")
    try:
        resources = archive_member(archive, root + "_CodeSignature/CodeResources")
    except KeyError:
        resources = None
    return {
        "identifier": identifier,
        "resource_manifest": inspect_resource_manifest(archive, root, resources),
        "signature": signature_blob(
            archive_member(archive, root + executable), info_bytes, identifier, resources
        ),
    }


def inspect_archive(path):
    with zipfile.ZipFile(path) as archive:
        return {"app": bundle_info(archive, APP_ROOT), "test": bundle_info(archive, TEST_ROOT)}


def prepare_synthetic_identifier(source, destination):
    info_path = TEST_ROOT + "Info.plist"
    replacements = 0
    with zipfile.ZipFile(source) as source_archive:
        with zipfile.ZipFile(destination, "w") as destination_archive:
            for member in source_archive.infolist():
                contents = archive_member(source_archive, member.filename)
                if member.filename == info_path:
                    info = plistlib.loads(contents)
                    info["CFBundleIdentifier"] = SYNTHETIC_BUNDLE_ID
                    contents = plistlib.dumps(info, fmt=plistlib.FMT_BINARY)
                    replacements += 1
                destination_archive.writestr(member, contents)
    if replacements != 1:
        raise ValueError("expected exactly one test bundle metadata file")


def run_case(signer, source, root, name, remove_extensions):
    output = root / (name + ".ipa")
    scratch = root / (name + "-scratch")
    scratch.mkdir()
    arguments = [
        str(signer),
        "-a",
        "-b",
        SYNTHETIC_BUNDLE_ID,
        "-t",
        str(scratch),
        "-o",
        str(output),
    ]
    if remove_extensions:
        arguments.append("-E")
    arguments.append(str(source))
    environment = {
        key: os.environ[key]
        for key in ("SystemRoot", "WINDIR", "PATH")
        if key in os.environ
    }
    environment.update({"TEMP": str(scratch), "TMP": str(scratch), "TMPDIR": str(scratch)})
    completed = subprocess.run(
        arguments,
        cwd=root,
        env=environment,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=60,
        check=False,
    )
    if completed.returncode != 0:
        return {"exit_code": completed.returncode, "archive": None}
    if not output.is_file() or output.stat().st_size > MAX_IPA_BYTES:
        raise ValueError("signer produced an invalid output archive")
    return {"exit_code": 0, "archive": inspect_archive(output)}


def summarize(original, outcome):
    result = {"exit_code": outcome["exit_code"]}
    archive = outcome["archive"]
    if archive is None:
        return result
    app, test = archive["app"], archive["test"]
    result["app_present"] = app is not None
    result["test_present"] = test is not None
    if app is not None:
        result["app_identifier_changed"] = app["identifier"] != original["app"]["identifier"]
        result["app_signature"] = app["signature"]
        result["app_resource_manifest"] = app["resource_manifest"]
    if test is not None:
        result["test_identifier_changed"] = test["identifier"] != original["test"]["identifier"]
        result["identifiers_match"] = app is not None and app["identifier"] == test["identifier"]
        result["test_signature"] = test["signature"]
        result["test_resource_manifest"] = test["resource_manifest"]
        before = original["test"]["signature"]
        after = test["signature"]
        result["test_signature_changed"] = None
        if before.get("present") is not None and after.get("present") is not None:
            result["test_signature_changed"] = (
                before.get("blob_sha256") != after.get("blob_sha256")
                or before["present"] != after["present"]
            )
    return result


def probe(ipa, signer):
    ipa = ipa.resolve(strict=True)
    signer = signer.resolve(strict=True)
    if not ipa.is_file() or ipa.stat().st_size > MAX_IPA_BYTES:
        raise ValueError("runner IPA is missing or too large")
    if not signer.is_file():
        raise ValueError("signer is missing")
    if hashlib.sha256(ipa.read_bytes()).hexdigest() != RUNNER_SHA256:
        raise ValueError("runner IPA does not match the pinned public release")
    original = inspect_archive(ipa)
    if original["app"] is None or original["test"] is None:
        raise ValueError("runner IPA does not contain expected bundles")
    with tempfile.TemporaryDirectory(prefix="sydney-iphone-probe-") as directory:
        root = Path(directory)
        source = root / "runner.ipa"
        source.write_bytes(ipa.read_bytes())
        if hashlib.sha256(source.read_bytes()).hexdigest() != RUNNER_SHA256:
            raise ValueError("runner IPA changed during verification")
        prealigned = root / "prealigned.ipa"
        prepare_synthetic_identifier(source, prealigned)
        cases = {
            "preserve_extensions": run_case(signer, source, root, "preserve", False),
            "remove_extensions": run_case(signer, source, root, "remove", True),
            "prealign_test_identifier": run_case(signer, prealigned, root, "prealigned", False),
        }
        return {
            "runner_sha256": RUNNER_SHA256,
            "signer_sha256": hashlib.sha256(signer.read_bytes()).hexdigest(),
            "signing_kind": "ad-hoc; no Apple identity or provisioning profile",
            "original_identifiers_match": (
                original["app"]["identifier"] == original["test"]["identifier"]
            ),
            "cases": {name: summarize(original, value) for name, value in cases.items()},
            "limitations": [
                "CodeDirectory hash checks do not establish CMS trust or resource integrity",
                "Does not establish Apple signing, installation, execution, or renewal",
            ],
        }


def main():
    parser = argparse.ArgumentParser(
        description="Compare ad-hoc signing of the pinned public iCTRL runner."
    )
    parser.add_argument("--ipa", required=True, type=Path)
    parser.add_argument("--signer", required=True, type=Path)
    options = parser.parse_args()
    try:
        result = probe(options.ipa, options.signer)
    except (OSError, ValueError, zipfile.BadZipFile, subprocess.TimeoutExpired) as error:
        print(json.dumps({"probe_completed": False, "error_type": type(error).__name__}))
        return 1
    print(json.dumps({"probe_completed": True, **result}, ensure_ascii=False, indent=2))
    return 0 if all(case["exit_code"] == 0 for case in result["cases"].values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
