import type * as fs from "node:fs/promises";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readWorkspaceGrant,
  readWorkspaceGrantDirectory,
  revokeWorkspaceGrant,
  saveWorkspaceGrant,
} from "./workspace-grants.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof fs>();
  return { ...original, rm: vi.fn(original.rm) };
});

const scope = { origin: "https://example.com", userId: "user-1", deviceId: "device-1" };
let userData: string;
let directory: string;

beforeEach(async () => {
  userData = await mkdtemp(path.join(tmpdir(), "workspace-grants-"));
  directory = path.join(userData, "private-selected-directory");
});

afterEach(async () => {
  vi.mocked(rm).mockRestore();
  await rm(userData, { recursive: true, force: true, maxRetries: 5 });
});

async function storedFile(): Promise<string> {
  const root = path.join(userData, "workspace-grants");
  const [scopeDirectory] = await readdir(root);
  if (!scopeDirectory) throw new Error("Missing scope directory");
  const [name] = await readdir(path.join(root, scopeDirectory));
  if (!name) throw new Error("Missing grant file");
  return path.join(root, scopeDirectory, name);
}

describe("workspace grant storage", () => {
  it("isolates origin, verified user and device and exposes no path in summaries", async () => {
    const first = await saveWorkspaceGrant(userData, scope, directory);
    const second = await saveWorkspaceGrant(userData, scope, directory);
    expect(first.id).not.toBe(second.id);
    expect(first).toEqual({ id: expect.any(String), intent: "read-only" });
    expect(JSON.stringify(first)).not.toContain(directory);
    expect(await readWorkspaceGrant(userData, scope, first.id)).toEqual(first);
    expect(await readWorkspaceGrantDirectory(userData, scope, first.id)).toBe(directory);
    for (const other of [
      { ...scope, origin: "https://other.example.com" },
      { ...scope, userId: "user-2" },
      { ...scope, deviceId: "device-2" },
    ]) {
      expect(await readWorkspaceGrant(userData, other, first.id)).toBeNull();
      expect(await readWorkspaceGrantDirectory(userData, other, first.id)).toBeNull();
      await revokeWorkspaceGrant(userData, other, first.id);
    }
    expect(await readWorkspaceGrant(userData, scope, first.id)).toEqual(first);
    const file = await storedFile();
    expect(file).not.toContain(directory);
    if (process.platform !== "win32") expect((await stat(file)).mode & 0o077).toBe(0);
  });

  it("revokes only the selected grant and never deletes the directory", async () => {
    await mkdir(directory);
    await writeFile(path.join(directory, "keep.txt"), "keep");
    const first = await saveWorkspaceGrant(userData, scope, directory);
    const second = await saveWorkspaceGrant(userData, scope, directory);
    await revokeWorkspaceGrant(userData, scope, first.id);
    expect(await readWorkspaceGrant(userData, scope, first.id)).toBeNull();
    expect(await readWorkspaceGrantDirectory(userData, scope, first.id)).toBeNull();
    expect(await readWorkspaceGrant(userData, scope, second.id)).toEqual(second);
    expect(await readFile(path.join(directory, "keep.txt"), "utf8")).toBe("keep");
    await revokeWorkspaceGrant(userData, scope, first.id);
  });

  it("fails closed for malformed, mismatched and oversized records", async () => {
    const grant = await saveWorkspaceGrant(userData, scope, directory);
    const file = await storedFile();
    const original = await readFile(file, "utf8");
    for (const contents of [
      "{",
      JSON.stringify({ ...JSON.parse(original), scope: { ...scope, userId: "other" } }),
      "x".repeat(32 * 1024 + 1),
    ]) {
      await writeFile(file, contents);
      await expect(readWorkspaceGrant(userData, scope, grant.id)).rejects.toThrow();
      await expect(readWorkspaceGrantDirectory(userData, scope, grant.id)).rejects.toThrow();
    }
    await revokeWorkspaceGrant(userData, scope, grant.id);
    expect(await readWorkspaceGrant(userData, scope, grant.id)).toBeNull();
  });

  it("rejects a valid-looking record whose authorized directory was changed", async () => {
    const grant = await saveWorkspaceGrant(userData, scope, directory);
    const file = await storedFile();
    const original = await readFile(file, "utf8");
    const otherDirectory = path.join(userData, "different-directory");
    await writeFile(file, JSON.stringify({ ...JSON.parse(original), directory: otherDirectory }));

    await expect(readWorkspaceGrant(userData, scope, grant.id)).rejects.toThrow(
      "Workspace grant is invalid",
    );
    await expect(readWorkspaceGrantDirectory(userData, scope, grant.id)).rejects.toThrow(
      "Workspace grant is invalid",
    );
    await writeFile(file, original);
    expect(await readWorkspaceGrantDirectory(userData, scope, grant.id)).toBe(directory);
  });

  it("reports failed revocation without leaking paths and blocks reads until retry succeeds", async () => {
    const grant = await saveWorkspaceGrant(userData, scope, directory);
    const file = await storedFile();
    vi.mocked(rm).mockImplementationOnce(async () => {
      throw new Error(`private failure ${directory} ${file}`);
    });
    await expect(revokeWorkspaceGrant(userData, scope, grant.id)).rejects.toThrow(
      "Could not revoke workspace grant",
    );
    await expect(readWorkspaceGrant(userData, scope, grant.id)).rejects.toThrow(
      "Workspace grant is unavailable",
    );
    await expect(readWorkspaceGrantDirectory(userData, scope, grant.id)).rejects.toThrow();
    await revokeWorkspaceGrant(userData, scope, grant.id);
    expect(await readWorkspaceGrant(userData, scope, grant.id)).toBeNull();
  });

  it("does not restore saved grants after a module restart, including failed revocations", async () => {
    const retained = await saveWorkspaceGrant(userData, scope, directory);
    const revoked = await saveWorkspaceGrant(userData, scope, directory);
    vi.mocked(rm).mockImplementationOnce(async () => {
      throw new Error("delete failed");
    });
    await expect(revokeWorkspaceGrant(userData, scope, revoked.id)).rejects.toThrow(
      "Could not revoke workspace grant",
    );
    const scopeDirectory = path.dirname(await storedFile());
    expect(await readdir(scopeDirectory)).toEqual(
      expect.arrayContaining([`${retained.id}.json`, `${revoked.id}.json`]),
    );

    vi.resetModules();
    const restarted = await import("./workspace-grants.js");
    for (const grant of [retained, revoked]) {
      expect(await restarted.readWorkspaceGrant(userData, scope, grant.id)).toBeNull();
      expect(await restarted.readWorkspaceGrantDirectory(userData, scope, grant.id)).toBeNull();
    }
    await restarted.revokeWorkspaceGrant(userData, scope, revoked.id);
    const fresh = await restarted.saveWorkspaceGrant(userData, scope, directory);
    expect(await restarted.readWorkspaceGrant(userData, scope, fresh.id)).toEqual(fresh);
  });

  it("rejects missing identity, non-origin URLs and invalid identifiers", async () => {
    for (const invalid of [
      { ...scope, userId: "" },
      { ...scope, deviceId: "" },
      { ...scope, origin: "https://example.com/path" },
    ]) {
      await expect(saveWorkspaceGrant(userData, invalid, directory)).rejects.toThrow();
    }
    await expect(readWorkspaceGrant(userData, scope, "../secret")).rejects.toThrow();
  });
});
