#!/bin/bash -p
set -euo pipefail

if [[ $- != *p* ]]; then
  builtin printf '%s\n' 'Invoke this receiver with /bin/bash -p.' >&2
  exit 1
fi

PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH

[[ $EUID == 0 ]] || exit 1
[[ ! -L $0 && -f $0 ]] || exit 1
script_mode=$(stat -c '%u:%g:%a' "$0")
[[ $script_mode == 0:0:600 || $script_mode == 0:0:700 ]] || exit 1
if [[ $# == 0 ]]; then
  exec /usr/bin/unshare --mount --propagation private /bin/bash -p "$0" --private-namespace
fi
[[ $# == 1 && $1 == --private-namespace ]] || exit 1
[[ $(readlink /proc/self/ns/mnt) != "$(readlink /proc/1/ns/mnt)" ]] || exit 1

root=/var/backups/sydney-ip-migration/image-recv-20261111
backing=/var/backups/sydney-ip-migration/image-recv-20261111.ext4
receiver=/usr/bin/rrsync

[[ ! -L $root && -d $root && ! -L $backing && -f $backing ]] || exit 1
[[ $(stat -c '%u:%g:%a' "$root") == 0:0:700 ]] || exit 1
[[ $(stat -c '%u:%g:%a' "$backing") == 0:0:600 ]] || exit 1
[[ ! -L $receiver && -f $receiver && -x $receiver ]] || exit 1
[[ $(stat -c '%u:%g:%a' "$receiver") == 0:0:755 ]] || exit 1
[[ $(findmnt -n -o TARGET --target "$root") == "$root" ]] || exit 1
[[ $(findmnt -n -o FSTYPE --target "$root") == ext4 ]] || exit 1
device=$(findmnt -n -o SOURCE --target "$root")
[[ $device =~ ^/dev/loop[0-9]+$ ]] || exit 1
[[ $(realpath -e -- "$(losetup -n -O BACK-FILE "$device")") == "$backing" ]] || exit 1
options=,$(findmnt -n -o OPTIONS --target "$root"),
for option in nodev nosuid noexec; do
  [[ $options == *,$option,* ]] || exit 1
done

exec "$receiver" -wo -no-del -- "$root"
