import type { AdapterContext } from "@rakazo/adapter-kit";
import {
  destroyBot,
  removeAgentHome,
  removeDeletedBotsFromLegacyTeamHome,
  toComputerRef,
} from "@rakazo/adapters";
import { accountHasProjectWorkspacesAuthError } from "@rakazo/auth";
import type { PrismaClient } from "@rakazo/db";
import {
  assertMemberHasNoProjectWorkspacesInOrg,
  claimProjectAccountDeletion,
  claimSpacesLeavingWithAccount,
  deleteSpaceLeavingWithAccount,
  ProjectAccountHasWorkspacesError,
  recordComputerRunEnd,
  releaseProjectAccountDeletionClaim,
  runAsSystem,
} from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import type { SpaceDeletionDeps } from "./space-deletion.js";

export class AccountHasProjectWorkspacesError extends Error {
  constructor() {
    super("Remove project workspaces before deleting the account");
    this.name = "AccountHasProjectWorkspacesError";
  }
}

export async function assertAccountHasNoProjectWorkspaces(
  prisma: Pick<PrismaClient, "$queryRaw">,
  userId: string,
): Promise<void> {
  const rows = await runAsSystem(
    "account deletion workspace preflight",
    () => prisma.$queryRaw<Array<{ authorized: boolean; exists: boolean }>>`
      SELECT app_rls_bypass() AS authorized,
        EXISTS (SELECT 1 FROM project_workspaces WHERE "userId" = ${userId}) AS "exists"
    `,
  );
  if (rows[0]?.authorized !== true || typeof rows[0]?.exists !== "boolean") {
    throw new Error("Cannot verify system access for account deletion");
  }
  if (rows[0].exists) throw new AccountHasProjectWorkspacesError();
}

export async function assertAccountDeletionAllowed(
  prisma: PrismaClient,
  userId: string,
): Promise<{ claimedNow: boolean }> {
  try {
    return await claimProjectAccountDeletion(prisma, userId);
  } catch (error) {
    if (error instanceof ProjectAccountHasWorkspacesError) {
      throw accountHasProjectWorkspacesAuthError();
    }
    throw error;
  }
}

export async function releaseAccountDeletionClaim(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  await releaseProjectAccountDeletionClaim(prisma, userId);
}

/**
 * Runs a pre-destructive account deletion step (such as billing cancellation) while holding a
 * deletion claim. If this request created the claim and the step fails, the claim is released
 * best-effort before rethrowing the original error; an already-existing claim stays intact so
 * retries converge cleanly.
 */
export async function withPreDestructiveAccountDeletionClaim<T>(
  prisma: PrismaClient,
  userId: string,
  claimedNow: boolean,
  step: () => Promise<T>,
): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (claimedNow) {
      await releaseAccountDeletionClaim(prisma, userId).catch((releaseError) =>
        getLogger().error("account deletion claim release failed", releaseError),
      );
    }
    throw error;
  }
}

export async function assertMemberRemovalAllowed(
  prisma: PrismaClient,
  userId: string,
  organizationId: string,
): Promise<void> {
  try {
    await assertMemberHasNoProjectWorkspacesInOrg(prisma, userId, organizationId);
  } catch (error) {
    if (error instanceof ProjectAccountHasWorkspacesError) {
      throw accountHasProjectWorkspacesAuthError();
    }
    throw error;
  }
}

/**
 * In shared spaces, the account's bot folders also live on the space's Team Computer from before
 * each person got their own. Each sandbox is destroyed at its provider before its row goes, so a
 * failure keeps the handle and deleting again resumes from what is left.
 */
export async function deleteAccountContent(deps: SpaceDeletionDeps, userId: string): Promise<void> {
  const context = (spaceId: string, botId?: string): AdapterContext => ({
    operationId: `account-delete:${userId}`,
    traceId: `account-delete:${userId}`,
    spaceId,
    userId,
    ...(botId ? { botId } : {}),
    signal: new AbortController().signal,
  });
  const leaving = await claimSpacesLeavingWithAccount(deps.prisma, userId);
  const bots = await deps.prisma.bot.findMany({
    where: { OR: [{ userId }, { spaceId: { in: leaving } }] },
    select: {
      id: true,
      userId: true,
      spaceId: true,
      name: true,
      archivedAt: true,
      computerId: true,
      webhookSecretId: true,
    },
  });
  await settleAll(
    bots.map((bot) =>
      destroyBot(deps, bot, context(bot.spaceId, bot.id), {
        deleteMemories: true,
        strictTeardown: true,
      }),
    ),
  );

  // Bot deletion cleans these best-effort; here a failure fails the account deletion, and the
  // retry finds the ids again in bot_deletions.
  const deletions = await deps.prisma.botDeletion.findMany({
    where: { deletedByUserId: userId, spaceId: { notIn: leaving } },
    select: { id: true, spaceId: true },
  });
  const deletedBySpace = new Map<string, string[]>();
  for (const { id, spaceId } of deletions)
    deletedBySpace.set(spaceId, [...(deletedBySpace.get(spaceId) ?? []), id]);
  await settleAll(
    [...deletedBySpace].map(([spaceId, botIds]) =>
      removeDeletedBotsFromLegacyTeamHome(deps, spaceId, botIds),
    ),
  );

  const computers = await deps.prisma.computer.findMany({
    where: { OR: [{ userId }, { spaceId: { in: leaving } }] },
    select: {
      id: true,
      spaceId: true,
      homeKey: true,
      kind: true,
      providerRef: true,
      bots: { select: { id: true } },
    },
  });
  await settleAll(
    computers.map(async (computer) => {
      // Only someone else's bot can still be on it, and its files are theirs.
      if (computer.bots.length) {
        getLogger().warn("account.delete.computer_in_use", { "computer.id": computer.id });
        return;
      }
      if (computer.providerRef) {
        await deps.sandbox.destroy(toComputerRef(computer), context(computer.spaceId));
        await recordComputerRunEnd(deps.prisma, computer, "deleted");
      }
      await removeAgentHome(deps.home, computer.homeKey, deps.dataDir);
      // The row holds the stored home's key, so the stored copy is unreadable from here on.
      await deps.prisma.computer.deleteMany({
        where: { id: computer.id, providerRef: computer.providerRef, bots: { none: {} } },
      });
    }),
  );

  for (const spaceId of leaving) {
    const deleted = await deleteSpaceLeavingWithAccount(deps.prisma, { spaceId, userId });
    if (!deleted) continue;
    const cleanup = await Promise.allSettled(
      deleted.artifactKeys.map((storageKey) => deps.artifacts.remove(storageKey, context(spaceId))),
    );
    for (const result of cleanup) {
      if (result.status === "rejected") getLogger().error("space file cleanup", result.reason);
    }
  }
}

/** Runs every teardown, then fails with the first error so a retry finishes the rest. */
async function settleAll(work: Promise<unknown>[]) {
  const failed = (await Promise.allSettled(work)).find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed) throw failed.reason;
}
