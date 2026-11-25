import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NativeLinuxSandbox, NativeProjectFileDispatchError } from "./native-linux-sandbox.js";
import type { RunContext } from "./run-context.js";
import { PROJECT_FILE_CREATE, PROJECT_FILE_LIST, PROJECT_FILE_READ, PROJECT_FILE_SEARCH, PROJECT_FILE_UPDATE } from "./run-project-policy.js";
import type { ToolCall } from "./run-tool-gate.js";
import type { ToolRequest } from "./run-tool-request.js";
import { UserDeviceNotConnectedError } from "./user-device-gateway.js";
import { persistMessageInTransaction } from "./run-messages.js";
import { prepareProjectFile, projectFileHandlers } from "./run-tools-project-files.js";

vi.mock("./run-messages.js", () => ({
  persistMessageInTransaction: vi.fn().mockResolvedValue({ eventSeq: 7 }),
}));

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
  const updateRun = vi.fn().mockResolvedValue({ count: 1 });
  const updateAttempt = vi.fn().mockResolvedValue({ count: 1 });
  const tx = {
    $queryRaw: vi.fn(),
    run: {
      updateMany: updateRun,
      findUnique: vi.fn().mockResolvedValue({ status: "queued", leaseOwner: null, leaseFence: 4 }),
    },
    externalEffect: { updateMany: updateEffect },
    attempt: { updateMany: updateAttempt },
    thread: { update: vi.fn().mockResolvedValue({ nextEventSeq: 9 }) },
    event: { create: vi.fn(async ({ data }: { data: { seq: number } }) => data) },
  };
  const transaction = vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx));
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const notify = vi.fn().mockResolvedValue(undefined);
  const ctx = {
    context: { signal: new AbortController().signal },
    deps: {
      userDevices: { request },
      prisma: { $queryRaw: query, externalEffect: tx.externalEffect, $transaction: transaction },
      jobs: { enqueue },
      events: { notify },
    },
    run: { id: "run-a", projectWorkspaceId: "project-a", spaceId: "space-a", userId: "owner-a", threadId: "thread-a", taskId: "task-a", botId: "bot-a", trigger: "user" },
    attempt: { id: "attempt-a" },
    state: { approval: { pausePending: false }, effects: { pendingTurnCheckpoints: new Map() } },
    runId: "run-a",
    workerId: "worker-a",
    fence: 4,
  } as unknown as RunContext;
  const args = { path: "source.txt" };
  const persistEffectResult = vi.fn().mockResolvedValue(true);
  const finish = vi.fn(async (result: unknown) => result);
  const call = {
    name: PROJECT_FILE_READ,
    args: { ...args, projectDirectory: binding },
    claimedEffect: true,
    bypassApproval: false,
    applied: { effect: { id: "effect-a", status: "approved" } },
    persistEffectResult,
    finish,
  } as unknown as ToolCall;
  return { ctx, call, args, query, request, updateEffect, updateRun, updateAttempt, enqueue, notify, persistEffectResult, finish, tx };
}

describe("Windows project file tools", () => {
  it("lists an approved directory and persists only a bounded summary", async () => {
    const { ctx, call, request, persistEffectResult } = fixture([{
      operation: "list",
      entries: [{ path: "src/index.ts", kind: "file" }],
      truncated: false,
    }]);
    const listCall = {
      ...call,
      name: PROJECT_FILE_LIST,
      args: { path: "src", projectDirectory: binding },
    };
    const prepared = {
      name: PROJECT_FILE_LIST,
      args: {},
      executionId: "list-a",
    } as unknown as ToolRequest;
    await expect(prepareProjectFile(ctx, prepared)).resolves.toBeUndefined();
    expect(prepared.fleetSummary).toMatchObject({
      title: "List this project folder?",
      lines: expect.arrayContaining(["Folder: ."]),
      onceOnly: true,
    });
    await expect(projectFileHandlers[PROJECT_FILE_LIST]!(ctx, listCall as unknown as ToolCall)).resolves.toEqual({
      listed: true,
      entries: [{ path: "src/index.ts", kind: "file" }],
      truncated: false,
    });
    expect(request).toHaveBeenCalledWith("owner-a", expect.objectContaining({
      file: { operation: "list", path: "src" },
    }), expect.any(AbortSignal), binding.deviceId);
    expect(persistEffectResult).toHaveBeenCalledWith({ listed: true, entries: 1, truncated: false });
  });

  it("does not expose a device listing that escapes the requested folder", async () => {
    const { ctx, call, persistEffectResult } = fixture([{
      operation: "list",
      entries: [{ path: "private.txt", kind: "file" }],
      truncated: false,
    }]);
    const listCall = {
      ...call,
      name: PROJECT_FILE_LIST,
      args: { path: "src", projectDirectory: binding },
    };
    await expect(projectFileHandlers[PROJECT_FILE_LIST]!(ctx, listCall as unknown as ToolCall)).resolves.toEqual({
      error: "The bound computer did not complete the project directory request.",
    });
    expect(persistEffectResult).not.toHaveBeenCalled();
  });

  it("searches an approved directory, records a summary, and rejects escaped match paths", async () => {
    const { ctx, call, request, persistEffectResult } = fixture([{
      operation: "search",
      matches: [{ path: "src/index.ts", line: 4, text: "export const token = true;" }],
      truncated: false,
    }]);
    const prepared = {
      name: PROJECT_FILE_SEARCH,
      args: { path: "src", query: "token" },
      executionId: "search-a",
    } as unknown as ToolRequest;
    await expect(prepareProjectFile(ctx, prepared)).resolves.toBeUndefined();
    expect(prepared.fleetSummary).toMatchObject({
      title: "Search this project folder?",
      lines: expect.arrayContaining(["Folder: src", "Query: token"]),
      onceOnly: true,
    });
    const searchCall = {
      ...call,
      name: PROJECT_FILE_SEARCH,
      args: { path: "src", query: "token", caseSensitive: false, projectDirectory: binding },
    };
    await expect(projectFileHandlers[PROJECT_FILE_SEARCH]!(ctx, searchCall as unknown as ToolCall)).resolves.toEqual({
      searched: true,
      matches: [{ path: "src/index.ts", line: 4, text: "export const token = true;" }],
      truncated: false,
    });
    expect(request).toHaveBeenCalledWith("owner-a", expect.objectContaining({
      file: { operation: "search", path: "src", query: "token", caseSensitive: false },
    }), expect.any(AbortSignal), binding.deviceId);
    expect(persistEffectResult).toHaveBeenCalledWith({ searched: true, matches: 1, truncated: false });

    const escaped = fixture([{
      operation: "search",
      matches: [{ path: "other/secret.ts", line: 1, text: "token" }],
      truncated: false,
    }]);
    const escapedCall = {
      ...escaped.call,
      name: PROJECT_FILE_SEARCH,
      args: { path: "src", query: "token", caseSensitive: false, projectDirectory: binding },
    };
    await expect(projectFileHandlers[PROJECT_FILE_SEARCH]!(escaped.ctx, escapedCall as unknown as ToolCall)).resolves.toEqual({
      error: "The bound computer did not complete the project directory request.",
    });
    expect(escaped.persistEffectResult).not.toHaveBeenCalled();
  });

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
    const text = "\ufeff样本";
    const bytes = Buffer.byteLength(text);
    const sha256 = createHash("sha256").update(text).digest("hex");
    const { ctx, call, request, persistEffectResult } = fixture([{ operation: "read", text, sha256 }]);
    await expect(projectFileHandlers[PROJECT_FILE_READ]!(ctx, call)).resolves.toEqual({
      read: true, bytes, sha256, text,
    });
    expect(request).toHaveBeenCalledExactlyOnceWith("owner-a", {
      method: "projectFile", spaceId: "space-a", projectId: "project-a",
      grantId: binding.grantId, file: { operation: "read", path: "source.txt" },
    }, expect.any(AbortSignal), binding.deviceId);
    expect(persistEffectResult).toHaveBeenCalledExactlyOnceWith({
      read: true,
      bytes,
      sha256,
    });
  });

  it("withholds file contents when the device returns a mismatched read digest", async () => {
    const { ctx, call, persistEffectResult } = fixture([
      { operation: "read", text: "sample", sha256: "a".repeat(64) },
    ]);
    await expect(projectFileHandlers[PROJECT_FILE_READ]!(ctx, call)).resolves.toEqual({
      error: "The bound computer did not complete the project directory request.",
    });
    expect(persistEffectResult).not.toHaveBeenCalled();
  });

  it("withholds read content when permission disappears before delivery", async () => {
    const { ctx, call, query, persistEffectResult } = fixture([{ operation: "read", text: "sample" }]);
    query.mockResolvedValueOnce([binding]).mockResolvedValueOnce([]);
    await expect(projectFileHandlers[PROJECT_FILE_READ]!(ctx, call)).resolves.toEqual({
      error: "The current project directory authorization is unavailable.",
    });
    expect(persistEffectResult).toHaveBeenCalledOnce();
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

  it("requeues the same run and approval when the fixed device was offline before dispatch", async () => {
    vi.mocked(persistMessageInTransaction).mockClear();
    const { ctx, call, request, updateEffect, updateRun, updateAttempt, enqueue, notify, finish, tx } = fixture();
    request.mockImplementation(() => {
      throw new UserDeviceNotConnectedError();
    });
    const create = { ...call, name: PROJECT_FILE_CREATE, args: {
      path: "result.md", text: "样本", projectDirectory: binding,
    } };
    await expect(projectFileHandlers[PROJECT_FILE_CREATE]!(ctx, create)).resolves.toMatchObject({
      terminate: true,
    });
    expect(ctx.state.approval.pausePending).toBe(true);
    expect(finish).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledOnce();
    expect(updateRun).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: "run-a", status: "running", leaseOwner: "worker-a", leaseFence: 4,
        leaseExpiresAt: { gt: expect.any(Date) },
      },
      data: {
        status: "queued", wakeAt: expect.any(Date), leaseOwner: null, leaseExpiresAt: null,
      },
    });
    expect(updateEffect).toHaveBeenCalledExactlyOnceWith({
      where: { id: "effect-a", runId: "run-a", status: "executing" },
      data: { status: "approved", result: { waitingForDevice: true } },
    });
    expect(updateAttempt).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "attempt-a", runId: "run-a", fence: 4, status: "running" },
      data: { status: "interrupted", finishedAt: expect.any(Date) },
    }));
    expect(tx.event.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: "run.queued",
        runId: "run-a",
        payload: expect.objectContaining({ reason: "project_device_offline", trigger: "user" }),
      }),
    }));
    const wakeAt = updateRun.mock.calls[0]?.[0].data.wakeAt;
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      name: "run.continue", payload: { runId: "run-a" }, availableAt: wakeAt,
    }));
    expect(persistMessageInTransaction).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith("thread-a", 8, undefined);
  });

  it("does not post another wait notice when the approved read is still offline on resume", async () => {
    vi.mocked(persistMessageInTransaction).mockClear();
    const { ctx, call, request, enqueue, notify } = fixture();
    request.mockImplementation(() => {
      throw new UserDeviceNotConnectedError();
    });
    const replay = {
      ...call,
      applied: { ...call.applied!, effect: { ...call.applied!.effect, result: { waitingForDevice: true } } },
    };
    await expect(projectFileHandlers[PROJECT_FILE_READ]!(ctx, replay)).resolves.toMatchObject({
      terminate: true,
    });
    expect(enqueue).toHaveBeenCalledOnce();
    expect(persistMessageInTransaction).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("thread-a", 8, undefined);
  });

  it("does not restore an approval after cancellation or a superseding worker", async () => {
    const { ctx, call, request, updateRun, updateEffect, enqueue } = fixture();
    request.mockImplementation(() => {
      throw new UserDeviceNotConnectedError();
    });
    updateRun.mockResolvedValue({ count: 0 });
    await expect(projectFileHandlers[PROJECT_FILE_READ]!(ctx, call)).resolves.toMatchObject({
      terminate: true,
    });
    expect(updateEffect).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("does not send a resumed request after the directory was rebound", async () => {
    const { ctx, call, query, request } = fixture();
    query.mockResolvedValue([{ ...binding, deviceId: "windows-b" }]);
    await expect(projectFileHandlers[PROJECT_FILE_READ]!(ctx, call)).resolves.toMatchObject({
      error: "The current project directory authorization is unavailable.",
    });
    expect(request).not.toHaveBeenCalled();
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

  it("requires a valid prior-read hash and reports changed files without overwriting them", async () => {
    const { ctx, call, request } = fixture([{ operation: "conflict", sha256: "b".repeat(64) }]);
    const update = {
      ...call,
      name: PROJECT_FILE_UPDATE,
      args: {
        path: "source.txt", expectedSha256: "a".repeat(64), text: "replacement",
        projectDirectory: binding,
      },
    };
    const prepared = { name: PROJECT_FILE_UPDATE, args: { path: "source.txt", expectedSha256: "a".repeat(64), text: "replacement" }, executionId: "update-a" } as unknown as ToolRequest;
    await expect(prepareProjectFile(ctx, prepared)).resolves.toBeUndefined();
    expect(prepared.fleetSummary?.title).toBe("Update this project file?");
    await expect(projectFileHandlers[PROJECT_FILE_UPDATE]!(ctx, update)).resolves.toMatchObject({
      conflict: true,
      sha256: "b".repeat(64),
    });
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      file: { operation: "update", expectedSha256: "a".repeat(64) },
    });
  });
});

describe("cloud project file tools", () => {
  function cloudFixture() {
    const base = fixture();
    const cloud = {
      computerId: "cloud-a",
      grantId: binding.grantId,
      homeKey: "private-bot-a",
      providerRef: "native:0123456789abcdef",
      folder: { path: "project", device: "12", inode: "34" },
      intent: "read-write",
      available: true,
    };
    const transport = vi.fn();
    const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5_000, transport);
    const ctx: RunContext = {
      ...base.ctx,
      context: {
        ...base.ctx.context,
        nativeRunLease: { owner: "worker-a", fence: 4, validate: async () => Date.now() + 5_000 },
      },
      deps: { ...base.ctx.deps, userDevices: undefined, sandbox },
    };
    const call = {
      ...base.call,
      name: PROJECT_FILE_UPDATE,
      args: {
        path: "source.txt",
        expectedSha256: "a".repeat(64),
        text: "updated",
        projectDirectory: { computerId: cloud.computerId, grantId: cloud.grantId },
      },
    };
    base.query.mockResolvedValue([cloud]);
    return { ...base, ctx, call, cloud, transport };
  }

  it("keeps the approved write on the original cloud computer until its connection recovers", async () => {
    vi.mocked(persistMessageInTransaction).mockClear();
    const { ctx, call, cloud, transport, request, updateEffect, enqueue } = cloudFixture();
    transport
      .mockRejectedValueOnce(new NativeProjectFileDispatchError("offline"))
      .mockResolvedValueOnce({
        operation: "update",
        bytes: 7,
        sha256: createHash("sha256").update("updated").digest("hex"),
      });

    await expect(projectFileHandlers[PROJECT_FILE_UPDATE]!(ctx, call)).resolves.toMatchObject({
      terminate: true,
    });
    expect(updateEffect).toHaveBeenCalledWith({
      where: { id: "effect-a", runId: "run-a", status: "executing" },
      data: { status: "approved", result: { waitingForDevice: true } },
    });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      name: "run.continue",
      payload: { runId: "run-a" },
    }));
    expect(persistMessageInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      ctx.run,
      "bot",
      [expect.objectContaining({ text: expect.stringContaining("绑定的云电脑") })],
      false,
      undefined,
      false,
      expect.anything(),
    );

    await expect(projectFileHandlers[PROJECT_FILE_UPDATE]!(ctx, call)).resolves.toMatchObject({
      updated: true,
      bytes: 7,
    });
    expect(transport).toHaveBeenCalledTimes(2);
    for (const dispatch of transport.mock.calls) {
      expect(dispatch).toEqual([
        "project_file",
        {
          folder: cloud.folder,
          file: { operation: "update", path: "source.txt", expectedSha256: "a".repeat(64), text: "updated" },
        },
        expect.objectContaining({ botId: cloud.homeKey }),
        { id: cloud.computerId, kind: "native-linux", botId: cloud.homeKey, providerRef: cloud.providerRef },
      ]);
    }
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps a dispatched update uncertain when its digest does not match the approved text", async () => {
    const { ctx, call, transport, updateEffect, enqueue, finish } = cloudFixture();
    transport.mockResolvedValue({ operation: "update", bytes: 7, sha256: "b".repeat(64) });

    await expect(projectFileHandlers[PROJECT_FILE_UPDATE]!(ctx, call)).resolves.toMatchObject({
      uncertain: true,
    });
    expect(updateEffect).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "uncertain", result: expect.objectContaining({ uncertain: true }) },
    }));
    expect(finish).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("does not duplicate the cloud wait notice while the same approval remains offline", async () => {
    vi.mocked(persistMessageInTransaction).mockClear();
    const { ctx, call, transport, enqueue, updateEffect } = cloudFixture();
    transport.mockRejectedValue(new NativeProjectFileDispatchError("offline"));

    await expect(projectFileHandlers[PROJECT_FILE_UPDATE]!(ctx, call)).resolves.toMatchObject({
      terminate: true,
    });
    const replay = {
      ...call,
      applied: {
        ...call.applied!,
        effect: { ...call.applied!.effect, result: { waitingForDevice: true } },
      },
    };
    await expect(projectFileHandlers[PROJECT_FILE_UPDATE]!(ctx, replay)).resolves.toMatchObject({
      terminate: true,
    });

    expect(transport).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(persistMessageInTransaction).toHaveBeenCalledOnce();
    expect(updateEffect).toHaveBeenCalledTimes(2);
  });

  it("does not dispatch an approved write after the cloud directory is rebound", async () => {
    const { ctx, call, cloud, query, transport, enqueue } = cloudFixture();
    query.mockResolvedValue([{ ...cloud, grantId: "new-grant" }]);
    await expect(projectFileHandlers[PROJECT_FILE_UPDATE]!(ctx, call)).resolves.toHaveProperty("error");
    expect(transport).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("asks for a new approval after the driver explicitly rejects an old generation", async () => {
    const { ctx, call, transport, enqueue, updateEffect } = cloudFixture();
    transport.mockRejectedValue(new NativeProjectFileDispatchError("generation_changed"));
    await expect(projectFileHandlers[PROJECT_FILE_UPDATE]!(ctx, call)).resolves.toEqual({
      error: "The cloud computer has restarted. Reconnect the project directory and request a new approval.",
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(updateEffect).not.toHaveBeenCalled();
  });

  it("does not replay a write after the cloud transport loses the reply", async () => {
    const { ctx, call, transport, updateEffect, enqueue } = cloudFixture();
    transport.mockRejectedValue(new Error("native_driver_disconnected_result_unknown"));
    await expect(projectFileHandlers[PROJECT_FILE_UPDATE]!(ctx, call)).resolves.toMatchObject({
      uncertain: true,
    });
    expect(updateEffect).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "uncertain" }),
    }));
    expect(transport).toHaveBeenCalledOnce();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
