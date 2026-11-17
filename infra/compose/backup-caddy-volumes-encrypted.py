#!/usr/bin/env python3
"""Synthetic-only Linux archive experiment; not a production backup tool.

Pass already-open directory descriptors for data, config, and output, plus an
already-open manifest descriptor. The caller must preserve them across exec.
The UTF-8 JSON manifest is {"version":1,"entries":[...]}; each entry contains
root (data or config), relative path, type (directory or file), numeric uid,
gid and mode; file entries additionally require lowercase hexadecimal sha256.
Every child, including empty directories, must be listed. Roots are implicit.
Only caller-owned synthetic inputs with no group/other write or xattrs are
accepted. The private output directory must be outside both inputs.
The caller must supply a trusted absolute age path and public recipient.
Free-space checks do not enforce dedicated capacity or prevent other writers.
The output is not an atomic snapshot; decryption and recovery are not tested.
The encryptor defaults to a 4 GiB virtual-address limit and a 256-task
per-real-UID limit; both can be changed. These are not dedicated memory or
thread quotas, and compatibility with any real age binary is not established.
"""

import argparse
import ctypes
import errno
import hashlib
import io
import json
import os
import platform
import signal
import stat
import subprocess
import sys
import tarfile

try:
    import resource
except ImportError:
    resource = None


MAX_ENTRIES = 128
MAX_DEPTH = 16
MAX_MANIFEST = 131072
OPENAT2 = 437
RESOLVE = 0x01 | 0x02 | 0x04 | 0x08
CLONE_THREAD = 0x10000


def fail(message):
    raise ValueError(message)


def parse_manifest(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                fail("duplicate JSON key")
            result[key] = value
        return result

    if len(raw) > MAX_MANIFEST:
        fail("manifest too large")
    document = json.loads(raw, object_pairs_hook=unique)
    if (not isinstance(document, dict) or set(document) != {"version", "entries"}
            or type(document["version"]) is not int or document["version"] != 1):
        fail("invalid manifest")
    entries = document["entries"]
    if not isinstance(entries, list) or len(entries) > MAX_ENTRIES:
        fail("invalid entries")
    result = {}
    for item in entries:
        if not isinstance(item, dict) or item.get("type") not in ("directory", "file"):
            fail("invalid entry")
        expected = {"root", "path", "type", "uid", "gid", "mode"}
        if item["type"] == "file":
            expected |= {"sha256"}
        if set(item) != expected or item["root"] not in ("data", "config"):
            fail("invalid entry fields")
        path = item["path"]
        if not isinstance(path, str) or len(path.encode("utf-8")) > 4096:
            fail("invalid path")
        parts = path.split("/")
        if (not path or len(parts) > MAX_DEPTH or any(
            part in ("", ".", "..") or len(part.encode("utf-8")) > 255
            or any(ord(char) < 32 or ord(char) == 127 for char in part)
            for part in parts
        )):
            fail("invalid path")
        for field in ("uid", "gid", "mode"):
            if type(item[field]) is not int or item[field] < 0:
                fail("invalid metadata")
        if item["mode"] > 0o7777:
            fail("invalid mode")
        if item["type"] == "file":
            digest = item["sha256"]
            if not isinstance(digest, str) or len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
                fail("invalid digest")
        key = (item["root"], path)
        if key in result:
            fail("duplicate entry")
        result[key] = item
    for (root, path), item in result.items():
        if "/" in path:
            parent = result.get((root, path.rsplit("/", 1)[0]))
            if not parent or parent["type"] != "directory":
                fail("missing parent")
    return result


def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def check_object(fd, kind, expected=None, *, sticky_root=False):
    info = os.fstat(fd)
    if not (stat.S_ISDIR(info.st_mode) if kind == "directory" else stat.S_ISREG(info.st_mode)):
        fail("unexpected file type")
    trusted_sticky_root = (
        sticky_root and kind == "directory" and expected is None and os.geteuid() == 0
        and info.st_uid == 0 and info.st_gid == 0 and stat.S_IMODE(info.st_mode) == 0o1777
    )
    if info.st_uid != os.geteuid() or (info.st_mode & 0o022 and not trusted_sticky_root):
        fail("untrusted owner or writable object")
    if kind == "file" and info.st_nlink != 1:
        fail("hard links forbidden")
    if expected and (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) != (
        expected["uid"], expected["gid"], expected["mode"]
    ):
        fail("metadata differs from manifest")
    if os.listxattr(fd):
        fail("ACL or xattr unsupported")
    return identity(info)


def open_child(parent, name, directory):
    class OpenHow(ctypes.Structure):
        _fields_ = [("flags", ctypes.c_uint64), ("mode", ctypes.c_uint64),
                    ("resolve", ctypes.c_uint64)]

    flags = os.O_CLOEXEC | os.O_NOFOLLOW
    if directory:
        flags |= os.O_RDONLY | os.O_DIRECTORY | os.O_NOATIME
    else:
        flags |= os.O_PATH
    how = OpenHow(flags, 0, RESOLVE)
    libc = ctypes.CDLL(None, use_errno=True)
    result = libc.syscall(OPENAT2, parent, os.fsencode(name), ctypes.byref(how), ctypes.sizeof(how))
    if result < 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))
    if directory:
        return result
    try:
        pinned = os.fstat(result)
        if not stat.S_ISREG(pinned.st_mode):
            fail("unexpected file type")
        fd = os.open(f"/proc/self/fd/{result}", os.O_RDONLY | os.O_CLOEXEC | os.O_NOATIME)
        opened = os.fstat(fd)
        if (pinned.st_dev, pinned.st_ino) != (opened.st_dev, opened.st_ino):
            os.close(fd)
            fail("file changed")
        return fd
    finally:
        os.close(result)


def digest_file(fd, size):
    digest = hashlib.sha256()
    offset = 0
    while offset < size:
        chunk = os.pread(fd, min(65536, size - offset), offset)
        if not chunk:
            fail("short read")
        digest.update(chunk)
        offset += len(chunk)
    if os.pread(fd, 1, size):
        fail("file grew")
    return digest.hexdigest()


def bounded_names(fd, maximum):
    names = []
    os.lseek(fd, 0, os.SEEK_SET)
    with os.scandir(fd) as entries:
        for item in entries:
            if len(names) >= maximum:
                fail("too many directory entries")
            names.append(item.name)
    return sorted(names, key=os.fsencode)


def collect(roots, manifest, max_bytes, *, sticky_root=False):
    objects = {}
    children = {}
    total = 0
    try:
        for root, root_fd in roots.items():
            fixed = open_child(root_fd, ".", True)
            try:
                before = check_object(fixed, "directory", sticky_root=sticky_root)
            except BaseException:
                os.close(fixed)
                raise
            objects[(root, "")] = (fixed, before, None)

        def walk(root, path):
            nonlocal total
            fd, _, _ = objects[(root, path)]
            expected_names = sorted(
                (key_path[len(path) + 1:] if path else key_path)
                for key_root, key_path in manifest
                if key_root == root and (key_path.rpartition("/")[0] == path)
            )
            names = bounded_names(fd, len(expected_names))
            if names != expected_names:
                fail("directory differs from manifest")
            children[(root, path)] = names
            for name in names:
                child_path = path + "/" + name if path else name
                item = manifest[(root, child_path)]
                child_fd = open_child(fd, name, item["type"] == "directory")
                try:
                    before = check_object(child_fd, item["type"], item)
                except BaseException:
                    os.close(child_fd)
                    raise
                objects[(root, child_path)] = (child_fd, before, item)
                if item["type"] == "directory":
                    walk(root, child_path)
                else:
                    total += before[6]
                    if total > max_bytes or digest_file(child_fd, before[6]) != item["sha256"]:
                        fail("size or digest mismatch")

        for root in roots:
            walk(root, "")
        return objects, children
    except BaseException:
        for fd, _, _ in objects.values():
            os.close(fd)
        raise


def verify(objects, children, *, sticky_root=False):
    for (root, path), (fd, before, item) in objects.items():
        kind = item["type"] if item else "directory"
        if check_object(fd, kind, item, sticky_root=sticky_root and not path) != before:
            fail("object changed")
        if kind == "directory" and bounded_names(fd, len(children[(root, path)])) != children[(root, path)]:
            fail("directory changed")
        if path:
            parent_path, _, name = path.rpartition("/")
            reopened = open_child(objects[(root, parent_path)][0], name, kind == "directory")
            try:
                if check_object(reopened, kind, item) != before:
                    fail("path changed")
            finally:
                os.close(reopened)


def set_limits(output_limit, address_limit, task_limit):
    for key, limit in ((resource.RLIMIT_FSIZE, output_limit),
                       (resource.RLIMIT_AS, address_limit),
                       (resource.RLIMIT_NPROC, task_limit)):
        _, hard = resource.getrlimit(key)
        if hard != resource.RLIM_INFINITY and limit > hard:
            fail("requested limit exceeds inherited hard limit")
        resource.setrlimit(key, (limit, limit))


def validate_capability_status(text):
    required = {"CapInh", "CapPrm", "CapEff", "CapAmb"}
    found = {}
    for line in text.splitlines():
        field, separator, value = line.partition(":")
        if field in required:
            if not separator or field in found:
                fail("invalid capability status")
            value = value.strip()
            if not value or any(char not in "0123456789abcdefABCDEF" for char in value):
                fail("invalid capability status")
            found[field] = int(value, 16)
    if set(found) != required or any(found.values()):
        fail("capability-bearing process forbidden")


def check_unprivileged():
    uids = os.getresuid()
    if uids[0] == 0 or len(set(uids)) != 1:
        fail("equal non-root real, effective and saved UIDs required")
    with open("/proc/self/status", encoding="ascii") as status:
        validate_capability_status(status.read())


def set_no_new_privileges():
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(38, 1, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), "no_new_privs failed")
    if libc.prctl(39, 0, 0, 0, 0) != 1:
        raise OSError(ctypes.get_errno(), "no_new_privs verification failed")


def restrict_children():
    machine = platform.machine()
    architectures = {
        "x86_64": (0xC000003E, 56, (57, 58)),
        "aarch64": (0xC00000B7, 220, ()),
    }
    if machine not in architectures:
        fail("unsupported architecture")
    architecture, clone_syscall, fork_syscalls = architectures[machine]

    class Filter(ctypes.Structure):
        _fields_ = [("code", ctypes.c_ushort), ("jt", ctypes.c_ubyte),
                    ("jf", ctypes.c_ubyte), ("k", ctypes.c_uint32)]

    class Program(ctypes.Structure):
        _fields_ = [("length", ctypes.c_ushort), ("filters", ctypes.POINTER(Filter))]

    load = 0x20
    equal = 0x15
    bit_set = 0x45
    ret = 0x06
    allow = 0x7FFF0000
    kill = 0x80000000
    error = 0x00050000
    instructions = [
        (load, 0, 0, 4),
        (equal, 1, 0, architecture),
        (ret, 0, 0, kill),
        (load, 0, 0, 0),
    ]
    if machine == "x86_64":
        instructions.extend([(bit_set, 0, 1, 0x40000000), (ret, 0, 0, error | errno.ENOSYS)])
    instructions.extend([(equal, 0, 1, 435), (ret, 0, 0, error | errno.ENOSYS)])
    for number in fork_syscalls:
        instructions.extend([(equal, 0, 1, number), (ret, 0, 0, error | errno.EPERM)])
    instructions.extend([
        (equal, 0, 3, clone_syscall),
        (load, 0, 0, 16),
        (bit_set, 1, 0, CLONE_THREAD),
        (ret, 0, 0, error | errno.EPERM),
        (ret, 0, 0, allow),
    ])
    filters = (Filter * len(instructions))(*(Filter(*item) for item in instructions))
    program = Program(len(filters), filters)
    libc = ctypes.CDLL(None, use_errno=True)
    set_no_new_privileges()
    if libc.prctl(22, 2, ctypes.byref(program), 0, 0) != 0:
        raise OSError(ctypes.get_errno(), "seccomp setup failed")


def prepare_encryptor(output_limit, address_limit, task_limit):
    set_no_new_privileges()
    check_unprivileged()
    set_limits(output_limit, address_limit, task_limit)
    restrict_children()
    check_unprivileged()


class HashingReader:
    def __init__(self, file):
        self.file = file
        self.digest = hashlib.sha256()

    def read(self, size=-1):
        content = self.file.read(size)
        self.digest.update(content)
        return content


def reject_output_in_roots(output_fd, root_stats):
    roots = {(info.st_dev, info.st_ino) for info in root_stats}
    current = os.dup(output_fd)
    try:
        for _ in range(256):
            info = os.fstat(current)
            if (info.st_dev, info.st_ino) in roots:
                fail("output inside input root")
            parent = os.open("..", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW,
                             dir_fd=current)
            parent_info = os.fstat(parent)
            os.close(current)
            current = parent
            if (info.st_dev, info.st_ino) == (parent_info.st_dev, parent_info.st_ino):
                return
        fail("output ancestry too deep")
    finally:
        os.close(current)


def capture(args):
    if (sys.platform != "linux" or platform.machine() not in ("x86_64", "aarch64")
            or os.getuid() == 0 or os.geteuid() == 0 or not args.synthetic_only):
        fail("Linux non-root synthetic-only execution required")
    check_unprivileged()
    if not 1 <= args.max_bytes <= 10485760 or not 1024 <= args.max_output_bytes <= 16777216:
        fail("invalid limits")
    if not 1 <= args.reserve_bytes <= 1073741824 or not 1 <= args.timeout <= 120:
        fail("invalid reserve or timeout")
    if not 2147483648 <= args.encryptor_as_bytes <= 68719476736 or not 32 <= args.encryptor_tasks <= 4096:
        fail("invalid encryptor resource limits")
    if not args.recipient.startswith("age1") or any(char.isspace() for char in args.recipient):
        fail("invalid recipient")
    if not args.output or args.output in (".", "..") or "/" in args.output or "\0" in args.output:
        fail("output must be a basename")
    if not os.path.isabs(args.age):
        fail("age executable must be absolute")
    soft, _ = resource.getrlimit(resource.RLIMIT_NOFILE)
    if soft != resource.RLIM_INFINITY and soft < MAX_ENTRIES + 32:
        fail("insufficient descriptor limit")
    manifest = parse_manifest(os.read(args.manifest_fd, MAX_MANIFEST + 1))
    roots = {"data": args.data_fd, "config": args.config_fd}
    root_stats = [os.fstat(fd) for fd in roots.values()]
    if (root_stats[0].st_dev, root_stats[0].st_ino) == (root_stats[1].st_dev, root_stats[1].st_ino):
        fail("input roots must be distinct")
    output_stat = os.fstat(args.output_dir_fd)
    if (not stat.S_ISDIR(output_stat.st_mode) or output_stat.st_uid != os.geteuid()
            or stat.S_IMODE(output_stat.st_mode) != 0o700 or os.listxattr(args.output_dir_fd)):
        fail("output directory must be private")
    reject_output_in_roots(args.output_dir_fd, root_stats)
    capacity = os.fstatvfs(args.output_dir_fd)
    if capacity.f_bavail * capacity.f_frsize < args.max_output_bytes + args.reserve_bytes:
        fail("insufficient free space")
    objects, children = collect(roots, manifest, args.max_bytes)
    out_fd = None
    output_identity = None
    completed = False
    process = None
    try:
        verify(objects, children)
        out_fd = os.open(args.output, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC,
                         0o600, dir_fd=args.output_dir_fd)
        out_info = os.fstat(out_fd)
        output_identity = (out_info.st_dev, out_info.st_ino)
        process = subprocess.Popen([args.age, "--encrypt", "-r", args.recipient], stdin=subprocess.PIPE,
                                   stdout=out_fd, stderr=subprocess.DEVNULL,
                                   start_new_session=True,
                                   preexec_fn=lambda: prepare_encryptor(
                                       args.max_output_bytes, args.encryptor_as_bytes, args.encryptor_tasks))
        with tarfile.open(fileobj=process.stdin, mode="w|", format=tarfile.PAX_FORMAT) as archive:
            for (root, path), (fd, before, item) in sorted(objects.items()):
                name = root + ("/" + path if path else "")
                info = tarfile.TarInfo(name)
                source_stat = os.fstat(fd)
                info.uid, info.gid = source_stat.st_uid, source_stat.st_gid
                info.mode, info.mtime = stat.S_IMODE(source_stat.st_mode), int(source_stat.st_mtime)
                if item is None or item["type"] == "directory":
                    info.type = tarfile.DIRTYPE
                    archive.addfile(info)
                else:
                    info.size = before[6]
                    os.lseek(fd, 0, os.SEEK_SET)
                    with os.fdopen(os.dup(fd), "rb") as source:
                        reader = HashingReader(source)
                        archive.addfile(info, reader)
                    if reader.digest.hexdigest() != item["sha256"] or digest_file(fd, before[6]) != item["sha256"]:
                        fail("content changed")
            payload = json.dumps({"version": 1, "entries": list(manifest.values())},
                                 sort_keys=True, separators=(",", ":")).encode()
            metadata = tarfile.TarInfo("MANIFEST.json")
            metadata.mode, metadata.size = 0o600, len(payload)
            archive.addfile(metadata, io.BytesIO(payload))
        process.stdin.close()
        if process.wait(timeout=args.timeout) != 0:
            fail("encryption failed")
        verify(objects, children)
        if os.fstat(out_fd).st_size > args.max_output_bytes or os.pread(out_fd, 22, 0) != b"age-encryption.org/v1\n":
            fail("invalid encrypted output")
        current = os.stat(args.output, dir_fd=args.output_dir_fd, follow_symlinks=False)
        if (current.st_dev, current.st_ino) != output_identity:
            fail("output changed")
        capacity = os.fstatvfs(args.output_dir_fd)
        if capacity.f_bavail * capacity.f_frsize < args.reserve_bytes:
            fail("insufficient remaining space")
        os.fsync(out_fd)
        os.fsync(args.output_dir_fd)
        completed = True
    finally:
        cleanup_failed = False
        if process is not None:
            try:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)
                if process.stdin and not process.stdin.closed:
                    process.stdin.close()
            except (OSError, subprocess.SubprocessError):
                cleanup_failed = True
        for fd, _, _ in objects.values():
            try:
                os.close(fd)
            except OSError:
                cleanup_failed = True
        if out_fd is not None:
            try:
                os.close(out_fd)
            except OSError:
                cleanup_failed = True
        if (not completed or cleanup_failed) and output_identity is not None:
            try:
                current = os.stat(args.output, dir_fd=args.output_dir_fd, follow_symlinks=False)
                if (current.st_dev, current.st_ino) != output_identity:
                    raise OSError("output identity changed")
                os.unlink(args.output, dir_fd=args.output_dir_fd)
            except OSError:
                print("Incomplete output cleanup failed; inspect privately.", file=sys.stderr)
        if cleanup_failed:
            raise OSError("capture cleanup failed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--synthetic-only", action="store_true")
    for name in ("data-fd", "config-fd", "manifest-fd", "output-dir-fd", "max-bytes",
                 "max-output-bytes", "reserve-bytes", "timeout"):
        parser.add_argument("--" + name, type=int, required=True)
    for name in ("output", "recipient", "age"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--encryptor-as-bytes", type=int, default=4294967296)
    parser.add_argument("--encryptor-tasks", type=int, default=256)
    args = parser.parse_args()

    def interrupted(signum, frame):
        raise TimeoutError("interrupted or timed out")

    for sig in (signal.SIGALRM, signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, interrupted)
    try:
        signal.alarm(max(1, min(args.timeout, 120)))
        capture(args)
        print("Synthetic encrypted capture complete; recovery and consistency are not verified.")
        return 0
    except (ValueError, OSError, subprocess.SubprocessError, tarfile.TarError, OverflowError):
        print("Synthetic capture failed; inspect prerequisites privately.", file=sys.stderr)
        return 1
    finally:
        signal.alarm(0)


if __name__ == "__main__":
    sys.exit(main())
