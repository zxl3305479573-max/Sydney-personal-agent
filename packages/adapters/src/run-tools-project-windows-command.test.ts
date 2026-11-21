import { describe, expect, it, vi } from "vitest";
import type { RunContext } from "./run-context.js";
import type { ToolCall } from "./run-tool-gate.js";
import type { ToolRequest } from "./run-tool-request.js";
import { waitForProjectDevice } from "./run-tools-project-files.js";
import {
  prepareProjectWindowsCommand,
  runProjectWindowsCommand,
} from "./run-tools-project-windows-command.js";
import { UserDeviceNotConnectedError } from "./user-device-gateway.js";

vi.mock("./run-tools-project-files.js", () => ({
  waitForProjectDevice: vi.fn(async () => ({ queued: true })),
}));

function fixture() {
  const project = {
    id: "project-a",
    name: "Project A",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const binding = {
    deviceId: "windows-a",
    deviceName: "My Windows PC",
    grantId: "a374627e-87a5-4f8d-a619-1c662ae431b7",
    directoryName: "Project A",
    intent: "read-only",
  };
  const query = vi.fn(async (sql: { text: string }) =>
    sql.text.includes('FROM "runs"') ? [binding] : [project],
  );
  const request = vi.fn(async function* (): AsyncGenerator<unknown> {
    yield { status: "completed", stdout: "ok", stderr: "", code: 0 };
  });
  const devices = {
    connected: vi.fn(),
    request: vi.fn(async function* (..._args: unknown[]) {
      yield* request();
    }),
  };
  const persistEffectResult = vi.fn(async () => true);
  const ctx = {
    deps: {
      prisma: { $queryRaw: query },
      userDevices: devices,
    },
    run: {
      projectWorkspaceId: project.id,
      spaceId: "space-a",
      userId: "owner-a",
      threadId: "thread-a",
      taskId: "task-a",
    },
    runId: "run-a",
    workerId: "worker-a",
    fence: 4,
    source: { ownerStartedRun: true, messagingChannelRun: false, userComputerOwner: "owner-a" },
    context: { signal: new AbortController().signal },
  } as unknown as RunContext;
  const requestTool = {
    name: "project_windows_command",
    args: {
      argv: ["/usr/bin/python3", "-c", "print('ok')"],
      inputFiles: ["src/main.py"],
      timeoutMs: 2000,
    },
    executionId: "call-a",
  } as unknown as ToolRequest;
  const call = {
    name: "project_windows_command",
    args: { ...requestTool.args, deviceId: binding.deviceId, grantId: binding.grantId },
    executionId: "call-a",
    claimedEffect: true,
    bypassApproval: false,
    applied: { effect: { id: "effect-a", status: "executing" } },
    persistEffectResult,
    finish: async (value: unknown) => value,
  } as unknown as ToolCall;
  return {
    ctx,
    binding,
    project,
    query,
    devices,
    request,
    requestTool,
    call,
    persistEffectResult,
  };
}

describe("isolated project command on the bound Windows device", () => {
  it("does not contact the device before preparing the approved command request", async () => {
    const state = fixture();
    await expect(
      prepareProjectWindowsCommand(state.ctx, state.requestTool),
    ).resolves.toBeUndefined();
    expect(state.requestTool.args).toEqual({
      argv: ["/usr/bin/python3", "-c", "print('ok')"],
      inputFiles: ["src/main.py"],
      timeoutMs: 2000,
      deviceId: state.binding.deviceId,
      grantId: state.binding.grantId,
    });
    expect(state.requestTool.fleetSummary).toMatchObject({
      onceOnly: true,
      lines: expect.arrayContaining([
        "Execution location: My Windows PC (Windows, isolated WSL 2)",
        "Input files: src/main.py",
      ]),
    });
    expect(state.devices.request).not.toHaveBeenCalled();
  });

  it("queues the approved run when the bound Windows device is offline", async () => {
    const state = fixture();
    state.request.mockImplementation(async function* () {
      yield* [];
      throw new UserDeviceNotConnectedError();
    });
    await expect(runProjectWindowsCommand(state.ctx, state.call)).resolves.toEqual({
      queued: true,
    });
    expect(waitForProjectDevice).toHaveBeenCalledWith(
      state.ctx,
      state.call,
      state.call.applied?.effect,
      "Windows 电脑",
    );
    expect(state.persistEffectResult).not.toHaveBeenCalled();
  });

  it("executes on the same approved device and durably records the result", async () => {
    const state = fixture();
    await expect(runProjectWindowsCommand(state.ctx, state.call)).resolves.toEqual({
      code: 0,
      stdout: "ok",
      stderr: "",
    });
    expect(state.devices.request).toHaveBeenCalledWith(
      "owner-a",
      {
        method: "projectWindowsCommand",
        spaceId: "space-a",
        projectId: "project-a",
        projectName: "Project A",
        runId: "run-a",
        grantId: state.binding.grantId,
        command: state.requestTool.args && {
          argv: ["/usr/bin/python3", "-c", "print('ok')"],
          inputFiles: ["src/main.py"],
          timeoutMs: 2000,
        },
      },
      expect.any(AbortSignal),
      "windows-a",
    );
    expect(state.persistEffectResult).toHaveBeenCalledWith({ code: 0, stdout: "ok", stderr: "" });
  });

  it("rejects a changed device/grant and an unclaimed approval", async () => {
    const state = fixture();
    await expect(
      runProjectWindowsCommand(state.ctx, {
        ...state.call,
        args: { ...state.call.args, deviceId: "other-device" },
      }),
    ).resolves.toHaveProperty("error");
    await expect(
      runProjectWindowsCommand(state.ctx, {
        ...state.call,
        claimedEffect: false,
      }),
    ).resolves.toHaveProperty("error");
    expect(state.devices.request).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "declined" }, "declined"],
    [{ status: "unavailable" }, "unavailable"],
  ])("does not report success when the Windows device returns %s", async (result, message) => {
    const state = fixture();
    state.request.mockImplementation(async function* (): AsyncGenerator<unknown> {
      yield result;
    });
    await expect(runProjectWindowsCommand(state.ctx, state.call)).resolves.toHaveProperty(
      "error",
      expect.stringContaining(message),
    );
    expect(state.persistEffectResult).not.toHaveBeenCalled();
  });
});
