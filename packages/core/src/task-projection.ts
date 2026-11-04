export type TaskRunView = {
  id: string;
  status: string;
  attempts: number;
};

export type TaskControlView = { intent: "continue" | "pause" | "cancel"; quiesced: boolean };

export type TaskExecutionView = {
  version: number;
  currentRunId: string | null;
  control: TaskControlView;
  completionEvidence: { runId: string; confirmedBy: string; confirmedAt: number } | null;
  budget: { maxRuns: number; maxToolCalls: number; maxModelCalls: number; maxReservedTokens: number; timeoutMs: number };
  deadline: number | null;
  modelCalls: number;
  reservedTokens: number;
  toolCalls: { id: string; tool: string; reservedTokens: number }[];
};

export type TaskProjectionInput = {
  task: { id: string; status: string; execution: TaskExecutionView };
  runs: (TaskRunView & { cancelled?: boolean; leaseExpired?: boolean })[];
  pendingEffects: { id: string; status: string }[];
  unresolvedEffects: { id: string; status: string }[];
};

export type TaskProjectionOutput = {
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "paused" | "waiting_input" | "waiting_takeover";
  reason: string | null;
  runs: TaskRunView[];
  unresolvedEffectIds: string[];
  pendingEffectIds: string[];
};

const ACTIVE_RUN_STATUSES = new Set(["queued", "leased", "running", "waiting_input", "waiting_takeover"]);

export function projectTask(input: TaskProjectionInput): TaskProjectionOutput {
  const activeRun = input.runs.find((run) => ACTIVE_RUN_STATUSES.has(run.status));
  const lastRun = input.runs.find((run) => run.id === input.task.execution.currentRunId);
  const control = input.task.execution.control;
  if (activeRun) {
    const state = activeRun.status === "waiting_input"
      ? "waiting_input"
      : activeRun.status === "waiting_takeover"
        ? "waiting_takeover"
        : "running";
    return {
      state,
      reason: control.intent === "continue" ? null : "stop_unconfirmed",
      runs: input.runs,
      unresolvedEffectIds: input.unresolvedEffects.map((e) => e.id),
      pendingEffectIds: input.pendingEffects.map((e) => e.id),
    };
  }
  if (input.task.execution.currentRunId && !lastRun) {
    return {
      state: "queued",
      reason: "current_run_missing",
      runs: input.runs,
      unresolvedEffectIds: input.unresolvedEffects.map((e) => e.id),
      pendingEffectIds: input.pendingEffects.map((e) => e.id),
    };
  }
  if (control.intent === "pause" && !control.quiesced) {
    return {
      state: "paused",
      reason: "stop_unconfirmed",
      runs: input.runs,
      unresolvedEffectIds: input.unresolvedEffects.map((e) => e.id),
      pendingEffectIds: input.pendingEffects.map((e) => e.id),
    };
  }
  if (input.unresolvedEffects.length > 0 || input.pendingEffects.length > 0) {
    return {
      state: lastRun?.status === "failed" ? "failed" : "cancelled",
      reason: "unknown_effects",
      runs: input.runs,
      unresolvedEffectIds: input.unresolvedEffects.map((e) => e.id),
      pendingEffectIds: input.pendingEffects.map((e) => e.id),
    };
  }
  if (control.intent === "cancel") {
    return {
      state: "cancelled",
      reason: control.quiesced ? null : "stop_unconfirmed",
      runs: input.runs,
      unresolvedEffectIds: [],
      pendingEffectIds: [],
    };
  }
  if (lastRun?.status === "completed" && input.task.execution.completionEvidence?.runId === lastRun.id) {
    return {
      state: "succeeded",
      reason: null,
      runs: input.runs,
      unresolvedEffectIds: [],
      pendingEffectIds: [],
    };
  }
  if (lastRun?.status === "completed" && control.intent === "continue") {
    return {
      state: "queued",
      reason: "completion_unverified",
      runs: input.runs,
      unresolvedEffectIds: [],
      pendingEffectIds: [],
    };
  }
  if (lastRun?.status === "failed") {
    return {
      state: "failed",
      reason: null,
      runs: input.runs,
      unresolvedEffectIds: [],
      pendingEffectIds: [],
    };
  }
  if (lastRun?.cancelled) {
    return {
      state: "cancelled",
      reason: control.quiesced ? null : "stop_unconfirmed",
      runs: input.runs,
      unresolvedEffectIds: [],
      pendingEffectIds: [],
    };
  }
  return {
    state: "queued",
    reason: null,
    runs: input.runs,
    unresolvedEffectIds: input.unresolvedEffects.map((e) => e.id),
    pendingEffectIds: input.pendingEffects.map((e) => e.id),
  };
}
