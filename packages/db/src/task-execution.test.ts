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
  reconcileManagedTaskEffect,
  renewManagedTaskMandate,
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
    runStatus?: string;
    effect?: { id: string; status: string } | null;
    runLease?: { leaseOwner: string; leaseFence: number; leaseExpiresAt: Date | null };
    queuedCancelCount?: number;
    mandate?: object;
  } = {},
) {
  let savedState: TaskExecutionState = {
    format: 1 as const,
    version: options.version ?? 2,
    currentRunId: "run-1",
    control: options.control ?? { intent: "continue" as const, quiesced: false },
    completionEvidence: null,
    budget: {
      maxRuns: 3,
      maxToolCalls: 20,
      maxModelCalls: 8,
      maxReservedTokens: 100_000,
      timeoutMs: 900_000,
    },
    deadline: null,
    modelCalls: 0,
    reservedTokens: 0,
    toolCalls: [],
  };
  const task = {
    id: "task-1",
    userId: actor.userId,
    spaceId: actor.spaceId,
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
    await runAsTenant(actor, () => controlManagedTask(db.prisma, actor, "task-1", "cancel", 2));

    expect(db.tx.run.updateMany).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        taskId: "task-1",
        ...actor,
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

  it("keeps stop unconfirmed if the worker claims the Run first", async () => {
    const db = harness({ queuedCancelCount: 0 });
    await runAsTenant(actor, () => controlManagedTask(db.prisma, actor, "task-1", "cancel", 2));

    expect(db.tx.externalEffect.deleteMany).not.toHaveBeenCalled();
    expect(db.state().control).toEqual({ intent: "cancel", quiesced: false });
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
        where: { id: "run-1", taskId: "task-1", ...actor, status: "running" },
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
        run: { taskId: "task-1", ...actor },
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
});
