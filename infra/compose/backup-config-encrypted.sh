#!/usr/bin/env bash
set -euo pipefail
umask 077

exec python3 - "$@" <<'PY'
import argparse
import ctypes
import functools
import os
import signal
import stat
import subprocess
import sys
import tarfile

HELP = """Draft for PA-009 and PA-010: encrypted configuration/key backup.
Specify each absolute regular file and each age public recipient explicitly.
Example: backup-config-encrypted.sh --output /private/backup/config.age \\
  --recipient age1PUBLICKEY --file /absolute/config --file /absolute/key \\
  --max-bytes 10485760 --max-output-bytes 12000000 \\
  --reserve-bytes 10000000 --confirm-isolated-capacity

Linux, Python 3 and a trusted age executable in PATH are required. The output
parent must already exist, be owned by the caller and have mode 0700. Paths
cannot contain symlinks, dot components or newlines. Output is exclusive and
mode 0600; existing files are never overwritten. Only regular files are archived.
Input and output ancestors must be owned by root or the caller and not
group/world writable. When run as root, --trusted-input-owner-uid UID also
trusts that single explicitly named numeric owner for input ancestors only.
That account can alter input paths between checks and must be fully trusted.
Output ancestors remain subject to the default ownership rule. Input files
must be on ext-family, XFS, Btrfs, overlayfs, or tmpfs. Input paths are
reopened and checked before and after capture.
File contents and original absolute paths are inside the encrypted tar stream.
No plaintext temporary files are created by this script.

Production use is refused without --confirm-isolated-capacity: the operator
must first independently verify a dedicated filesystem or enforced quota. This
flag is an assertion, not proof of isolation. The script enforces a ciphertext
size limit and checks free space before and after capture, but cannot reserve
space against concurrent writers or verify the quota and filesystem isolation.
The host, filesystem, PATH and age executable must be trusted. File changes are
checked but files are not frozen: this is not an atomic snapshot. Memory, swap,
age itself, and privileged observers are outside this script's control. Abrupt
termination or cleanup failure may leave an incomplete encrypted output; remove
it manually before retrying. This does not verify recipient ownership, decrypt,
restore, preserve ACLs/xattrs, or provide an off-site copy. Review and isolated
recovery testing are required before use.
"""


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError("Invalid arguments.")


class CapacityRequired(ValueError):
    pass


def parse_args(argv):
    parser = Parser(add_help=False, allow_abbrev=False)
    parser.add_argument("--help", action="store_true")
    parser.add_argument("--output")
    parser.add_argument("--recipient", action="append", default=[])
    parser.add_argument("--file", action="append", default=[])
    parser.add_argument("--max-bytes", type=int)
    parser.add_argument("--max-output-bytes", type=int)
    parser.add_argument("--reserve-bytes", type=int)
    parser.add_argument("--confirm-isolated-capacity", action="store_true")
    parser.add_argument("--trusted-input-owner-uid", type=int)
    args = parser.parse_args(argv)
    if args.help and argv == ["--help"]:
        print(HELP)
        return None
    if not args.confirm_isolated_capacity:
        raise CapacityRequired("Independent capacity confirmation is required.")
    if args.trusted_input_owner_uid is not None:
        if not 0 <= args.trusted_input_owner_uid < 4294967295 or os.geteuid() != 0:
            raise ValueError("An additional input owner requires root and a valid numeric UID.")
    if (args.help or not args.output or not args.file or not args.recipient
            or not args.max_bytes or not 0 < args.max_bytes <= 1073741824
            or not args.max_output_bytes or not 0 < args.max_output_bytes <= 2147483648
            or not args.reserve_bytes or not 0 < args.reserve_bytes <= 1099511627776
            or len(args.file) > 128 or len(args.recipient) > 32):
        raise ValueError("Explicit files, recipients, output and a valid size limit are required.")
    if any(not recipient.startswith("age1") or any(char.isspace() for char in recipient)
           for recipient in args.recipient):
        raise ValueError("Only explicit age public recipients are accepted.")
    if len(set(args.file)) != len(args.file) or len(set(args.recipient)) != len(args.recipient):
        raise ValueError("Duplicate files or recipients are forbidden.")
    return args


def components(path):
    if not path.startswith("/") or "\n" in path or "\r" in path or "\0" in path:
        raise ValueError("Invalid absolute path.")
    parts = path.split("/")[1:]
    if not parts or any(part in ("", ".", "..") for part in parts):
        raise ValueError("Noncanonical path.")
    return parts


def check_trusted_directory(fd, trusted_input_owner_uid=None):
    info = os.fstat(fd)
    effective_uid = os.geteuid()
    if trusted_input_owner_uid is not None and effective_uid != 0:
        raise ValueError("An additional input owner requires root.")
    owners = {0, effective_uid}
    if trusted_input_owner_uid is not None:
        owners.add(trusted_input_owner_uid)
    if info.st_uid not in owners or info.st_mode & 0o022:
        raise ValueError("Untrusted directory ancestor.")


def open_parent(path, trusted=False, trusted_input_owner_uid=None):
    parts = components(path)
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    current = os.open("/", flags)
    try:
        if trusted:
            check_trusted_directory(current, trusted_input_owner_uid)
        for part in parts[:-1]:
            next_fd = os.open(part, flags, dir_fd=current)
            os.close(current)
            current = next_fd
            if trusted:
                check_trusted_directory(current, trusted_input_owner_uid)
        return current, parts[-1]
    except BaseException:
        os.close(current)
        raise


def open_input(path, trusted_input_owner_uid=None):
    parent, name = open_parent(path, trusted=True, trusted_input_owner_uid=trusted_input_owner_uid)
    try:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=parent)
    finally:
        os.close(parent)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise ValueError("Input is not a regular file.")
        if filesystem_type(fd) not in (0xEF53, 0x58465342, 0x9123683E, 0x794C7630, 0x01021994):
            raise ValueError("Unsupported input filesystem.")
        return fd, info
    except BaseException:
        os.close(fd)
        raise


def filesystem_type(fd):
    libc = ctypes.CDLL(None, use_errno=True)
    fstatfs = libc.fstatfs
    fstatfs.argtypes = [ctypes.c_int, ctypes.c_void_p]
    fstatfs.restype = ctypes.c_int
    buffer = ctypes.create_string_buffer(256)
    if fstatfs(fd, buffer) != 0:
        raise OSError("Cannot inspect input filesystem.")
    return ctypes.c_long.from_buffer(buffer).value & 0xFFFFFFFF


def open_output(path):
    parent, name = open_parent(path, trusted=True)
    try:
        info = os.fstat(parent)
        if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise ValueError("Output parent must be private and owned by the caller.")
        fd = os.open(name, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC,
                     0o600, dir_fd=parent)
        return parent, name, fd
    except BaseException:
        os.close(parent)
        raise


def file_identity(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns,
            info.st_uid, info.st_gid, info.st_mode)


def verify_output_parent(path, parent):
    current, _ = open_parent(path, trusted=True)
    try:
        expected = os.fstat(parent)
        actual = os.fstat(current)
        if (expected.st_dev, expected.st_ino) != (actual.st_dev, actual.st_ino):
            raise ValueError("Output parent changed.")
    finally:
        os.close(current)


def verify_inputs(inputs, trusted_input_owner_uid=None):
    for path, fd, before in inputs:
        if file_identity(os.fstat(fd)) != file_identity(before):
            raise ValueError("Pinned input changed.")
        current_fd, current_info = open_input(path, trusted_input_owner_uid)
        try:
            if file_identity(current_info) != file_identity(before):
                raise ValueError("Input path changed.")
        finally:
            os.close(current_fd)


def check_capacity(parent, required):
    info = os.fstatvfs(parent)
    if info.f_bavail * info.f_frsize < required:
        raise ValueError("Insufficient available output capacity.")


def limit_output(max_bytes):
    import resource
    _, hard = resource.getrlimit(resource.RLIMIT_FSIZE)
    if hard != resource.RLIM_INFINITY and max_bytes > hard:
        raise ValueError("Ciphertext limit exceeds hard file-size limit.")
    resource.setrlimit(resource.RLIMIT_FSIZE, (max_bytes, hard))


def stream_archive(stream, inputs):
    with tarfile.open(fileobj=stream, mode="w|", format=tarfile.PAX_FORMAT) as archive:
        for path, fd, before in inputs:
            entry = tarfile.TarInfo(path[1:])
            entry.size = before.st_size
            entry.mode = stat.S_IMODE(before.st_mode)
            entry.mtime = int(before.st_mtime)
            entry.uid = before.st_uid
            entry.gid = before.st_gid
            with os.fdopen(os.dup(fd), "rb") as source:
                archive.addfile(entry, source)
                if source.read(1):
                    raise ValueError("Input exceeds its reported size.")
            if file_identity(os.fstat(fd)) != file_identity(before):
                raise ValueError("Input changed during capture.")


def capture(args):
    inputs = []
    parent = None
    output_fd = None
    process = None
    completed = False
    cleanup_failed = False
    output_identity = None
    try:
        total = 0
        identities = set()
        for path in args.file:
            fd, info = open_input(path, args.trusted_input_owner_uid)
            inputs.append((path, fd, info))
            identity = (info.st_dev, info.st_ino)
            if identity in identities:
                raise ValueError("Duplicate input inode.")
            identities.add(identity)
            total += info.st_size
            if total > args.max_bytes:
                raise ValueError("Input size limit exceeded.")
        verify_inputs(inputs, args.trusted_input_owner_uid)
        parent, name, output_fd = open_output(args.output)
        output_identity = file_identity(os.fstat(output_fd))[:2]
        verify_output_parent(args.output, parent)
        check_capacity(parent, args.max_output_bytes + args.reserve_bytes)
        command = ["age", "--encrypt"]
        for recipient in args.recipient:
            command.extend(["-r", recipient])
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=output_fd,
                                   stderr=subprocess.DEVNULL, close_fds=True,
                                   preexec_fn=functools.partial(limit_output, args.max_output_bytes))
        try:
            stream_archive(process.stdin, inputs)
            process.stdin.close()
            if process.wait() != 0:
                raise ValueError("Encryption failed.")
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            if not process.stdin.closed:
                process.stdin.close()
        os.fsync(output_fd)
        if os.fstat(output_fd).st_size > args.max_output_bytes:
            raise ValueError("Ciphertext size limit exceeded.")
        os.lseek(output_fd, 0, os.SEEK_SET)
        if os.read(output_fd, 22) != b"age-encryption.org/v1\n":
            raise ValueError("Invalid encrypted output.")
        verify_inputs(inputs, args.trusted_input_owner_uid)
        current = os.stat(name, dir_fd=parent, follow_symlinks=False)
        if (current.st_dev, current.st_ino) != output_identity:
            raise ValueError("Output changed during capture.")
        check_capacity(parent, args.reserve_bytes)
        os.fsync(parent)
        verify_output_parent(args.output, parent)
        completed = True
    finally:
        close_failed = False
        for _, fd, _ in inputs:
            try:
                os.close(fd)
            except OSError:
                close_failed = True
        if output_fd is not None:
            try:
                os.close(output_fd)
            except OSError:
                close_failed = True
        if parent is not None:
            if not completed or close_failed:
                try:
                    current = os.stat(name, dir_fd=parent, follow_symlinks=False)
                    if (current.st_dev, current.st_ino) != output_identity:
                        raise OSError("Output changed.")
                    os.unlink(name, dir_fd=parent)
                except OSError:
                    cleanup_failed = True
            try:
                os.close(parent)
            except OSError:
                close_failed = True
        if cleanup_failed:
            print("Failed to remove incomplete encrypted output; manual cleanup is required.", file=sys.stderr)
        if close_failed:
            raise OSError("File descriptor cleanup failed.")
    if completed:
        print("Encrypted capture completed; decryption and recovery are not verified.")


def interrupted(signum, frame):
    raise InterruptedError("Interrupted.")


def main(argv):
    try:
        args = parse_args(argv)
        if args is None:
            return 0
        if sys.platform != "linux":
            raise ValueError("Linux is required.")
        for item in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            signal.signal(item, interrupted)
        capture(args)
        return 0
    except CapacityRequired:
        print("Production use is forbidden without independently verified isolated capacity and explicit confirmation.", file=sys.stderr)
        return 1
    except (ValueError, OSError, tarfile.TarError, subprocess.SubprocessError):
        print("Encrypted capture failed; inspect inputs and prerequisites privately.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
PY
