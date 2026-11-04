import type { RunStatus } from "@rakazo/contracts";

export type TaskGrant = { tool: string; action: string; resource: string };
export type TaskControlState = { intent: "continue" | "pause" | "cancel"; quiesced: boolean };

export type TaskMandateInput = {
  userId: string;
  spaceId: string;
  botId: string;
  threadId: string;
  taskId: string;
  runId: string;
  source: "authenticated_user";
  issuedAt: number;
  expiresAt: number;
  scopes: TaskGrant[];
  now: number;
  runStatus: RunStatus;
  runLeaseOwner: string;
  runLeaseFence: number;
  workerId: string;
  workerFence: number;
  control: TaskControlState;
  takeoverHolder: string | null;
  approvalPending: boolean;
};

export function evaluateTaskMandate(
  mandate: TaskMandateInput,
  requested: TaskGrant,
): { allowed: boolean; reason?: string } {
  if (mandate.expiresAt <= mandate.now) return { allowed: false, reason: "expired" };
  if (mandate.source !== "authenticated_user") return { allowed: false, reason: "untrusted_source" };
  if (mandate.runId === "" || mandate.taskId === "") return { allowed: false, reason: "missing_ids" };
  if (mandate.runStatus !== "running") return { allowed: false, reason: "run_not_running" };
  if (mandate.runLeaseOwner !== mandate.workerId) return { allowed: false, reason: "lease_owner_mismatch" };
  if (mandate.runLeaseFence !== mandate.workerFence) return { allowed: false, reason: "fence_mismatch" };
  if (mandate.control.intent !== "continue") return { allowed: false, reason: "control_not_continue" };
  if (mandate.takeoverHolder !== null) return { allowed: false, reason: "takeover_active" };
  if (mandate.approvalPending) return { allowed: false, reason: "approval_pending" };
  const scope = mandate.scopes.some(
    (grant) =>
      grant.tool === requested.tool && grant.action === requested.action && grant.resource === requested.resource,
  );
  if (!scope) return { allowed: false, reason: "scope_mismatch" };
  return { allowed: true };
}
