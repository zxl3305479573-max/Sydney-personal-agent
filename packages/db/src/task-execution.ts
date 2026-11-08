import { createHash } from "node:crypto";
import type { TaskExecutionState } from "@rakazo/contracts";
import {
  StoredTaskMandateSchema,
  TaskExecutionStateSchema,
  taskExecutionContract,
} from "@rakazo/contracts";
import { ACTIVE_RUN_STATUSES } from "@rakazo/core";
import type { Prisma, PrismaClient } from "./client.js";
import { appendEventInTransaction } from "./events.js";
import { currentDbContext } from "./row-security.js";
import { clearEndedRunState } from "./run-secrets.js";
import { RUN_TURN_CHECKPOINT_KIND } from "./run-turn-checkpoint.js";
import { IsolationError } from "./scope.js";
import { withTransactionRetry } from "./transaction-retry.js";

type Tenant = { userId: string; spaceId: string };
type TaskRow = Prisma.TaskGetPayload<object>;
type DispatchInput = NonNullable<
  (typeof taskExecutionContract.dispatch)["~orpc"]["inputSchema"]
>["_output"];

export class TaskExecutionError extends Error {}

function assertTenant(actor: Tenant): void {
  const context = currentDbContext();
  if (
    !context ||
    context.kind !== "tenant" ||
    context.userId !== actor.userId ||
    context.spaceId !== actor.spaceId
  ) {
    throw new IsolationError();
  }
}

function taskScope(task: TaskRow): Tenant & { botId: string; threadId: string; taskId: string } {
  return {
    userId: task.userId,
    spaceId: task.spaceId,
    botId: task.botId,
    threadId: task.threadId,
    taskId: task.id,
  };
}

export function taskSummary(task: TaskRow) {
  return {
    id: task.id,
    botId: task.botId,
    threadId: task.threadId,
    prompt: task.prompt,
    status: task.status,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    execution: TaskExecutionStateSchema.parse(task.executionState),
  };
}

async function saveState(tx: Prisma.TransactionClient, task: TaskRow, state: TaskExecutionState) {
  await tx.task.update({
    where: { id: task.id },
    data: { executionState: state, status: stateToStatus(state) },
  });
}

function stateToStatus(state: TaskExecutionState): string {
  if (state.completionEvidence) return "succeeded";
  if (state.control.intent === "cancel") return "cancelled";
  if (state.control.intent === "pause") return "paused";
  if (state.currentRunId) return "running";
  return "queued";
}

async function lockedTask(tx: Prisma.TransactionClient, actor: Tenant, taskId: string) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "tasks"
    WHERE "id" = ${taskId} AND "userId" = ${actor.userId} AND "spaceId" = ${actor.spaceId}
    FOR UPDATE
  `;
  if (locked.length !== 1) throw new IsolationError();
  const rows = await tx.task.findMany({
    where: { id: taskId, ...actor },
    select: {
      id: true,
      userId: true,
      spaceId: true,
      botId: true,
      threadId: true,
      prompt: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      executionState: true,
    },
    take: 2,
  });
  const task = rows[0];
  if (!task || rows.length > 1) throw new IsolationError();
  const state = TaskExecutionStateSchema.parse(task.executionState);
  return { task, state } as const;
}

export async function createManagedTask(prisma: PrismaClient, actor: Tenant, rawInput: unknown) {
  assertTenant(actor);
  const input = taskExecutionContract.create["~orpc"].inputSchema!.parse(rawInput);
  const id = `task-${createHash("sha256")
    .update(JSON.stringify([actor.spaceId, actor.userId, input.clientNonce]))
    .digest("hex")}`;
  return withTransactionRetry(() =>
    prisma.$transaction(async (tx) => {
      const thread = await tx.thread.findFirst({
        where: {
          spaceId: actor.spaceId,
          userId: actor.userId,
          botId: input.botId,
          bot: { archivedAt: null },
        },
        select: { id: true },
      });
      if (!thread) throw new IsolationError();
      const state: TaskExecutionState = {
        format: 1,
        version: 0,
        currentRunId: null,
        control: { intent: "continue", quiesced: true },
        completionEvidence: null,
        budget: input.budget,
        deadline: null,
        modelCalls: 0,
        reservedTokens: 0,
        toolCalls: [],
      };
      const task = await tx.task.upsert({
        where: { id },
        create: {
          id,
          ...actor,
          botId: input.botId,
          threadId: thread.id,
          prompt: input.prompt,
          status: "queued",
          executionState: state,
        },
        update: {},
      });
      const summary = taskSummary(task);
      if (
        task.userId !== actor.userId ||
        task.spaceId !== actor.spaceId ||
        task.botId !== input.botId ||
        task.prompt !== input.prompt ||
        summary.execution.budget.maxRuns !== input.budget.maxRuns ||
        summary.execution.budget.maxToolCalls !== input.budget.maxToolCalls ||
        summary.execution.budget.maxModelCalls !== input.budget.maxModelCalls ||
        summary.execution.budget.maxReservedTokens !== input.budget.maxReservedTokens ||
        summary.execution.budget.timeoutMs !== input.budget.timeoutMs
      ) {
        throw new TaskExecutionError("nonce_payload_mismatch");
      }
      return summary;
    }),
  );
}

export async function dispatchManagedTask(prisma: PrismaClient, actor: Tenant, rawInput: unknown) {
  assertTenant(actor);
  const input: DispatchInput = taskExecutionContract.dispatch["~orpc"].inputSchema!.parse(rawInput);
  return withTransactionRetry(() =>
    prisma.$transaction(async (tx) => {
      const { task, state } = await lockedTask(tx, actor, input.taskId);
      const nonce = `task:${task.id}:${input.clientNonce}`;
      const existing = await tx.run.findFirst({
        where: { taskId: task.id, ...actor, clientNonce: nonce },
        select: { id: true, taskMandate: true },
      });
      if (existing) {
        const mandate = StoredTaskMandateSchema.parse(existing.taskMandate);
        if (
          mandate.expiresAt !== input.expiresAt ||
          JSON.stringify(mandate.scopes) !== JSON.stringify(input.scopes)
        ) {
          throw new TaskExecutionError("nonce_payload_mismatch");
        }
        return { runId: existing.id, reused: true };
      }
      if (state.version !== input.expectedVersion) {
        throw new TaskExecutionError("version_conflict");
      }
      if (state.control.intent !== "continue" || !state.control.quiesced) {
        throw new TaskExecutionError("control_blocked");
      }
      if (state.completionEvidence) throw new TaskExecutionError("task_already_completed");
      if (!input.modelDataConsent) throw new TaskExecutionError("consent_required");
      const runCount = await tx.run.count({ where: { taskId: task.id, ...actor } });
      if (runCount >= state.budget.maxRuns) throw new TaskExecutionError("max_runs_reached");
      if (runCount > 0 && !input.retry) throw new TaskExecutionError("retry_required");
      const activeRun = await tx.run.findFirst({
        where: { taskId: task.id, ...actor, status: { in: [...ACTIVE_RUN_STATUSES] } },
        select: { id: true },
      });
      if (activeRun) throw new TaskExecutionError("active_run_exists");
      const unresolved = await tx.externalEffect.findFirst({
        where: {
          run: { taskId: task.id, ...actor },
          spaceId: actor.spaceId,
          kind: { not: RUN_TURN_CHECKPOINT_KIND },
          status: { notIn: ["completed", "denied", "reconciled"] },
        },
        select: { id: true },
      });
      if (unresolved) throw new TaskExecutionError("effects_unresolved");
      const now = Date.now();
      if (state.deadline !== null && state.deadline <= now) {
        throw new TaskExecutionError("task_deadline_exceeded");
      }
      if (input.expiresAt <= now || input.expiresAt > now + 24 * 60 * 60_000) {
        throw new TaskExecutionError("mandate_expiry_invalid");
      }
      const run = await tx.run.create({
        data: {
          ...actor,
          botId: task.botId,
          threadId: task.threadId,
          taskId: task.id,
          trigger: "managed_task",
          status: "queued",
          clientNonce: nonce,
        },
        select: { id: true },
      });
      const mandate = StoredTaskMandateSchema.parse({
        id: `mandate-${nonce}`,
        ...actor,
        botId: task.botId,
        threadId: task.threadId,
        taskId: task.id,
        runId: run.id,
        source: "authenticated_user",
        issuedAt: now,
        expiresAt: input.expiresAt,
        scopes: input.scopes,
      });
      await tx.run.update({ where: { id: run.id }, data: { taskMandate: mandate } });
      await saveState(tx, task, {
        ...state,
        version: state.version + 1,
        currentRunId: run.id,
        control: { intent: "continue", quiesced: false },
        deadline: state.deadline ?? now + state.budget.timeoutMs,
      });
      return { runId: run.id, reused: false };
    }),
  );
}

export type ManagedTaskGuardInput = {
  runId: string;
  workerId: string;
  fence: number;
  action: { tool: string; action: string; resource: string };
  reserveTokens?: number;
  executionId?: string;
};

export async function guardManagedRun(
  prisma: PrismaClient,
  actor: Tenant,
  taskId: string,
  input: ManagedTaskGuardInput,
  tokenEstimate: number,
) {
  assertTenant(actor);
  return prisma.$transaction(async (tx) => {
    const { task, state } = await lockedTask(tx, actor, taskId);
    if (state.currentRunId !== input.runId) throw new TaskExecutionError("run_mismatch");
    if (state.deadline !== null && state.deadline <= Date.now()) {
      throw new TaskExecutionError("task_deadline_exceeded");
    }
    const run = await tx.run.findFirst({
      where: { id: input.runId, taskId, ...actor },
      select: {
        id: true,
        status: true,
        leaseOwner: true,
        leaseFence: true,
        leaseExpiresAt: true,
        taskMandate: true,
      },
    });
    if (!run || run.status !== "running") throw new TaskExecutionError("run_not_running");
    if (run.leaseOwner !== input.workerId || run.leaseFence !== input.fence) {
      throw new TaskExecutionError("lease_mismatch");
    }
    if (!run.leaseExpiresAt || run.leaseExpiresAt.getTime() <= Date.now()) {
      throw new TaskExecutionError("lease_expired");
    }
    const mandate = StoredTaskMandateSchema.parse(run.taskMandate);
    if (
      mandate.runId !== run.id ||
      mandate.taskId !== task.id ||
      mandate.botId !== task.botId ||
      mandate.threadId !== task.threadId ||
      mandate.userId !== actor.userId ||
      mandate.spaceId !== actor.spaceId
    ) {
      throw new TaskExecutionError("mandate_binding_mismatch");
    }
    if (mandate.expiresAt <= Date.now()) throw new TaskExecutionError("mandate_expired");
    const scope =
      input.action.tool === "model_call" ||
      mandate.scopes.some(
        (grant) =>
          grant.tool === input.action.tool &&
          grant.action === input.action.action &&
          grant.resource === input.action.resource,
      );
    if (!scope) throw new TaskExecutionError("scope_mismatch");
    if (state.control.intent !== "continue") throw new TaskExecutionError("control_blocked");
    const reserved = input.reserveTokens ?? tokenEstimate;
    if (!Number.isInteger(reserved) || reserved < 0 || !Number.isFinite(reserved)) {
      throw new TaskExecutionError("unknown_token_reservation");
    }
    const modelCall = input.action.tool === "model_call";
    if (modelCall && state.reservedTokens + reserved > state.budget.maxReservedTokens) {
      throw new TaskExecutionError("budget_exceeded");
    }
    if (modelCall && state.modelCalls >= state.budget.maxModelCalls) {
      throw new TaskExecutionError("model_calls_exceeded");
    }
    if (!modelCall && state.toolCalls.length >= state.budget.maxToolCalls) {
      throw new TaskExecutionError("tool_calls_exceeded");
    }
    const toolCallId =
      input.executionId ??
      `call-${createHash("sha256").update(JSON.stringify(input.action)).digest("hex").slice(0, 16)}`;
    await saveState(tx, task, {
      ...state,
      reservedTokens: state.reservedTokens + (modelCall ? reserved : 0),
      modelCalls: state.modelCalls + (modelCall ? 1 : 0),
      toolCalls: [
        ...state.toolCalls,
        ...(!modelCall ? [{ id: toolCallId, tool: input.action.tool, reservedTokens: 0 }] : []),
      ],
    });
    return { allowed: true as const, toolCallId };
  });
}

export async function controlManagedTask(
  prisma: PrismaClient,
  actor: Tenant,
  taskId: string,
  intent: "pause" | "cancel" | "continue",
  expectedVersion: number,
) {
  assertTenant(actor);
  return prisma.$transaction(async (tx) => {
    const { task, state } = await lockedTask(tx, actor, taskId);
    if (state.version !== expectedVersion) throw new TaskExecutionError("version_conflict");
    if (state.control.intent === "cancel" && intent !== "cancel") {
      throw new TaskExecutionError("task_cancelled");
    }
    if (intent === "continue") {
      if (state.control.intent === "cancel") throw new TaskExecutionError("task_cancelled");
      if (state.control.intent !== "pause" || !state.control.quiesced) {
        throw new TaskExecutionError("stop_unconfirmed");
      }
      const unresolved = await tx.externalEffect.findFirst({
        where: {
          run: { taskId, ...actor },
          spaceId: actor.spaceId,
          kind: { not: RUN_TURN_CHECKPOINT_KIND },
          status: { notIn: ["completed", "denied", "reconciled"] },
        },
        select: { id: true },
      });
      if (unresolved) throw new TaskExecutionError("effects_unresolved");
    }
    if (state.completionEvidence && intent !== "continue") {
      throw new TaskExecutionError("task_already_completed");
    }
    if (intent === "cancel" && state.currentRunId) {
      const cancelled = await tx.run.updateMany({
        where: {
          id: state.currentRunId,
          taskId,
          ...actor,
          trigger: "managed_task",
          status: "queued",
        },
        data: {
          status: "cancelled",
          completedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      if (cancelled.count === 1) {
        await clearEndedRunState(tx, [state.currentRunId]);
        const event = await appendEventInTransaction(tx, {
          spaceId: actor.spaceId,
          threadId: task.threadId,
          botId: task.botId,
          type: "run.cancelled",
          runId: state.currentRunId,
          payload: {},
        });
        const control = { intent, quiesced: false };
        await saveState(tx, task, { ...state, version: state.version + 1, control });
        return { ok: true as const, threadId: task.threadId, eventSeq: event.seq };
      }
    }
    const control = { intent, quiesced: intent === "continue" ? true : false };
    await saveState(tx, task, { ...state, version: state.version + 1, control });
    return { ok: true as const, threadId: null, eventSeq: null };
  });
}

export async function renewManagedTaskMandate(
  prisma: PrismaClient,
  actor: Tenant,
  taskId: string,
  runId: string,
  expectedVersion: number,
  expiresAt: number,
) {
  assertTenant(actor);
  return prisma.$transaction(async (tx) => {
    const { task, state } = await lockedTask(tx, actor, taskId);
    if (state.version !== expectedVersion) throw new TaskExecutionError("version_conflict");
    if (state.currentRunId !== runId) throw new TaskExecutionError("run_mismatch");
    if (state.control.intent !== "continue" || state.completionEvidence) {
      throw new TaskExecutionError("control_blocked");
    }
    const run = await tx.run.findFirst({
      where: { id: runId, taskId, ...actor },
      select: { id: true, status: true, taskMandate: true },
    });
    if (!run) throw new IsolationError();
    if (!ACTIVE_RUN_STATUSES.includes(run.status as (typeof ACTIVE_RUN_STATUSES)[number])) {
      throw new TaskExecutionError("run_not_active");
    }
    const mandate = StoredTaskMandateSchema.parse(run.taskMandate);
    if (mandate.expiresAt <= Date.now()) throw new TaskExecutionError("mandate_expired");
    if (
      mandate.runId !== run.id ||
      mandate.taskId !== task.id ||
      mandate.botId !== task.botId ||
      mandate.threadId !== task.threadId ||
      mandate.userId !== actor.userId ||
      mandate.spaceId !== actor.spaceId
    ) {
      throw new TaskExecutionError("mandate_binding_mismatch");
    }
    if (expiresAt <= Date.now() || expiresAt > Date.now() + 24 * 60 * 60_000) {
      throw new TaskExecutionError("mandate_expiry_invalid");
    }
    const renewed = await tx.run.updateMany({
      where: { id: run.id, taskId, ...actor, status: run.status },
      data: { taskMandate: { ...mandate, expiresAt } },
    });
    if (renewed.count !== 1) throw new TaskExecutionError("run_state_changed");
    await saveState(tx, task, { ...state, version: state.version + 1 });
    return { ok: true as const };
  });
}

export async function confirmManagedTaskStopped(
  prisma: PrismaClient,
  actor: Tenant,
  taskId: string,
  runId: string,
  expectedVersion: number,
) {
  assertTenant(actor);
  return prisma.$transaction(async (tx) => {
    const { state } = await lockedTask(tx, actor, taskId);
    if (state.version !== expectedVersion) throw new TaskExecutionError("version_conflict");
    if (state.currentRunId !== runId || state.control.intent === "continue") {
      throw new TaskExecutionError("run_mismatch");
    }
    const run = await tx.run.findFirst({
      where: { id: runId, taskId, ...actor },
      select: { status: true },
    });
    if (!run || ACTIVE_RUN_STATUSES.includes(run.status as (typeof ACTIVE_RUN_STATUSES)[number])) {
      throw new TaskExecutionError("run_not_stopped");
    }
    throw new TaskExecutionError("stop_evidence_unavailable");
  });
}

export async function finishManagedTaskReview(
  prisma: PrismaClient,
  actor: Tenant,
  taskId: string,
  expectedVersion: number,
) {
  assertTenant(actor);
  return prisma.$transaction(async (tx) => {
    const { task, state } = await lockedTask(tx, actor, taskId);
    if (state.version !== expectedVersion) throw new TaskExecutionError("version_conflict");
    if (state.control.intent !== "pause" || !state.control.quiesced) {
      throw new TaskExecutionError("review_not_ready");
    }
    if (state.completionEvidence) throw new TaskExecutionError("task_already_completed");
    const unresolved = await tx.externalEffect.findFirst({
      where: {
        run: { taskId, ...actor },
        spaceId: actor.spaceId,
        kind: { not: RUN_TURN_CHECKPOINT_KIND },
        status: { notIn: ["completed", "denied", "reconciled"] },
      },
      select: { id: true },
    });
    if (unresolved) throw new TaskExecutionError("effects_unresolved");
    await saveState(tx, task, {
      ...state,
      version: state.version + 1,
      control: { intent: "continue", quiesced: true },
    });
    return { ok: true as const };
  });
}

export async function reconcileManagedTaskEffect(
  prisma: PrismaClient,
  actor: Tenant,
  taskId: string,
  effectId: string,
  outcome: "completed" | "not_applied",
  expectedVersion: number,
) {
  assertTenant(actor);
  return prisma.$transaction(async (tx) => {
    const { task, state } = await lockedTask(tx, actor, taskId);
    if (state.version !== expectedVersion) throw new TaskExecutionError("version_conflict");
    if (state.control.intent === "continue" || !state.control.quiesced) {
      throw new TaskExecutionError("task_not_quiesced");
    }
    const effect = await tx.externalEffect.findFirst({
      where: {
        id: effectId,
        run: { taskId, ...actor },
        spaceId: actor.spaceId,
        kind: { not: RUN_TURN_CHECKPOINT_KIND },
      },
      select: { id: true, status: true },
    });
    if (!effect) throw new IsolationError();
    if (!["intended", "ambiguous", "failed"].includes(effect.status)) {
      throw new TaskExecutionError("effect_not_reconcilable");
    }
    await tx.externalEffect.update({
      where: { id: effect.id },
      data: { status: outcome === "completed" ? "completed" : "reconciled" },
    });
    await saveState(tx, task, { ...state, version: state.version + 1 });
    return { ok: true as const };
  });
}

export async function verifyManagedTaskCompletion(
  prisma: PrismaClient,
  actor: Tenant,
  taskId: string,
  runId: string,
  expectedVersion: number,
) {
  assertTenant(actor);
  return prisma.$transaction(async (tx) => {
    const { task, state } = await lockedTask(tx, actor, taskId);
    if (state.version !== expectedVersion) throw new TaskExecutionError("version_conflict");
    if (state.currentRunId !== runId) throw new TaskExecutionError("run_mismatch");
    if (state.control.intent !== "continue" || state.completionEvidence) {
      throw new TaskExecutionError("control_blocked");
    }
    const run = await tx.run.findFirst({
      where: { id: runId, taskId, ...actor },
      select: { status: true },
    });
    if (!run || run.status !== "completed") throw new TaskExecutionError("run_not_completed");
    const unresolved = await tx.externalEffect.findFirst({
      where: {
        run: { taskId, ...actor },
        spaceId: actor.spaceId,
        kind: { not: RUN_TURN_CHECKPOINT_KIND },
        status: { notIn: ["completed", "denied", "reconciled"] },
      },
      select: { id: true },
    });
    if (unresolved) throw new TaskExecutionError("effects_unresolved");
    await saveState(tx, task, {
      ...state,
      version: state.version + 1,
      completionEvidence: { runId, confirmedBy: actor.userId, confirmedAt: Date.now() },
    });
    return { ok: true as const };
  });
}
