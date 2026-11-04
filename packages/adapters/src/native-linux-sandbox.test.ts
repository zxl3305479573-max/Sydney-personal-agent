import type { AdapterContext, ComputerRef } from "@rakazo/adapter-kit";
import { EventEmitter } from "node:events";
import * as net from "node:net";
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

it("rejects a computer owned by another bot", async () => {
  const transport = vi.fn();
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);
  await expect(sandbox.observe({ ...computer, botId: "other-bot" }, context)).rejects.toThrow(
    "native_generation_mismatch",
  );
  expect(transport).not.toHaveBeenCalled();
});

it("declares PTY unavailable and exposes conservative run cleanup results", async () => {
  const transport = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce("unknown");
  const sandbox = new NativeLinuxSandbox(async () => Date.now() + 5000, transport);

  expect(sandbox.describe().capabilities.pty).toBe(false);
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
  const socket = new EventEmitter() as EventEmitter & {
    write: (data: string) => void;
    end: () => void;
    destroy: () => void;
  };
  let request: Record<string, unknown> | undefined;
  socket.write = (data) => {
    request = JSON.parse(data) as Record<string, unknown>;
    queueMicrotask(() => socket.emit("data", Buffer.from('{"ok":true,"value":null}\n')));
  };
  socket.end = () => undefined;
  socket.destroy = () => undefined;
  vi.spyOn(net, "createConnection").mockReturnValue(socket as never);
  const transport = createNativeLinuxTransport("/tmp/driver.sock");
  const response = transport(
    "write",
    { path: "file.txt", botId: "attacker", generation: "attacker", run: { id: "attacker", fence: 0 } },
    context,
    computer,
  );
  socket.emit("connect");
  await response;
  expect(request).toMatchObject({
    method: "write",
    botId: "bot",
    generation: "0123456789abcdef",
    run: { id: "run", fence: 2 },
    path: "file.txt",
  });
});

it("closes an in-flight native request when its signal is aborted", async () => {
  const socket = new EventEmitter() as EventEmitter & {
    write: (data: string) => void;
    end: () => void;
    destroy: ReturnType<typeof vi.fn>;
  };
  socket.write = () => undefined;
  socket.end = () => undefined;
  socket.destroy = vi.fn();
  vi.spyOn(net, "createConnection").mockReturnValue(socket as never);
  const controller = new AbortController();
  const transport = createNativeLinuxTransport("/tmp/driver.sock");
  const pending = transport("execute", {}, { ...context, signal: controller.signal }, computer);
  controller.abort();
  await expect(pending).rejects.toThrow("native_driver_aborted_result_unknown");
  expect(socket.destroy).toHaveBeenCalledOnce();
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
