import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { Prisma } from "./client.js";
import {
  AccountHasProjectWorkspacesError,
  assertMemberHasNoProjectWorkspacesInOrg,
  claimProjectAccountDeletion,
  lockProjectAccountForCreation,
  ProjectAccountDeletionInProgressError,
  releaseProjectAccountDeletionClaim,
} from "./project-account-lifecycle.js";
import { currentDbContext } from "./row-security.js";

describe("project account lifecycle gate", () => {
  it("refuses project creation when account deletion was claimed", async () => {
    const query = vi.fn().mockResolvedValue([{ projectDeletionClaimedAt: new Date() }]);
    const tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;
    await expect(lockProjectAccountForCreation(tx, "user-a")).rejects.toBeInstanceOf(
      ProjectAccountDeletionInProgressError,
    );
    expect(query.mock.calls[0]?.[0].text).toContain("FOR UPDATE");
  });

  it("claims only after system authorization and an empty project check", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ authorized: true, projectDeletionClaimedAt: null }])
      .mockResolvedValueOnce([{ exists: false }]);
    const execute = vi.fn().mockResolvedValue(1);
    const transaction = vi.fn(
      async (callback: (tx: unknown) => Promise<unknown>, _options: unknown) => {
        expect(currentDbContext()).toMatchObject({ kind: "system" });
        return callback({ $queryRaw: query, $executeRaw: execute });
      },
    );
    const prisma = { $transaction: transaction } as unknown as PrismaClient;
    await expect(claimProjectAccountDeletion(prisma, "user-a")).resolves.toEqual({
      claimedNow: true,
    });
    expect(query.mock.calls[0]?.[0].text).toContain("FOR UPDATE");
    expect(query.mock.calls[0]?.[0].text).toContain('"projectDeletionClaimedAt"');
    expect(query.mock.calls[1]?.[0].values).toContain("user-a");
    expect(execute).toHaveBeenCalledOnce();
    expect(transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  });

  it("returns claimedNow: false when the deletion claim was already set, and treats omitted timestamp as unclaimed", async () => {
    const alreadyClaimedQuery = vi
      .fn()
      .mockResolvedValueOnce([
        { authorized: true, projectDeletionClaimedAt: new Date("2026-01-01T00:00:00Z") },
      ])
      .mockResolvedValueOnce([{ exists: false }]);
    const alreadyClaimedExecute = vi.fn().mockResolvedValue(1);
    const alreadyClaimedPrisma = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ $queryRaw: alreadyClaimedQuery, $executeRaw: alreadyClaimedExecute }),
    } as unknown as PrismaClient;
    await expect(claimProjectAccountDeletion(alreadyClaimedPrisma, "user-a")).resolves.toEqual({
      claimedNow: false,
    });
    expect(alreadyClaimedExecute).not.toHaveBeenCalled();

    const legacyMockQuery = vi
      .fn()
      .mockResolvedValueOnce([{ authorized: true }])
      .mockResolvedValueOnce([{ exists: false }]);
    const legacyMockExecute = vi.fn().mockResolvedValue(1);
    const legacyMockPrisma = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ $queryRaw: legacyMockQuery, $executeRaw: legacyMockExecute }),
    } as unknown as PrismaClient;
    await expect(claimProjectAccountDeletion(legacyMockPrisma, "user-a")).resolves.toEqual({
      claimedNow: true,
    });
    expect(legacyMockExecute).toHaveBeenCalledOnce();
  });

  it("releases an account deletion claim only after verified system bypass and a FOR UPDATE lock", async () => {
    const query = vi.fn().mockResolvedValueOnce([{ authorized: true }]);
    const execute = vi.fn().mockResolvedValue(1);
    const transaction = vi.fn(
      async (callback: (tx: unknown) => Promise<unknown>, _options: unknown) => {
        expect(currentDbContext()).toMatchObject({ kind: "system" });
        return callback({ $queryRaw: query, $executeRaw: execute });
      },
    );
    const prisma = { $transaction: transaction } as unknown as PrismaClient;
    await expect(releaseProjectAccountDeletionClaim(prisma, "user-a")).resolves.toBeUndefined();
    expect(query.mock.calls[0]?.[0].text).toContain("app_rls_bypass()");
    expect(query.mock.calls[0]?.[0].text).toContain("FOR UPDATE");
    expect(query.mock.calls[0]?.[0].values).toEqual(["user-a"]);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[0].text).toContain('"projectDeletionClaimedAt" = NULL');
    expect(execute.mock.calls[0]?.[0].values).toEqual(["user-a"]);
    expect(transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });

    for (const rows of [[{ authorized: false }], []]) {
      const deniedQuery = vi.fn().mockResolvedValueOnce(rows);
      const deniedExecute = vi.fn();
      const deniedPrisma = {
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({ $queryRaw: deniedQuery, $executeRaw: deniedExecute }),
      } as unknown as PrismaClient;
      await expect(releaseProjectAccountDeletionClaim(deniedPrisma, "user-a")).rejects.toThrow(
        "Cannot verify account deletion claim release access",
      );
      expect(deniedExecute).not.toHaveBeenCalled();
    }

    await expect(releaseProjectAccountDeletionClaim(prisma, "")).rejects.toThrow(
      "Invalid account scope",
    );
  });

  it("does not claim when projects exist or system authorization is absent", async () => {
    for (const rows of [[[{ authorized: true }], [{ exists: true }]], [[{ authorized: false }]]]) {
      const query = vi.fn();
      for (const result of rows) query.mockResolvedValueOnce(result);
      const execute = vi.fn();
      const prisma = {
        $transaction: async (callback: (tx: unknown) => Promise<void>) =>
          callback({ $queryRaw: query, $executeRaw: execute }),
      } as unknown as PrismaClient;
      const operation = claimProjectAccountDeletion(prisma, "user-a");
      if (rows.length === 2)
        await expect(operation).rejects.toBeInstanceOf(AccountHasProjectWorkspacesError);
      else await expect(operation).rejects.toThrow("Cannot verify account deletion access");
      expect(execute).not.toHaveBeenCalled();
    }
  });

  it("blocks organization member removal when the member owns project workspaces in that org", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ authorized: true }])
      .mockResolvedValueOnce([{ exists: true }]);
    const prisma = {
      $transaction: async (callback: (tx: { $queryRaw: typeof query }) => Promise<void>) =>
        callback({ $queryRaw: query }),
    } as unknown as PrismaClient;
    await expect(
      assertMemberHasNoProjectWorkspacesInOrg(prisma, "user-a", "org-a"),
    ).rejects.toBeInstanceOf(AccountHasProjectWorkspacesError);
    expect(query.mock.calls[0]?.[0].text).toContain("FOR UPDATE");
    expect(query.mock.calls[1]?.[0].values).toEqual(["user-a", "org-a"]);
  });

  it("allows organization member removal only after verified system bypass and empty org project check", async () => {
    const allowedQuery = vi
      .fn()
      .mockResolvedValueOnce([{ authorized: true }])
      .mockResolvedValueOnce([{ exists: false }]);
    const allowedPrisma = {
      $transaction: async (callback: (tx: { $queryRaw: typeof allowedQuery }) => Promise<void>) => {
        expect(currentDbContext()).toMatchObject({ kind: "system" });
        await callback({ $queryRaw: allowedQuery });
      },
    } as unknown as PrismaClient;
    await expect(
      assertMemberHasNoProjectWorkspacesInOrg(allowedPrisma, "user-a", "org-a"),
    ).resolves.toBeUndefined();

    const deniedQuery = vi.fn().mockResolvedValueOnce([{ authorized: false }]);
    const deniedPrisma = {
      $transaction: async (callback: (tx: { $queryRaw: typeof deniedQuery }) => Promise<void>) =>
        callback({ $queryRaw: deniedQuery }),
    } as unknown as PrismaClient;
    await expect(
      assertMemberHasNoProjectWorkspacesInOrg(deniedPrisma, "user-a", "org-a"),
    ).rejects.toThrow("Cannot verify member removal access");
  });
});
