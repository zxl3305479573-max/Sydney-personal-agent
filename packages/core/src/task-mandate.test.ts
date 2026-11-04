import { expect, it } from "vitest";
import { evaluateTaskMandate } from "./task-mandate.js";

const base = {
  userId: "u",
  spaceId: "s",
  botId: "b",
  threadId: "t",
  taskId: "task",
  runId: "run",
  source: "authenticated_user" as const,
  issuedAt: 0,
  expiresAt: 10_000,
  scopes: [{ tool: "read_file", action: "execute", resource: "workspace" }],
  now: 5_000,
  runStatus: "running" as const,
  runLeaseOwner: "worker",
  runLeaseFence: 2,
  workerId: "worker",
  workerFence: 2,
  control: { intent: "continue" as const, quiesced: false },
  takeoverHolder: null,
  approvalPending: false,
};
const read = { tool: "read_file", action: "execute", resource: "workspace" };

it("allows a matching scope on a healthy run", () => {
  expect(evaluateTaskMandate(base, read)).toEqual({ allowed: true });
});

it("rejects expired, wrong source, mismatched lease, and stale fence", () => {
  expect(evaluateTaskMandate({ ...base, now: 10_001 }, read).reason).toBe("expired");
  expect(evaluateTaskMandate({ ...base, source: "system" as never }, read).reason).toBe("untrusted_source");
  expect(evaluateTaskMandate({ ...base, workerId: "other" }, read).reason).toBe("lease_owner_mismatch");
  expect(evaluateTaskMandate({ ...base, workerFence: 3 }, read).reason).toBe("fence_mismatch");
});

it("rejects pause, takeover, and pending approvals", () => {
  expect(evaluateTaskMandate({ ...base, control: { intent: "pause", quiesced: false } }, read).reason).toBe(
    "control_not_continue",
  );
  expect(evaluateTaskMandate({ ...base, takeoverHolder: "user" }, read).reason).toBe("takeover_active");
  expect(evaluateTaskMandate({ ...base, approvalPending: true }, read).reason).toBe("approval_pending");
});

it("requires an exact tool, action, and resource match", () => {
  expect(evaluateTaskMandate(base, { ...read, tool: "write_file" }).reason).toBe("scope_mismatch");
  expect(evaluateTaskMandate(base, { ...read, resource: "elsewhere" }).reason).toBe("scope_mismatch");
});
