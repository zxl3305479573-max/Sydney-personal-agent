import { read as readCb } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ProjectFileOperation, ProjectFileResult } from "@rakazo/contracts";
import { PROJECT_FILE_MAX_BYTES, ProjectFileOperationSchema } from "@rakazo/contracts";
import { normalizeDesktopWorkspacePath } from "./desktop-sandbox-paths.js";
import {
  assertPlainWindowsHandle,
  openProjectChildWin32,
  pathFromDirectoryFd,
  win32NtRelativeAvailable,
} from "./desktop-sandbox-win32-path.js";

const read = promisify(readCb);
type DirectoryHandle = Awaited<ReturnType<typeof open>> | ReturnType<typeof openProjectChildWin32>;
export type WindowsProjectRoot = { directory: string; dev: bigint; ino: bigint };

async function withDirectory<T>(
  directory: string,
  work: (handle: DirectoryHandle) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const root = path.win32.parse(directory).root;
  if (!win32NtRelativeAvailable() || !/^[A-Z]:\\$/iu.test(root) ||
    path.win32.normalize(directory) !== directory) {
    throw new Error("A local Windows project folder is required");
  }
  signal?.throwIfAborted();
  const handles: DirectoryHandle[] = [];
  try {
    let handle: DirectoryHandle = await open(root, "r");
    handles.push(handle);
    assertPlainWindowsHandle(handle.fd);
    if (path.win32.relative(pathFromDirectoryFd(handle.fd), root)) {
      throw new Error("The project drive changed");
    }
    const relative = directory.slice(root.length);
    if (relative) {
      for (const name of relative.split("\\")) {
        signal?.throwIfAborted();
        handle = openProjectChildWin32(handle.fd, name, "directory");
        handles.push(handle);
      }
    }
    return await work(handle);
  } finally {
    for (const handle of handles.reverse()) await handle.close().catch(() => undefined);
  }
}

export function captureWindowsProjectRoot(directory: string): Promise<WindowsProjectRoot> {
  return withDirectory(directory, async (handle) => {
    const info = await handle.stat({ bigint: true });
    if (!info.isDirectory() || BigInt(info.ino) === 0n)
      throw new Error("Project folder identity is unavailable");
    return { directory, dev: BigInt(info.dev), ino: BigInt(info.ino) };
  });
}

export function executeWindowsProjectFile(
  root: WindowsProjectRoot,
  input: ProjectFileOperation,
  signal: AbortSignal,
): Promise<ProjectFileResult> {
  const request = ProjectFileOperationSchema.parse(input);
  normalizeDesktopWorkspacePath(request.path, "win32");
  const parts = request.path.split("/");
  const leaf = parts.pop()!;
  return withDirectory(root.directory, async (directory) => {
    const info = await directory.stat({ bigint: true });
    if (!info.isDirectory() || BigInt(info.dev) !== root.dev || BigInt(info.ino) !== root.ino) {
      throw new Error("The authorized project folder changed");
    }
    const parents: ReturnType<typeof openProjectChildWin32>[] = [];
    let parent = directory;
    try {
      for (const name of parts) {
        signal.throwIfAborted();
        parent = openProjectChildWin32(parent.fd, name, "directory");
        parents.push(parent);
      }
      signal.throwIfAborted();
      const file = openProjectChildWin32(parent.fd, leaf, request.operation);
      try {
        if (request.operation === "create") {
          const bytes = Buffer.from(request.text, "utf8");
          await file.writeFile(bytes);
          signal.throwIfAborted();
          return { operation: "create", bytes: bytes.length };
        }
        const stat = await file.stat({ bigint: true });
        if (!stat.isFile() || BigInt(stat.nlink) !== 1n || BigInt(stat.size) > BigInt(PROJECT_FILE_MAX_BYTES)) {
          throw new Error("Project file is unavailable or too large");
        }
        const buffer = Buffer.alloc(PROJECT_FILE_MAX_BYTES + 1);
        let offset = 0;
        while (offset < buffer.length) {
          signal.throwIfAborted();
          const { bytesRead } = await read(file.fd, buffer, offset, buffer.length - offset, offset);
          if (bytesRead === 0) break;
          offset += bytesRead;
        }
        signal.throwIfAborted();
        if (offset > PROJECT_FILE_MAX_BYTES) throw new Error("Project file is too large");
        return { operation: "read", text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, offset)) };
      } finally {
        await file.close();
      }
    } finally {
      for (const handle of parents.reverse()) await handle.close().catch(() => undefined);
    }
  }, signal);
}
