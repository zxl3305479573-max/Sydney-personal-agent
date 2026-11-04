import { expect, it } from "vitest";
import { projectTask } from "./task-projection.js";

const execution = () => ({
  version: 0,
  currentRunId: "run",
  control: { intent: "continue" as const, quiesced: true },
  completionEvidence: null as null | { runId: string; confirmedBy: string; confirmedAt: number },
  budget: { maxRuns: 3, maxToolCalls: 30, maxModelCalls: 8, maxReservedTokens: 100_000, timeoutMs: 900_000 },
  deadline: null,
  modelCalls: 0,
  reservedTokens: 0,
  toolCalls: [],
});

it("shows running for an active run", () => {
  expect(projectTask({
    task: { id: "task", status: "running", execution: execution() },
    runs: [{ id: "run", status: "running", attempts: 1 }],
    pendingEffects: [],
    unresolvedEffects: [],
  }).state).toBe("running");
});

it("requires independent completion evidence for success", () => {
  const input = {
    task: { id: "task", status: "completed", execution: execution() },
    runs: [{ id: "run", status: "completed", attempts: 1 }],
    pendingEffects: [],
    unresolvedEffects: [],
  };
  expect(projectTask(input)).toMatchObject({ state: "queued", reason: "completion_unverified" });
  input.task.execution.completionEvidence = { runId: "run", confirmedBy: "user", confirmedAt: 1 };
  expect(projectTask(input).state).toBe("succeeded");
});

it("uses the current Run instead of the last historical row", () => {
  const state = execution();
  state.completionEvidence = { runId: "run", confirmedBy: "user", confirmedAt: 1 };
  expect(projectTask({
    task: { id: "task", status: "completed", execution: state },
    runs: [
      { id: "run", status: "completed", attempts: 1 },
      { id: "older", status: "failed", attempts: 1 },
    ],
    pendingEffects: [],
    unresolvedEffects: [],
  }).state).toBe("succeeded");
});

it("does not infer completion when the current Run is missing", () => {
  expect(projectTask({
    task: { id: "task", status: "completed", execution: execution() },
    runs: [{ id: "older", status: "completed", attempts: 1 }],
    pendingEffects: [],
    unresolvedEffects: [],
  })).toMatchObject({ state: "queued", reason: "current_run_missing" });
});

it("reports an unconfirmed stop while a Run is still active", () => {
  const executionState = { ...execution(), control: { intent: "cancel" as const, quiesced: false } };
  expect(projectTask({
    task: { id: "task", status: "cancelled", execution: executionState },
    runs: [{ id: "run", status: "running", attempts: 1 }],
    pendingEffects: [],
    unresolvedEffects: [],
  })).toMatchObject({ state: "running", reason: "stop_unconfirmed" });
});

it("keeps cancelled separate from stop confirmation", () => {
  const executionState = { ...execution(), control: { intent: "cancel" as const, quiesced: false } };
  expect(projectTask({
    task: { id: "task", status: "cancelled", execution: executionState },
    runs: [{ id: "run", status: "cancelled", attempts: 1, cancelled: true }],
    pendingEffects: [],
    unresolvedEffects: [],
  })).toMatchObject({ state: "cancelled", reason: "stop_unconfirmed" });
});

it("surfaces unknown effects as failed or cancelled with a reason", () => {
  const base = {
    task: { id: "task", status: "failed", execution: execution() },
    runs: [{ id: "run", status: "failed", attempts: 1 }],
    pendingEffects: [],
    unresolvedEffects: [{ id: "effect", status: "intended" }],
  };
  expect(projectTask(base)).toMatchObject({ state: "failed", reason: "unknown_effects" });
});
