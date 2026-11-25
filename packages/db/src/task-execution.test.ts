import type { TaskExecutionState } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { appendEventInTransaction } from "./events.js";
import { runAsTenant } from "./row-security.js";
import {
  confirmManagedTaskStopped,
  controlManagedTask,
  createManagedTask,
  dispatchManagedTask,
  guardManagedRun,
  preflightManagedRun,
  reconcileManagedTaskEffect,
  renewManagedTaskMandate,
  rollbackManagedModelReservation,
  TaskExecutionError,
  verifyManagedTaskCompletion,
} from "./task-execution.js";

vi.mock("./events.js", () => ({
  appendEventInTransaction: vi.fn(async () => ({ seq: 42 })),
}));

const actor = { userId: "user-1", spaceId: "space-1" };

describe("managed task creation replay", () => {
  it("rejects changed budgets and reuses an identical request", async () => {
    const state = harness().state();
    const task = {
      id: "task-1",
      ...actor,
      projectWorkspaceId: null,
      botId: "bot-1",
      threadId: "thread-1",
      prompt: "prompt",
      status: "queued",
      createdAt: new Date(0),
      updatedAt: new Date(0),
      executionState: state,
    };
    const tx = {
      thread: { findFirst: vi.fn(async () => ({ id: task.threadId })) },
      task: { upsert: vi.fn(async () => task) },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) =>
        operation(tx),
      ),
    } as unknown as PrismaClient;
    const input = {
      botId: task.botId,
      prompt: task.prompt,
      clientNonce: "nonce-1",
      budget: state.budget,
    };

    await runAsTenant(actor, async () => {
      await expect(createManagedTask(prisma, actor, input)).resolves.toMatchObject({ id: task.id });
      for (const key of Object.keys(state.budget) as (keyof typeof state.budget)[]) {
        const changed = { ...input, budget: { ...input.budget, [key]: input.budget[key] + 1 } };
        await expect(createManagedTask(prisma, actor, changed)).rejects.toThrow(
          "nonce_payload_mismatch",
        );
      }
    });
  });
});

describe("managed task retry budget", () => {
  it.each([false, true])("preserves usage and deadline on retry (expired: %s)", async (expired) => {
    const now = Date.now();
    const state = {
      ...harness().state(),
      control: { intent: "continue" as const, quiesced: true },
      deadline: now + (expired ? -1 : 60_000),
      modelCalls: 2,
      reservedTokens: 1000,
      toolCalls: [{ id: "old-call", tool: "read_file", reservedTokens: 0 }],
    };
    const task = {
      id: "task-1",
      ...actor,
      projectWorkspaceId: null,
      botId: "bot-1",
      threadId: "thread-1",
      prompt: "prompt",
      status: "running",
      createdAt: new Date(0),
      updatedAt: new Date(0),
      executionState: state,
    };
    const tx = {
      $queryRaw: vi.fn(async () => [{ id: task.id }]),
      task: {
        findMany: vi.fn(async () => [task]),
        update: vi.fn(async () => task),
      },
      run: {
        findFirst: vi.fn(async () => null),
        count: vi.fn(async () => 1),
        create: vi.fn(async () => ({ id: "run-2" })),
        update: vi.fn(async () => ({})),
      },
      externalEffect: { findFirst: vi.fn(async () => null) },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) =>
        operation(tx),
      ),
    } as unknown as PrismaClient;
    const input = {
      taskId: task.id,
      expectedVersion: state.version,
      clientNonce: "retry-1",
      retry: true,
      expiresAt: now + 60_000,
      modelDataConsent: true,
      scopes: [{ tool: "read_file", action: "execute", resource: "workspace" }],
    };

    await runAsTenant(actor, async () => {
      if (expired) {
        await expect(dispatchManagedTask(prisma, actor, input)).rejects.toThrow(
          "task_deadline_exceeded",
        );
        expect(tx.run.create).not.toHaveBeenCalled();
      } else {
        await expect(dispatchManagedTask(prisma, actor, input)).resolves.toEqual({
          runId: "run-2",
          reused: false,
        });
        expect(tx.task.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              executionState: expect.objectContaining({
                deadline: state.deadline,
                modelCalls: 2,
                reservedTokens: 1000,
                toolCalls: state.toolCalls,
              }),
            }),
          }),
        );
      }
    });
  });
});

function harness(
  options: {
    control?: { intent: "continue" | "pause" | "cancel"; quiesced: boolean };
    version?: number;
    currentRunId?: string | null;
    runStatus?: string;
    effect?: { id: string; status: string } | null;
    runLease?: { leaseOwner: string; leaseFence: number; leaseExpiresAt: Date | null };
    queuedCancelCount?: number;
    mandate?: object;
    deadline?: number | null;
    modelCalls?: number;
    reservedTokens?: number;
    toolCalls?: Array<{ id: string; tool: string; reservedTokens: number }>;
    maxToolCalls?: number;
    maxModelCalls?: number;
    maxReservedTokens?: number;
    activeLease?: { id: string } | null;
    activeComputer?: { id: string } | null;
    attemptCount?: number;
  } = {},
) {
  let savedState: TaskExecutionState = {
    format: 1 as const,
    version: options.version ?? 2,
    currentRunId: options.currentRunId === undefined ? "run-1" : options.currentRunId,
    control: options.control ?? { intent: "continue" as const, quiesced: false },
    completionEvidence: null,
    budget: {
      maxRuns: 3,
      maxToolCalls: options.maxToolCalls ?? 20,
      maxModelCalls: options.maxModelCalls ?? 8,
      maxReservedTokens: options.maxReservedTokens ?? 100_000,
      timeoutMs: 900_000,
    },
    deadline: options.deadline === undefined ? null : options.deadline,
    modelCalls: options.modelCalls ?? 0,
    reservedTokens: options.reservedTokens ?? 0,
    toolCalls: options.toolCalls ?? [],
  };
  const task = {
    id: "task-1",
    userId: actor.userId,
    spaceId: actor.spaceId,
    projectWorkspaceId: null,
    botId: "bot-1",
    threadId: "thread-1",
    prompt: "prompt",
    status: "running",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    executionState: savedState,
  };
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: task.id }]),
    task: {
      findMany: vi.fn(async () => [{ ...task, executionState: savedState }]),
      update: vi.fn(async ({ data }: { data: { executionState: typeof savedState } }) => {
        savedState = data.executionState;
        return task;
      }),
    },
    run: {
      findFirst: vi.fn(async () => ({
        id: "run-1",
        status: options.runStatus ?? "failed",
        taskMandate: options.mandate,
        ...options.runLease,
      })),
      updateMany: vi.fn(async () => ({ count: options.queuedCancelCount ?? 0 })),
      findMany: vi.fn(async () => [{ id: "run-1", ...actor }]),
    },
    computerExecutionLease: {
      findFirst: vi.fn(async () => options.activeLease ?? null),
    },
    computer: {
      findFirst: vi.fn(async () => options.activeComputer ?? null),
    },
    attempt: {
      count: vi.fn(async () => options.attemptCount ?? 1),
    },
    externalEffect: {
      findFirst: vi.fn(async () => options.effect ?? null),
      update: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    message: { findMany: vi.fn(async () => []) },
    secret: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  };
  const prisma = {
    $transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
  } as unknown as PrismaClient;
  return { prisma, tx, state: () => savedState };
}

describe("managed task state transitions", () => {
  it("atomically cancels a queued Run without claiming its work is quiescent", async () => {
    const db = harness({ queuedCancelCount: 1 });
    const result = await runAsTenant(actor, () =>
      controlManagedTask(db.prisma, actor, "task-1", "cancel", 2),
    );

    expect(result).toEqual({
      ok: true,
      runId: "run-1",
      threadId: "thread-1",
      eventSeq: 42,
      cancelledQueuedRun: true,
    });
    expect(db.tx.run.updateMany).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        taskId: "task-1",
        ...actor,
        projectWorkspaceId: null,
        trigger: "managed_task",
        status: "queued",
      },
      data: {
        status: "cancelled",
        completedAt: expect.any(Date),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    expect(db.tx.externalEffect.deleteMany).toHaveBeenCalled();
    expect(vi.mocked(appendEventInTransaction)).toHaveBeenCalledWith(
      db.tx,
      expect.objectContaining({
        type: "run.cancelled",
        runId: "run-1",
        threadId: "thread-1",
        botId: "bot-1",
      }),
    );
    expect(db.state().control).toEqual({ intent: "cancel", quiesced: false });
    expect(db.state().version).toBe(3);
  });

  it("keeps stop unconfirmed and still returns runId/threadId if the worker claims the Run first", async () => {
    const db = harness({ queuedCancelCount: 0 });
    const result = await runAsTenant(actor, () =>
      controlManagedTask(db.prisma, actor, "task-1", "cancel", 2),
    );

    expect(result).toEqual({
      ok: true,
      runId: "run-1",
      threadId: "thread-1",
      eventSeq: null,
      cancelledQueuedRun: false,
    });
    expect(db.tx.externalEffect.deleteMany).not.toHaveBeenCalled();
    expect(db.state().control).toEqual({ intent: "cancel", quiesced: false });
  });

  it("returns runId and threadId when pausing an active managed task", async () => {
    const db = harness();
    const result = await runAsTenant(actor, () =>
      controlManagedTask(db.prisma, actor, "task-1", "pause", 2),
    );

    expect(result).toEqual({
      ok: true,
      runId: "run-1",
      threadId: "thread-1",
      eventSeq: null,
      cancelledQueuedRun: false,
    });
    expect(db.state().control).toEqual({ intent: "pause", quiesced: false });
    expect(db.state().version).toBe(3);
  });

  it("does not allow a cancelled task to continue", async () => {
    const db = harness({ control: { intent: "cancel", quiesced: true } });

    await runAsTenant(actor, async () => {
      await expect(controlManagedTask(db.prisma, actor, "task-1", "continue", 2)).rejects.toThrow(
        new TaskExecutionError("task_cancelled"),
      );
    });
    expect(db.tx.task.update).not.toHaveBeenCalled();
  });

  it("rejects renewal of a terminal Run", async () => {
    const db = harness({ runStatus: "completed" });
    await runAsTenant(actor, async () => {
      await expect(
        renewManagedTaskMandate(db.prisma, actor, "task-1", "run-1", 2, Date.now() + 60_000),
      ).rejects.toThrow(new TaskExecutionError("run_not_active"));
    });
    expect(db.tx.run.updateMany).not.toHaveBeenCalled();
  });

  it("rejects renewal when the Run changes state during the update", async () => {
    const now = Date.now();
    const db = harness({
      runStatus: "running",
      queuedCancelCount: 0,
      mandate: {
        id: "mandate-1",
        ...actor,
        botId: "bot-1",
        threadId: "thread-1",
        taskId: "task-1",
        runId: "run-1",
        source: "authenticated_user",
        issuedAt: now,
        expiresAt: now + 30_000,
        scopes: [{ tool: "web_fetch", action: "execute", resource: "https://example.com/" }],
      },
    });
    await runAsTenant(actor, async () => {
      await expect(
        renewManagedTaskMandate(db.prisma, actor, "task-1", "run-1", 2, now + 60_000),
      ).rejects.toThrow(new TaskExecutionError("run_state_changed"));
    });
    expect(db.tx.run.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "run-1",
          taskId: "task-1",
          ...actor,
          projectWorkspaceId: null,
          status: "running",
        },
      }),
    );
    expect(db.tx.task.update).not.toHaveBeenCalled();
  });

  it("does not resume a paused task while effects are unresolved", async () => {
    const db = harness({
      control: { intent: "pause", quiesced: true },
      effect: { id: "effect-1", status: "ambiguous" },
    });

    await runAsTenant(actor, async () => {
      await expect(controlManagedTask(db.prisma, actor, "task-1", "continue", 2)).rejects.toThrow(
        new TaskExecutionError("effects_unresolved"),
      );
    });
    expect(db.tx.task.update).not.toHaveBeenCalled();
  });

  it("rejects stale confirmation and active Runs", async () => {
    const stale = harness({ version: 3 });
    await runAsTenant(actor, async () => {
      await expect(
        confirmManagedTaskStopped(stale.prisma, actor, "task-1", "run-1", 2),
      ).rejects.toThrow(new TaskExecutionError("version_conflict"));
    });

    const active = harness({
      control: { intent: "pause", quiesced: false },
      runStatus: "running",
    });
    await runAsTenant(actor, async () => {
      await expect(
        confirmManagedTaskStopped(active.prisma, actor, "task-1", "run-1", 2),
      ).rejects.toThrow(new TaskExecutionError("run_not_stopped"));
    });
    expect(active.tx.task.update).not.toHaveBeenCalled();
  });

  it("reconciles only pending effects and advances the task version", async () => {
    const db = harness({
      control: { intent: "pause", quiesced: true },
      effect: { id: "effect-1", status: "ambiguous" },
    });

    await runAsTenant(actor, () =>
      reconcileManagedTaskEffect(db.prisma, actor, "task-1", "effect-1", "completed", 2),
    );

    expect(db.tx.externalEffect.update).toHaveBeenCalledWith({
      where: { id: "effect-1" },
      data: { status: "completed" },
    });
    expect(db.state().version).toBe(3);
  });

  it("does not rewrite a settled effect during reconciliation", async () => {
    const db = harness({
      control: { intent: "pause", quiesced: true },
      effect: { id: "effect-1", status: "completed" },
    });

    await runAsTenant(actor, async () => {
      await expect(
        reconcileManagedTaskEffect(db.prisma, actor, "task-1", "effect-1", "not_applied", 2),
      ).rejects.toThrow(new TaskExecutionError("effect_not_reconcilable"));
    });
    expect(db.tx.externalEffect.update).not.toHaveBeenCalled();
  });

  it("does not treat a terminal Run as proof that background work stopped", async () => {
    const db = harness({ control: { intent: "pause", quiesced: false } });
    await runAsTenant(actor, async () => {
      await expect(
        confirmManagedTaskStopped(db.prisma, actor, "task-1", "run-1", 2),
      ).rejects.toThrow(new TaskExecutionError("stop_evidence_unavailable"));
    });
    expect(db.tx.task.update).not.toHaveBeenCalled();
  });

  it("does not verify completion after cancellation", async () => {
    const db = harness({
      control: { intent: "cancel", quiesced: false },
      runStatus: "completed",
    });
    await runAsTenant(actor, async () => {
      await expect(
        verifyManagedTaskCompletion(db.prisma, actor, "task-1", "run-1", 2),
      ).rejects.toThrow(new TaskExecutionError("control_blocked"));
    });
    expect(db.tx.task.update).not.toHaveBeenCalled();
  });

  it("checks unresolved effects across every Run before verifying completion", async () => {
    const db = harness({
      runStatus: "completed",
      effect: { id: "older-effect", status: "ambiguous" },
    });
    await runAsTenant(actor, async () => {
      await expect(
        verifyManagedTaskCompletion(db.prisma, actor, "task-1", "run-1", 2),
      ).rejects.toThrow(new TaskExecutionError("effects_unresolved"));
    });
    expect(db.tx.externalEffect.findFirst).toHaveBeenCalledWith({
      where: {
        run: { taskId: "task-1", ...actor, projectWorkspaceId: null },
        spaceId: actor.spaceId,
        kind: { not: "runtime_checkpoint" },
        status: { notIn: ["completed", "denied", "reconciled"] },
      },
      select: { id: true },
    });
    expect(db.tx.task.update).not.toHaveBeenCalled();
  });

  it("rejects an expired Run lease before any managed action", async () => {
    const db = harness({
      runStatus: "running",
      runLease: { leaseOwner: "worker-1", leaseFence: 2, leaseExpiresAt: new Date(0) },
    });
    await runAsTenant(actor, async () => {
      await expect(
        guardManagedRun(
          db.prisma,
          actor,
          "task-1",
          {
            runId: "run-1",
            workerId: "worker-1",
            fence: 2,
            action: { tool: "model_call", action: "execute", resource: "model" },
          },
          0,
        ),
      ).rejects.toThrow(new TaskExecutionError("lease_expired"));
    });
    expect(db.tx.task.update).not.toHaveBeenCalled();
  });

  it("confirms stop for a queued-cancelled Run with zero attempts", async () => {
    const db = harness({
      control: { intent: "cancel", quiesced: false },
      runStatus: "cancelled",
      attemptCount: 0,
    });
    const result = await runAsTenant(actor, () =>
      confirmManagedTaskStopped(db.prisma, actor, "task-1", "run-1", 2),
    );

    expect(result).toEqual({ ok: true, quiesced: true, version: 3 });
    expect(db.state().control).toEqual({ intent: "cancel", quiesced: true });
    expect(db.state().version).toBe(3);
  });

  it("confirms stop when attempts ran only with idle server-side background work evidence and no active computer leases", async () => {
    const db = harness({
      control: { intent: "pause", quiesced: false },
      runStatus: "failed",
      attemptCount: 2,
    });
    const result = await runAsTenant(actor, () =>
      confirmManagedTaskStopped(db.prisma, actor, "task-1", "run-1", 2, {
        backgroundWork: "idle",
      }),
    );

    expect(result).toEqual({ ok: true, quiesced: true, version: 3 });
    expect(db.state().control).toEqual({ intent: "pause", quiesced: true });
    expect(db.state().version).toBe(3);
  });

  it.each(["unknown", "active", "unused"] as const)(
    "rejects stop confirmation when attempts ran and backgroundWork is %s",
    async (backgroundWork) => {
      const db = harness({
        control: { intent: "pause", quiesced: false },
        runStatus: "failed",
        attemptCount: 1,
      });
      await runAsTenant(actor, async () => {
        await expect(
          confirmManagedTaskStopped(db.prisma, actor, "task-1", "run-1", 2, { backgroundWork }),
        ).rejects.toThrow(new TaskExecutionError("stop_evidence_unavailable"));
      });
      expect(db.tx.task.update).not.toHaveBeenCalled();
    },
  );

  it("rejects stop confirmation when an active computer execution lease or legacy execution binding exists", async () => {
    const leased = harness({
      control: { intent: "cancel", quiesced: false },
      runStatus: "cancelled",
      attemptCount: 0,
      activeLease: { id: "lease-1" },
    });
    await runAsTenant(actor, async () => {
      await expect(
        confirmManagedTaskStopped(leased.prisma, actor, "task-1", "run-1", 2, {
          backgroundWork: "idle",
        }),
      ).rejects.toThrow(new TaskExecutionError("stop_evidence_unavailable"));
    });
    expect(leased.tx.task.update).not.toHaveBeenCalled();

    const boundComputer = harness({
      control: { intent: "pause", quiesced: false },
      runStatus: "failed",
      attemptCount: 0,
      activeComputer: { id: "comp-1" },
    });
    await runAsTenant(actor, async () => {
      await expect(
        confirmManagedTaskStopped(boundComputer.prisma, actor, "task-1", "run-1", 2, {
          backgroundWork: "idle",
        }),
      ).rejects.toThrow(new TaskExecutionError("stop_evidence_unavailable"));
    });
    expect(boundComputer.tx.task.update).not.toHaveBeenCalled();
  });

  it("checks managed run preconditions without mutating usage during preflightManagedRun", async () => {
    const now = Date.now();
    const mandate = {
      id: "mandate-1",
      ...actor,
      botId: "bot-1",
      threadId: "thread-1",
      taskId: "task-1",
      runId: "run-1",
      source: "authenticated_user" as const,
      issuedAt: now,
      expiresAt: now + 60_000,
      scopes: [{ tool: "read_file", action: "execute", resource: "workspace" }],
    };
    const input = {
      runId: "run-1",
      workerId: "worker-1",
      fence: 2,
      action: { tool: "read_file", action: "execute", resource: "workspace" },
    };

    const allowedDb = harness({
      runStatus: "running",
      runLease: { leaseOwner: "worker-1", leaseFence: 2, leaseExpiresAt: new Date(now + 60_000) },
      mandate,
    });
    await expect(
      runAsTenant(actor, () => preflightManagedRun(allowedDb.prisma, actor, "task-1", input, 0)),
    ).resolves.toEqual({ allowed: true });
    expect(allowedDb.tx.$queryRaw).not.toHaveBeenCalled();
    expect(allowedDb.tx.task.update).not.toHaveBeenCalled();
    expect(allowedDb.state().toolCalls).toEqual([]);

    const pausedDb = harness({
      control: { intent: "pause", quiesced: false },
      runStatus: "running",
      runLease: { leaseOwner: "worker-1", leaseFence: 2, leaseExpiresAt: new Date(now + 60_000) },
      mandate,
    });
    await expect(
      runAsTenant(actor, () => preflightManagedRun(pausedDb.prisma, actor, "task-1", input, 0)),
    ).resolves.toEqual({
      allowed: false,
      code: "control_blocked",
      reason: "control_blocked",
    });
    expect(pausedDb.tx.task.update).not.toHaveBeenCalled();

    const cappedDb = harness({
      runStatus: "running",
      runLease: { leaseOwner: "worker-1", leaseFence: 2, leaseExpiresAt: new Date(now + 60_000) },
      mandate,
      maxToolCalls: 1,
      toolCalls: [{ id: "call-0", tool: "read_file", reservedTokens: 0 }],
    });
    await expect(
      runAsTenant(actor, () => preflightManagedRun(cappedDb.prisma, actor, "task-1", input, 0)),
    ).resolves.toEqual({
      allowed: false,
      code: "tool_calls_exceeded",
      reason: "tool_calls_exceeded",
    });
    expect(cappedDb.tx.task.update).not.toHaveBeenCalled();
  });

  it("rolls back model call reservation with zero floor and ignores mismatched runId", async () => {
    const db = harness({ modelCalls: 2, reservedTokens: 500 });
    const rolled = await runAsTenant(actor, () =>
      rollbackManagedModelReservation(db.prisma, actor, "task-1", {
        runId: "run-1",
        reservedTokens: 200,
      }),
    );
    expect(rolled).toEqual({ rolledBack: true, modelCalls: 1, reservedTokens: 300 });
    expect(db.state().modelCalls).toBe(1);
    expect(db.state().reservedTokens).toBe(300);
    expect(db.state().version).toBe(2);

    const floored = await runAsTenant(actor, () =>
      rollbackManagedModelReservation(db.prisma, actor, "task-1", {
        runId: "run-1",
        reservedTokens: 1_000,
      }),
    );
    expect(floored).toEqual({ rolledBack: true, modelCalls: 0, reservedTokens: 0 });
    expect(db.state().modelCalls).toBe(0);
    expect(db.state().reservedTokens).toBe(0);

    db.tx.task.update.mockClear();
    const ignored = await runAsTenant(actor, () =>
      rollbackManagedModelReservation(db.prisma, actor, "task-1", {
        runId: "run-other",
        reservedTokens: 100,
      }),
    );
    expect(ignored).toEqual({ rolledBack: false });
    expect(db.tx.task.update).not.toHaveBeenCalled();
  });
});
