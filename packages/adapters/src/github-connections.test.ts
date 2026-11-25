import type { GithubProvider, SecretStore } from "@rakazo/adapter-kit";
import { GithubAuthInvalidError } from "@rakazo/adapter-kit";
import type { GithubConnection, PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import type { GithubAccountDeps } from "./github-connections.js";
import {
  createGithubAccountService,
  createGithubProvider,
  hasConnectedGithubAccount,
  loadConnectedGithubAuth,
} from "./github-connections.js";
import { createGithubEmulator } from "./github-emulator.js";
import { EncryptedSecretStore } from "./secrets.js";

const actor = { userId: "user-1", spaceId: "space-1" };

function fakePrisma() {
  const rows: GithubConnection[] = [];
  let sequence = 0;

  const matches = (row: GithubConnection, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      const actual = row[key as keyof GithubConnection];
      if (value instanceof Date) {
        return actual instanceof Date && actual.getTime() === value.getTime();
      }
      return actual === value;
    });

  const githubConnection = {
    findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
      const found = rows.find((entry) => entry.userId === where.userId);
      return found ? { ...found } : null;
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<GithubConnection>;
      }) => {
        const matched = rows.filter((entry) => matches(entry, where));
        for (const entry of matched) {
          Object.assign(entry, data, { updatedAt: new Date() });
        }
        return { count: matched.length };
      },
    ),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const before = rows.length;
      for (let idx = rows.length - 1; idx >= 0; idx -= 1) {
        if (matches(rows[idx]!, where)) {
          rows.splice(idx, 1);
        }
      }
      return { count: before - rows.length };
    }),
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { userId: string };
        create: Partial<GithubConnection>;
        update: Partial<GithubConnection>;
      }) => {
        const existing = rows.find((entry) => entry.userId === where.userId);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return { ...existing };
        }
        sequence += 1;
        const created = {
          id: `gh-conn-${sequence}`,
          authKind: "pat",
          displayName: null,
          avatarUrl: null,
          scopes: [],
          highRiskScopes: [],
          invalidMessage: null,
          connectedAt: new Date(),
          lastVerifiedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create,
        } as GithubConnection;
        rows.push(created);
        return { ...created };
      },
    ),
  };

  const prisma = {
    githubConnection,
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };

  return { prisma, rows };
}

function setup(options?: { github?: GithubProvider | null }) {
  const { prisma, rows } = fakePrisma();
  const realEncrypted = new EncryptedSecretStore("test-github-encryption-key");
  const deletedRefs: string[] = [];
  const putSpy = vi.spyOn(realEncrypted, "put");
  const deleteSpy = vi
    .spyOn(realEncrypted, "delete")
    .mockImplementation(async (ref: string, ctx) => {
      deletedRefs.push(ref);
      await EncryptedSecretStore.prototype.delete.call(realEncrypted, ref, ctx);
    });

  const github = options?.github === undefined ? createGithubEmulator() : options.github;
  const deps: GithubAccountDeps = {
    prisma: prisma as unknown as PrismaClient,
    secretStore: realEncrypted as unknown as SecretStore,
    github,
  };

  return {
    deps,
    prisma,
    rows,
    secretStore: realEncrypted,
    putSpy,
    deleteSpy,
    deletedRefs,
    github,
  };
}

describe("createGithubProvider", () => {
  it("selects none, emulator, or github HTTP provider from env", () => {
    expect(createGithubProvider({ GITHUB_PROVIDER: "none" })).toBeNull();
    expect(createGithubProvider({ GITHUB_PROVIDER: "emulator" })?.describe().id).toBe("emulator");
    expect(createGithubProvider({})?.describe().id).toBe("github");
    expect(createGithubProvider({ GITHUB_PROVIDER: "github" })?.describe().id).toBe("github");
    expect(() => createGithubProvider({ GITHUB_PROVIDER: "unsupported" })).toThrow();
  });
});

describe("createGithubAccountService", () => {
  it("encrypts PAT on connect, serializes via advisory lock, and cleans up on reconnect/disconnect", async () => {
    const env = setup();
    const service = createGithubAccountService(env.deps);

    expect(await service.getStatus(actor)).toEqual({ status: "disconnected" });
    expect(await hasConnectedGithubAccount(env.deps, actor.userId)).toBe(false);

    const connected = await service.connect(actor, "ghp_highrisk_token_test");
    expect(connected).toMatchObject({
      status: "connected",
      authKind: "pat",
      login: "sydney-dev",
      highRiskScopes: ["delete_repo", "admin:org"],
    });
    expect(env.prisma.$executeRaw).toHaveBeenCalled();
    expect(env.putSpy).toHaveBeenCalledWith(expect.any(String), expect.anything(), {
      recordId: "github-connection:user-1",
    });

    const firstCiphertext = env.rows[0]!.ciphertext;
    expect(firstCiphertext).toMatch(/^v2:/);
    expect(firstCiphertext).not.toContain("ghp_highrisk_token_test");

    const loaded = await loadConnectedGithubAuth(env.deps, actor);
    expect(loaded).toEqual({
      token: "ghp_highrisk_token_test",
      login: "sydney-dev",
    });
    expect(await hasConnectedGithubAccount(env.deps, actor.userId)).toBe(true);

    // Reconnecting replaces secret and deletes previous ciphertext best-effort
    const reconnected = await service.connect(actor, "ghp_clean_pat_1234567890");
    expect(reconnected).toMatchObject({
      status: "connected",
      highRiskScopes: [],
    });
    expect(env.deletedRefs).toContain(firstCiphertext);

    const secondCiphertext = env.rows[0]!.ciphertext;
    const disconnected = await service.disconnect(actor);
    expect(disconnected).toEqual({ status: "disconnected" });
    expect(env.rows).toHaveLength(0);
    expect(env.deletedRefs).toContain(secondCiphertext);
    expect(await hasConnectedGithubAccount(env.deps, actor.userId)).toBe(false);
  });

  it("marks stored connection invalid and drops rejected secret when provider rejects token", async () => {
    const baseEmulator = createGithubEmulator();
    let tokenRevoked = false;
    const revocableProvider: GithubProvider = {
      ...baseEmulator,
      async getProfileOverview(token, input, ctx) {
        if (tokenRevoked) {
          throw new GithubAuthInvalidError(`Token ${token} was revoked`);
        }
        return baseEmulator.getProfileOverview(token, input, ctx);
      },
    };

    const env = setup({ github: revocableProvider });
    const service = createGithubAccountService(env.deps);

    await service.connect(actor, "ghp_revocable_token_12345");
    const oldCiphertext = env.rows[0]!.ciphertext;

    tokenRevoked = true;
    await expect(service.getProfileOverview(actor, {})).rejects.toBeInstanceOf(
      GithubAuthInvalidError,
    );

    expect(env.rows[0]?.status).toBe("invalid");
    expect(env.rows[0]?.ciphertext).toBe("");
    expect(env.rows[0]?.invalidMessage).not.toContain("ghp_revocable_token_12345");
    expect(env.deletedRefs).toContain(oldCiphertext);

    const status = await service.getStatus(actor);
    expect(status).toMatchObject({
      status: "invalid",
      login: "sydney-dev",
    });
  });

  it("does not clobber a concurrent reconnect when an older call fails with 401", async () => {
    const baseEmulator = createGithubEmulator();
    const env = setup({ github: baseEmulator });
    const service = createGithubAccountService(env.deps);

    await service.connect(actor, "ghp_first_token_12345");
    const staleRow = { ...env.rows[0]! };

    // Simulate concurrent reconnect landing before the stale 401 handler updates DB
    await service.connect(actor, "ghp_fresh_token_67890");
    const freshCiphertext = env.rows[0]!.ciphertext;

    const { markGithubConnectionInvalid } = await import("./github-connections.js");
    await markGithubConnectionInvalid(
      env.deps,
      staleRow,
      new GithubAuthInvalidError("Bad credentials"),
      "ghp_first_token_12345",
    );

    // Fresh connection remains intact!
    expect(env.rows[0]?.status).toBe("connected");
    expect(env.rows[0]?.ciphertext).toBe(freshCiphertext);
  });

  it("falls back to anonymous open-source search when connected token is rejected, and searches anonymously when disconnected", async () => {
    const baseEmulator = createGithubEmulator();
    const searchTokensSeen: Array<string | null> = [];
    const provider: GithubProvider = {
      ...baseEmulator,
      async searchRepos(token, input, ctx) {
        searchTokensSeen.push(token);
        if (token) {
          throw new GithubAuthInvalidError("Expired token");
        }
        return baseEmulator.searchRepos(null, input, ctx);
      },
    };

    const env = setup({ github: provider });
    const service = createGithubAccountService(env.deps);

    // Disconnected search uses null token directly
    const anonResult = await service.searchRepos(actor, {
      query: "claude",
      sort: "stars",
      page: 1,
      perPage: 10,
    });
    expect(anonResult.authenticated).toBe(false);
    expect(anonResult.items.length).toBeGreaterThan(0);

    // Connected search tries token, marks connection invalid on 401, and falls back to null token
    await service.connect(actor, "ghp_will_expire_12345");
    searchTokensSeen.length = 0;

    const fallbackResult = await service.searchRepos(actor, {
      query: "next.js",
      sort: "stars",
      page: 1,
      perPage: 10,
    });
    expect(searchTokensSeen).toEqual(["ghp_will_expire_12345", null]);
    expect(fallbackResult.authenticated).toBe(false);
    expect(fallbackResult.items.some((r) => r.fullName === "vercel/next.js")).toBe(true);
    expect(env.rows[0]?.status).toBe("invalid");
  });
});
