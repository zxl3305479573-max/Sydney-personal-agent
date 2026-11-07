import type { AdapterContext, ComputerRef } from "@rakazo/adapter-kit";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import * as net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { computerHomeKey } from "@rakazo/db";
import { expect, it, vi } from "vitest";
import { createNativeLinuxTransport, NativeLinuxSandbox } from "./native-linux-sandbox.js";

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

it("enforces generation and lease guards before transport calls", async () => {
  const transport = vi.fn().mockResolvedValue({});
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);
  await expect(sandbox.observe(computer, context)).rejects.toThrow("native_driver_missing_image");
  expect(transport).toHaveBeenCalledWith(
    "observe", {}, expect.objectContaining({ nativeRunLease: expect.objectContaining({ expiresAt: expect.any(Number) }) }), computer,
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
  await expect(sandbox.observe(computer, { ...context, nativeRunLease: undefined })).resolves.toMatchObject({
    frameId: "frame",
  });
  expect(transport).toHaveBeenCalledWith("observe", {}, { ...context, nativeRunLease: undefined }, computer);
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
  await expect(sandbox.connectScreen(computer, { view: "stream", interactive: true }, viewer)).rejects.toThrow("native_screen_unsupported");
  await expect(sandbox.connectScreen(computer, { view: "stream" }, { ...viewer, userId: "other" })).rejects.toThrow();
  await expect(sandbox.connectScreen(computer, { view: "stream" }, { ...viewer, spaceId: "other" })).rejects.toThrow();
  await expect(sandbox.connectScreen(computer, { view: "stream" }, { ...viewer, botId: "other" })).rejects.toThrow();
  transport.mockRejectedValueOnce(new Error("generation changed"));
  await expect(sandbox.connectScreen(computer, { view: "stream" }, viewer)).rejects.toThrow("generation changed");
  await expect(
    new NativeLinuxSandbox(async () => null, transport).connectScreen(computer, { view: "stream" }, viewer),
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
    sandbox.connectScreen(newBotComputer, { view: "stream" }, { ...context, botId: "new-bot", userId: "other" }),
  ).rejects.toThrow("native_screen_unsupported");
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
  const teamHome = computerHomeKey({ mode: "team", spaceId: context.spaceId, userId: context.userId });
  const teamComputer = { ...computer, botId: teamHome };
  const transport = vi.fn().mockResolvedValue("aGVsbG8=");
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);

  await expect(sandbox.readFile(teamComputer, "notes.txt", context)).resolves.toBeInstanceOf(Uint8Array);
  await expect(sandbox.readFile(teamComputer, "notes.txt", { ...context, userId: "other" })).rejects.toThrow(
    "native_generation_mismatch",
  );
  await expect(sandbox.readFile(teamComputer, "notes.txt", { ...context, spaceId: "other" })).rejects.toThrow(
    "native_generation_mismatch",
  );
  await expect(sandbox.readFile(teamComputer, "notes.txt", { ...context, botId: undefined })).rejects.toThrow(
    "native_generation_mismatch",
  );
  expect(transport).toHaveBeenCalledOnce();
});

it("declares PTY unavailable and exposes conservative run cleanup results", async () => {
  const transport = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce("unknown");
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);

  expect(sandbox.describe().capabilities.pty).toBe(false);
  expect(sandbox.describe().capabilities.graphical).toBe(true);
  expect(sandbox.describe().capabilities.takeover).toBe(false);
  await sandbox.cancelRunWork(computer, "computer", "run", context);
  await expect(sandbox.inspectBackgroundWork(computer, "computer", context)).resolves.toBe("unknown");
  expect(transport).toHaveBeenNthCalledWith(1, "cancel", { targetRunId: "run" }, context, computer);
  expect(transport).toHaveBeenNthCalledWith(2, "inspect", {}, context, computer);
});

it("refuses unsupported native stop and destroy operations", async () => {
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, vi.fn());

  await expect(sandbox.stop(computer, context)).rejects.toThrow("native_stop_unsupported");
  await expect(sandbox.destroy(computer, context)).rejects.toThrow("native_destroy_unsupported");
});

it("keeps driver identity and lease fields out of caller-controlled params", async () => {
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
      { path: "file.txt", botId: "attacker", generation: "attacker", run: { id: "attacker", fence: 0 } },
      context,
      computer,
    );
    [socket] = await once(server, "connection") as [net.Socket];
    const [data] = await once(socket, "data") as [Buffer];
    expect(JSON.parse(data.toString("utf8"))).toMatchObject({
      method: "write",
      botId: "bot",
      generation: "0123456789abcdef",
      run: { id: "run", fence: 2 },
      path: "file.txt",
    });
    socket.end('{"ok":true,"value":null}\n');
    await expect(response).resolves.toBeNull();
  } finally {
    socket?.destroy();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

it("returns explicit quiescence evidence for native background work", async () => {
  const transport = vi.fn().mockResolvedValueOnce("idle").mockResolvedValueOnce("unknown");
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);

  await expect(sandbox.inspectBackgroundWorkEvidence(computer, "computer", context)).resolves.toMatchObject({
    status: "idle",
    kind: "process_group_empty",
    markerId: "computer",
  });
  await expect(sandbox.inspectBackgroundWorkEvidence(computer, "computer", context)).resolves.toMatchObject({
    status: "unknown",
    kind: "unavailable",
    markerId: "computer",
  });
});

it("closes an in-flight native request when its signal is aborted", async () => {
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
    [socket] = await once(server, "connection") as [net.Socket];
    socket.resume();
    const disconnected = once(socket, "close");
    controller.abort();
    await expect(pending).rejects.toThrow("native_driver_aborted_result_unknown");
    await disconnected;
  } finally {
    socket?.destroy();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

it("decodes driver images and file payloads", async () => {
  const transport = vi.fn()
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
  expect(new TextDecoder().decode(await sandbox.readFile(computer, "notes.txt", context))).toBe("hello");
});

it("converts command output into runtime process events", async () => {
  const transport = vi.fn().mockResolvedValue({ stdout: "out", stderr: "err", code: 0 });
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);
  const events = [];
  for await (const event of sandbox.execute(computer, { argv: ["true"] }, context)) events.push(event);
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
  const validate = vi.fn().mockResolvedValueOnce(Date.now() + 5000).mockResolvedValueOnce(null);
  const transport = vi.fn().mockResolvedValue("aGVsbG8=");
  const sandbox = new NativeLinuxSandbox(validate, transport);

  await sandbox.readFile(computer, "notes.txt", context);
  await expect(sandbox.readFile(computer, "notes.txt", context)).rejects.toThrow(
    "native_run_lease_invalid",
  );
  expect(validate).toHaveBeenCalledTimes(2);
  expect(transport).toHaveBeenCalledTimes(1);
});
