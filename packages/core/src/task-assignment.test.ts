import { expect, it } from "vitest";
import { decideTaskAssignment } from "./task-assignment.js";

const base = {
  taskId: "task",
  clientNonce: "n1",
  retry: false,
  maxRuns: 3,
  runCount: 0,
  hasUnknownEffects: false,
};

it("creates when no active run exists", () => {
  expect(decideTaskAssignment(base)).toEqual({ action: "create", runId: null });
});

it("rejects when an active run exists", () => {
  expect(
    decideTaskAssignment({
      ...base,
      activeRun: { id: "run", status: "running", clientNonce: "n1" },
    }),
  ).toEqual({ action: "reject", reason: "active_run_exists" });
});

it("rejects unknown effects and max runs", () => {
  expect(decideTaskAssignment({ ...base, hasUnknownEffects: true })).toEqual({
    action: "reject",
    reason: "unknown_effects",
  });
  expect(decideTaskAssignment({ ...base, runCount: 3 })).toEqual({
    action: "reject",
    reason: "max_runs_reached",
  });
});

it("reuses a matching nonce without retry and rejects retry with the same nonce", () => {
  const existing = { id: "run", status: "completed" as const, clientNonce: "n1" };
  expect(decideTaskAssignment({ ...base, existingRun: existing })).toEqual({
    action: "reuse",
    runId: "run",
  });
  expect(decideTaskAssignment({ ...base, existingRun: existing, retry: true })).toEqual({
    action: "reject",
    reason: "duplicate_nonce_with_retry",
  });
});
