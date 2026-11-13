#!/bin/bash -p
set -euo pipefail
umask 077

builtin printf '%s\n' 'Workspace capture is disabled: concurrent path replacement is not contained.' >&2
exit 1

[[ $- == *p* && $EUID == 0 ]] || exit 1
PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
[[ ! -L $0 && -f $0 ]] || exit 1
script_mode=$(stat -c '%u:%g:%a' "$0")
[[ $script_mode == 0:0:600 || $script_mode == 0:0:700 ]] || exit 1
if [[ $# == 0 ]]; then
  exec /usr/bin/unshare --mount --propagation private /bin/bash -p "$0" --private-namespace
fi
[[ $# == 1 && $1 == --private-namespace ]] || exit 1
[[ $(readlink /proc/self/ns/mnt) != "$(readlink /proc/1/ns/mnt)" ]] || exit 1

workspace=/home/sydney-desktop/.local/share/sydney/workspaces
root=/var/backups/sydney-workspace-staging-20261111
backing=/var/lib/sydney-backup/workspace-staging-20261111.ext4
tool=/root/sydney-image-age-20261111
partial=$root/native-workspace.tgz.age.partial
final=$root/native-workspace.tgz.age

exec 9>/run/lock/sydney-workspace-staging-20261111.lock
flock -n 9 || exit 1
[[ ! -L $workspace && -d $workspace ]] || exit 1
[[ ! -L $root && -d $root && ! -L $backing && -f $backing ]] || exit 1
[[ $(stat -c '%u:%g:%a' "$root") == 0:0:700 ]] || exit 1
[[ $(stat -c '%u:%g:%a' "$backing") == 0:0:600 ]] || exit 1
[[ $(stat -c '%u:%g:%a' "$tool") == 0:0:700 ]] || exit 1
[[ $(stat -c '%u:%g:%a' "$tool/recipient") == 0:0:600 ]] || exit 1
[[ $(findmnt -n -o TARGET --target "$root") == "$root" ]] || exit 1
[[ $(findmnt -n -o FSTYPE --target "$root") == ext4 ]] || exit 1
device=$(findmnt -n -o SOURCE --target "$root")
[[ $device =~ ^/dev/loop[0-9]+$ ]] || exit 1
[[ $(realpath -e -- "$(losetup -n -O BACK-FILE "$device")") == "$backing" ]] || exit 1
options=,$(findmnt -n -o OPTIONS --target "$root"),
for option in nodev nosuid noexec; do
  [[ $options == *,$option,* ]] || exit 1
done
available=$(df -Pk -- "$root" | awk 'NR==2 {print $4}')
[[ $available =~ ^[0-9]+$ ]] && (( available >= 950000 )) || exit 1
[[ ! -e $partial && ! -L $partial && ! -e $final && ! -L $final ]] || exit 1

driver_identity() {
  /usr/bin/python3 -I - "$workspace" <<'PY'
import os
import pwd
import subprocess
import sys

workspace = sys.argv[1]
result = subprocess.run(
    ["/usr/bin/systemctl", "show", "sydney-driver.service",
     "--property=MainPID", "--property=ActiveState"],
    check=True, capture_output=True, text=True, timeout=10,
)
fields = dict(line.split("=", 1) for line in result.stdout.splitlines())
pid = int(fields["MainPID"])
if fields["ActiveState"] != "active" or pid <= 1:
    raise ValueError("driver unavailable")
with open(f"/proc/{pid}/environ", "rb") as source:
    values = [item.split(b"=", 1)[1] for item in source.read().split(b"\0")
              if item.startswith(b"SYDNEY_WORKSPACE_ROOT=")]
if len(values) != 1 or os.path.realpath(os.fsdecode(values[0])) != workspace:
    raise ValueError("workspace differs")
with open(f"/proc/{pid}/stat", encoding="ascii") as source:
    contents = source.read()
start = contents[contents.rfind(")") + 2:].split()[19]
host = os.stat(workspace, follow_symlinks=False)
view = os.stat(f"/proc/{pid}/root{workspace}")
if (host.st_dev, host.st_ino) != (view.st_dev, view.st_ino):
    raise ValueError("workspace view differs")
if host.st_uid != pwd.getpwnam("sydney-desktop").pw_uid:
    raise ValueError("workspace owner differs")
print(f"{pid}:{start}:{host.st_dev}:{host.st_ino}")
PY
}

reject_nested_mounts() {
  /usr/bin/python3 -I - "$workspace" "$1" <<'PY'
import re
import sys

root = sys.argv[1].rstrip("/")
pid = int(sys.argv[2])
for filename in ("/proc/self/mountinfo", f"/proc/{pid}/mountinfo"):
    found = False
    with open(filename, encoding="utf-8", errors="strict") as source:
        for line in source:
            fields = line.rstrip("\n").split(" ")
            if len(fields) < 10 or "-" not in fields[6:]:
                raise ValueError("invalid mountinfo")
            encoded = fields[4]
            if re.search(r"\\(?![0-7]{3})", encoded):
                raise ValueError("invalid mount escape")
            path = re.sub(r"\\([0-7]{3})", lambda match: chr(int(match.group(1), 8)), encoded)
            if not path.startswith("/"):
                raise ValueError("invalid mount path")
            found = True
            if path.startswith(root + "/"):
                raise ValueError("nested mount")
    if not found:
        raise ValueError("empty mountinfo")
PY
}

tree_fingerprint() {
  /usr/bin/python3 -I - <<'PY'
import hashlib
import os
import pwd
import stat

root = "/proc/self/fd/8"
owner = pwd.getpwnam("sydney-desktop").pw_uid
device = os.fstat(8).st_dev
digest = hashlib.sha256()
count = 0
total = 0

def record(relative, info, link):
    global count, total
    count += 1
    if count > 200000:
        raise ValueError("too many entries")
    if info.st_dev != device or info.st_uid != owner:
        raise ValueError("unexpected device or owner")
    if stat.S_ISREG(info.st_mode):
        if info.st_nlink != 1:
            raise ValueError("hard links unsupported")
        total += info.st_size
        if total > 700 * 1024 * 1024:
            raise ValueError("workspace exceeds limit")
    elif not stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode):
        raise ValueError("special entry")
    values = (relative, info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
              info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns, link)
    digest.update(repr(values).encode("utf-8", errors="surrogateescape"))
    digest.update(b"\0")

if os.listxattr(8):
    raise ValueError("extended attributes unsupported")
record("", os.fstat(8), "")
for directory, dirs, files in os.walk(root, topdown=True, followlinks=False,
                                      onerror=lambda error: (_ for _ in ()).throw(error)):
    dirs.sort(key=os.fsencode)
    files.sort(key=os.fsencode)
    for name in dirs + files:
        path = os.path.join(directory, name)
        info = os.lstat(path)
        link = os.readlink(path) if stat.S_ISLNK(info.st_mode) else ""
        if os.listxattr(path, follow_symlinks=False):
            raise ValueError("extended attributes unsupported")
        record(os.path.relpath(path, root), info, link)
print(f"{count}:{total}:{digest.hexdigest()}")
PY
}

driver_before=$(driver_identity)
pid=${driver_before%%:*}
reject_nested_mounts "$pid"
exec 8<"$workspace"
[[ $(stat -Lc '%d:%i' /proc/self/fd/8) == "${driver_before#*:*:}" ]] || exit 1
before=$(tree_fingerprint 2>/dev/null) || { printf '%s\n' 'Workspace inspection failed.' >&2; exit 1; }
[[ $(driver_identity) == "$driver_before" ]] || exit 1

scratch=$(mktemp -d /run/sydney-workspace-capture.XXXXXXXX)
cleanup() {
  local status=$?
  trap - EXIT
  case "$scratch" in
    /run/sydney-workspace-capture.*) rm -rf -- "$scratch" || status=1 ;;
    *) status=1 ;;
  esac
  exit "$status"
}
trap cleanup EXIT
export CAPTURE_ROOT="$root" CAPTURE_TOOL="$tool" CAPTURE_SCRATCH="$scratch"
timeout --kill-after=15s 900 /bin/bash -p -o pipefail -c '
  set -C
  set +e
  nice -n 19 tar --create --format=pax --numeric-owner --acls --xattrs \
    --xattrs-include="*" --one-file-system --use-compress-program="gzip -1" \
    --file - --directory /proc/self/fd/8 . 2>"$CAPTURE_SCRATCH/tar.err" |
    (ulimit -f 819200; exec nice -n 19 "$CAPTURE_TOOL/unpacked/usr/bin/age" \
      -R "$CAPTURE_TOOL/recipient") > "$CAPTURE_ROOT/native-workspace.tgz.age.partial"
  status=("${PIPESTATUS[@]}")
  printf "tar_exit=%s age_exit=%s\n" "${status[0]}" "${status[1]}"
  test "${status[0]}" = 0 && test "${status[1]}" = 0 && test ! -s "$CAPTURE_SCRATCH/tar.err"
'

[[ $(driver_identity) == "$driver_before" ]] || exit 1
reject_nested_mounts "$pid"
after=$(tree_fingerprint 2>/dev/null) || { printf '%s\n' 'Workspace reinspection failed.' >&2; exit 1; }
[[ $after == "$before" ]] || exit 1
[[ -s $partial ]] || exit 1
[[ $(df -Pk -- "$root" | awk 'NR==2 {print $4}') -ge 131072 ]] || exit 1
ln -- "$partial" "$final"
rm -- "$partial"
printf 'ciphertext_bytes='
stat -c '%s' "$final"
sha256sum "$final"
printf '%s\n' 'workspace_capture_complete_consistency_unverified'
