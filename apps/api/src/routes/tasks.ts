import { ORPCError } from "@orpc/server";
import { runContinueJob } from "@rakazo/adapter-kit";
import { SandboxKind } from "@rakazo/contracts";
import { projectTask } from "@rakazo/core";
import {
  confirmManagedTaskStopped,
  controlManagedTask,
  createManagedTask,
  dispatchManagedTask,
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
import type { RouterContext } from "../context.js";

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

export function tasksRoutes(ctx: RouterContext) {
  const { deps, authed } = ctx;
  return {
    tasks: {
      list: authed.tasks.list.handler(async ({ context, input }) => {
        const rows = await deps.prisma.task.findMany({
          where: {
            userId: context.actor.userId,
            spaceId: context.actor.spaceId,
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
          await deps.jobs.enqueue({ ...runContinueJob(result.runId), keepExisting: true }).catch((error) => {
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
          if (result.threadId && result.eventSeq !== null) {
            await deps.events.notify(result.threadId, result.eventSeq).catch((error) => {
              getLogger().error("managed task control realtime notification", error);
            });
          }
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
          await controlManagedTask(
            deps.prisma,
            context.actor,
            input.taskId,
            "cancel",
            input.expectedVersion,
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
          await confirmManagedTaskStopped(
            deps.prisma,
            context.actor,
            input.taskId,
            input.runId,
            input.expectedVersion,
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
              userId: context.actor.userId,
              spaceId: context.actor.spaceId,
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
            state: !history.historyComplete && projection.state === "succeeded" ? "queued" : projection.state,
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
            userId: context.actor.userId,
            spaceId: context.actor.spaceId,
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
          throw new ORPCError("CONFLICT", { message: "Desktop preview is disabled during takeover" });
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
