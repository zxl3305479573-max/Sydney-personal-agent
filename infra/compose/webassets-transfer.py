#!/usr/bin/env python3
import base64
import hashlib
import json
import shlex
import subprocess
import sys


SOURCE_HOST = "sydney-cloud-admin"
TARGET_HOST = "sydney-backend-admin"
CHUNK = 4 * 1024 * 1024
MANIFEST_SHA256 = "ff9fd8dea119239b4afead69629f73b35767cb417ba4f2912a28e576429cfc07"
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20",
       "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3"]

REMOTE = r'''
import hashlib,json,os,re,secrets,stat,subprocess,sys

def command(args):
    return subprocess.check_output(args,timeout=20,stderr=subprocess.DEVNULL).decode().strip()

def guard(stage,backing):
    if os.readlink('/proc/self/ns/mnt')==os.readlink('/proc/1/ns/mnt'):
        raise ValueError('mount namespace')
    fields=command(['/usr/bin/findmnt','-n','-o','TARGET,SOURCE,FSTYPE,OPTIONS','--target',stage]).split()
    if (len(fields)!=4 or fields[0]!=stage or not re.fullmatch(r'/dev/loop[0-9]+',fields[1])
            or fields[2]!='ext4' or not {'nodev','nosuid','noexec'}<=set(fields[3].split(','))):
        raise ValueError('mount identity')
    if os.path.realpath(command(['/usr/sbin/losetup','-n','-O','BACK-FILE',fields[1]]))!=backing:
        raise ValueError('mount backing')
    for path,kind,mode in ((stage,stat.S_ISDIR,0o700),(backing,stat.S_ISREG,0o600)):
        info=os.lstat(path)
        if not kind(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=mode:
            raise ValueError('mount permissions')

def source_dir():
    stage='/var/backups/sydney-webassets-staging-20261112'
    guard(stage,'/var/lib/sydney-backup/webassets-staging-20261112.ext4')
    path=stage+'/capture-20261112'
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    info=os.fstat(fd)
    if info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o700:
        os.close(fd); raise ValueError('source directory')
    names=['manifest.age']+[f'part-{number:04d}.age' for number in range(12)]
    if set(os.listdir(fd))!=set(names):
        os.close(fd); raise ValueError('source file set')
    return fd,names

def target_dir():
    stage='/var/backups/sydney-ip-migration/webassets-recv-20261112'
    guard(stage,'/var/backups/sydney-ip-migration/webassets-recv-20261112.ext4')
    space=os.statvfs(stage)
    if space.f_bavail*space.f_frsize < 256*1024*1024:
        raise ValueError('target space')
    path=stage+'/chunks'
    try: os.mkdir(path,0o700)
    except FileExistsError: pass
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    info=os.fstat(fd)
    if info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o700:
        os.close(fd); raise ValueError('target directory')
    return fd

def source_file(fd,name):
    entry=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)
    info=os.fstat(entry)
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o600 or not 0<info.st_size<=40*1024*1024:
        os.close(entry); raise ValueError('source file')
    return entry,info

def manifest():
    fd,names=source_dir(); result=[]
    try:
        for name in names:
            entry,info=source_file(fd,name); whole=hashlib.sha256(); chunks=[]
            try:
                offset=0
                while offset<info.st_size:
                    block=os.pread(entry,min(4*1024*1024,info.st_size-offset),offset)
                    if not block: raise ValueError('short read')
                    chunks.append(hashlib.sha256(block).hexdigest()); whole.update(block); offset+=len(block)
                after=os.fstat(entry)
                if (info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns,info.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):
                    raise ValueError('source changed')
            finally: os.close(entry)
            result.append({'name':name,'size':info.st_size,'sha256':whole.hexdigest(),'chunks':chunks})
    finally: os.close(fd)
    print(json.dumps(result))

def source_chunk(index,part,length,digest):
    fd,names=source_dir()
    try:
        entry,info=source_file(fd,names[index])
        try: data=os.pread(entry,length,part*4*1024*1024)
        finally: os.close(entry)
    finally: os.close(fd)
    if len(data)!=length or hashlib.sha256(data).hexdigest()!=digest:
        raise ValueError('source chunk mismatch')
    sys.stdout.buffer.write(data)

def existing(items):
    fd=target_dir(); present=[]
    try:
        for item in items:
            name=f'{item[0]:04d}-{item[1]:04d}.chunk'
            try: entry=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)
            except FileNotFoundError: continue
            try:
                info=os.fstat(entry)
                if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o600 or info.st_size!=item[2]:
                    raise ValueError('existing chunk metadata')
                digest=hashlib.sha256()
                while True:
                    block=os.read(entry,1024*1024)
                    if not block: break
                    digest.update(block)
                if digest.hexdigest()!=item[3]: raise ValueError('existing chunk checksum')
                present.append([item[0],item[1]])
            finally: os.close(entry)
    finally: os.close(fd)
    print(json.dumps(present))

def receive(index,part,length,digest):
    fd=target_dir(); temp='.partial-'+secrets.token_hex(16); opened=None
    try:
        data=sys.stdin.buffer.read(length+1)
        if len(data)!=length or hashlib.sha256(data).hexdigest()!=digest:
            raise ValueError('received chunk mismatch')
        name=f'{index:04d}-{part:04d}.chunk'
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

def assemble(manifest):
    chunks=target_dir()
    stage='/var/backups/sydney-ip-migration/webassets-recv-20261112'
    path=stage+'/capture-20261112'
    try:
        try: os.mkdir(path,0o700)
        except FileExistsError: pass
        output_dir=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:
            info=os.fstat(output_dir)
            if info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o700:
                raise ValueError('output directory')
            for index,item in enumerate(manifest):
                name=item['name']; size=item['size']; expected=item['sha256']
                try: existing_fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=output_dir)
                except FileNotFoundError: existing_fd=None
                if existing_fd is not None:
                    try:
                        info=os.fstat(existing_fd); digest=hashlib.sha256()
                        if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o600 or info.st_size!=size:
                            raise ValueError('existing output metadata')
                        while True:
                            data=os.read(existing_fd,1024*1024)
                            if not data: break
                            digest.update(data)
                        if digest.hexdigest()!=expected: raise ValueError('existing output checksum')
                    finally: os.close(existing_fd)
                    continue
                temp='.partial-'+secrets.token_hex(16); out=None
                try:
                    out=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=output_dir)
                    digest=hashlib.sha256(); length=0
                    with os.fdopen(out,'wb') as target:
                        out=None
                        for part,chunk_digest in enumerate(item['chunks']):
                            chunk_name=f'{index:04d}-{part:04d}.chunk'
                            chunk=os.open(chunk_name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=chunks)
                            try:
                                info=os.fstat(chunk); expected_size=min(4*1024*1024,size-part*4*1024*1024)
                                if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o600 or info.st_size!=expected_size:
                                    raise ValueError('chunk metadata')
                                data=b''
                                while len(data)<expected_size:
                                    block=os.read(chunk,expected_size-len(data))
                                    if not block: raise ValueError('short chunk')
                                    data+=block
                                if hashlib.sha256(data).hexdigest()!=chunk_digest: raise ValueError('chunk checksum')
                                target.write(data); digest.update(data); length+=len(data)
                            finally: os.close(chunk)
                        if length!=size or digest.hexdigest()!=expected: raise ValueError('assembled checksum')
                        target.flush(); os.fsync(target.fileno())
                    os.link(temp,name,src_dir_fd=output_dir,dst_dir_fd=output_dir,follow_symlinks=False)
                    os.unlink(temp,dir_fd=output_dir); os.fsync(output_dir)
                finally:
                    if out is not None: os.close(out)
                    try: os.unlink(temp,dir_fd=output_dir)
                    except FileNotFoundError: pass
            print('assembled_files='+str(len(manifest)))
        finally: os.close(output_dir)
    finally: os.close(chunks)
'''


def remote(host, expression, data=None, timeout=90):
    code = REMOTE + "\n" + expression + "\n"
    encoded = base64.b64encode(code.encode()).decode()
    program = "import base64;exec(base64.b64decode(" + repr(encoded) + "))"
    command = "unshare --mount --propagation private /usr/bin/python3 -c " + shlex.quote(program)
    try:
        result = subprocess.run(SSH + [host, command], input=data, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, timeout=timeout, check=True)
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(f"{host}: remote operation timed out") from error
    except subprocess.CalledProcessError as error:
        raise RuntimeError(f"{host}: remote operation exited {error.returncode}") from error
    return result.stdout


def main():
    if (len(sys.argv) != 2 or
            (sys.argv[1] != "--assemble" and
             (not sys.argv[1].isdigit() or not 1 <= int(sys.argv[1]) <= 50))):
        raise ValueError("provide maximum chunks")
    manifest = json.loads(remote(SOURCE_HOST, "manifest()"))
    canonical = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    if hashlib.sha256(canonical).hexdigest() != MANIFEST_SHA256:
        raise ValueError("source ciphertext manifest changed")
    expected = ["manifest.age"] + [f"part-{number:04d}.age" for number in range(12)]
    if not isinstance(manifest, list) or [item.get("name") for item in manifest] != expected:
        raise ValueError("invalid manifest")
    items = []
    for index, item in enumerate(manifest):
        size = item.get("size")
        digests = item.get("chunks")
        if (type(size) is not int or not 0 < size <= 40 * 1024 * 1024
                or not isinstance(digests, list) or len(digests) != (size + CHUNK - 1) // CHUNK
                or any(not isinstance(value, str) or len(value) != 64 for value in digests)
                or not isinstance(item.get("sha256"), str) or len(item["sha256"]) != 64):
            raise ValueError("invalid source metadata")
        for part, digest in enumerate(digests):
            items.append([index, part, min(CHUNK, size - part * CHUNK), digest])
    present = {tuple(value) for value in json.loads(remote(TARGET_HOST, "existing(" + repr(items) + ")"))}
    if sys.argv[1] == "--assemble":
        if len(present) != len(items):
            raise ValueError("missing chunks")
        print(remote(TARGET_HOST, "assemble(" + repr(manifest) + ")", timeout=180).decode().strip())
        return
    transferred = 0
    for index, part, length, digest in items:
        if (index, part) in present:
            continue
        payload = remote(SOURCE_HOST, f"source_chunk({index},{part},{length},{digest!r})")
        if len(payload) != length or hashlib.sha256(payload).hexdigest() != digest:
            raise ValueError("local chunk mismatch")
        remote(TARGET_HOST, f"receive({index},{part},{length},{digest!r})", payload)
        transferred += 1
        print(f"chunk_verified={len(present) + transferred}/{len(items)}", flush=True)
        if transferred >= int(sys.argv[1]):
            break
    print(f"verified_before={len(present)} transferred={transferred} total={len(items)}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        raise SystemExit(f"Transfer incomplete ({type(error).__name__}: {error}); inspect both hosts before retry.")
