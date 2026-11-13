import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { readPrivateFile, writePrivateFile } from "./setup-store.js";

export interface WorkspaceGrantScope {
  origin: string;
  userId: string;
  deviceId: string;
}

export interface WorkspaceGrantSummary {
  id: string;
  intent: "read-only";
}

interface StoredGrant extends WorkspaceGrantSummary {
  version: 1;
  scope: WorkspaceGrantScope;
  directory: string;
}

const MAX_BYTES = 32 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const queues = new Map<string, Promise<void>>();
const blocked = new Set<string>();
const active = new Map<string, string>();

function validateScope(scope: WorkspaceGrantScope): void {
  try {
    const parsed = new URL(scope.origin);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== scope.origin ||
      !scope.userId ||
      !scope.deviceId ||
      scope.userId.length > 1024 ||
      scope.deviceId.length > 1024 ||
      scope.userId.trim() !== scope.userId ||
      scope.deviceId.trim() !== scope.deviceId
    )
      throw new Error();
  } catch {
    throw new Error("Invalid workspace grant scope");
  }
}

function grantFile(userDataDir: string, scope: WorkspaceGrantScope, id: string): string {
  validateScope(scope);
  if (!UUID.test(id)) throw new Error("Invalid workspace grant identifier");
  const digest = createHash("sha256")
    .update(JSON.stringify([scope.origin, scope.userId, scope.deviceId]))
    .digest("hex");
  return path.resolve(userDataDir, "workspace-grants", digest, `${id}.json`);
}

async function serial<T>(file: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(file) ?? Promise.resolve();
  const result = previous.then(operation);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  queues.set(file, settled);
  try {
    return await result;
  } finally {
    if (queues.get(file) === settled) queues.delete(file);
  }
}

async function load(
  file: string,
  scope: WorkspaceGrantScope,
  id: string,
  expected: string,
): Promise<StoredGrant | null> {
  const raw = await readPrivateFile(file, MAX_BYTES);
  if (raw === null) {
    try {
      await lstat(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    }
    throw new Error("Workspace grant is unavailable");
  }
  try {
    if (raw !== expected) throw new Error();
    const grant: unknown = JSON.parse(raw);
    if (!grant || typeof grant !== "object" || Array.isArray(grant)) throw new Error();
    const record = grant as StoredGrant;
    if (
      record.version !== 1 ||
      record.id !== id ||
      record.intent !== "read-only" ||
      record.scope?.origin !== scope.origin ||
      record.scope?.userId !== scope.userId ||
      record.scope?.deviceId !== scope.deviceId ||
      typeof record.directory !== "string" ||
      !path.isAbsolute(record.directory) ||
      record.directory.includes("\0")
    )
      throw new Error();
    return record;
  } catch {
    throw new Error("Workspace grant is invalid");
  }
}

/** The caller must obtain the directory from a trusted local user selection and verify the scope.
 * Grants are valid only in this process; a restart requires a new user selection.
 */
export async function saveWorkspaceGrant(
  userDataDir: string,
  scope: WorkspaceGrantScope,
  directory: string,
): Promise<WorkspaceGrantSummary> {
  if (typeof directory !== "string" || !path.isAbsolute(directory) || directory.includes("\0")) {
    throw new Error("Invalid workspace directory");
  }
  const id = randomUUID();
  const file = grantFile(userDataDir, scope, id);
  const record: StoredGrant = {
    version: 1,
    id,
    scope: { ...scope },
    directory,
    intent: "read-only",
  };
  const contents = JSON.stringify(record);
  if (Buffer.byteLength(contents) > MAX_BYTES) throw new Error("Workspace grant is too large");
  try {
    await serial(file, async () => {
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await writePrivateFile(file, contents);
      active.set(file, contents);
    });
  } catch {
    throw new Error("Could not save workspace grant");
  }
  return { id, intent: "read-only" };
}

/** Returns only an opaque identifier and the recorded intent. */
export async function readWorkspaceGrant(
  userDataDir: string,
  scope: WorkspaceGrantScope,
  id: string,
): Promise<WorkspaceGrantSummary | null> {
  const file = grantFile(userDataDir, scope, id);
  return serial(file, async () => {
    if (blocked.has(file)) throw new Error("Workspace grant is unavailable");
    const expected = active.get(file);
    if (expected === undefined) return null;
    const record = await load(file, scope, id, expected);
    return record ? { id: record.id, intent: record.intent } : null;
  });
}

/** Main-process only; does not establish that a directory is safe to access. */
export async function readWorkspaceGrantDirectory(
  userDataDir: string,
  scope: WorkspaceGrantScope,
  id: string,
): Promise<string | null> {
  const file = grantFile(userDataDir, scope, id);
  return serial(file, async () => {
    if (blocked.has(file)) throw new Error("Workspace grant is unavailable");
    const expected = active.get(file);
    if (expected === undefined) return null;
    return (await load(file, scope, id, expected))?.directory ?? null;
  });
}

export async function revokeWorkspaceGrant(
  userDataDir: string,
  scope: WorkspaceGrantScope,
  id: string,
): Promise<void> {
  const file = grantFile(userDataDir, scope, id);
  blocked.add(file);
  active.delete(file);
  await serial(file, async () => {
    try {
      await rm(file, { force: true });
      blocked.delete(file);
    } catch {
      throw new Error("Could not revoke workspace grant");
    }
  });
}
