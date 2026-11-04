import * as z from "zod";
import { oc } from "@orpc/contract";
import { Id } from "./ids.js";

export const TaskGrantSchema = z.object({
  tool: z.string().min(1),
  action: z.string().min(1),
  resource: z.string().min(1),
});
export type TaskGrant = z.infer<typeof TaskGrantSchema>;

export const TaskBudgetSchema = z.object({
  maxRuns: z.number().int().min(1).max(20),
  maxToolCalls: z.number().int().min(1).max(500),
  maxModelCalls: z.number().int().min(1).max(200),
  maxReservedTokens: z.number().int().min(1).max(10_000_000),
  timeoutMs: z.number().int().min(1_000).max(3_600_000),
});
export type TaskBudget = z.infer<typeof TaskBudgetSchema>;

export const TaskControlSchema = z.object({
  intent: z.enum(["continue", "pause", "cancel"]),
  quiesced: z.boolean(),
});
export type TaskControl = z.infer<typeof TaskControlSchema>;

export const TaskExecutionStateSchema = z.object({
  format: z.literal(1),
  version: z.number().int().nonnegative(),
  currentRunId: z.string().nullable(),
  control: TaskControlSchema,
  completionEvidence: z
    .object({
      runId: z.string(),
      confirmedBy: z.string(),
      confirmedAt: z.number().int(),
    })
    .nullable(),
  budget: TaskBudgetSchema,
  deadline: z.number().int().nullable(),
  modelCalls: z.number().int().nonnegative(),
  reservedTokens: z.number().int().nonnegative(),
  toolCalls: z.array(z.object({ id: z.string(), tool: z.string(), reservedTokens: z.number() })),
});
export type TaskExecutionState = z.infer<typeof TaskExecutionStateSchema>;

export const StoredTaskMandateSchema = z.object({
  id: z.string(),
  userId: z.string(),
  spaceId: z.string(),
  botId: z.string(),
  threadId: z.string(),
  taskId: z.string(),
  runId: z.string(),
  source: z.enum(["authenticated_user"]),
  issuedAt: z.number().int(),
  expiresAt: z.number().int(),
  scopes: z.array(TaskGrantSchema).min(1),
});
export type StoredTaskMandate = z.infer<typeof StoredTaskMandateSchema>;

const TaskCreateInput = z.object({
  botId: Id,
  prompt: z.string().trim().min(1).max(20_000),
  clientNonce: z.string().min(1).max(200),
  budget: TaskBudgetSchema,
});

const TaskDispatchInput = z.object({
  taskId: Id,
  expectedVersion: z.number().int().nonnegative(),
  clientNonce: z.string().min(1).max(200),
  retry: z.boolean(),
  expiresAt: z.number().int(),
  modelDataConsent: z.literal(true),
  scopes: z.array(TaskGrantSchema).min(1).max(50),
});

const TaskVersionInput = z.object({
  taskId: Id,
  expectedVersion: z.number().int().nonnegative(),
});

const TaskInspectOutput = z.object({
  task: z.object({
    id: Id,
    botId: Id,
    threadId: Id,
    prompt: z.string(),
    status: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    execution: TaskExecutionStateSchema,
  }),
  state: z.enum([
    "queued",
    "running",
    "succeeded",
    "failed",
    "cancelled",
    "paused",
    "waiting_input",
    "waiting_takeover",
  ]),
  reason: z.string().nullable(),
  runs: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      attempts: z.number().int(),
    }),
  ),
  unresolvedEffects: z.array(z.string()),
  pendingEffects: z.array(z.string()),
  historyComplete: z.boolean(),
});

export const taskExecutionContract = {
  list: oc.input(z.object({})).output(z.array(TaskInspectOutput.shape.task.omit({}))),
  create: oc.input(TaskCreateInput).output(TaskInspectOutput.shape.task),
  dispatch: oc
    .input(TaskDispatchInput)
    .output(z.object({ runId: Id, reused: z.boolean() })),
  control: oc
    .input(TaskVersionInput.and(z.object({ intent: z.enum(["pause", "cancel", "continue"]) })))
    .output(z.object({ ok: z.literal(true) })),
  revoke: oc.input(TaskVersionInput).output(z.object({ ok: z.literal(true) })),
  renew: oc
    .input(
      TaskVersionInput.and(
        z.object({
          runId: Id,
          expiresAt: z.number().int(),
          modelDataConsent: z.literal(true),
        }),
      ),
    )
    .output(z.object({ ok: z.literal(true) })),
  confirmStop: oc
    .input(
      TaskVersionInput.and(
        z.object({ runId: Id, stoppedConfirmed: z.literal(true) }),
      ),
    )
    .output(z.object({ ok: z.literal(true) })),
  reconcile: oc
    .input(
      TaskVersionInput.and(
        z.object({
          effectId: Id,
          outcome: z.enum(["completed", "not_applied"]),
          examined: z.literal(true),
        }),
      ),
    )
    .output(z.object({ ok: z.literal(true) })),
  finishReview: oc.input(TaskVersionInput).output(z.object({ ok: z.literal(true) })),
  verify: oc
    .input(TaskVersionInput.and(z.object({ runId: Id })))
    .output(z.object({ ok: z.literal(true) })),
  inspect: oc.input(z.object({ taskId: Id })).output(TaskInspectOutput),
  preview: oc.input(z.object({ botId: Id })).output(
    z.object({
      imageBase64: z.string(),
      mimeType: z.string(),
    }),
  ),
};
