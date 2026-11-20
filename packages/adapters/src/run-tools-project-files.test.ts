import { describe, expect, it, vi } from "vitest";
import type { RunContext } from "./run-context.js";
import { PROJECT_FILE_CREATE, PROJECT_FILE_READ } from "./run-project-policy.js";
import type { ToolCall } from "./run-tool-gate.js";
import type { ToolRequest } from "./run-tool-request.js";
import { prepareProjectFile, projectFileHandlers } from "./run-tools-project-files.js";

const binding = {
  deviceId: "windows-a",
  grantId: "a374627e-87a5-4f8d-a619-1c662ae431b7",
  directoryName: "Project A",
  intent: "read-write",
};

function fixture(data: unknown[] = []) {
  const query = vi.fn().mockResolvedValue([binding]);
  const request = vi.fn(async function* (_user: string, _body: unknown, _signal: AbortSignal, _device: string) {
    yield* data;
  });
  const updateEffect = vi.fn().mockResolvedValue({ count: 1 });
  const ctx = {
    context: { signal: new AbortController().signal },
    deps: {
      userDevices: { request },
      prisma: { $queryRaw: query, externalEffect: { updateMany: updateEffect } },
    },
    run: { projectWorkspaceId: "project-a", spaceId: "space-a", userId: "owner-a", threadId: "thread-a", taskId: "task-a" },
    runId: "run-a",
    workerId: "worker-a",
    fence: 4,
  } as unknown as RunContext;
  const args = { path: "source.txt" };
  const persistEffectResult = vi.fn().mockResolvedValue(true);
  const call = {
    name: PROJECT_FILE_READ,
    args: { ...args, projectDirectory: binding },
    claimedEffect: true,
    bypassApproval: false,
    applied: { effect: { id: "effect-a" } },
    persistEffectResult,
    finish: async (result: unknown) => result,
  } as unknown as ToolCall;
  return { ctx, call, args, query, request, updateEffect, persistEffectResult };
}

describe("Windows project file tools", () => {
  it("pins the approved device and directory without accepting model-provided identifiers", async () => {
    const { ctx, args, query } = fixture();
    const request = { name: PROJECT_FILE_READ, args, executionId: "call-a" } as unknown as ToolRequest;
    await expect(prepareProjectFile(ctx, request)).resolves.toBeUndefined();
    expect(request.effectRequest).toEqual({
      ...args, projectDirectory: { deviceId: binding.deviceId, grantId: binding.grantId },
    });
    expect(request.fleetSummary).toMatchObject({ onceOnly: true });
    expect(query.mock.calls[0]?.[0].values).toEqual([
      "run-a", "thread-a", "task-a", "project-a", "space-a", "owner-a", "worker-a", 4,
    ]);
    await expect(prepareProjectFile(ctx, request)).resolves.toHaveProperty("error");
    expect(query).toHaveBeenCalledOnce();
    query.mockResolvedValue([{ ...binding, grantId: "a374627e-87a5-4f8d-a619-1c662ae431b8" }]);
    await expect(prepareProjectFile(ctx, {
      ...request, approvedEffectKey: "approved-key",
    })).resolves.toHaveProperty("error", expect.stringContaining("changed after approval"));
  });

  it("delivers one finished read from the bound device and persists summary only", async () => {
    const { ctx, call, request, persistEffectResult } = fixture([{ operation: "read", text: "样本" }]);
    await expect(projectFileHandlers[PROJECT_FILE_READ]!(ctx, call)).resolves.toEqual({
      read: true, bytes: 6, text: "样本",
    });
    expect(request).toHaveBeenCalledExactlyOnceWith("owner-a", {
      method: "projectFile", spaceId: "space-a", projectId: "project-a",
      grantId: binding.grantId, file: { operation: "read", path: "source.txt" },
    }, expect.any(AbortSignal), binding.deviceId);
    expect(persistEffectResult).toHaveBeenCalledExactlyOnceWith({ read: true, bytes: 6 });
  });

  it("withholds read content when permission disappears before delivery", async () => {
    const { ctx, call, query } = fixture([{ operation: "read", text: "sample" }]);
    query.mockResolvedValueOnce([binding]).mockResolvedValueOnce([]);
    await expect(projectFileHandlers[PROJECT_FILE_READ]!(ctx, call)).resolves.toEqual({
      error: "The current project directory authorization is unavailable.",
    });
  });

  it("routes a cloud grant to its dedicated provider and keeps the project Run in the context", async () => {
    const { ctx, call, query } = fixture();
    const cloud = {
      computerId: "cloud-a", grantId: binding.grantId, available: true,
      providerRef: "native:0123456789abcdef", homeKey: "home-bot-a",
      folder: { path: "project-a", device: "12", inode: "34" }, intent: "read-only",
    };
    const executeProjectFile = vi.fn().mockResolvedValue({ operation: "read", text: "sample" });
    query.mockResolvedValue([cloud]);
    const target = { ...ctx, context: { ...ctx.context, runId: "run-a" }, deps: {
      ...ctx.deps, userDevices: undefined, sandbox: { executeProjectFile } as never,
    } };
    await expect(projectFileHandlers[PROJECT_FILE_READ]!(target, {
      ...call, args: { ...call.args, projectDirectory: { computerId: cloud.computerId, grantId: cloud.grantId } },
    })).resolves.toMatchObject({ read: true, text: "sample" });
    expect(executeProjectFile).toHaveBeenCalledExactlyOnceWith(
      { id: cloud.computerId, kind: "native-linux", providerRef: cloud.providerRef, botId: cloud.homeKey },
      cloud.folder, { operation: "read", path: "source.txt" },
      expect.objectContaining({ runId: "run-a", botId: cloud.homeKey }),
    );
  });

  it("cancels an in-flight device request when the persisted run scope is lost", async () => {
    vi.useFakeTimers();
    try {
      const { ctx, call, query, request } = fixture();
      query.mockResolvedValueOnce([binding]).mockResolvedValueOnce([]);
      request.mockImplementation(async function* (_user, _body, signal) {
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      });
      const result = projectFileHandlers[PROJECT_FILE_READ]!(ctx, call);
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(result).resolves.toHaveProperty("error");
      expect(request).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("records an interrupted create as uncertain and sends it just once", async () => {
    const { ctx, call, request, updateEffect } = fixture([{ operation: "create", bytes: 2 }]);
    const create = { ...call, name: PROJECT_FILE_CREATE, args: {
      path: "result.md", text: "样本", projectDirectory: binding,
    } };
    await expect(projectFileHandlers[PROJECT_FILE_CREATE]!(ctx, create)).resolves.toMatchObject({
      uncertain: true,
    });
    expect(request).toHaveBeenCalledOnce();
    expect(updateEffect).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      where: { id: "effect-a", status: "executing" },
      data: expect.objectContaining({ status: "uncertain" }),
    }));
  });

  it("reports a confirmed Windows create even when there is no download store", async () => {
    const { ctx, call, request, updateEffect } = fixture([{ operation: "create", bytes: 6 }]);
    const create = { ...call, name: PROJECT_FILE_CREATE, args: {
      path: "result.md", text: "样本", projectDirectory: binding,
    } };
    await expect(projectFileHandlers[PROJECT_FILE_CREATE]!(ctx, create)).resolves.toEqual({
      created: true, bytes: 6, downloadAvailable: false,
    });
    expect(request).toHaveBeenCalledOnce();
    expect(updateEffect).not.toHaveBeenCalled();
  });
});
