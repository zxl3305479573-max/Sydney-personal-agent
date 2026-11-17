#!/usr/bin/env python3
import os
import resource
import secrets
import signal
import stat
import subprocess
import time


def capture(directory_fd, name, producer, encryptor, limit, timeout, *, producer_fds=(),
            environment=None, pre_publish=None):
    return _capture(directory_fd, name, producer, encryptor, limit, timeout,
                    producer_fds, 64 * 1024 * 1024, 120, environment, pre_publish)


def capture_workspace(directory_fd, name, producer, encryptor, limit, timeout, *, producer_fds=()):
    return _capture(directory_fd, name, producer, encryptor, limit, timeout,
                    producer_fds, 768 * 1024 * 1024, 900, None, None)


def _capture(directory_fd, name, producer, encryptor, limit, timeout,
             producer_fds, max_size, max_timeout, environment, pre_publish):
    if (not name or name in (".", "..") or "/" in name or "\0" in name
            or not producer or not encryptor or not 1 <= limit <= max_size
            or not 0 < timeout <= max_timeout or not isinstance(producer_fds, tuple)
            or any(type(fd) is not int or fd <= 2 for fd in producer_fds)
            or len(set(producer_fds)) != len(producer_fds)
            or (environment is not None and not isinstance(environment, dict))
            or (pre_publish is not None and not callable(pre_publish))):
        raise ValueError("invalid capture parameters")
    for fd in producer_fds:
        os.fstat(fd)
    directory = os.fstat(directory_fd)
    if not stat.S_ISDIR(directory.st_mode) or directory.st_uid != os.geteuid() or directory.st_mode & 0o077:
        raise ValueError("unsafe destination directory")
    try:
        os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    except FileNotFoundError:
        pass
    else:
        raise FileExistsError(name)
    temporary_name = ".capture-" + secrets.token_hex(16) + ".partial"
    output_fd = os.open(temporary_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW |
                        os.O_CLOEXEC, 0o600, dir_fd=directory_fd)
    output_info = os.fstat(output_fd)
    processes = []
    success = False
    published = False
    deadline = time.monotonic() + timeout

    def set_limit():
        resource.setrlimit(resource.RLIMIT_FSIZE, (limit, limit))
        signal.signal(signal.SIGXFSZ, signal.SIG_DFL)

    try:
        source = subprocess.Popen(
            producer, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, close_fds=True, pass_fds=producer_fds,
            start_new_session=True, env=environment,
        )
        processes.append(source)
        try:
            encrypted = subprocess.Popen(
                encryptor, stdin=source.stdout, stdout=output_fd,
                stderr=subprocess.DEVNULL, close_fds=True, start_new_session=True,
                preexec_fn=set_limit, env=environment,
            )
            processes.append(encrypted)
        finally:
            source.stdout.close()
        for process in processes:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("capture timed out")
            if process.wait(timeout=remaining) != 0:
                raise RuntimeError("capture process failed")
        os.fsync(output_fd)
        result = os.fstat(output_fd)
        current = os.stat(temporary_name, dir_fd=directory_fd, follow_symlinks=False)
        if (not stat.S_ISREG(result.st_mode) or result.st_nlink != 1
                or result.st_size <= 0 or result.st_size > limit
                or (result.st_dev, result.st_ino) != (current.st_dev, current.st_ino)):
            raise RuntimeError("capture output changed")
        if pre_publish is not None:
            pre_publish()
            if time.monotonic() >= deadline:
                raise TimeoutError("capture timed out before publication")
            after = os.fstat(output_fd)
            current = os.stat(temporary_name, dir_fd=directory_fd, follow_symlinks=False)
            if (not stat.S_ISREG(after.st_mode) or after.st_nlink != 1
                    or (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
                    != (result.st_dev, result.st_ino, result.st_size, result.st_mtime_ns, result.st_ctime_ns)
                    or (current.st_dev, current.st_ino) != (after.st_dev, after.st_ino)):
                raise RuntimeError("capture output changed before publication")
        os.link(temporary_name, name, src_dir_fd=directory_fd, dst_dir_fd=directory_fd,
                follow_symlinks=False)
        published = True
        os.unlink(temporary_name, dir_fd=directory_fd)
        os.fsync(directory_fd)
        success = True
        return result.st_size
    finally:
        cleanup_failed = False
        for process in processes:
            if process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                except OSError:
                    cleanup_failed = True
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                cleanup_failed = True
        os.close(output_fd)
        if not success:
            for cleanup_name in ([temporary_name, name] if published else [temporary_name]):
                try:
                    current = os.stat(cleanup_name, dir_fd=directory_fd, follow_symlinks=False)
                    if (current.st_dev, current.st_ino) != (output_info.st_dev, output_info.st_ino):
                        raise RuntimeError("capture output replaced")
                    os.unlink(cleanup_name, dir_fd=directory_fd)
                except FileNotFoundError:
                    pass
            os.fsync(directory_fd)
        if cleanup_failed:
            raise RuntimeError("capture process cleanup failed")


if __name__ == "__main__":
    raise SystemExit("Synthetic component only; production capture is disabled.")
