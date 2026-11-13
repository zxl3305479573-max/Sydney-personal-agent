"""Compare renewal source and device version metadata without printing identities."""

import asyncio
import json
import logging
import os
from pathlib import Path
import plistlib
import re
import zipfile


MAX_RECORD_BYTES = 4 * 1024 * 1024
MAX_PLIST_BYTES = 1024 * 1024
MAX_IPA_BYTES = 512 * 1024 * 1024
MAX_ENTRIES = 100_000
VERSION_KEYS = ("CFBundleVersion", "CFBundleShortVersionString")


def matching_app(identifier, metadata):
    labels = (identifier, metadata.get("CFBundleDisplayName"), metadata.get("CFBundleName"))
    return any(
        isinstance(label, str)
        and any(name in label.casefold() for name in ("sydney", "rakazo"))
        for label in labels
    )


def compare_versions(installed, source):
    result = {}
    for key in VERSION_KEYS:
        current, candidate = installed.get(key), source.get(key)
        if not isinstance(current, str) or not current or not isinstance(candidate, str) or not candidate:
            result[key] = "unavailable"
        else:
            result[key] = "match" if current == candidate else "different"
    return result


def read_source_metadata(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_IPA_BYTES:
        raise ValueError("invalid IPA")
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > MAX_ENTRIES:
            raise ValueError("too many archive entries")
        manifests = [
            entry
            for entry in entries
            if re.fullmatch(r"Payload/[^/]+\.app/Info\.plist", entry.filename)
        ]
        if len(manifests) != 1 or manifests[0].file_size > MAX_PLIST_BYTES:
            raise ValueError("invalid application manifest")
        with archive.open(manifests[0]) as source:
            data = source.read(MAX_PLIST_BYTES + 1)
        if len(data) > MAX_PLIST_BYTES:
            raise ValueError("manifest too large")
    result = plistlib.loads(data)
    if not isinstance(result, dict):
        raise ValueError("invalid manifest")
    return result


def read_records(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        raise ValueError("invalid record file")
    with path.open("rb") as source:
        data = source.read(MAX_RECORD_BYTES + 1)
    if len(data) > MAX_RECORD_BYTES:
        raise ValueError("record file too large")
    result = json.loads(data)
    if not isinstance(result, dict):
        raise ValueError("invalid records")
    return [record for record in result.values() if isinstance(record, dict)]


def summarize(apps, records, matches_device):
    matched = [(identifier, metadata) for identifier, metadata in apps.items() if matching_app(identifier, metadata)]
    if len(matched) != 1:
        return {"status": "unexpected_app_count", "matching_apps": len(matched)}
    identifier, installed = matched[0]
    entries = [
        record for record in records
        if record.get("bundle_id") == identifier
        and isinstance(record.get("udid"), str)
        and matches_device(record["udid"])
    ]
    if len(entries) != 1:
        return {"status": "unexpected_record_count", "matching_records": len(entries)}
    path = entries[0].get("source_ipa")
    if not isinstance(path, str) or not path:
        return {"status": "source_unavailable"}
    try:
        source = read_source_metadata(path)
    except (OSError, ValueError, zipfile.BadZipFile, plistlib.InvalidFileException):
        return {"status": "source_unavailable"}
    return {"status": "ok", "versions": compare_versions(installed, source)}


async def inspect():
    from pymobiledevice3.lockdown import create_using_usbmux
    from pymobiledevice3.services.installation_proxy import InstallationProxyService
    from pymobiledevice3.usbmux import list_devices

    devices = await list_devices()
    if len(devices) != 1 or devices[0].connection_type != "USB":
        return {"status": "unexpected_device_count", "device_count": len(devices)}
    client = await create_using_usbmux(autopair=False, connection_type="USB")
    try:
        async with InstallationProxyService(lockdown=client) as proxy:
            apps = await proxy.get_apps(application_type="User")
        records = read_records(Path(os.environ["LOCALAPPDATA"]) / "iPASide" / "sideloads.json")
        return summarize(apps, records, devices[0].matches_udid)
    finally:
        await client.close()


def main():
    logging.disable(logging.CRITICAL)
    try:
        result = asyncio.run(asyncio.wait_for(inspect(), timeout=25))
    except Exception as error:
        result = {"status": "failed", "error_type": type(error).__name__}
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
