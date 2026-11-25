import { lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import { normalizeServerUrl, standaloneSessionPartitionForServerUrl } from "./setup-config.js";
import { readPrivateFile, writePrivateFile } from "./setup-store.js";

export const STANDALONE_ORIGINS_FILE_NAME = "standalone-origins.json";
export const STANDALONE_ORIGINS_VERSION = 1;

const MAX_STANDALONE_ORIGINS_BYTES = 64 * 1024;
const MAX_STANDALONE_ORIGIN_ENTRIES = 256;
const MIN_LOOPBACK_PORT = 1024;
const MAX_LOOPBACK_PORT = 65_535;

export interface StandaloneOriginRecord {
  readonly remoteOrigin: string;
  readonly port: number;
  readonly partition: string;
}

export class StandaloneOriginStoreError extends Error {
  constructor(
    readonly code: "corrupt" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "StandaloneOriginStoreError";
  }
}

const writeQueues = new Map<string, Promise<void>>();

export function standaloneOriginsFilePath(userDataDir: string): string {
  return path.join(userDataDir, STANDALONE_ORIGINS_FILE_NAME);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isValidLoopbackPort(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_LOOPBACK_PORT &&
    value <= MAX_LOOPBACK_PORT
  );
}

function validateRecordInput(input: StandaloneOriginRecord): StandaloneOriginRecord {
  const normalized = normalizeServerUrl(input.remoteOrigin);
  if (normalized === null || normalized !== input.remoteOrigin) {
    throw new StandaloneOriginStoreError(
      "corrupt",
      "Standalone origin record requires a canonical HTTP(S) origin.",
    );
  }
  const expectedPartition = standaloneSessionPartitionForServerUrl(normalized);
  if (expectedPartition === null || input.partition !== expectedPartition) {
    throw new StandaloneOriginStoreError(
      "corrupt",
      "Standalone origin record partition does not match the server origin.",
    );
  }
  if (!isValidLoopbackPort(input.port)) {
    throw new StandaloneOriginStoreError(
      "corrupt",
      "Standalone origin record port must be an integer between 1024 and 65535.",
    );
  }
  return {
    remoteOrigin: normalized,
    port: input.port,
    partition: expectedPartition,
  };
}

function parseRegistryJson(raw: string): Map<string, StandaloneOriginRecord> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StandaloneOriginStoreError(
      "corrupt",
      "Local renderer origin registry contains invalid JSON.",
    );
  }
  if (
    !isPlainRecord(parsed) ||
    parsed.version !== STANDALONE_ORIGINS_VERSION ||
    !isPlainRecord(parsed.origins)
  ) {
    throw new StandaloneOriginStoreError(
      "corrupt",
      "Local renderer origin registry has an unsupported format.",
    );
  }

  const entries = Object.entries(parsed.origins);
  if (entries.length > MAX_STANDALONE_ORIGIN_ENTRIES) {
    throw new StandaloneOriginStoreError(
      "corrupt",
      "Local renderer origin registry exceeds the maximum entry count.",
    );
  }

  const records = new Map<string, StandaloneOriginRecord>();
  const usedPorts = new Set<number>();
  const usedPartitions = new Set<string>();

  for (const [key, value] of entries) {
    if (!isPlainRecord(value) || typeof value.partition !== "string") {
      throw new StandaloneOriginStoreError(
        "corrupt",
        "Local renderer origin registry contains a malformed entry.",
      );
    }
    const validated = validateRecordInput({
      remoteOrigin: key,
      port: value.port as number,
      partition: value.partition,
    });
    if (usedPorts.has(validated.port) || usedPartitions.has(validated.partition)) {
      throw new StandaloneOriginStoreError(
        "corrupt",
        "Local renderer origin registry contains duplicate ports or partitions.",
      );
    }
    usedPorts.add(validated.port);
    usedPartitions.add(validated.partition);
    records.set(validated.remoteOrigin, validated);
  }

  return records;
}

async function readRegistryFromDisk(
  userDataDir: string,
): Promise<Map<string, StandaloneOriginRecord>> {
  const file = standaloneOriginsFilePath(userDataDir);
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new StandaloneOriginStoreError(
        "corrupt",
        "Local renderer origin registry is not a regular file.",
      );
    }
  } catch (error) {
    if (error instanceof StandaloneOriginStoreError) throw error;
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return new Map();
    }
    throw new StandaloneOriginStoreError(
      "corrupt",
      "Local renderer origin registry could not be inspected.",
    );
  }

  const raw = await readPrivateFile(file, MAX_STANDALONE_ORIGINS_BYTES);
  if (raw === null) {
    throw new StandaloneOriginStoreError(
      "corrupt",
      "Local renderer origin registry could not be read.",
    );
  }
  return parseRegistryJson(raw);
}

function serializeRegistry(records: ReadonlyMap<string, StandaloneOriginRecord>): string {
  const origins: Record<string, { port: number; partition: string }> = {};
  for (const key of [...records.keys()].sort()) {
    const entry = records.get(key)!;
    origins[key] = {
      port: entry.port,
      partition: entry.partition,
    };
  }
  return `${JSON.stringify({ version: STANDALONE_ORIGINS_VERSION, origins }, null, 2)}\n`;
}

/**
 * Reads the persisted `remoteOrigin -> { port, partition }` registry.
 * Missing `standalone-origins.json` returns an empty map; corrupt or unreadable
 * files throw `StandaloneOriginStoreError` without modifying disk state.
 */
export async function readStandaloneOriginRegistry(
  userDataDir: string,
): Promise<ReadonlyMap<string, StandaloneOriginRecord>> {
  const queueKey = path.resolve(userDataDir);
  const pending = writeQueues.get(queueKey);
  if (pending) await pending.catch(() => undefined);
  return readRegistryFromDisk(userDataDir);
}

/**
 * Atomically records a newly bound loopback port for `remoteOrigin`.
 * Fails closed without overwriting `standalone-origins.json` if the existing
 * registry is corrupt or if `port` / `remoteOrigin` conflicts with another entry.
 */
export async function recordStandaloneOrigin(
  userDataDir: string,
  record: StandaloneOriginRecord,
): Promise<StandaloneOriginRecord> {
  const validated = validateRecordInput(record);
  const queueKey = path.resolve(userDataDir);
  const previous = writeQueues.get(queueKey) ?? Promise.resolve();

  let result!: StandaloneOriginRecord;
  const current = previous
    .catch(() => undefined)
    .then(async () => {
      const registry = await readRegistryFromDisk(userDataDir);
      const existing = registry.get(validated.remoteOrigin);
      if (existing) {
        if (existing.port === validated.port && existing.partition === validated.partition) {
          result = existing;
          return;
        }
        throw new StandaloneOriginStoreError(
          "conflict",
          "Server already has a different registered local renderer port.",
        );
      }

      for (const entry of registry.values()) {
        if (entry.port === validated.port || entry.partition === validated.partition) {
          throw new StandaloneOriginStoreError(
            "conflict",
            "Local renderer port is already assigned to another server.",
          );
        }
      }
      if (registry.size >= MAX_STANDALONE_ORIGIN_ENTRIES) {
        throw new StandaloneOriginStoreError("conflict", "Local renderer origin registry is full.");
      }

      registry.set(validated.remoteOrigin, validated);
      await mkdir(userDataDir, { recursive: true });
      await writePrivateFile(standaloneOriginsFilePath(userDataDir), serializeRegistry(registry));
      result = validated;
    });

  const settled = current.then(
    () => undefined,
    () => undefined,
  );
  writeQueues.set(queueKey, settled);
  try {
    await current;
    return result;
  } finally {
    if (writeQueues.get(queueKey) === settled) writeQueues.delete(queueKey);
  }
}
