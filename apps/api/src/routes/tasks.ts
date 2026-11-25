import { ORPCError } from "@orpc/server";
import { runContinueJob, runJobKey } from "@rakazo/adapter-kit";
import { cancelComputerRunWork, screenLeaseIdForRun, toComputerRef } from "@rakazo/adapters";
import { SandboxKind } from "@rakazo/contracts";
import { projectTask } from "@rakazo/core";
import type { ManagedTaskStopEvidence } from "@rakazo/db";
import {
  confirmManagedTaskStopped,
  conversationScopeWhere,
  controlManagedTask,
  createManagedTask,
  dispatchManagedTask,
  expireComputerExecutionLeases,
  finishManagedTaskReview,
  IsolationError,
  readTaskExecutionHistory,
  reconcileManagedTaskEffect,
  recordAuditEvent,
  renewManagedTaskMandate,
  TaskExecutionError,
  taskSummary,
  verifyManagedTaskCompletion,
} from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import type { RouterContext } from "./context.js";

async function taskOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof IsolationError) throw new ORPCError("NOT_FOUND");
    if (error instanceof TaskExecutionError) {
      throw new ORPCError("CONFLICT", { message: error.message });
    }
    throw error;
  }
}

async function cancelManagedRunComputerWork(
  deps: RouterContext["deps"],
  actor: { userId: string; spaceId: string },
  runId: string,
): Promise<void> {
  try {
    const leases = await deps.prisma.computerExecutionLease.findMany({
      where: { runId, computer: { spaceId: actor.spaceId, userId: actor.userId } },
      select: { computerId: true, botId: true, runId: true, fence: true },
    });
    const leaseComputerIds = [...new Set(leases.map((lease) => lease.computerId))];
    const computers = await deps.prisma.computer.findMany({
      where: {
        spaceId: actor.spaceId,
        userId: actor.userId,
        ...(leaseComputerIds.length > 0
          ? { OR: [{ id: { in: leaseComputerIds } }, { executionRunId: runId }] }
          : { executionRunId: runId }),
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
    const teardownTargets: Array<{
      computer: (typeof computers)[number];
      botId: string;
      lease: (typeof leases)[number] | null;
    }> = [];
    const seenComputerIds = new Set<string>();
    for (const lease of leases) {
      const computer = computerById.get(lease.computerId);
      if (!computer || seenComputerIds.has(computer.id)) continue;
      seenComputerIds.add(computer.id);
      teardownTargets.push({ computer, botId: lease.botId, lease });
    }
    for (const computer of computers) {
      if (!computer.executionBotId || computer.executionRunId !== runId) continue;
      if (seenComputerIds.has(computer.id)) continue;
      seenComputerIds.add(computer.id);
      teardownTargets.push({ computer, botId: computer.executionBotId, lease: null });
    }
    await Promise.all(
      teardownTargets.map(async ({ computer, botId, lease }) => {
        if (!computer.providerRef) return;
        const cancelContext = {
          operationId: `task-cancel:${runId}`,
          traceId: `task-cancel:${runId}`,
          spaceId: actor.spaceId,
          userId: actor.userId,
          botId,
          runId,
          screenLeaseId: screenLeaseIdForRun(lease, runId),
          cancelRunWork: true,
          signal: AbortSignal.timeout(15_000),
        };
        const ref = toComputerRef(computer);
        await cancelComputerRunWork(deps.sandbox, ref, computer.id, runId, cancelContext);
        await deps.sandbox.releaseScreen?.(ref, cancelContext).catch(() => undefined);
      }),
    );
    await expireComputerExecutionLeases(deps.prisma, {
      runId,
      computer: { spaceId: actor.spaceId, userId: actor.userId },
    });
    await deps.prisma.computer.updateMany({
      where: {
        spaceId: actor.spaceId,
        userId: actor.userId,
        executionRunId: runId,
      },
      data: {
        executionRunId: null,
        executionBotId: null,
        executionLeaseExpiresAt: null,
      },
    });
  } catch (error) {
    getLogger().error("managed task cancel computer teardown", error);
  }
}

async function applyManagedTaskControlSideEffects(
  deps: RouterContext["deps"],
  actor: { userId: string; spaceId: string },
  intent: "pause" | "cancel" | "continue",
  result: {
    runId: string | null;
    threadId: string | null;
    eventSeq: number | null;
    cancelledQueuedRun: boolean;
  },
  label: "control" | "revoke",
): Promise<void> {
  if (intent === "pause" || intent === "cancel") {
    if (result.runId) {
      await deps.jobs.cancel(runJobKey(result.runId)).catch((error) => {
        getLogger().error(`managed task ${label} job cancel`, error);
      });
    }
    if (result.threadId) {
      await deps.events.notify(result.threadId, result.eventSeq ?? 0).catch((error) => {
        getLogger().error(`managed task ${label} realtime notification`, error);
      });
    }
    if (intent === "cancel" && result.runId && !result.cancelledQueuedRun) {
      await cancelManagedRunComputerWork(deps, actor, result.runId);
    }
    return;
  }
  if (result.threadId && result.eventSeq !== null) {
    await deps.events.notify(result.threadId, result.eventSeq).catch((error) => {
      getLogger().error(`managed task ${label} realtime notification`, error);
    });
  }
}

async function probeManagedRunBackgroundWork(
  deps: RouterContext["deps"],
  actor: { userId: string; spaceId: string },
  input: { taskId: string; runId: string },
  signal?: AbortSignal,
): Promise<ManagedTaskStopEvidence["backgroundWork"]> {
  const run = await deps.prisma.run.findFirst({
    where: {
      id: input.runId,
      taskId: input.taskId,
      ...conversationScopeWhere(actor),
    },
    select: {
      id: true,
      botId: true,
      bot: {
        select: {
          computer: {
            select: {
              id: true,
              homeKey: true,
              kind: true,
              providerRef: true,
            },
          },
        },
      },
    },
  });
  const computer = run?.bot?.computer;
  if (!run || !computer?.providerRef) return "unknown";
  const ref = toComputerRef(computer);
  const probeContext = {
    operationId: `task-confirm-stop:${input.taskId}:${input.runId}`,
    traceId: `task-confirm-stop:${input.taskId}:${input.runId}`,
    spaceId: actor.spaceId,
    userId: actor.userId,
    botId: run.botId,
    runId: run.id,
    signal: signal ?? AbortSignal.timeout(10_000),
  };
  try {
    if (deps.sandbox.inspectBackgroundWorkEvidence) {
      const evidence = await deps.sandbox.inspectBackgroundWorkEvidence(
        ref,
        computer.id,
        probeContext,
      );
      return evidence.status;
    }
    if (deps.sandbox.inspectBackgroundWork) {
      return await deps.sandbox.inspectBackgroundWork(ref, computer.id, probeContext);
    }
  } catch (error) {
    getLogger().warn("managed task confirm stop background work probe failed", {
      taskId: input.taskId,
      runId: input.runId,
      computerId: computer.id,
      error,
    });
  }
  return "unknown";
}

export function tasksRoutes(ctx: RouterContext) {
  const { deps, authed } = ctx;
  return {
    tasks: {
      list: authed.tasks.list.handler(async ({ context, input }) => {
        const rows = await deps.prisma.task.findMany({
          where: {
            ...conversationScopeWhere(context.actor),
            ...(input.botId ? { botId: input.botId } : {}),
            executionState: { path: ["format"], equals: 1 },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 100,
        });
        return rows.map(taskSummary);
      }),
      create: authed.tasks.create.handler(({ context, input }) =>
        taskOperation(async () => {
          const result = await createManagedTask(deps.prisma, context.actor, input);
          await recordAuditEvent({
            action: "task.created",
            actor: { type: "user", id: context.actor.userId },
            spaceId: context.actor.spaceId,
            target: { type: "task", id: result.id },
          });
          return result;
        }),
      ),
      dispatch: authed.tasks.dispatch.handler(({ context, input }) =>
        taskOperation(async () => {
          const result = await dispatchManagedTask(deps.prisma, context.actor, input);
          await recordAuditEvent({
            action: "task.dispatched",
            actor: { type: "user", id: context.actor.userId },
            spaceId: context.actor.spaceId,
            target: { type: "task", id: input.taskId },
            runId: result.runId,
            metadata: { reused: result.reused },
          });
          await deps.jobs
            .enqueue({ ...runContinueJob(result.runId), keepExisting: true })
            .catch((error) => {
              getLogger().error("managed task enqueue", error);
            });
          return result;
        }),
      ),
      control: authed.tasks.control.handler(({ context, input }) =>
        taskOperation(async () => {
          const result = await controlManagedTask(
            deps.prisma,
            context.actor,
            input.taskId,
            input.intent,
            input.expectedVersion,
          );
          await applyManagedTaskControlSideEffects(
            deps,
            context.actor,
            input.intent,
            result,
            "control",
          );
          await recordAuditEvent({
            action: `task.${input.intent}`,
            actor: { type: "user", id: context.actor.userId },
            spaceId: context.actor.spaceId,
            target: { type: "task", id: input.taskId },
          });
          return { ok: true as const };
        }),
      ),
      revoke: authed.tasks.revoke.handler(({ context, input }) =>
        taskOperation(async () => {
          const result = await controlManagedTask(
            deps.prisma,
            context.actor,
            input.taskId,
            "cancel",
            input.expectedVersion,
          );
          await applyManagedTaskControlSideEffects(
            deps,
            context.actor,
            "cancel",
            result,
            "revoke",
          );
          await recordAuditEvent({
            action: "task.mandate.revoked",
            actor: { type: "user", id: context.actor.userId },
            spaceId: context.actor.spaceId,
            target: { type: "task", id: input.taskId },
          });
          return { ok: true as const };
        }),
      ),
      renew: authed.tasks.renew.handler(({ context, input }) =>
        taskOperation(async () => {
          await renewManagedTaskMandate(
            deps.prisma,
            context.actor,
            input.taskId,
            input.runId,
            input.expectedVersion,
            input.expiresAt,
          );
          return { ok: true as const };
        }),
      ),
      confirmStop: authed.tasks.confirmStop.handler(({ context, input }) =>
        taskOperation(async () => {
          const backgroundWork = await probeManagedRunBackgroundWork(
            deps,
            context.actor,
            input,
            context.signal,
          );
          await confirmManagedTaskStopped(
            deps.prisma,
            context.actor,
            input.taskId,
            input.runId,
            input.expectedVersion,
            { backgroundWork },
          );
          return { ok: true as const };
        }),
      ),
      reconcile: authed.tasks.reconcile.handler(({ context, input }) =>
        taskOperation(async () => {
          await reconcileManagedTaskEffect(
            deps.prisma,
            context.actor,
            input.taskId,
            input.effectId,
            input.outcome,
            input.expectedVersion,
          );
          await recordAuditEvent({
            action: "task.effect.reconciled",
            actor: { type: "user", id: context.actor.userId },
            spaceId: context.actor.spaceId,
            target: { type: "task", id: input.taskId },
            metadata: { effectId: input.effectId, outcome: input.outcome },
          });
          return { ok: true as const };
        }),
      ),
      finishReview: authed.tasks.finishReview.handler(({ context, input }) =>
        taskOperation(async () => {
          await finishManagedTaskReview(
            deps.prisma,
            context.actor,
            input.taskId,
            input.expectedVersion,
          );
          return { ok: true as const };
        }),
      ),
      verify: authed.tasks.verify.handler(({ context, input }) =>
        taskOperation(async () => {
          await verifyManagedTaskCompletion(
            deps.prisma,
            context.actor,
            input.taskId,
            input.runId,
            input.expectedVersion,
          );
          return { ok: true as const };
        }),
      ),
      inspect: authed.tasks.inspect.handler(({ context, input }) =>
        taskOperation(async () => {
          const row = await deps.prisma.task.findFirst({
            where: {
              id: input.taskId,
              ...conversationScopeWhere(context.actor),
            },
          });
          if (!row) throw new IsolationError();
          const task = taskSummary(row);
          const history = await readTaskExecutionHistory(deps.prisma, context.actor, row.id);
          const projection = projectTask({
            task: { id: task.id, status: task.status, execution: task.execution },
            runs: history.runs,
            pendingEffects: history.pendingEffects.map((id) => ({ id, status: "pending" })),
            unresolvedEffects: history.unresolvedEffects.map((id) => ({ id, status: "unknown" })),
          });
          return {
            task,
            state:
              !history.historyComplete && projection.state === "succeeded"
                ? "queued"
                : projection.state,
            reason: history.historyComplete ? projection.reason : "history_incomplete",
            runs: history.runs,
            unresolvedEffects: [...projection.unresolvedEffectIds],
            pendingEffects: history.pendingEffects,
            historyComplete: history.historyComplete,
          };
        }),
      ),
      preview: authed.tasks.preview.handler(async ({ context, input }) => {
        const bot = await deps.prisma.bot.findFirst({
          where: {
            id: input.botId,
            ...conversationScopeWhere(context.actor),
            archivedAt: null,
          },
          include: { computer: true },
        });
        const computer = bot?.computer;
        if (
          !bot ||
          computer?.kind !== "native-linux" ||
          computer.state !== "running" ||
          !computer.providerRef
        ) {
          throw new ORPCError("NOT_FOUND");
        }
        if (
          computer.controlHolder === "user" &&
          computer.controlLeaseExpiresAt &&
          computer.controlLeaseExpiresAt.getTime() > Date.now()
        ) {
          throw new ORPCError("CONFLICT", {
            message: "Desktop preview is disabled during takeover",
          });
        }
        const observation = await deps.sandbox.observe(
          {
            id: computer.providerRef,
            providerRef: computer.providerRef,
            botId: bot.id,
            kind: SandboxKind.parse(computer.kind),
          },
          {
            operationId: `task-preview:${bot.id}`,
            traceId: `task-preview:${bot.id}`,
            userId: context.actor.userId,
            spaceId: context.actor.spaceId,
            botId: bot.id,
            signal: context.signal ?? AbortSignal.timeout(8_000),
          },
        );
        if (observation.image.byteLength > 8 * 1024 * 1024) {
          throw new ORPCError("INTERNAL_SERVER_ERROR");
        }
        return {
          imageBase64: Buffer.from(observation.image).toString("base64"),
          mimeType: observation.mimeType,
          width: observation.width,
          height: observation.height,
          capturedAt: observation.capturedAt,
        };
      }),
    },
  };
}
