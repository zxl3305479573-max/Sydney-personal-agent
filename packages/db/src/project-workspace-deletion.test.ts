import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import {
  cancelClaimedProjectWorkspaceRuns,
  claimProjectWorkspaceDeletion,
  finalizeProjectWorkspaceDeletion,
  lockProjectWorkspaceForMutation,
  PROJECT_WORKSPACE_DELETION_CLAIM_TIMEOUT_MS,
  ProjectWorkspaceDeferredResourcesError,
  ProjectWorkspaceDeletionInProgressError,
  ProjectWorkspaceNotFoundError,
  releaseProjectWorkspaceDeletionClaim,
  renewProjectWorkspaceDeletionClaim,
} from "./project-workspace-deletion.js";
import { IsolationError } from "./scope.js";

const actor = { spaceId: "space-a", userId: "user-a" };

describe("project workspace deletion lifecycle (DB)", () => {
  it("locks an active project for mutation and rejects missing or deleting projects", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ deletingAt: null }])
      .mockResolvedValueOnce([{ deletingAt: new Date() }])
      .mockResolvedValueOnce([]);
    const tx = { $queryRaw: query };

    await expect(lockProjectWorkspaceForMutation(tx, actor, "project-a")).resolves.toBeUndefined();
    await expect(lockProjectWorkspaceForMutation(tx, actor, "project-a")).rejects.toBeInstanceOf(
      ProjectWorkspaceDeletionInProgressError,
    );
    await expect(lockProjectWorkspaceForMutation(tx, actor, "project-a")).rejects.toBeInstanceOf(
      IsolationError,
    );
  });

  it("claims an active project, rejects concurrent claims, and takes over stale claims", async () => {
    const execute = vi.fn().mockResolvedValue(1);
    const activeQuery = vi
      .fn()
      .mockResolvedValueOnce([]) // space advisory lock
      .mockResolvedValueOnce([{ id: "project-a", name: "Alpha", deletingAt: null, deletionClaimId: null }]);
    const makePrisma = (query: ReturnType<typeof vi.fn>) =>
      ({
        $transaction: async (callback: (tx: unknown) => unknown) =>
          callback({
            $queryRaw: query,
            $executeRaw: execute,
            spaceMember: {
              findUnique: vi.fn().mockResolvedValue({
                organizationId: "org-a",
                space: { deletingAt: null },
              }),
            },
          }),
      }) as unknown as PrismaClient;

    const claimed = await claimProjectWorkspaceDeletion(makePrisma(activeQuery), actor, {
      id: "project-a",
      confirmRemoveAppData: true,
    });
    expect(claimed.recovered).toBe(false);
    expect(claimed.name).toBe("Alpha");
    expect(claimed.claimId).toMatch(/^[0-9a-f-]{36}$/);
    expect(execute).toHaveBeenCalledTimes(1);

    const inProgressQuery = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "project-a", name: "Alpha", deletingAt: new Date(), deletionClaimId: "other-claim" },
      ]);
    await expect(
      claimProjectWorkspaceDeletion(makePrisma(inProgressQuery), actor, {
        id: "project-a",
        confirmRemoveAppData: true,
      }),
    ).rejects.toBeInstanceOf(ProjectWorkspaceDeletionInProgressError);

    const staleQuery = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "project-a",
          name: "Alpha",
          deletingAt: new Date(Date.now() - PROJECT_WORKSPACE_DELETION_CLAIM_TIMEOUT_MS - 1_000),
          deletionClaimId: "stale-claim",
        },
      ]);
    const recovered = await claimProjectWorkspaceDeletion(makePrisma(staleQuery), actor, {
      id: "project-a",
      confirmRemoveAppData: true,
    });
    expect(recovered.recovered).toBe(true);

    const missingQuery = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(
      claimProjectWorkspaceDeletion(makePrisma(missingQuery), actor, {
        id: "project-missing",
        confirmRemoveAppData: true,
      }),
    ).rejects.toBeInstanceOf(ProjectWorkspaceNotFoundError);
  });

  it("renews and releases claims strictly by claimId", async () => {
    const query = vi.fn().mockResolvedValueOnce([{ id: "project-a" }]).mockResolvedValueOnce([]);
    const execute = vi.fn().mockResolvedValue(1);
    await expect(
      renewProjectWorkspaceDeletionClaim({ $queryRaw: query }, actor, {
        id: "project-a",
        claimId: "claim-1",
      }),
    ).resolves.toBe(true);
    await expect(
      renewProjectWorkspaceDeletionClaim({ $queryRaw: query }, actor, {
        id: "project-a",
        claimId: "wrong-claim",
      }),
    ).resolves.toBe(false);
    await releaseProjectWorkspaceDeletionClaim({ $executeRaw: execute }, actor, {
      id: "project-a",
      claimId: "claim-1",
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("cancels active runs, disables routines, expires computer leases, and returns thread notifications", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ id: "project-a" }]),
      run: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "run-1",
            taskId: "task-1",
            threadId: "thread-1",
            botId: "bot-1",
            userId: actor.userId,
            spaceId: actor.spaceId,
          },
        ]),
        updateManyAndReturn: vi.fn().mockResolvedValue([{ id: "run-1" }]),
      },
      attempt: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      task: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      externalEffect: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      secret: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      message: { findMany: vi.fn().mockResolvedValue([]) },
      bot: { findMany: vi.fn().mockResolvedValue([{ id: "bot-1" }]) },
      thread: { findMany: vi.fn().mockResolvedValue([{ id: "thread-1" }, { id: "thread-2" }]) },
      routine: {
        findMany: vi.fn().mockResolvedValue([{ id: "routine-1" }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      computerExecutionLease: {
        findMany: vi.fn().mockResolvedValue([
          { id: "lease-1", computerId: "comp-1", botId: "bot-1", runId: "run-1" },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      computer: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "comp-1",
            homeKey: "home-1",
            kind: "docker",
            providerRef: "sandbox-1",
            executionBotId: "bot-1",
            executionRunId: "run-1",
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      event: {
        groupBy: vi.fn().mockResolvedValue([{ threadId: "thread-1", _max: { seq: 14 } }]),
      },
    };
    const prisma = {
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    } as unknown as PrismaClient;

    const stopped = await cancelClaimedProjectWorkspaceRuns(prisma, actor, {
      id: "project-a",
      claimId: "claim-1",
    });

    expect(stopped.cancelledRunIds).toEqual(["run-1"]);
    expect(stopped.routineIds).toEqual(["routine-1"]);
    expect(stopped.threadNotifications).toEqual([
      { threadId: "thread-1", seq: 14 },
      { threadId: "thread-2", seq: 0 },
    ]);
    expect(stopped.teardownTargets).toEqual([
      {
        computer: { id: "comp-1", homeKey: "home-1", kind: "docker", providerRef: "sandbox-1" },
        botId: "bot-1",
        runId: "run-1",
        lease: { id: "lease-1" },
      },
    ]);
    expect(tx.routine.updateMany).toHaveBeenCalledWith({
      where: { botId: { in: ["bot-1"] } },
      data: { active: false, nextRunAt: null },
    });
  });

  it("refuses finalization when bots or deferred resources remain, and deletes in RESTRICT order when clear", async () => {
    const order: string[] = [];
    const makeTx = (opts: { remainingBots: number; hasDeferred: boolean }) => ({
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: "project-a" }])
        .mockResolvedValueOnce([{ hasDeferred: opts.hasDeferred }])
        .mockResolvedValueOnce([{ id: "project-a" }]),
      bot: { count: vi.fn().mockResolvedValue(opts.remainingBots) },
      run: { deleteMany: vi.fn(async () => { order.push("run"); return { count: 0 }; }) },
      task: { deleteMany: vi.fn(async () => { order.push("task"); return { count: 0 }; }) },
      thread: { deleteMany: vi.fn(async () => { order.push("thread"); return { count: 0 }; }) },
      chatGroup: { deleteMany: vi.fn(async () => { order.push("chatGroup"); return { count: 0 }; }) },
    });

    await expect(
      finalizeProjectWorkspaceDeletion(
        { $transaction: async (cb: (tx: unknown) => unknown) => cb(makeTx({ remainingBots: 1, hasDeferred: false })) } as unknown as PrismaClient,
        actor,
        { id: "project-a", claimId: "claim-1" },
      ),
    ).rejects.toBeInstanceOf(ProjectWorkspaceDeletionInProgressError);

    await expect(
      finalizeProjectWorkspaceDeletion(
        { $transaction: async (cb: (tx: unknown) => unknown) => cb(makeTx({ remainingBots: 0, hasDeferred: true })) } as unknown as PrismaClient,
        actor,
        { id: "project-a", claimId: "claim-1" },
      ),
    ).rejects.toBeInstanceOf(ProjectWorkspaceDeferredResourcesError);

    await finalizeProjectWorkspaceDeletion(
      { $transaction: async (cb: (tx: unknown) => unknown) => cb(makeTx({ remainingBots: 0, hasDeferred: false })) } as unknown as PrismaClient,
      actor,
      { id: "project-a", claimId: "claim-1" },
    );
    expect(order).toEqual(["run", "task", "thread", "chatGroup"]);
  });
});
