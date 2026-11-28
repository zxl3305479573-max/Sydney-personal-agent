import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import * as net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AdapterContext, ComputerRef } from "@rakazo/adapter-kit";
import { computerHomeKey, legacyTeamHomeKey } from "@rakazo/db";
import { expect, it, vi } from "vitest";
import {
  buildNativeDriverRequest,
  createNativeLinuxTransport,
  NativeLinuxSandbox,
  NativeProjectFileDispatchError,
} from "./native-linux-sandbox.js";

async function closeServer(server: net.Server) {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

const context: AdapterContext = {
  operationId: "worker",
  traceId: "trace",
  spaceId: "space",
  userId: "user",
  botId: "bot",
  runId: "run",
  nativeRunLease: { owner: "worker", fence: 2, validate: async () => Date.now() + 5000 },
  signal: new AbortController().signal,
};

const computer: ComputerRef = {
  id: "native-0123456789abcdef",
  providerRef: "native:0123456789abcdef",
  botId: "bot",
  kind: "native-linux",
};

it("probes a relative project folder and passes a guarded lease with the exact file request", async () => {
  const folder = { path: "project", device: "12", inode: "34" };
  const transport = vi
    .fn()
    .mockResolvedValueOnce(folder)
    .mockResolvedValueOnce({ operation: "read", text: "sample", sha256: "a".repeat(64) });
  const validate = vi.fn().mockResolvedValue(Date.now() + 5_000);
  const sandbox = new NativeLinuxSandbox(validate, transport);
  await expect(sandbox.identifyProjectFolder(computer, folder.path, context)).resolves.toEqual(
    folder,
  );
  expect(validate).not.toHaveBeenCalled();
  const file = { operation: "read", path: "source.txt" } as const;
  await expect(sandbox.executeProjectFile(computer, folder, file, context)).resolves.toEqual({
    operation: "read",
    text: "sample",
    sha256: expect.any(String),
  });
  expect(transport).toHaveBeenLastCalledWith(
    "project_file",
    { folder, file },
    expect.objectContaining({
      nativeRunLease: expect.objectContaining({ expiresAt: expect.any(Number) }),
    }),
    computer,
  );
  validate.mockResolvedValue(null);
  await expect(sandbox.executeProjectFile(computer, folder, file, context)).rejects.toThrow(
    "native_run_lease_invalid",
  );
  expect(transport).toHaveBeenCalledTimes(2);
});

it("dispatches a guarded project command only to a dedicated native computer", async () => {
  const folder = { path: "project", device: "12", inode: "34" };
  const command = { argv: ["cat", "sample.txt"], inputFiles: ["sample.txt"], timeoutMs: 2000 };
  const reply = { stdout: "sample", stderr: "", code: 0 };
  const transport = vi.fn().mockResolvedValue(reply);
  const validate = vi.fn().mockResolvedValue(Date.now() + 5_000);
  const sandbox = new NativeLinuxSandbox(validate, transport);
  await expect(sandbox.executeProjectCommand(computer, folder, command, context)).resolves.toEqual(
    reply,
  );
  expect(transport).toHaveBeenCalledExactlyOnceWith(
    "project_command",
    { folder, command },
    expect.objectContaining({
      nativeRunLease: expect.objectContaining({ expiresAt: expect.any(Number) }),
    }),
    computer,
  );
  await expect(
    sandbox.executeProjectCommand(
      computer,
      folder,
      {
        ...command,
        inputFiles: ["../sample.txt"],
      },
      context,
    ),
  ).rejects.toThrow();
  for (const teamHome of [
    computerHomeKey({ mode: "team", spaceId: context.spaceId, userId: context.userId }),
    legacyTeamHomeKey(context.spaceId),
  ]) {
    await expect(
      sandbox.executeProjectCommand({ ...computer, botId: teamHome }, folder, command, {
        ...context,
        botId: teamHome,
      }),
    ).rejects.toThrow("native_project_command_requires_dedicated_computer");
  }
  validate.mockResolvedValue(null);
  await expect(sandbox.executeProjectCommand(computer, folder, command, context)).rejects.toThrow(
    "native_run_lease_invalid",
  );
  expect(transport).toHaveBeenCalledTimes(1);
});

it("reports isolated project command availability through the guarded driver method", async () => {
  const transport = vi.fn().mockResolvedValue({ available: true });
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5_000, transport);
  await expect(sandbox.projectCommandAvailable(computer, context)).resolves.toBe(true);
  expect(transport).toHaveBeenCalledExactlyOnceWith(
    "project_command_status",
    {},
    expect.objectContaining({
      nativeRunLease: expect.objectContaining({ expiresAt: expect.any(Number) }),
    }),
    computer,
  );
});

it.each([
  { operation: "update", bytes: 3, sha256: "b".repeat(64) },
  { operation: "conflict", sha256: "b".repeat(64) },
])("preserves the $operation result for a project file update", async (result) => {
  const folder = { path: "project", device: "12", inode: "34" };
  const transport = vi.fn().mockResolvedValue(result);
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5_000, transport);
  const file = {
    operation: "update",
    path: "source.txt",
    expectedSha256: "a".repeat(64),
    text: "new",
  } as const;

  await expect(sandbox.executeProjectFile(computer, folder, file, context)).resolves.toEqual(
    result,
  );
  expect(transport).toHaveBeenCalledOnce();
  expect(transport).toHaveBeenCalledWith(
    "project_file",
    { folder, file },
    expect.anything(),
    computer,
  );
});

it.each(["read", "create"] as const)(
  "rejects a project file update conflict for %s",
  async (operation) => {
    const folder = { path: "project", device: "12", inode: "34" };
    const transport = vi.fn().mockResolvedValue({ operation: "conflict", sha256: "b".repeat(64) });
    const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5_000, transport);
    const file =
      operation === "read"
        ? { operation, path: "source.txt" }
        : { operation, path: "result.md", text: "new" };

    await expect(sandbox.executeProjectFile(computer, folder, file, context)).rejects.toThrow(
      "native_project_file_result_mismatch",
    );
  },
);

it("distinguishes an absent project driver, a stale generation, and a lost reply", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sydney-native-test-"));
  const socketPath =
    process.platform === "win32"
      ? `\\\\.\\pipe\\${path.basename(directory)}`
      : path.join(directory, "driver.sock");
  const folder = { path: "project", device: "12", inode: "34" };
  const file = { operation: "create", path: "result.md", text: "sample" } as const;
  const sandbox = new NativeLinuxSandbox(
    async () => Date.now() + 5_000,
    createNativeLinuxTransport(socketPath),
  );
  const previouslySent = vi.fn();
  const replies = [
    `${JSON.stringify({ ok: false, error: "native_driver_generation_changed" })}\n`,
    undefined,
    `${JSON.stringify({ ok: true, value: { operation: "create", bytes: 6 } })}\n`,
  ];
  const server = net.createServer((socket) => {
    socket.once("data", (data) => {
      previouslySent(JSON.parse(data.toString("utf8")));
      socket.end(replies.shift() ?? "");
    });
  });
  try {
    await expect(sandbox.executeProjectFile(computer, folder, file, context)).rejects.toMatchObject(
      {
        name: "NativeProjectFileDispatchError",
        reason: "offline",
      },
    );
    server.listen(socketPath);
    await once(server, "listening");
    await expect(sandbox.executeProjectFile(computer, folder, file, context)).rejects.toMatchObject(
      {
        name: "NativeProjectFileDispatchError",
        reason: "generation_changed",
      },
    );
    const disconnected = await sandbox
      .executeProjectFile(computer, folder, file, context)
      .catch((error: unknown) => error);
    expect(disconnected).toBeInstanceOf(Error);
    expect(disconnected).not.toBeInstanceOf(NativeProjectFileDispatchError);
    expect(disconnected).toHaveProperty("message", "native_driver_disconnected_result_unknown");
    await expect(sandbox.executeProjectFile(computer, folder, file, context)).resolves.toEqual({
      operation: "create",
      bytes: 6,
    });
    expect(previouslySent).toHaveBeenCalledTimes(3);
    expect(previouslySent).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: "project_file", folder, file }),
    );
  } finally {
    await closeServer(server);
    await rm(directory, { recursive: true, force: true });
  }
});

it("uses a separately validated human lease for RPC input and binds revocation to its token", async () => {
  const transport = vi.fn().mockResolvedValue({ completed: 1 });
  const sandbox = new NativeLinuxSandbox(async () => null, transport, {
    userId: "user",
    spaceId: "space",
    port: 16080,
  });
  const validate = vi.fn().mockResolvedValue(Date.now() + 60_000);
  const human = {
    ...context,
    nativeRunLease: undefined,
    nativeControlLease: { leaseId: "human", fence: 4, validate },
  };
  const input = { kind: "pointer", x: 10, y: 20, type: "click" } as const;
  const lease = { leaseId: "human", holder: "user", fence: 4 } as const;
  await sandbox.sendInput(computer, input, lease, human);
  expect(validate).toHaveBeenCalledOnce();
  expect(transport).toHaveBeenCalledWith(
    "control_input",
    {
      control: { leaseId: "human", fence: 4, expiresAt: expect.any(Number) },
      request: { actions: [input], observe: false },
    },
    expect.objectContaining({ nativeRunLease: undefined }),
    computer,
  );
  const ticket = transport.mock.calls[0]![1].control;
  expect(ticket.expiresAt).toBeLessThanOrEqual(Date.now() + 1000);
  transport.mockClear();
  await expect(
    sandbox.sendInput(computer, input, { ...lease, leaseId: "old" }, human),
  ).rejects.toThrow("native_control_lease_invalid");
  validate.mockResolvedValue(null);
  await expect(sandbox.sendInput(computer, input, lease, human)).rejects.toThrow(
    "native_control_lease_invalid",
  );
  expect(transport).not.toHaveBeenCalled();
  await sandbox.setScreenControl(computer, false, context, "human");
  expect(transport).toHaveBeenCalledWith(
    "control_revoke",
    { controlLeaseId: "human" },
    context,
    computer,
  );
});

it("sends native input through the driver's act protocol only with a valid run lease", async () => {
  const transport = vi.fn().mockResolvedValue({ completed: 1 });
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);
  const input = { kind: "pointer", x: 10, y: 20, type: "click" } as const;
  const lease = { leaseId: "lease", holder: "user", fence: 1 } as const;
  await sandbox.sendInput(computer, input, lease, context);
  expect(transport).toHaveBeenCalledWith(
    "act",
    { request: { actions: [input], observe: false } },
    expect.objectContaining({
      nativeRunLease: expect.objectContaining({ expiresAt: expect.any(Number) }),
    }),
    computer,
  );
  transport.mockClear();
  await expect(
    sandbox.sendInput(computer, input, lease, { ...context, nativeRunLease: undefined }),
  ).rejects.toThrow("missing_native_run_lease");
  expect(transport).not.toHaveBeenCalled();
});

it("enforces generation and lease guards before transport calls", async () => {
  const transport = vi.fn().mockResolvedValue({});
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);
  await expect(sandbox.observe(computer, context)).rejects.toThrow("native_driver_missing_image");
  expect(transport).toHaveBeenCalledWith(
    "observe",
    {},
    expect.objectContaining({
      nativeRunLease: expect.objectContaining({ expiresAt: expect.any(Number) }),
    }),
    computer,
  );
  await expect(
    sandbox.observe({ ...computer, providerRef: "native:invalid" }, context),
  ).rejects.toThrow("native_generation_mismatch");
});

it("allows an identity-bound read-only preview without an execution lease", async () => {
  const transport = vi.fn().mockResolvedValue({
    frameId: "frame",
    capturedAt: "2026-11-04T00:00:00Z",
    mimeType: "image/png",
    width: 1,
    height: 1,
    imageBase64: "aGVsbG8=",
  });
  const sandbox = new NativeLinuxSandbox(async () => null, transport);
  await expect(
    sandbox.observe(computer, { ...context, nativeRunLease: undefined }),
  ).resolves.toMatchObject({
    frameId: "frame",
  });
  expect(transport).toHaveBeenCalledWith(
    "observe",
    {},
    { ...context, nativeRunLease: undefined },
    computer,
  );
});

it("restricts the live screen to the configured identity and validates the driver generation", async () => {
  const transport = vi.fn().mockResolvedValue({ generation: "0123456789abcdef" });
  const screen = { userId: "user", spaceId: "space", botId: "bot", port: 16080 };
  const sandbox = new NativeLinuxSandbox(async () => null, transport, screen);
  const viewer = { ...context, nativeRunLease: undefined };
  await expect(sandbox.connectScreen(computer, { view: "stream" }, viewer)).resolves.toMatchObject({
    url: "http://127.0.0.1:16080/vnc.html",
    mimeType: "text/html",
  });
  expect(transport).toHaveBeenCalledWith("status", {}, viewer, computer);
  await expect(
    sandbox.connectScreen(computer, { view: "stream", interactive: true }, viewer),
  ).rejects.toThrow("native_screen_unsupported");
  await expect(
    sandbox.connectScreen(computer, { view: "stream" }, { ...viewer, userId: "other" }),
  ).rejects.toThrow();
  await expect(
    sandbox.connectScreen(computer, { view: "stream" }, { ...viewer, spaceId: "other" }),
  ).rejects.toThrow();
  await expect(
    sandbox.connectScreen(computer, { view: "stream" }, { ...viewer, botId: "other" }),
  ).rejects.toThrow();
  const abortedViewer = { ...viewer, signal: AbortSignal.abort() };
  await expect(sandbox.connectScreen(computer, { view: "stream" }, abortedViewer)).rejects.toThrow(
    "native_driver_aborted_result_unknown",
  );
  await expect(
    sandbox.connectScreen(computer, { view: "stream" }, { ...abortedViewer, userId: "other" }),
  ).rejects.toThrow("native_screen_unsupported");
  transport.mockRejectedValueOnce(new Error("generation changed"));
  await expect(sandbox.connectScreen(computer, { view: "stream" }, viewer)).rejects.toThrow(
    "generation changed",
  );
  await expect(
    new NativeLinuxSandbox(async () => null, transport).connectScreen(
      computer,
      { view: "stream" },
      viewer,
    ),
  ).rejects.toThrow("native_screen_not_configured");
});

it("allows the configured user and space to use a newly provisioned bot", async () => {
  const transport = vi.fn().mockResolvedValue({ generation: "0123456789abcdef" });
  const sandbox = new NativeLinuxSandbox(async () => null, transport, {
    userId: "user",
    spaceId: "space",
    port: 16080,
  });
  const newBotComputer = { ...computer, botId: "new-bot" };

  await expect(
    sandbox.connectScreen(newBotComputer, { view: "stream" }, { ...context, botId: "new-bot" }),
  ).resolves.toMatchObject({ url: "http://127.0.0.1:16080/vnc.html" });
  await expect(
    sandbox.connectScreen(
      newBotComputer,
      { view: "stream" },
      { ...context, botId: "new-bot", userId: "other" },
    ),
  ).rejects.toThrow("native_screen_unsupported");
});

it("allows an explicitly authorized member to view and control their own native computer", async () => {
  const transport = vi.fn().mockResolvedValue({ completed: 1 });
  const authorizeAdditionalViewer = vi.fn().mockResolvedValue(true);
  const sandbox = new NativeLinuxSandbox(async () => null, transport, {
    userId: "owner",
    spaceId: "owner-space",
    port: 16080,
    authorizeAdditionalViewer,
  });
  const member = {
    ...context,
    nativeRunLease: undefined,
    nativeControlLease: {
      leaseId: "member-control",
      fence: 4,
      validate: vi.fn().mockResolvedValue(Date.now() + 60_000),
    },
  };
  await expect(sandbox.connectScreen(computer, { view: "stream" }, member)).resolves.toMatchObject({
    url: "http://127.0.0.1:16080/vnc.html",
  });
  await sandbox.sendInput(
    computer,
    { kind: "key", key: "Enter" },
    { holder: "user", leaseId: "member-control", fence: 4 },
    member,
  );
  expect(authorizeAdditionalViewer).toHaveBeenCalledTimes(2);
  expect(authorizeAdditionalViewer).toHaveBeenCalledWith(member);
  expect(transport).toHaveBeenLastCalledWith(
    "control_input",
    expect.objectContaining({ control: expect.objectContaining({ leaseId: "member-control" }) }),
    expect.anything(),
    computer,
  );

  transport.mockClear();
  authorizeAdditionalViewer.mockResolvedValue(false);
  await expect(sandbox.connectScreen(computer, { view: "stream" }, member)).rejects.toThrow(
    "native_screen_unsupported",
  );
  await expect(
    sandbox.sendInput(
      computer,
      { kind: "key", key: "Enter" },
      { holder: "user", leaseId: "member-control", fence: 4 },
      member,
    ),
  ).rejects.toThrow("native_control_unsupported");
  expect(transport).not.toHaveBeenCalled();
});

it("keeps Bot, generation and human lease restrictions for explicitly authorized members", async () => {
  const transport = vi.fn();
  const authorizeAdditionalViewer = vi.fn().mockResolvedValue(true);
  const screen = {
    userId: "owner",
    spaceId: "owner-space",
    botId: "pinned-bot",
    port: 16080,
    authorizeAdditionalViewer,
  };
  const sandbox = new NativeLinuxSandbox(async () => null, transport, screen);
  await expect(sandbox.connectScreen(computer, { view: "stream" }, context)).rejects.toThrow(
    "native_screen_unsupported",
  );
  const unpinned = new NativeLinuxSandbox(async () => null, transport, {
    ...screen,
    botId: undefined,
  });
  await expect(
    unpinned.connectScreen({ ...computer, botId: "another-bot" }, { view: "stream" }, context),
  ).rejects.toThrow("native_generation_mismatch");
  await expect(
    unpinned.connectScreen({ ...computer, providerRef: "native:old" }, { view: "stream" }, context),
  ).rejects.toThrow("native_generation_mismatch");
  const member = {
    ...context,
    nativeRunLease: undefined,
    nativeControlLease: { leaseId: "expired", fence: 3, validate: async () => null },
  };
  await expect(
    unpinned.sendInput(
      computer,
      { kind: "key", key: "Enter" },
      { holder: "user", leaseId: "expired", fence: 3 },
      member,
    ),
  ).rejects.toThrow("native_control_lease_invalid");
  expect(transport).not.toHaveBeenCalled();
});

it("reports an unconfigured native screen distinctly", async () => {
  const sandbox = new NativeLinuxSandbox(async () => null, vi.fn());

  await expect(sandbox.connectScreen(computer, { view: "stream" }, context)).rejects.toThrow(
    "native_screen_not_configured",
  );
});

it("rejects a computer owned by another bot", async () => {
  const transport = vi.fn();
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);
  await expect(sandbox.observe({ ...computer, botId: "other-bot" }, context)).rejects.toThrow(
    "native_generation_mismatch",
  );
  expect(transport).not.toHaveBeenCalled();
});

it("allows a team home only for its space and user", async () => {
  const teamHome = computerHomeKey({
    mode: "team",
    spaceId: context.spaceId,
    userId: context.userId,
  });
  const teamComputer = { ...computer, botId: teamHome };
  const transport = vi.fn().mockResolvedValue("aGVsbG8=");
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);

  await expect(sandbox.readFile(teamComputer, "notes.txt", context)).resolves.toBeInstanceOf(
    Uint8Array,
  );
  await expect(
    sandbox.readFile(teamComputer, "notes.txt", { ...context, userId: "other" }),
  ).rejects.toThrow("native_generation_mismatch");
  await expect(
    sandbox.readFile(teamComputer, "notes.txt", { ...context, spaceId: "other" }),
  ).rejects.toThrow("native_generation_mismatch");
  await expect(
    sandbox.readFile(teamComputer, "notes.txt", { ...context, botId: undefined }),
  ).rejects.toThrow("native_generation_mismatch");
  expect(transport).toHaveBeenCalledOnce();
});

it("declares PTY unavailable and exposes conservative run cleanup results", async () => {
  const transport = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce("unknown");
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);

  expect(sandbox.describe().capabilities.pty).toBe(false);
  expect(sandbox.describe().capabilities.graphical).toBe(true);
  expect(sandbox.describe().capabilities.takeover).toBe(false);
  await sandbox.cancelRunWork(computer, "computer", "run", context);
  await expect(sandbox.inspectBackgroundWork(computer, "computer", context)).resolves.toBe(
    "unknown",
  );
  expect(transport).toHaveBeenNthCalledWith(1, "cancel", { targetRunId: "run" }, context, computer);
  expect(transport).toHaveBeenNthCalledWith(2, "inspect", {}, context, computer);
});

it("refuses unsupported native stop and destroy operations", async () => {
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, vi.fn());

  await expect(sandbox.stop(computer, context)).rejects.toThrow("native_stop_unsupported");
  await expect(sandbox.destroy(computer, context)).rejects.toThrow("native_destroy_unsupported");
});

it.skipIf(process.platform === "win32")(
  "keeps driver identity and lease fields out of caller-controlled params",
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "sydney-native-test-"));
    const socketPath = path.join(directory, "driver.sock");
    const server = net.createServer();
    let socket: net.Socket | undefined;
    try {
      server.listen(socketPath);
      await once(server, "listening");
      const transport = createNativeLinuxTransport(socketPath);
      const response = transport(
        "write",
        {
          path: "file.txt",
          botId: "attacker",
          generation: "attacker",
          requestId: "attacker",
          run: { id: "attacker", fence: 0 },
        },
        context,
        computer,
      );
      [socket] = (await once(server, "connection")) as [net.Socket];
      const [data] = (await once(socket, "data")) as [Buffer];
      const parsed = JSON.parse(data.toString("utf8")) as Record<string, unknown>;
      expect(parsed).toMatchObject({
        method: "write",
        botId: "bot",
        generation: "0123456789abcdef",
        run: { id: "run", fence: 2 },
        path: "file.txt",
      });
      expect(parsed.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(parsed.requestId).not.toBe("attacker");
      socket.end('{"ok":true,"value":null}\n');
      await expect(response).resolves.toBeNull();
    } finally {
      socket?.destroy();
      await closeServer(server);
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it("returns explicit quiescence evidence for native background work", async () => {
  const transport = vi.fn().mockResolvedValueOnce("idle").mockResolvedValueOnce("unknown");
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);

  await expect(
    sandbox.inspectBackgroundWorkEvidence(computer, "computer", context),
  ).resolves.toMatchObject({
    status: "idle",
    kind: "process_group_empty",
    markerId: "computer",
  });
  await expect(
    sandbox.inspectBackgroundWorkEvidence(computer, "computer", context),
  ).resolves.toMatchObject({
    status: "unknown",
    kind: "unavailable",
    markerId: "computer",
  });
});

it.skipIf(process.platform === "win32")(
  "closes an in-flight native request when its signal is aborted",
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "sydney-native-test-"));
    const socketPath = path.join(directory, "driver.sock");
    const server = net.createServer();
    let socket: net.Socket | undefined;
    try {
      server.listen(socketPath);
      await once(server, "listening");
      const controller = new AbortController();
      const transport = createNativeLinuxTransport(socketPath);
      const pending = transport("execute", {}, { ...context, signal: controller.signal }, computer);
      [socket] = (await once(server, "connection")) as [net.Socket];
      socket.resume();
      const disconnected = once(socket, "close");
      controller.abort();
      await expect(pending).rejects.toThrow("native_driver_aborted_result_unknown");
      await disconnected;
    } finally {
      socket?.destroy();
      await closeServer(server);
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it("decodes driver images and file payloads", async () => {
  const transport = vi
    .fn()
    .mockResolvedValueOnce({
      frameId: "frame",
      capturedAt: "2026-01-01T00:00:00Z",
      mimeType: "image/png",
      width: 1,
      height: 1,
      imageBase64: "aGVsbG8=",
    })
    .mockResolvedValueOnce("aGVsbG8=");
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);
  const observation = await sandbox.observe(computer, context);
  expect(new TextDecoder().decode(observation.image)).toBe("hello");
  expect(new TextDecoder().decode(await sandbox.readFile(computer, "notes.txt", context))).toBe(
    "hello",
  );
});

it("converts command output into runtime process events", async () => {
  const transport = vi.fn().mockResolvedValue({ stdout: "out", stderr: "err", code: 0 });
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);
  const events = [];
  for await (const event of sandbox.execute(computer, { argv: ["true"] }, context))
    events.push(event);
  expect(events).toEqual([
    { type: "stdout", data: "out" },
    { type: "stderr", data: "err" },
    { type: "exit", code: 0 },
  ]);
  expect(transport).toHaveBeenCalledWith(
    "execute",
    { command: { argv: ["true"], timeoutMs: 8000 } },
    expect.anything(),
    computer,
  );
});

it("requires a valid lease before a native command", async () => {
  const sandbox = new NativeLinuxSandbox(async () => null, vi.fn());
  const consume = async () => {
    for await (const _event of sandbox.execute(computer, { argv: ["true"] }, context)) {
      void _event;
    }
  };
  await expect(consume()).rejects.toThrow("native_run_lease_invalid");
});

it("revalidates each operation and refuses a lost lease", async () => {
  const validate = vi
    .fn()
    .mockResolvedValueOnce(Date.now() + 5000)
    .mockResolvedValueOnce(null);
  const transport = vi.fn().mockResolvedValue("aGVsbG8=");
  const sandbox = new NativeLinuxSandbox(validate, transport);

  await sandbox.readFile(computer, "notes.txt", context);
  await expect(sandbox.readFile(computer, "notes.txt", context)).rejects.toThrow(
    "native_run_lease_invalid",
  );
  expect(validate).toHaveBeenCalledTimes(2);
  expect(transport).toHaveBeenCalledTimes(1);
});

it("attaches unique UUID requestIds to run-leased requests and strips forged reserved fields", () => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const leasedContext: AdapterContext = {
    ...context,
    nativeRunLease: { ...context.nativeRunLease!, expiresAt: Date.now() + 5000 },
  };
  const first = buildNativeDriverRequest(
    "write",
    {
      path: "notes.txt",
      requestId: "forged-id",
      botId: "attacker",
      generation: "attacker",
      run: { id: "attacker", fence: 0 },
    },
    leasedContext,
    computer,
  );
  const second = buildNativeDriverRequest("write", { path: "notes.txt" }, leasedContext, computer);
  expect(first.requestId).toMatch(uuidPattern);
  expect(second.requestId).toMatch(uuidPattern);
  expect(first.requestId).not.toBe("forged-id");
  expect(first.requestId).not.toBe(second.requestId);
  expect(first).toMatchObject({
    method: "write",
    botId: "bot",
    generation: "0123456789abcdef",
    run: { id: "run", fence: 2 },
    path: "notes.txt",
  });

  const preview = buildNativeDriverRequest(
    "observe",
    { requestId: "forged-id", run: { id: "attacker", fence: 1 } },
    { ...context, nativeRunLease: undefined },
    computer,
  );
  expect(preview.requestId).toBeUndefined();
  expect(preview.run).toBeUndefined();
});

it("rejects unsafe command cwd values before invoking transport and allows relative subdirs", async () => {
  const transport = vi.fn().mockResolvedValue({ stdout: "", stderr: "", code: 0 });
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);
  const consume = async (cwd: string) => {
    for await (const _event of sandbox.execute(computer, { argv: ["true"], cwd }, context)) {
      void _event;
    }
  };

  for (const badCwd of [
    "notes\0bad",
    "../other-bot",
    "sub/../../other-bot",
    "a/../b",
    "/etc",
    "sub\\dir",
  ]) {
    await expect(consume(badCwd)).rejects.toThrow("native_invalid_cwd");
  }
  expect(transport).not.toHaveBeenCalled();

  await expect(consume(".")).resolves.toBeUndefined();
  await expect(consume("notes/sub")).resolves.toBeUndefined();
  expect(transport).toHaveBeenCalledTimes(2);
});
