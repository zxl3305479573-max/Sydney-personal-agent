import type { PrismaClient } from "@rakazo/db";
import { currentDbContext } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import {
  AccountHasProjectWorkspacesError,
  assertAccountHasNoProjectWorkspaces,
} from "./account-deletion.js";

describe("account workspace preflight", () => {
  it("checks the account under an explicit system context", async () => {
    const query = vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      expect(currentDbContext()).toEqual({
        kind: "system",
        reason: "account deletion workspace preflight",
      });
      expect(values).toEqual(["account-a"]);
      return [{ authorized: true, exists: false }];
    });
    const prisma = { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">;

    await expect(assertAccountHasNoProjectWorkspaces(prisma, "account-a")).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledOnce();
  });

  it("rejects deletion if any workspace is returned", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ authorized: true, exists: true }]),
    } as unknown as Pick<PrismaClient, "$queryRaw">;

    await expect(assertAccountHasNoProjectWorkspaces(prisma, "account-a")).rejects.toBeInstanceOf(
      AccountHasProjectWorkspacesError,
    );
  });

  it("propagates database failures instead of allowing deletion", async () => {
    const failure = new Error("database unavailable");
    const prisma = {
      $queryRaw: vi.fn(async () => {
        throw failure;
      }),
    } as unknown as Pick<PrismaClient, "$queryRaw">;

    await expect(assertAccountHasNoProjectWorkspaces(prisma, "account-a")).rejects.toBe(failure);
  });

  it("rejects deletion when system access cannot be verified", async () => {
    const query = vi.fn(async () => [{ authorized: false }]);
    const prisma = { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">;

    await expect(assertAccountHasNoProjectWorkspaces(prisma, "account-a")).rejects.toThrow(
      "Cannot verify system access",
    );
    expect(query).toHaveBeenCalledOnce();
  });

  it.each([
    { rows: [] },
    { rows: [{ authorized: true }] },
    { rows: [{ authorized: true, exists: "false" }] },
  ])("rejects invalid database results", async ({ rows }) => {
    const prisma = {
      $queryRaw: vi.fn(async () => rows),
    } as unknown as Pick<PrismaClient, "$queryRaw">;

    await expect(assertAccountHasNoProjectWorkspaces(prisma, "account-a")).rejects.toThrow(
      "Cannot verify system access",
    );
  });
});
