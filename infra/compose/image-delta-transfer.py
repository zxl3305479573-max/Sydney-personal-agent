#!/usr/bin/env python3
import base64
import hashlib
import json
import shlex
import subprocess
import sys


SOURCE_HOST = "sydney-cloud-admin"
TARGET_HOST = "sydney-backend-admin"
SIZE = 77423256
DIGEST = "9bb6b8dd96da048c34300dd2394fe57b58fe5306a074e1c37102e8cf3bc75a2f"
CHUNK = 4 * 1024 * 1024
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20",
       "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3"]

REMOTE = r'''
import hashlib,json,os,pathlib,re,secrets,stat,subprocess,sys

def command(args):
    return subprocess.check_output(args,timeout=15,stderr=subprocess.DEVNULL).decode().strip()

def guard(stage,backing):
    if os.readlink('/proc/self/ns/mnt')==os.readlink('/proc/1/ns/mnt'):
        raise ValueError('mount namespace')
    if command(['/usr/bin/findmnt','-n','-o','TARGET','--target',stage])!=stage:
        raise ValueError('mount target')
    if command(['/usr/bin/findmnt','-n','-o','FSTYPE','--target',stage])!='ext4':
        raise ValueError('mount type')
    device=command(['/usr/bin/findmnt','-n','-o','SOURCE','--target',stage])
    if not re.fullmatch(r'/dev/loop[0-9]+',device):
        raise ValueError('mount device')
    if os.path.realpath(command(['/usr/sbin/losetup','-n','-O','BACK-FILE',device]))!=backing:
        raise ValueError('mount backing')
    options=set(command(['/usr/bin/findmnt','-n','-o','OPTIONS','--target',stage]).split(','))
    if not {'nodev','nosuid','noexec'} <= options:
        raise ValueError('mount options')
    for path,kind,mode in ((stage,stat.S_ISDIR,0o700),(backing,stat.S_ISREG,0o600)):
        info=os.lstat(path)
        if not kind(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=mode:
            raise ValueError('mount path')

def source_file():
    stage='/var/backups/sydney-image-staging-20261111'
    guard(stage,'/var/lib/sydney-backup/image-staging-20261111.ext4')
    path=stage+'/rollback-delta-20261112.age'
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    info=os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o600 or info.st_size!=77423256:
        os.close(fd); raise ValueError('source identity')
    return fd

def target_dir():
    stage='/var/backups/sydney-ip-migration/image-recv-20261111'
    guard(stage,'/var/backups/sydney-ip-migration/image-recv-20261111.ext4')
    if os.statvfs(stage).f_bavail*os.statvfs(stage).f_frsize < 200*1024*1024:
        raise ValueError('target space')
    path=stage+'/rollback-delta-chunks-20261112'
    try: os.mkdir(path,0o700)
    except FileExistsError: pass
    info=os.lstat(path)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o700:
        raise ValueError('target directory')
    return os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)

def digest_file(fd):
    digest=hashlib.sha256()
    while True:
        block=os.read(fd,1024*1024)
        if not block: return digest.hexdigest()
        digest.update(block)

def manifest():
    fd=source_file(); total=hashlib.sha256(); chunks=[]; offset=0
    try:
        while offset<77423256:
            length=min(4*1024*1024,77423256-offset)
            block=os.pread(fd,length,offset)
            if len(block)!=length: raise ValueError('short source read')
            total.update(block); chunks.append(hashlib.sha256(block).hexdigest())
            offset+=len(block)
    finally: os.close(fd)
    if total.hexdigest()!='9bb6b8dd96da048c34300dd2394fe57b58fe5306a074e1c37102e8cf3bc75a2f':
        raise ValueError('source checksum')
    print(json.dumps(chunks))

def source_chunk(index,length,digest):
    fd=source_file()
    try: data=os.pread(fd,length,index*4*1024*1024)
    finally: os.close(fd)
    if len(data)!=length or hashlib.sha256(data).hexdigest()!=digest:
        raise ValueError('source chunk mismatch')
    sys.stdout.buffer.write(data)

def existing(digests):
    fd=target_dir(); found=[]
    try:
        for index,digest in enumerate(digests):
            name=f'{index:08d}.chunk'
            try: entry=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)
            except FileNotFoundError: continue
            try:
                info=os.fstat(entry)
                length=min(4*1024*1024,77423256-index*4*1024*1024)
                if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o600 or info.st_size!=length or digest_file(entry)!=digest:
                    raise ValueError('existing chunk mismatch')
                found.append(index)
            finally: os.close(entry)
    finally: os.close(fd)
    print(json.dumps(found))

def receive(index,length,digest):
    fd=target_dir(); temp='.partial-'+secrets.token_hex(16); opened=None
    try:
        data=sys.stdin.buffer.read(length+1)
        if len(data)!=length or hashlib.sha256(data).hexdigest()!=digest:
            raise ValueError('received chunk mismatch')
        name=f'{index:08d}.chunk'
        opened=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=fd)
        with os.fdopen(opened,'wb') as output:
            opened=None; output.write(data); output.flush(); os.fsync(output.fileno())
        os.link(temp,name,src_dir_fd=fd,dst_dir_fd=fd,follow_symlinks=False)
        os.unlink(temp,dir_fd=fd); os.fsync(fd)
    finally:
        if opened is not None: os.close(opened)
        try: os.unlink(temp,dir_fd=fd)
        except FileNotFoundError: pass
        os.close(fd)
'''


def remote(host, expression, data=None, timeout=50):
    code = REMOTE + "\n" + expression + "\n"
    encoded = base64.b64encode(code.encode()).decode()
    program = "import base64;exec(base64.b64decode(" + repr(encoded) + "))"
    command = "unshare --mount --propagation private /usr/bin/python3 -c " + shlex.quote(program)
    result = subprocess.run(SSH + [host, command], input=data, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, timeout=timeout, check=True)
    return result.stdout


def main():
    if len(sys.argv) != 2 or not sys.argv[1].isdigit() or not 1 <= int(sys.argv[1]) <= 19:
        raise ValueError("provide a maximum of 1 to 19 chunks")
    digests = json.loads(remote(SOURCE_HOST, "manifest()"))
    if (len(digests) != (SIZE + CHUNK - 1) // CHUNK
            or any(not isinstance(value, str) or len(value) != 64 for value in digests)):
        raise ValueError("invalid source manifest")
    present = set(json.loads(remote(TARGET_HOST, "existing(" + repr(digests) + ")")))
    transferred = 0
    for index, digest in enumerate(digests):
        if index in present:
            continue
        length = min(CHUNK, SIZE - index * CHUNK)
        payload = remote(SOURCE_HOST, f"source_chunk({index},{length},{digest!r})")
        if len(payload) != length or hashlib.sha256(payload).hexdigest() != digest:
            raise ValueError("local chunk mismatch")
        remote(TARGET_HOST, f"receive({index},{length},{digest!r})", payload)
        transferred += 1
        print(f"chunk_verified={index + 1}/{len(digests)}", flush=True)
        if transferred >= int(sys.argv[1]):
            break
    print(f"verified_before={len(present)} transferred={transferred} total={len(digests)}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        raise SystemExit("Chunk transfer did not complete; recheck both hosts before retrying.")
