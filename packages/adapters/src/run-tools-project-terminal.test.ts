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
  const device = { deviceId: "windows-a", name: "Desktop", platform: "win32" };
  const connected = vi.fn().mockResolvedValue(device);
  const requestDevice = vi.fn(async function* () { yield { status: "completed", stdout: "10.0.26100" }; });
  const ctx = {
    deps: {
      prisma: { $queryRaw: vi.fn().mockResolvedValue([currentProject]) },
      userDevices: { connected, request: requestDevice },
    },
    run: { projectWorkspaceId: currentProject.id, spaceId: "space-a", userId: "owner-a" },
    runId: "run-a",
    source: { ownerStartedRun: true, messagingChannelRun: false, userComputerOwner: "owner-a" },
    context: {
      signal: new AbortController().signal,
      nativeRunLease: { validate: vi.fn(async () => Date.now() + 10_000) },
    },
  } as unknown as RunContext;
  const request = { args: { command: "ver" }, executionId: "call-a" } as unknown as ToolRequest;
  const call = {
    args: { command: "ver", deviceId: device.deviceId },
    claimedEffect: true,
    bypassApproval: false,
    applied: { effect: { id: "effect-a" } },
    finish: async (result: unknown) => result,
  } as unknown as ToolCall;
  return { ctx, request, call, connected, requestDevice, device };
}

describe("project Windows terminal", () => {
  it("pins the currently connected Windows device in a one-time task approval", async () => {
    const { ctx, request, call, requestDevice } = fixture();
    await expect(prepareProjectWindowsTerminal(ctx, request)).resolves.toBeUndefined();
    expect(request.effectRequest).toEqual({ command: "ver", deviceId: "windows-a" });
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
  });

  it("refuses to replay on a replacement device or run without a claimed approval", async () => {
    const { ctx, request, call, connected, requestDevice, device } = fixture();
    connected.mockResolvedValue({ ...device, deviceId: "windows-b" });
    await expect(prepareProjectWindowsTerminal(ctx, {
      ...request, args: call.args, approvedEffectKey: "effect-a",
    })).resolves.toHaveProperty("error");
    await expect(runProjectWindowsTerminal(ctx, call)).resolves.toHaveProperty("error");
    await expect(runProjectWindowsTerminal(ctx, {
      ...call, args: { command: "ver", deviceId: "windows-b" }, bypassApproval: true,
    })).resolves.toHaveProperty("error");
    expect(requestDevice).not.toHaveBeenCalled();
  });

  it("rejects command suffixes and model-supplied devices", async () => {
    const { ctx, request, connected } = fixture();
    for (const args of [{ command: "ver & dir" }, { command: "chcp 65001" }, { command: "ver", deviceId: "windows-a" }])
      await expect(prepareProjectWindowsTerminal(ctx, { ...request, args })).resolves.toHaveProperty("error");
    expect(connected).not.toHaveBeenCalled();
  });
});
