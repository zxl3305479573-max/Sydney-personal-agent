import { readFileSync } from "node:fs";
import type { PrismaClient } from "@rakazo/db";
import { ProjectAccountHasWorkspacesError } from "@rakazo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertAccountDeletionAllowed,
  releaseAccountDeletionClaim,
  withPreDestructiveAccountDeletionClaim,
} from "./account-deletion.js";

const dbMocks = vi.hoisted(() => ({
  claim: vi.fn(),
  release: vi.fn(),
}));

const logMocks = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@rakazo/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@rakazo/db")>();
  return {
    ...original,
    claimProjectAccountDeletion: dbMocks.claim,
    releaseProjectAccountDeletionClaim: dbMocks.release,
  };
});

vi.mock("@rakazo/logging", async (importOriginal) => {
  const original = await importOriginal<typeof import("@rakazo/logging")>();
  return {
    ...original,
    getLogger: () => logMocks,
  };
});

const prisma = {} as PrismaClient;

describe("account deletion claim recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.claim.mockResolvedValue({ claimedNow: true });
    dbMocks.release.mockResolvedValue(undefined);
  });

  it("propagates claimedNow from claimProjectAccountDeletion and preserves workspace conflict mapping", async () => {
    await expect(assertAccountDeletionAllowed(prisma, "user-a")).resolves.toEqual({
      claimedNow: true,
    });
    dbMocks.claim.mockResolvedValueOnce({ claimedNow: false });
    await expect(assertAccountDeletionAllowed(prisma, "user-a")).resolves.toEqual({
      claimedNow: false,
    });

    dbMocks.claim.mockRejectedValueOnce(new ProjectAccountHasWorkspacesError());
    await expect(assertAccountDeletionAllowed(prisma, "user-a")).rejects.toMatchObject({
      body: {
        code: "ACCOUNT_HAS_PROJECT_WORKSPACES",
      },
    });
  });

  it("releases a fresh claim when a pre-destructive billing step fails", async () => {
    const billingError = new Error("stripe cancellation failed");
    const { claimedNow } = await assertAccountDeletionAllowed(prisma, "user-a");

    await expect(
      withPreDestructiveAccountDeletionClaim(prisma, "user-a", claimedNow, async () => {
        throw billingError;
      }),
    ).rejects.toBe(billingError);

    expect(dbMocks.release).toHaveBeenCalledOnce();
    expect(dbMocks.release).toHaveBeenCalledWith(prisma, "user-a");
    expect(logMocks.error).not.toHaveBeenCalled();
  });

  it("does not release an already-existing claim when a pre-destructive step fails", async () => {
    const billingError = new Error("stripe cancellation failed");
    dbMocks.claim.mockResolvedValueOnce({ claimedNow: false });
    const { claimedNow } = await assertAccountDeletionAllowed(prisma, "user-a");

    await expect(
      withPreDestructiveAccountDeletionClaim(prisma, "user-a", claimedNow, async () => {
        throw billingError;
      }),
    ).rejects.toBe(billingError);

    expect(dbMocks.release).not.toHaveBeenCalled();
  });

  it("does not mask the original billing error if releasing the claim also fails", async () => {
    const billingError = new Error("stripe cancellation failed");
    const releaseError = new Error("database connection lost");
    dbMocks.release.mockRejectedValueOnce(releaseError);

    await expect(
      withPreDestructiveAccountDeletionClaim(prisma, "user-a", true, async () => {
        throw billingError;
      }),
    ).rejects.toBe(billingError);

    expect(dbMocks.release).toHaveBeenCalledWith(prisma, "user-a");
    expect(logMocks.error).toHaveBeenCalledWith("account deletion claim release failed", releaseError);
  });

  it("keeps the claim when pre-destructive work succeeds and delegates explicit release", async () => {
    await expect(
      withPreDestructiveAccountDeletionClaim(prisma, "user-a", true, async () => "ok"),
    ).resolves.toBe("ok");
    expect(dbMocks.release).not.toHaveBeenCalled();

    await releaseAccountDeletionClaim(prisma, "user-a");
    expect(dbMocks.release).toHaveBeenCalledWith(prisma, "user-a");
  });

  it("wraps only pre-destructive billing cancellation in claim recovery inside app.ts", () => {
    const source = readFileSync(new URL("./app.ts", import.meta.url), "utf8");
    const start = source.indexOf("beforeDeleteUser: async (userId)");
    const guard = source.indexOf("await assertAccountDeletionAllowed(prisma, userId)", start);
    const recovery = source.indexOf("await withPreDestructiveAccountDeletionClaim(", start);
    const billing = source.indexOf("await billing?.cancelForDeletedUser(userId)", start);
    const cleanup = source.indexOf("await deleteAccountContent(", start);
    expect(start).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(start);
    expect(recovery).toBeGreaterThan(guard);
    expect(billing).toBeGreaterThan(recovery);
    expect(cleanup).toBeGreaterThan(billing);
  });
});
