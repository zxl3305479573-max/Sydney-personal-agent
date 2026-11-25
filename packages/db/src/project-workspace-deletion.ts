import { randomUUID } from "node:crypto";
import type { Actor } from "@rakazo/contracts";
import { DeleteProjectWorkspaceInput, ProjectWorkspaceIdInput } from "@rakazo/contracts";
import { ACTIVE_RUN_STATUSES } from "@rakazo/core";
import { cancelRunsInTransaction } from "./cancel-runs.js";
import type { PrismaClient } from "./client.js";
import { Prisma } from "./client.js";
import { expireComputerExecutionLeases } from "./computers.js";
import { runAsSystem } from "./row-security.js";
import { IsolationError } from "./scope.js";
import { lockSpaceForContentCreation } from "./spaces.js";
import { withTransactionRetry } from "./transaction-retry.js";

export const PROJECT_WORKSPACE_DELETION_CLAIM_TIMEOUT_MS = 5 * 60_000;

export class ProjectWorkspaceNotFoundError extends Error {
  constructor() {
    super("Project workspace not found");
    this.name = "ProjectWorkspaceNotFoundError";
  }
}

export class ProjectWorkspaceDeletionInProgressError extends Error {
  constructor() {
    super("Project workspace deletion is already in progress");
    this.name = "ProjectWorkspaceDeletionInProgressError";
  }
}

export class ProjectWorkspaceDeferredResourcesError extends Error {
  constructor() {
    super("Project workspace contains deferred resources that cannot be removed automatically");
    this.name = "ProjectWorkspaceDeferredResourcesError";
  }
}

type ProjectActor = Pick<Actor, "spaceId" | "userId">;
type ClaimedProjectInput = { id: string; claimId: string };

/**
 * Serializes project-scoped writes (`createBot`, `createGroup`, `sendThreadMessage`)
 * against `claimProjectWorkspaceDeletion`. Call inside the write transaction before
 * inserting project-scoped rows; a claimed project fails immediately.
 */
export async function lockProjectWorkspaceForMutation(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  actor: ProjectActor,
  projectWorkspaceId: string,
): Promise<void> {
  if (
    !actor?.spaceId ||
    !actor.userId ||
    !ProjectWorkspaceIdInput.safeParse({ id: projectWorkspaceId }).success
  ) {
    throw new IsolationError();
  }
  const rows = await tx.$queryRaw<Array<{ deletingAt: Date | null }>>(Prisma.sql`
    SELECT w."deletingAt"
    FROM "project_workspaces" w
    JOIN "space_members" m ON m."spaceId" = w."spaceId" AND m."userId" = w."userId"
    JOIN "spaces" s ON s."id" = w."spaceId"
    WHERE w."id" = ${projectWorkspaceId}
      AND w."spaceId" = ${actor.spaceId}
      AND w."userId" = ${actor.userId}
      AND s."deletingAt" IS NULL
    FOR SHARE OF w
  `);
  if (rows.length !== 1) throw new IsolationError();
  if (rows[0]!.deletingAt !== null) throw new ProjectWorkspaceDeletionInProgressError();
}

/**
 * Claims a project workspace for non-empty teardown. Once committed, `deletingAt` causes
 * RESTRICTIVE RLS on conversation tables to hide project rows from normal tenant queries,
 * and `lockProjectWorkspaceForMutation` blocks concurrent creation/send transactions.
 * Stale claims older than five minutes can be safely taken over and resumed.
 */
export async function claimProjectWorkspaceDeletion(
  prisma: PrismaClient,
  actor: ProjectActor,
  input: { id: string; confirmRemoveAppData: true },
): Promise<{ claimId: string; name: string; recovered: boolean }> {
  const { id } = DeleteProjectWorkspaceInput.parse(input);
  if (!actor?.spaceId || !actor.userId) throw new Error("Invalid workspace scope");
  const claimId = randomUUID();
  return runAsSystem("claim project workspace deletion", () =>
    withTransactionRetry(() =>
      prisma.$transaction(
        async (tx) => {
          await lockSpaceForContentCreation(tx, actor);
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              name: string;
              deletingAt: Date | null;
              deletionClaimId: string | null;
            }>
          >(Prisma.sql`
            SELECT "id", "name", "deletingAt", "deletionClaimId"
            FROM "project_workspaces"
            WHERE "id" = ${id} AND "spaceId" = ${actor.spaceId} AND "userId" = ${actor.userId}
            FOR UPDATE
          `);
          const workspace = rows[0];
          if (!workspace) throw new ProjectWorkspaceNotFoundError();
          const staleBefore = new Date(Date.now() - PROJECT_WORKSPACE_DELETION_CLAIM_TIMEOUT_MS);
          if (workspace.deletingAt !== null && workspace.deletingAt >= staleBefore) {
            throw new ProjectWorkspaceDeletionInProgressError();
          }
          const now = new Date();
          await tx.$executeRaw(Prisma.sql`
            UPDATE "project_workspaces"
            SET "deletingAt" = ${now}, "deletionClaimId" = ${claimId}
            WHERE "id" = ${id} AND "spaceId" = ${actor.spaceId} AND "userId" = ${actor.userId}
          `);
          return {
            claimId,
            name: workspace.name,
            recovered: workspace.deletingAt !== null,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      ),
    ),
  );
}

export async function renewProjectWorkspaceDeletionClaim(
  prisma: Pick<PrismaClient, "$queryRaw">,
  actor: ProjectActor,
  input: ClaimedProjectInput,
): Promise<boolean> {
  if (!actor?.spaceId || !actor.userId || !input.id || !input.claimId) return false;
  const now = new Date();
  const rows = await runAsSystem("renew project workspace deletion claim", () =>
    prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "project_workspaces"
      SET "deletingAt" = ${now}
      WHERE "id" = ${input.id}
        AND "spaceId" = ${actor.spaceId}
        AND "userId" = ${actor.userId}
        AND "deletionClaimId" = ${input.claimId}
      RETURNING "id"
    `),
  );
  return rows.length === 1;
}

/** Releases a claim only before any destructive teardown step has started. */
export async function releaseProjectWorkspaceDeletionClaim(
  prisma: Pick<PrismaClient, "$executeRaw">,
  actor: ProjectActor,
  input: ClaimedProjectInput,
): Promise<void> {
  if (!actor?.spaceId || !actor.userId || !input.id || !input.claimId) return;
  await runAsSystem("release project workspace deletion claim", () =>
    prisma.$executeRaw(Prisma.sql`
      UPDATE "project_workspaces"
      SET "deletingAt" = NULL, "deletionClaimId" = NULL
      WHERE "id" = ${input.id}
        AND "spaceId" = ${actor.spaceId}
        AND "userId" = ${actor.userId}
        AND "deletionClaimId" = ${input.claimId}
    `),
  );
}

/** Lists every bot in the claimed project (archived included) for per-bot teardown. */
export async function listClaimedProjectWorkspaceBots(
  prisma: Pick<PrismaClient, "$queryRaw" | "bot">,
  actor: ProjectActor,
  input: ClaimedProjectInput,
) {
  return runAsSystem("list bots in claimed project workspace", async () => {
    const claimed = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "project_workspaces"
      WHERE "id" = ${input.id}
        AND "spaceId" = ${actor.spaceId}
        AND "userId" = ${actor.userId}
        AND "deletionClaimId" = ${input.claimId}
    `);
    if (claimed.length !== 1) throw new ProjectWorkspaceDeletionInProgressError();
    return prisma.bot.findMany({
      where: {
        spaceId: actor.spaceId,
        userId: actor.userId,
        projectWorkspaceId: input.id,
      },
      select: {
        id: true,
        userId: true,
        spaceId: true,
        name: true,
        archivedAt: true,
        computerId: true,
        webhookSecretId: true,
      },
      orderBy: { createdAt: "asc" },
    });
  });
}

export type ClaimedProjectRunTeardownTarget = {
  computer: { id: string; homeKey: string; kind: string; providerRef: string | null };
  botId: string;
  runId: string;
  lease: { id: string; runId: string; fence: number } | null;
};

/**
 * Cancels every active run/task, disables routines, and expires computer execution leases
 * inside the claimed project workspace. Returns job keys, thread wakeups, and computer
 * teardown targets so callers can stop active sandboxes and immediately sever SSE streams.
 */
export async function cancelClaimedProjectWorkspaceRuns(
  prisma: PrismaClient,
  actor: ProjectActor,
  input: ClaimedProjectInput,
): Promise<{
  cancelledRunIds: string[];
  routineIds: string[];
  threadNotifications: Array<{ threadId: string; seq: number }>;
  teardownTargets: ClaimedProjectRunTeardownTarget[];
}> {
  return runAsSystem("cancel runs in claimed project workspace", () =>
    withTransactionRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const claimed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "project_workspaces"
            WHERE "id" = ${input.id}
              AND "spaceId" = ${actor.spaceId}
              AND "userId" = ${actor.userId}
              AND "deletionClaimId" = ${input.claimId}
            FOR UPDATE
          `);
          if (claimed.length !== 1) throw new ProjectWorkspaceDeletionInProgressError();
          const [activeRuns, projectBots, projectThreads] = await Promise.all([
            tx.run.findMany({
              where: {
                spaceId: actor.spaceId,
                userId: actor.userId,
                projectWorkspaceId: input.id,
                status: { in: [...ACTIVE_RUN_STATUSES] },
              },
              select: { id: true, taskId: true, threadId: true, botId: true, userId: true, spaceId: true },
            }),
            tx.bot.findMany({
              where: { spaceId: actor.spaceId, userId: actor.userId, projectWorkspaceId: input.id },
              select: { id: true },
            }),
            tx.thread.findMany({
              where: { spaceId: actor.spaceId, userId: actor.userId, projectWorkspaceId: input.id },
              select: { id: true },
            }),
          ]);
          const botIds = projectBots.map((bot) => bot.id);
          const routines = botIds.length
            ? await tx.routine.findMany({
                where: { botId: { in: botIds } },
                select: { id: true },
              })
            : [];
          const now = new Date();
          const cancelled = await cancelRunsInTransaction(tx, activeRuns, now);
          const cancelledRunIds = cancelled.map((run) => run.id);
          const teardownTargets: ClaimedProjectRunTeardownTarget[] = [];
          if (cancelledRunIds.length > 0) {
            const leases = await tx.computerExecutionLease.findMany({
              where: { runId: { in: cancelledRunIds } },
              select: { id: true, computerId: true, botId: true, runId: true, fence: true },
            });
            const computerIds = [...new Set(leases.map((lease) => lease.computerId))];
            const computers = await tx.computer.findMany({
              where: {
                OR: [
                  ...(computerIds.length ? [{ id: { in: computerIds } }] : []),
                  { executionRunId: { in: cancelledRunIds } },
                ],
              },
              select: {
                id: true,
                homeKey: true,
                kind: true,
                providerRef: true,
                executionBotId: true,
                executionRunId: true,
              },
            });
            const computerById = new Map(computers.map((computer) => [computer.id, computer]));
            const seen = new Set<string>();
            for (const lease of leases) {
              const computer = computerById.get(lease.computerId);
              if (!computer) continue;
              const key = `${computer.id}:${lease.runId}`;
              if (seen.has(key)) continue;
              seen.add(key);
              teardownTargets.push({
                computer: {
                  id: computer.id,
                  homeKey: computer.homeKey,
                  kind: computer.kind,
                  providerRef: computer.providerRef,
                },
                botId: lease.botId,
                runId: lease.runId,
                lease: { id: lease.id, runId: lease.runId, fence: lease.fence },
              });
            }
            const cancelledSet = new Set(cancelledRunIds);
            for (const computer of computers) {
              if (!computer.executionBotId || !computer.executionRunId) continue;
              if (!cancelledSet.has(computer.executionRunId)) continue;
              const key = `${computer.id}:${computer.executionRunId}`;
              if (seen.has(key)) continue;
              seen.add(key);
              teardownTargets.push({
                computer: {
                  id: computer.id,
                  homeKey: computer.homeKey,
                  kind: computer.kind,
                  providerRef: computer.providerRef,
                },
                botId: computer.executionBotId,
                runId: computer.executionRunId,
                lease: null,
              });
            }
            await expireComputerExecutionLeases(tx, { runId: { in: cancelledRunIds } });
            await tx.computer.updateMany({
              where: { executionRunId: { in: cancelledRunIds } },
              data: {
                executionRunId: null,
                executionBotId: null,
                executionLeaseExpiresAt: null,
              },
            });
          }
          if (botIds.length > 0) {
            await tx.routine.updateMany({
              where: { botId: { in: botIds } },
              data: { active: false, nextRunAt: null },
            });
          }
          const threadIds = projectThreads.map((thread) => thread.id);
          const threadNotifications: Array<{ threadId: string; seq: number }> = [];
          if (threadIds.length > 0) {
            const latestEvents = await tx.event.groupBy({
              by: ["threadId"],
              where: { threadId: { in: threadIds } },
              _max: { seq: true },
            });
            const seqByThread = new Map(
              latestEvents.map((row) => [row.threadId, row._max.seq ?? 0]),
            );
            for (const threadId of threadIds) {
              threadNotifications.push({ threadId, seq: seqByThread.get(threadId) ?? 0 });
            }
          }
          return {
            cancelledRunIds,
            routineIds: routines.map((routine) => routine.id),
            threadNotifications,
            teardownTargets,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      ),
    ),
  );
}

/**
 * Deletes residual project conversation rows in RESTRICT-safe order and removes the
 * claimed `project_workspaces` row. Refuses to delete if bots remain (incomplete teardown)
 * or if deferred resource tables (`artifacts`, `cloud_agents`, `purchases`) still reference
 * the workspace.
 */
export async function finalizeProjectWorkspaceDeletion(
  prisma: PrismaClient,
  actor: ProjectActor,
  input: ClaimedProjectInput,
): Promise<void> {
  await runAsSystem("finalize project workspace deletion", () =>
    withTransactionRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const claimed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "project_workspaces"
            WHERE "id" = ${input.id}
              AND "spaceId" = ${actor.spaceId}
              AND "userId" = ${actor.userId}
              AND "deletionClaimId" = ${input.claimId}
            FOR UPDATE
          `);
          if (claimed.length !== 1) throw new ProjectWorkspaceDeletionInProgressError();
          const [remainingBots, deferredCounts] = await Promise.all([
            tx.bot.count({
              where: {
                spaceId: actor.spaceId,
                userId: actor.userId,
                projectWorkspaceId: input.id,
              },
            }),
            tx.$queryRaw<Array<{ hasDeferred: boolean }>>(Prisma.sql`
              SELECT (
                EXISTS (SELECT 1 FROM "artifacts" a WHERE a."projectWorkspaceId" = ${input.id})
                OR EXISTS (SELECT 1 FROM "cloud_agents" c WHERE c."projectWorkspaceId" = ${input.id})
                OR EXISTS (SELECT 1 FROM "purchases" p WHERE p."projectWorkspaceId" = ${input.id})
              ) AS "hasDeferred"
            `),
          ]);
          if (remainingBots > 0) throw new ProjectWorkspaceDeletionInProgressError();
          if (deferredCounts[0]?.hasDeferred === true) {
            throw new ProjectWorkspaceDeferredResourcesError();
          }
          const scope = {
            spaceId: actor.spaceId,
            userId: actor.userId,
            projectWorkspaceId: input.id,
          };
          await tx.run.deleteMany({ where: scope });
          await tx.task.deleteMany({ where: scope });
          await tx.thread.deleteMany({ where: scope });
          await tx.chatGroup.deleteMany({ where: scope });
          const deleted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            DELETE FROM "project_workspaces"
            WHERE "id" = ${input.id}
              AND "spaceId" = ${actor.spaceId}
              AND "userId" = ${actor.userId}
              AND "deletionClaimId" = ${input.claimId}
            RETURNING "id"
          `);
          if (deleted.length !== 1) throw new ProjectWorkspaceDeletionInProgressError();
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      ),
    ),
  );
}
