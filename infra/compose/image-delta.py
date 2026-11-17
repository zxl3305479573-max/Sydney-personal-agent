#!/usr/bin/env python3
import hashlib
import io
import json
import re
import tarfile


BLOB = re.compile(r"blobs/sha256/([0-9a-f]{64})\Z")
METADATA = {"index.json", "manifest.json", "oci-layout"}
INDEX = "sydney-delta-index.json"
MAX_ENTRIES = 256
MAX_BLOB = 4 * 1024 * 1024 * 1024
MAX_METADATA = 1024 * 1024


def entries(archive):
    seen = set()
    for member in archive:
        if member.isdir() and member.name.rstrip("/") in {"blobs", "blobs/sha256"}:
            continue
        if (not member.isfile() or member.name in seen or len(seen) >= MAX_ENTRIES
                or member.size < 0 or member.size > MAX_BLOB):
            raise ValueError("invalid archive member")
        if not BLOB.fullmatch(member.name) and member.name not in METADATA | {INDEX}:
            raise ValueError("unexpected archive member")
        if member.name in METADATA | {INDEX} and member.size > MAX_METADATA:
            raise ValueError("metadata too large")
        seen.add(member.name)
        yield member


def index(source):
    result = {}
    with tarfile.open(fileobj=source, mode="r|") as archive:
        for member in entries(archive):
            if BLOB.fullmatch(member.name):
                result[member.name] = member.size
            elif member.name == INDEX:
                raise ValueError("unexpected delta index")
    return result


def copy_member(source, output, member):
    content = source.extractfile(member)
    if content is None:
        raise ValueError("missing member content")

    class DigestReader:
        def __init__(self):
            self.digest = hashlib.sha256()
            self.size = 0

        def read(self, size):
            chunk = content.read(size)
            self.digest.update(chunk)
            self.size += len(chunk)
            return chunk

    reader = DigestReader()
    output.addfile(member, reader)
    match = BLOB.fullmatch(member.name)
    if reader.size != member.size or (match and reader.digest.hexdigest() != match.group(1)):
        raise ValueError("member digest mismatch")


def pack(source, output, known):
    if (not isinstance(known, dict) or len(known) > MAX_ENTRIES
            or any(not BLOB.fullmatch(name) or type(size) is not int
                   or size < 0 or size > MAX_BLOB for name, size in known.items())):
        raise ValueError("invalid base index")
    blobs = {}
    metadata = set()
    with tarfile.open(fileobj=source, mode="r|") as archive, \
            tarfile.open(fileobj=output, mode="w|") as result:
        for member in entries(archive):
            if member.name == INDEX:
                raise ValueError("unexpected delta index")
            if BLOB.fullmatch(member.name):
                blobs[member.name] = member.size
                if known.get(member.name) == member.size:
                    continue
            else:
                metadata.add(member.name)
            copy_member(archive, result, member)
        if metadata != METADATA or not blobs:
            raise ValueError("incomplete image archive")
        content = json.dumps(blobs, sort_keys=True, separators=(",", ":")).encode()
        member = tarfile.TarInfo(INDEX)
        member.size = len(content)
        result.addfile(member, io.BytesIO(content))


def merge(delta, base, output):
    with tarfile.open(fileobj=delta, mode="r:") as archive:
        members = list(entries(archive))
        indexes = [member for member in members if member.name == INDEX]
        if len(indexes) != 1:
            raise ValueError("missing delta index")
        index_file = archive.extractfile(indexes[0])
        if index_file is None:
            raise ValueError("missing delta index")

        def unique(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError("duplicate index entry")
                result[key] = value
            return result

        expected = json.load(index_file, object_pairs_hook=unique)
        if (not isinstance(expected, dict) or not expected or len(expected) > MAX_ENTRIES
                or any(not BLOB.fullmatch(name) or type(size) is not int
                       or size < 0 or size > MAX_BLOB for name, size in expected.items())):
            raise ValueError("invalid delta index")
        if {member.name for member in members if member.name in METADATA} != METADATA:
            raise ValueError("missing image metadata")
        manifest = archive.extractfile(next(member for member in members
                                            if member.name == "manifest.json"))
        if manifest is None:
            raise ValueError("missing image manifest")
        manifest_data = json.load(manifest, object_pairs_hook=unique)
        if (not isinstance(manifest_data, list) or len(manifest_data) != 1
                or not isinstance(manifest_data[0], dict)):
            raise ValueError("invalid image manifest")
        configuration = manifest_data[0].get("Config")
        layers = manifest_data[0].get("Layers")
        if (not isinstance(configuration, str) or configuration not in expected
                or not isinstance(layers, list) or not layers
                or any(not isinstance(layer, str) or layer not in expected for layer in layers)):
            raise ValueError("manifest blob missing from index")
        present = set()
        with tarfile.open(fileobj=output, mode="w|") as result:
            for member in members:
                if member.name == INDEX:
                    continue
                if BLOB.fullmatch(member.name):
                    if expected.get(member.name) != member.size:
                        raise ValueError("unexpected delta blob")
                    present.add(member.name)
                copy_member(archive, result, member)
            with tarfile.open(fileobj=base, mode="r|") as source:
                for member in entries(source):
                    if member.name == INDEX:
                        raise ValueError("unexpected base index")
                    if member.name not in expected:
                        continue
                    if member.name in present:
                        continue
                    if expected[member.name] != member.size:
                        raise ValueError("base blob size mismatch")
                    copy_member(source, result, member)
                    present.add(member.name)
            if present != set(expected):
                raise ValueError("missing base blobs")


if __name__ == "__main__":
    raise SystemExit("Synthetic archive component only; direct execution is disabled.")
