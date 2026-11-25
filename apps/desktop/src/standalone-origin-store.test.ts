import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { standaloneSessionPartitionForServerUrl } from "./setup-config.js";
import {
  readStandaloneOriginRegistry,
  recordStandaloneOrigin,
  STANDALONE_ORIGINS_VERSION,
  StandaloneOriginStoreError,
  standaloneOriginsFilePath,
} from "./standalone-origin-store.js";

describe("standalone origin store", () => {
  let userDataDir: string;

  beforeEach(async () => {
    userDataDir = await mkdtemp(path.join(tmpdir(), "sydney-origin-store-"));
  });

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true });
  });

  it("returns an empty map when standalone-origins.json does not exist", async () => {
    const registry = await readStandaloneOriginRegistry(userDataDir);
    expect(registry.size).toBe(0);
  });

  it("persists canonical origins, ports, and partitions atomically and preserves concurrent writes", async () => {
    const originA = "https://124.221.182.39";
    const originB = "http://127.0.0.1:3100";
    const partitionA = standaloneSessionPartitionForServerUrl(originA)!;
    const partitionB = standaloneSessionPartitionForServerUrl(originB)!;

    await Promise.all([
      recordStandaloneOrigin(userDataDir, {
        remoteOrigin: originA,
        port: 49152,
        partition: partitionA,
      }),
      recordStandaloneOrigin(userDataDir, {
        remoteOrigin: originB,
        port: 49153,
        partition: partitionB,
      }),
    ]);

    const registry = await readStandaloneOriginRegistry(userDataDir);
    expect(registry.size).toBe(2);
    expect(registry.get(originA)).toEqual({
      remoteOrigin: originA,
      port: 49152,
      partition: partitionA,
    });
    expect(registry.get(originB)).toEqual({
      remoteOrigin: originB,
      port: 49153,
      partition: partitionB,
    });

    // Recording the exact same mapping is idempotent.
    await expect(
      recordStandaloneOrigin(userDataDir, {
        remoteOrigin: originA,
        port: 49152,
        partition: partitionA,
      }),
    ).resolves.toEqual({
      remoteOrigin: originA,
      port: 49152,
      partition: partitionA,
    });
  });

  it("fails closed without overwriting corrupt JSON or invalid schemas", async () => {
    const file = standaloneOriginsFilePath(userDataDir);
    const corruptRaw = "{not-valid-json";
    await writeFile(file, corruptRaw, "utf8");

    await expect(readStandaloneOriginRegistry(userDataDir)).rejects.toMatchObject({
      name: "StandaloneOriginStoreError",
      code: "corrupt",
    });

    const origin = "https://124.221.182.39";
    await expect(
      recordStandaloneOrigin(userDataDir, {
        remoteOrigin: origin,
        port: 50001,
        partition: standaloneSessionPartitionForServerUrl(origin)!,
      }),
    ).rejects.toBeInstanceOf(StandaloneOriginStoreError);

    // Original corrupt file is preserved for inspection/recovery.
    expect(await readFile(file, "utf8")).toBe(corruptRaw);
  });

  it("rejects duplicate ports, mismatched partitions, privileged ports, and directory collisions", async () => {
    const originA = "https://124.221.182.39";
    const originB = "https://pc.example.com";
    const partitionA = standaloneSessionPartitionForServerUrl(originA)!;
    const partitionB = standaloneSessionPartitionForServerUrl(originB)!;

    await expect(
      recordStandaloneOrigin(userDataDir, {
        remoteOrigin: originA,
        port: 80,
        partition: partitionA,
      }),
    ).rejects.toMatchObject({ code: "corrupt" });

    await expect(
      recordStandaloneOrigin(userDataDir, {
        remoteOrigin: originA,
        port: 50010,
        partition: partitionB,
      }),
    ).rejects.toMatchObject({ code: "corrupt" });

    await recordStandaloneOrigin(userDataDir, {
      remoteOrigin: originA,
      port: 50010,
      partition: partitionA,
    });

    // Different port for an already-registered origin is rejected without silent migration.
    await expect(
      recordStandaloneOrigin(userDataDir, {
        remoteOrigin: originA,
        port: 50011,
        partition: partitionA,
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    // Reusing an existing server's port for a second server is rejected.
    await expect(
      recordStandaloneOrigin(userDataDir, {
        remoteOrigin: originB,
        port: 50010,
        partition: partitionB,
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    // Corrupt duplicate-port file on disk is rejected on read.
    await writeFile(
      standaloneOriginsFilePath(userDataDir),
      JSON.stringify({
        version: STANDALONE_ORIGINS_VERSION,
        origins: {
          [originA]: { port: 50010, partition: partitionA },
          [originB]: { port: 50010, partition: partitionB },
        },
      }),
      "utf8",
    );
    await expect(readStandaloneOriginRegistry(userDataDir)).rejects.toMatchObject({
      code: "corrupt",
    });

    // Directory at the registry path fails closed as corrupt.
    await rm(standaloneOriginsFilePath(userDataDir), { force: true });
    await mkdir(standaloneOriginsFilePath(userDataDir));
    await expect(readStandaloneOriginRegistry(userDataDir)).rejects.toMatchObject({
      code: "corrupt",
    });
  });

  it("rejects symlinked registry files", async () => {
    const target = path.join(userDataDir, "real.json");
    await writeFile(target, JSON.stringify({ version: 1, origins: {} }), "utf8");
    try {
      await symlink(target, standaloneOriginsFilePath(userDataDir));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }
    await expect(readStandaloneOriginRegistry(userDataDir)).rejects.toMatchObject({
      code: "corrupt",
    });
  });
});
