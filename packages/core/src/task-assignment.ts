import type { RunStatus } from "@rakazo/contracts";

export type TaskAssignmentInput = {
  taskId: string;
  clientNonce: string;
  retry: boolean;
  activeRun?: {
    id: string;
    status: RunStatus;
    clientNonce: string | null;
  } | null;
  existingRun?: {
    id: string;
    status: RunStatus;
    clientNonce: string | null;
  } | null;
  maxRuns: number;
  runCount: number;
  hasUnknownEffects: boolean;
};

export type TaskAssignmentDecision =
  | { action: "create"; runId: null }
  | { action: "reuse"; runId: string }
  | { action: "reject"; reason: string };

export function decideTaskAssignment(input: TaskAssignmentInput): TaskAssignmentDecision {
  if (input.activeRun) {
    return { action: "reject", reason: "active_run_exists" };
  }
  if (input.hasUnknownEffects) {
    return { action: "reject", reason: "unknown_effects" };
  }
  if (input.runCount >= input.maxRuns) {
    return { action: "reject", reason: "max_runs_reached" };
  }
  if (input.existingRun) {
    if (input.existingRun.clientNonce === input.clientNonce) {
      if (!input.retry) return { action: "reuse", runId: input.existingRun.id };
      return { action: "reject", reason: "duplicate_nonce_with_retry" };
    }
    if (input.clientNonce === "" && !input.retry) {
      return { action: "reuse", runId: input.existingRun.id };
    }
  }
  return { action: "create", runId: null };
}
