"""Synthetic only. Use a trusted launcher and trusted local executables:

/usr/bin/env -i PATH=/usr/bin:/bin LC_ALL=C HOME=/ /usr/bin/unshare -n \
/usr/bin/setpriv --bounding-set=-net_admin,-net_raw /usr/bin/python3 -I -S -

Supply this trusted script on stdin. The launcher itself must start without
untrusted loader variables or startup hooks; checks inside Python cannot
undo code that executed before the interpreter reached this script.
"""

import sys

if not sys.flags.isolated or not sys.flags.no_site:
    raise SystemExit("Refused: Python must start with -I -S; launcher environment must be trusted.")

import hashlib
import json
import os
import pathlib
import stat
import subprocess
import tempfile


ENV = {"PATH": "/usr/bin:/bin", "LC_ALL": "C", "HOME": "/"}


def command(*args):
    return subprocess.run(args, check=True, stdin=subprocess.DEVNULL,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=ENV).stdout


def check_network():
    if os.stat("/proc/self/ns/net").st_ino == os.stat("/proc/1/ns/net").st_ino:
        raise ValueError("a separate network namespace is required")
    status = pathlib.Path("/proc/self/status").read_text(encoding="ascii")
    capabilities = {}
    for line in status.splitlines():
        if line.startswith(("CapInh:", "CapPrm:", "CapEff:", "CapBnd:", "CapAmb:")):
            key, value = line.split(":", 1)
            if key in capabilities:
                raise ValueError("duplicate capability field")
            capabilities[key] = int(value.strip(), 16)
    if set(capabilities) != {"CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"}:
        raise ValueError("capability status unavailable")
    if any(value & ((1 << 12) | (1 << 13)) for value in capabilities.values()):
        raise ValueError("network admin and raw capabilities must be absent")
    ip = "/usr/sbin/ip"
    links = json.loads(command(ip, "-j", "link", "show"))
    addresses = json.loads(command(ip, "-j", "address", "show"))
    routes4 = json.loads(command(ip, "-j", "-4", "route", "show", "table", "all"))
    routes6 = json.loads(command(ip, "-j", "-6", "route", "show", "table", "all"))
    if (len(links) != 1 or links[0].get("ifname") != "lo"
            or links[0].get("operstate") != "DOWN"
            or links[0].get("flags") != ["LOOPBACK"]
            or len(addresses) != 1 or addresses[0].get("ifname") != "lo"
            or addresses[0].get("addr_info") != [] or routes4 != [] or routes6 != []):
        raise ValueError("network namespace has active interfaces, addresses, or routes")


def raise_walk_error(error):
    raise error


def inventory(root):
    result = {}
    for base, directories, files in os.walk(root, followlinks=False, onerror=raise_walk_error):
        for name in ["."] + sorted(directories + files):
            path = pathlib.Path(base) if name == "." else pathlib.Path(base, name)
            relative = str(path.relative_to(root))
            if relative in result:
                continue
            info = path.lstat()
            kind = stat.S_IFMT(info.st_mode)
            if kind not in (stat.S_IFDIR, stat.S_IFREG, stat.S_IFLNK):
                raise ValueError("unexpected fixture file type")
            attrs = {key: os.getxattr(path, key, follow_symlinks=False)
                     for key in os.listxattr(path, follow_symlinks=False)}
            acl = None if stat.S_ISLNK(info.st_mode) else command(
                "/usr/bin/getfacl", "-cpn", "--", str(path))
            content = None
            if stat.S_ISREG(info.st_mode):
                content = hashlib.sha256(path.read_bytes()).hexdigest()
            elif stat.S_ISLNK(info.st_mode):
                content = os.readlink(path)
            result[relative] = (kind, stat.S_IMODE(info.st_mode), info.st_uid, info.st_gid,
                                info.st_nlink, content, acl, attrs)
    return result


def compare(source, restored):
    original = inventory(source)
    actual = inventory(restored)
    if original != actual:
        differences = sorted(key for key in original.keys() | actual.keys()
                             if original.get(key) != actual.get(key))
        raise ValueError("restore differs: " + ", ".join(differences))
    for root in (source, restored):
        if os.stat(root / "nested" / "hardlink").st_ino != os.stat(root / "payload").st_ino:
            raise ValueError("hard link relationship differs")


def expect_difference(source, restored, label):
    try:
        compare(source, restored)
    except ValueError as error:
        if "restore differs" not in str(error):
            raise
    else:
        raise ValueError("negative comparison did not detect " + label)


def check_walk_failure(lab):
    fixture = lab / "walk-error"
    fixture.mkdir(mode=0o755)
    os.chmod(fixture, 0o755)
    (fixture / "unreadable").mkdir(mode=0o700)
    os.chmod(lab, 0o711)
    try:
        pid = os.fork()
        if pid == 0:
            try:
                os.setgroups([])
                os.setgid(12349)
                os.setuid(12349)
                inventory(fixture)
            except PermissionError as error:
                os._exit(0 if error.filename == str(fixture / "unreadable") else 2)
            except BaseException:
                os._exit(2)
            os._exit(1)
        _, status = os.waitpid(pid, 0)
        if not os.WIFEXITED(status) or os.WEXITSTATUS(status) != 0:
            raise ValueError("unreadable directory traversal was not rejected")
    finally:
        os.chmod(lab, 0o700)
    print("Unreadable directory traversal negative control detected.")


def run():
    if len(sys.argv) != 1:
        raise ValueError("no arguments or external archives are accepted")
    if sys.platform != "linux" or os.geteuid() != 0:
        raise ValueError("Linux root is required to test numeric ownership")
    if dict(os.environ) != ENV:
        raise ValueError("launcher must supply only the prescribed clean environment")
    check_network()
    print("Separate network namespace: loopback down, no addresses or IPv4/IPv6 routes; "
          "network admin and raw capabilities absent.")
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix="caddy-restore-synthetic-", dir="/tmp") as temporary:
        lab = pathlib.Path(temporary)
        check_walk_failure(lab)
        for volume in ("data", "config"):
            source = lab / (volume + "-source")
            restored = lab / (volume + "-restored")
            source.mkdir(mode=0o750)
            restored.mkdir(mode=0o700)
            (source / "nested").mkdir(mode=0o750)
            (source / "empty").mkdir(mode=0o710)
            (source / "payload").write_bytes(("synthetic-" + volume + "\n").encode())
            os.chmod(source / "payload", 0o640)
            os.chown(source / "payload", 12345, 12346)
            os.link(source / "payload", source / "nested" / "hardlink")
            os.symlink("../payload", source / "nested" / "symlink")
            os.setxattr(source / "payload", "user.synthetic", b"synthetic-value")
            os.setxattr(source / "nested", "user.synthetic-directory", b"directory-value")
            command("/usr/bin/setfacl", "-m", "u:12347:r--", str(source / "payload"))
            command("/usr/bin/setfacl", "-m", "d:u:12347:r-x", str(source / "nested"))
            archive = lab / (volume + ".tar")
            command("/usr/bin/tar", "--create", "--file", str(archive), "--format=pax",
                    "--numeric-owner", "--acls", "--xattrs", "--xattrs-include=*",
                    "-C", str(source), ".")
            command("/usr/bin/tar", "--extract", "--file", str(archive), "--numeric-owner",
                    "--same-owner", "--same-permissions", "--acls", "--xattrs",
                    "--xattrs-include=*", "-C", str(restored))
            compare(source, restored)
            os.chown(restored / "payload", 12348, 12346)
            expect_difference(source, restored, "ownership change")
            os.chown(restored / "payload", 12345, 12346)
            os.setxattr(restored / "payload", "user.synthetic", b"changed")
            expect_difference(source, restored, "xattr change")
            os.setxattr(restored / "payload", "user.synthetic", b"synthetic-value")
            command("/usr/bin/setfacl", "-x", "u:12347", str(restored / "payload"))
            expect_difference(source, restored, "ACL change")
            command("/usr/bin/setfacl", "-m", "u:12347:r--", str(restored / "payload"))
            (restored / "extra").mkdir()
            expect_difference(source, restored, "extra directory")
            (restored / "extra").rmdir()
            compare(source, restored)
            with (restored / "payload").open("ab") as changed:
                changed.write(b"changed")
            expect_difference(source, restored, "content change")
            print(volume + ": directory tree, content, numeric owner, mode, ACL, xattr, "
                  "symlink and hardlink match; five negative controls detected")
    print("Synthetic files and unencrypted archives removed; production recovery is not supported.")


if __name__ == "__main__":
    try:
        run()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print("Synthetic restore experiment failed: " + str(error), file=sys.stderr)
        sys.exit(1)
