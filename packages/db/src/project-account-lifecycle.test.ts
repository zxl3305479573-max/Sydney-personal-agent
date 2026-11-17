import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { Prisma } from "./client.js";
import {
  AccountHasProjectWorkspacesError,
  claimProjectAccountDeletion,
  lockProjectAccountForCreation,
  ProjectAccountDeletionInProgressError,
} from "./project-account-lifecycle.js";
import { currentDbContext } from "./row-security.js";

describe("project account lifecycle gate", () => {
  it("refuses project creation when account deletion was claimed", async () => {
    const query = vi.fn().mockResolvedValue([{ projectDeletionClaimedAt: new Date() }]);
    const tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;
    await expect(lockProjectAccountForCreation(tx, "user-a"))
      .rejects.toBeInstanceOf(ProjectAccountDeletionInProgressError);
    expect(query.mock.calls[0]?.[0].text).toContain("FOR UPDATE");
  });

  it("claims only after system authorization and an empty project check", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ authorized: true }])
      .mockResolvedValueOnce([{ exists: false }]);
    const execute = vi.fn().mockResolvedValue(1);
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<void>, _options: unknown) => {
      expect(currentDbContext()).toMatchObject({ kind: "system" });
      await callback({ $queryRaw: query, $executeRaw: execute });
    });
    const prisma = { $transaction: transaction } as unknown as PrismaClient;
    await claimProjectAccountDeletion(prisma, "user-a");
    expect(query.mock.calls[0]?.[0].text).toContain("FOR UPDATE");
    expect(query.mock.calls[1]?.[0].values).toContain("user-a");
    expect(execute).toHaveBeenCalledOnce();
    expect(transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  });

  it("does not claim when projects exist or system authorization is absent", async () => {
    for (const rows of [
      [[{ authorized: true }], [{ exists: true }]],
      [[{ authorized: false }]],
    ]) {
      const query = vi.fn();
      for (const result of rows) query.mockResolvedValueOnce(result);
      const execute = vi.fn();
      const prisma = {
        $transaction: async (callback: (tx: unknown) => Promise<void>) =>
          callback({ $queryRaw: query, $executeRaw: execute }),
      } as unknown as PrismaClient;
      const operation = claimProjectAccountDeletion(prisma, "user-a");
      if (rows.length === 2) await expect(operation).rejects.toBeInstanceOf(AccountHasProjectWorkspacesError);
      else await expect(operation).rejects.toThrow("Cannot verify account deletion access");
      expect(execute).not.toHaveBeenCalled();
    }
  });
});
