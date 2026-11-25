import { describe, expect, it, vi } from "vitest";
import type { RunContext } from "./run-context.js";
import type { ToolCall } from "./run-tool-gate.js";
import type { ToolRequest } from "./run-tool-request.js";
import {
  prepareProjectWindowsTerminal,
  runProjectWindowsTerminal,
} from "./run-tools-project-terminal.js";

function fixture() {
  const date = new Date();
  const currentProject = { id: "project-a", name: "Project A", createdAt: date, updatedAt: date };
  const binding = {
    deviceId: "windows-a",
    deviceName: "Desktop",
    grantId: "a374627e-87a5-4f8d-a619-1c662ae431b7",
    directoryName: "Project A",
    intent: "read-only",
  };
  const connected = vi.fn().mockResolvedValue({ deviceId: "windows-b", platform: "win32" });
  const query = vi.fn(async (sql: { text: string }) =>
    sql.text.includes('FROM "runs"') ? [binding] : [currentProject],
  );
  const requestDevice = vi.fn(async function* () { yield { status: "completed", stdout: "10.0.26100" }; });
  const ctx = {
    deps: {
      prisma: { $queryRaw: query },
      userDevices: { connected, request: requestDevice },
    },
    run: {
      projectWorkspaceId: currentProject.id, spaceId: "space-a", userId: "owner-a",
      threadId: "thread-a", taskId: "task-a",
    },
    runId: "run-a",
    workerId: "worker-a",
    fence: 4,
    source: { ownerStartedRun: true, messagingChannelRun: false, userComputerOwner: "owner-a" },
    context: {
      signal: new AbortController().signal,
    },
  } as unknown as RunContext;
  const request = { args: { command: "ver" }, executionId: "call-a" } as unknown as ToolRequest;
  const call = {
    args: { command: "ver", deviceId: binding.deviceId, grantId: binding.grantId },
    claimedEffect: true,
    bypassApproval: false,
    applied: { effect: { id: "effect-a" } },
    finish: async (result: unknown) => result,
  } as unknown as ToolCall;
  return { ctx, request, call, connected, requestDevice, query, currentProject, binding };
}

describe("project Windows terminal", () => {
  it("uses the run's Windows device even when a different device is connected", async () => {
    const { ctx, request, call, requestDevice, binding, connected } = fixture();
    await expect(prepareProjectWindowsTerminal(ctx, request)).resolves.toBeUndefined();
    expect(request.effectRequest).toEqual({
      command: "ver", deviceId: binding.deviceId, grantId: binding.grantId,
    });
    expect(request.fleetSummary).toMatchObject({ onceOnly: true, lines: expect.arrayContaining([
      "Execution location: Desktop (Windows)", "Command: ver",
    ]) });
    await expect(runProjectWindowsTerminal(ctx, call)).resolves.toEqual({
      command: "ver", stdout: "10.0.26100",
    });
    expect(requestDevice).toHaveBeenCalledExactlyOnceWith("owner-a", {
      method: "projectWindowsTerminal", spaceId: "space-a",
      projectId: "project-a", projectName: "Project A", runId: "run-a", command: "ver",
    }, expect.any(AbortSignal), "windows-a");
    expect(connected).not.toHaveBeenCalled();
  });

  it("refuses to replay after losing the directory grant", async () => {
    const { ctx, request, call, query, requestDevice, currentProject } = fixture();
    query.mockImplementation(async (sql) => sql.text.includes('FROM "runs"') ? [] : [currentProject]);
    await expect(prepareProjectWindowsTerminal(ctx, {
      ...request, args: call.args, approvedEffectKey: "effect-a",
    })).resolves.toHaveProperty("error");
    await expect(runProjectWindowsTerminal(ctx, call)).resolves.toHaveProperty("error");
    expect(requestDevice).not.toHaveBeenCalled();
  });

  it("requires the saved grant and a claimed approval", async () => {
    const { ctx, request, call, requestDevice } = fixture();
    const args = { ...call.args, grantId: "a374627e-87a5-4f8d-a619-1c662ae431b8" };
    await expect(prepareProjectWindowsTerminal(ctx, {
      ...request, args, approvedEffectKey: "effect-a",
    })).resolves.toHaveProperty("error");
    await expect(runProjectWindowsTerminal(ctx, { ...call, args })).resolves.toHaveProperty("error");
    await expect(runProjectWindowsTerminal(ctx, {
      ...call, bypassApproval: true,
    })).resolves.toHaveProperty("error");
    expect(requestDevice).not.toHaveBeenCalled();
  });

  it("rejects command suffixes and model-supplied devices", async () => {
    const { ctx, request, query } = fixture();
    for (const args of [{ command: "ver & dir" }, { command: "chcp 65001" }, { command: "ver", deviceId: "windows-a" }])
      await expect(prepareProjectWindowsTerminal(ctx, { ...request, args })).resolves.toHaveProperty("error");
    expect(query).not.toHaveBeenCalled();
  });
});
