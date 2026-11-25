import { runJobKey } from "@rakazo/adapter-kit";
import { runAsTenant, TaskExecutionError } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import type { RouterContext } from "./context.js";
import { tasksRoutes } from "./tasks.js";

const mocks = vi.hoisted(() => ({
  controlManagedTask: vi.fn(),
  confirmManagedTaskStopped: vi.fn(),
  reconcileManagedTaskEffect: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("@rakazo/db", async () => {
  const actual = await vi.importActual<typeof import("@rakazo/db")>("@rakazo/db");
  return {
    ...actual,
    controlManagedTask: mocks.controlManagedTask,
    confirmManagedTaskStopped: mocks.confirmManagedTaskStopped,
    reconcileManagedTaskEffect: mocks.reconcileManagedTaskEffect,
    recordAuditEvent: mocks.recordAuditEvent,
  };
});

function fixture(options?: {
  leases?: Array<{ computerId: string; botId: string; runId: string; fence: number }>;
  computers?: Array<{
    id: string;
    homeKey: string;
    kind: string;
    providerRef: string | null;
    executionBotId: string | null;
    executionRunId: string | null;
  }>;
  confirmRun?: {
    id: string;
    botId: string;
    bot: {
      computer: {
        id: string;
        homeKey: string;
        kind: string;
        providerRef: string | null;
      } | null;
    } | null;
  } | null;
  sandbox?: Record<string, unknown>;
}) {
  const handler = (callback: unknown) => callback;
  const notify = vi.fn().mockResolvedValue(undefined);
  const cancelJob = vi.fn().mockResolvedValue(undefined);
  const findBot = vi.fn().mockResolvedValue(null);
  const findRun = vi.fn().mockResolvedValue(options?.confirmRun ?? null);
  const findLeases = vi.fn().mockResolvedValue(options?.leases ?? []);
  const updateManyLeases = vi.fn().mockResolvedValue({ count: 0 });
  const findComputers = vi.fn().mockResolvedValue(options?.computers ?? []);
  const updateManyComputers = vi.fn().mockResolvedValue({ count: 0 });
  const cancelRunWork = vi.fn().mockResolvedValue(undefined);
  const releaseScreen = vi.fn().mockResolvedValue(undefined);
  const routes = tasksRoutes({
    deps: {
      prisma: {
        bot: { findFirst: findBot },
        run: { findFirst: findRun },
        computerExecutionLease: {
          findMany: findLeases,
          updateMany: updateManyLeases,
        },
        computer: {
          findMany: findComputers,
          updateMany: updateManyComputers,
        },
      },
      events: { notify },
      jobs: { enqueue: vi.fn(), cancel: cancelJob },
      sandbox: {
        observe: vi.fn(),
        cancelRunWork,
        releaseScreen,
        ...options?.sandbox,
      },
    },
    authed: {
      tasks: {
        list: { handler },
        create: { handler },
        dispatch: { handler },
        control: { handler },
        revoke: { handler },
        renew: { handler },
        confirmStop: { handler },
        reconcile: { handler },
        finishReview: { handler },
        verify: { handler },
        inspect: { handler },
        preview: { handler },
      },
    },
  } as unknown as RouterContext);
  return {
    control: routes.tasks.control as unknown as (args: unknown) => Promise<unknown>,
    revoke: routes.tasks.revoke as unknown as (args: unknown) => Promise<unknown>,
    confirmStop: routes.tasks.confirmStop as unknown as (args: unknown) => Promise<unknown>,
    reconcile: routes.tasks.reconcile as unknown as (args: unknown) => Promise<unknown>,
    preview: routes.tasks.preview as unknown as (args: unknown) => Promise<unknown>,
    notify,
    cancelJob,
    findBot,
    findRun,
    findLeases,
    updateManyLeases,
    findComputers,
    updateManyComputers,
    cancelRunWork,
    releaseScreen,
  };
}

describe("tasksRoutes audit, live control, stop confirmation and realtime behavior", () => {
  it("cancels queued job, notifies thread subscribers, and records audit when revoke cancels a queued run", async () => {
    mocks.controlManagedTask.mockReset().mockResolvedValue({
      ok: true,
      runId: "run-1",
      threadId: "thread-1",
      eventSeq: 9,
      cancelledQueuedRun: true,
    });
    mocks.recordAuditEvent.mockReset().mockResolvedValue(undefined);
    const env = fixture();
    const actor = { userId: "user-1", spaceId: "space-1" };

    await expect(
      env.revoke({ context: { actor }, input: { taskId: "task-1", expectedVersion: 2 } }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.controlManagedTask).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      "task-1",
      "cancel",
      2,
    );
    expect(env.cancelJob).toHaveBeenCalledWith(runJobKey("run-1"));
    expect(env.notify).toHaveBeenCalledWith("thread-1", 9);
    expect(env.findLeases).not.toHaveBeenCalled();
    expect(env.cancelRunWork).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "task.mandate.revoked",
        target: { type: "task", id: "task-1" },
      }),
    );
  });

  it("cancels job and wakes thread listeners on pause without tearing down computer work", async () => {
    mocks.controlManagedTask.mockReset().mockResolvedValue({
      ok: true,
      runId: "run-2",
      threadId: "thread-2",
      eventSeq: null,
      cancelledQueuedRun: false,
    });
    mocks.recordAuditEvent.mockReset().mockResolvedValue(undefined);
    const env = fixture();
    const actor = { userId: "user-1", spaceId: "space-1" };

    await expect(
      env.control({
        context: { actor },
        input: { taskId: "task-1", intent: "pause", expectedVersion: 2 },
      }),
    ).resolves.toEqual({ ok: true });
    expect(env.cancelJob).toHaveBeenCalledWith(runJobKey("run-2"));
    expect(env.notify).toHaveBeenCalledWith("thread-2", 0);
    expect(env.findLeases).not.toHaveBeenCalled();
    expect(env.cancelRunWork).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "task.pause",
        target: { type: "task", id: "task-1" },
      }),
    );
  });

  it.each(["control", "revoke"] as const)(
    "cancels job, tears down sandbox work, and expires leases when %s stops a running run",
    async (method) => {
      mocks.controlManagedTask.mockReset().mockResolvedValue({
        ok: true,
        runId: "run-live",
        threadId: "thread-live",
        eventSeq: null,
        cancelledQueuedRun: false,
      });
      mocks.recordAuditEvent.mockReset().mockResolvedValue(undefined);
      const env = fixture({
        leases: [{ computerId: "comp-1", botId: "bot-1", runId: "run-live", fence: 3 }],
        computers: [
          {
            id: "comp-1",
            homeKey: "home-1",
            kind: "native-linux",
            providerRef: "ref-1",
            executionBotId: null,
            executionRunId: null,
          },
        ],
      });
      const actor = { userId: "user-1", spaceId: "space-1" };

      await expect(
        method === "control"
          ? env.control({
              context: { actor },
              input: { taskId: "task-1", intent: "cancel", expectedVersion: 4 },
            })
          : env.revoke({
              context: { actor },
              input: { taskId: "task-1", expectedVersion: 4 },
            }),
      ).resolves.toEqual({ ok: true });

      expect(env.cancelJob).toHaveBeenCalledWith(runJobKey("run-live"));
      expect(env.notify).toHaveBeenCalledWith("thread-live", 0);
      expect(env.cancelRunWork).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ref-1",
          providerRef: "ref-1",
          botId: "home-1",
          kind: "native-linux",
        }),
        "comp-1",
        "run-live",
        expect.objectContaining({
          spaceId: actor.spaceId,
          userId: actor.userId,
          botId: "bot-1",
          runId: "run-live",
          cancelRunWork: true,
        }),
      );
      expect(env.releaseScreen).toHaveBeenCalledOnce();
      expect(env.updateManyLeases).toHaveBeenCalledWith({
        where: { runId: "run-live", computer: { spaceId: "space-1", userId: "user-1" } },
        data: { expiresAt: new Date(0) },
      });
      expect(env.updateManyComputers).toHaveBeenCalledWith({
        where: { spaceId: "space-1", userId: "user-1", executionRunId: "run-live" },
        data: {
          executionRunId: null,
          executionBotId: null,
          executionLeaseExpiresAt: null,
        },
      });
    },
  );

  it("does not fail cancel if best-effort sandbox teardown throws", async () => {
    mocks.controlManagedTask.mockReset().mockResolvedValue({
      ok: true,
      runId: "run-live",
      threadId: "thread-live",
      eventSeq: null,
      cancelledQueuedRun: false,
    });
    mocks.recordAuditEvent.mockReset().mockResolvedValue(undefined);
    const env = fixture({
      leases: [{ computerId: "comp-1", botId: "bot-1", runId: "run-live", fence: 1 }],
      computers: [
        {
          id: "comp-1",
          homeKey: "home-1",
          kind: "native-linux",
          providerRef: "ref-1",
          executionBotId: null,
          executionRunId: null,
        },
      ],
      sandbox: {
        cancelRunWork: vi.fn().mockRejectedValue(new Error("sandbox unreachable")),
        releaseScreen: vi.fn().mockRejectedValue(new Error("release failed")),
      },
    });
    const actor = { userId: "user-1", spaceId: "space-1" };

    await expect(
      env.control({
        context: { actor },
        input: { taskId: "task-1", intent: "cancel", expectedVersion: 4 },
      }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "task.cancel" }),
    );
  });

  it("does not cancel jobs or computer work when resuming via continue", async () => {
    mocks.controlManagedTask.mockReset().mockResolvedValue({
      ok: true,
      runId: "run-1",
      threadId: "thread-1",
      eventSeq: null,
      cancelledQueuedRun: false,
    });
    mocks.recordAuditEvent.mockReset().mockResolvedValue(undefined);
    const env = fixture();
    const actor = { userId: "user-1", spaceId: "space-1" };

    await expect(
      env.control({
        context: { actor },
        input: { taskId: "task-1", intent: "continue", expectedVersion: 5 },
      }),
    ).resolves.toEqual({ ok: true });
    expect(env.cancelJob).not.toHaveBeenCalled();
    expect(env.notify).not.toHaveBeenCalled();
    expect(env.findLeases).not.toHaveBeenCalled();
  });

  it("probes inspectBackgroundWorkEvidence server-side before confirming stop", async () => {
    mocks.confirmManagedTaskStopped.mockReset().mockResolvedValue({
      ok: true,
      quiesced: true,
      version: 3,
    });
    const inspectBackgroundWorkEvidence = vi.fn().mockResolvedValue({
      status: "idle",
      kind: "process_group_empty",
      markerId: "comp-1",
      observedAt: "2026-11-25T00:00:00.000Z",
    });
    const inspectBackgroundWork = vi.fn().mockResolvedValue("active");
    const env = fixture({
      confirmRun: {
        id: "run-1",
        botId: "bot-1",
        bot: {
          computer: {
            id: "comp-1",
            homeKey: "home-1",
            kind: "native-linux",
            providerRef: "ref-1",
          },
        },
      },
      sandbox: { inspectBackgroundWorkEvidence, inspectBackgroundWork },
    });
    const actor = { userId: "user-1", spaceId: "space-1" };

    await expect(
      runAsTenant(actor, () =>
        env.confirmStop({
          context: { actor },
          input: { taskId: "task-1", runId: "run-1", expectedVersion: 2, stoppedConfirmed: true },
        }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(inspectBackgroundWorkEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ref-1",
        providerRef: "ref-1",
        botId: "home-1",
        kind: "native-linux",
      }),
      "comp-1",
      expect.objectContaining({
        spaceId: "space-1",
        userId: "user-1",
        botId: "bot-1",
        runId: "run-1",
      }),
    );
    expect(inspectBackgroundWork).not.toHaveBeenCalled();
    expect(mocks.confirmManagedTaskStopped).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      "task-1",
      "run-1",
      2,
      { backgroundWork: "idle" },
    );
  });

  it("falls back to inspectBackgroundWork and maps stop_evidence_unavailable to CONFLICT", async () => {
    mocks.confirmManagedTaskStopped
      .mockReset()
      .mockRejectedValue(new TaskExecutionError("stop_evidence_unavailable"));
    const inspectBackgroundWork = vi.fn().mockResolvedValue("active");
    const env = fixture({
      confirmRun: {
        id: "run-1",
        botId: "bot-1",
        bot: {
          computer: {
            id: "comp-1",
            homeKey: "home-1",
            kind: "native-linux",
            providerRef: "ref-1",
          },
        },
      },
      sandbox: { inspectBackgroundWork },
    });
    const actor = { userId: "user-1", spaceId: "space-1" };

    await expect(
      runAsTenant(actor, () =>
        env.confirmStop({
          context: { actor },
          input: { taskId: "task-1", runId: "run-1", expectedVersion: 2, stoppedConfirmed: true },
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "stop_evidence_unavailable" });

    expect(inspectBackgroundWork).toHaveBeenCalledOnce();
    expect(mocks.confirmManagedTaskStopped).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      "task-1",
      "run-1",
      2,
      { backgroundWork: "active" },
    );
  });

  it("degrades conservatively to unknown when sandbox background probe throws or providerRef is missing", async () => {
    mocks.confirmManagedTaskStopped
      .mockReset()
      .mockRejectedValue(new TaskExecutionError("stop_evidence_unavailable"));
    const throwingEnv = fixture({
      confirmRun: {
        id: "run-1",
        botId: "bot-1",
        bot: {
          computer: {
            id: "comp-1",
            homeKey: "home-1",
            kind: "native-linux",
            providerRef: "ref-1",
          },
        },
      },
      sandbox: {
        inspectBackgroundWorkEvidence: vi.fn().mockRejectedValue(new Error("transport closed")),
      },
    });
    const actor = { userId: "user-1", spaceId: "space-1" };

    await expect(
      runAsTenant(actor, () =>
        throwingEnv.confirmStop({
          context: { actor },
          input: { taskId: "task-1", runId: "run-1", expectedVersion: 2, stoppedConfirmed: true },
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "stop_evidence_unavailable" });
    expect(mocks.confirmManagedTaskStopped).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      "task-1",
      "run-1",
      2,
      { backgroundWork: "unknown" },
    );

    mocks.confirmManagedTaskStopped.mockClear();
    const noRefEnv = fixture({
      confirmRun: {
        id: "run-1",
        botId: "bot-1",
        bot: {
          computer: {
            id: "comp-1",
            homeKey: "home-1",
            kind: "native-linux",
            providerRef: null,
          },
        },
      },
    });
    await expect(
      runAsTenant(actor, () =>
        noRefEnv.confirmStop({
          context: { actor },
          input: { taskId: "task-1", runId: "run-1", expectedVersion: 2, stoppedConfirmed: true },
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "stop_evidence_unavailable" });
    expect(mocks.confirmManagedTaskStopped).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      "task-1",
      "run-1",
      2,
      { backgroundWork: "unknown" },
    );
  });

  it("records an audit event when reconciling a managed task effect", async () => {
    mocks.reconcileManagedTaskEffect.mockReset().mockResolvedValue({ ok: true });
    mocks.recordAuditEvent.mockReset().mockResolvedValue(undefined);
    const env = fixture();
    const actor = { userId: "user-1", spaceId: "space-1" };

    await expect(
      env.reconcile({
        context: { actor },
        input: { taskId: "task-1", effectId: "eff-1", outcome: "not_applied", expectedVersion: 3 },
      }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "task.effect.reconciled",
        target: { type: "task", id: "task-1" },
        metadata: { effectId: "eff-1", outcome: "not_applied" },
      }),
    );
  });

  it("scopes task preview bot lookup to the active project workspace", async () => {
    const env = fixture();
    const actor = { userId: "user-1", spaceId: "space-1" };
    await expect(
      runAsTenant({ ...actor, projectWorkspaceId: "project-1" }, () =>
        env.preview({ context: { actor }, input: { botId: "bot-1" } }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(env.findBot).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "bot-1",
          spaceId: "space-1",
          userId: "user-1",
          projectWorkspaceId: "project-1",
          archivedAt: null,
        },
      }),
    );
  });
});
