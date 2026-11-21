import { once } from "node:events";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { USER_DEVICE_CONNECT_PATH } from "@rakazo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import type { UserDeviceClient, UserDeviceClientOptions } from "./user-device-client.js";
import { startUserDeviceClient, USER_DEVICE_MAX_MESSAGE_BYTES } from "./user-device-client.js";
import { captureWindowsProjectRoot, executeWindowsProjectFile } from "./windows-project-files.js";

const token = "device-token";
const nodeEnv: Record<string, string> = process.versions.electron
  ? { ELECTRON_RUN_AS_NODE: "1" }
  : {};

interface Frame {
  type: string;
  id: string;
  frame: Record<string, unknown>;
}

describe("user device client", () => {
  let root: string;
  let http: ReturnType<typeof createServer>;
  let wss: WebSocketServer;
  let serverUrl: string;
  let upgrades: IncomingMessage[];
  let reject401: boolean;
  let refusedBecause: string | undefined;
  let client: UserDeviceClient | undefined;
  let revoked: ReturnType<typeof vi.fn<(reason?: string) => void>>;
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), "rakazo-device-test-")));
    upgrades = [];
    reject401 = false;
    refusedBecause = undefined;
    revoked = vi.fn<(reason?: string) => void>();
    http = createServer();
    wss = new WebSocketServer({ noServer: true });
    http.on("upgrade", (request, socket, head) => {
      upgrades.push(request);
      if (
        reject401 ||
        request.url !== USER_DEVICE_CONNECT_PATH ||
        request.headers.authorization !== `Bearer ${token}`
      ) {
        const why = refusedBecause ? `x-rakazo-device-revoked: ${refusedBecause}\r\n` : "";
        socket.end(`HTTP/1.1 401 Unauthorized\r\n${why}Content-Length: 0\r\n\r\n`);
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        sockets.push(ws);
        wss.emit("connection", ws);
      });
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    serverUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    client?.close();
    client = undefined;
    for (const ws of wss.clients) ws.terminate();
    sockets.length = 0;
    wss.close();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
  });

  function start(
    authorize: () => Promise<boolean> = async () => true,
    workspaceGrant?: UserDeviceClientOptions["workspaceGrant"],
    projectFile?: UserDeviceClientOptions["projectFile"],
    projectWindowsTerminal?: UserDeviceClientOptions["projectWindowsTerminal"],
  ) {
    client = startUserDeviceClient({
      serverUrl,
      token,
      root,
      onRevoked: revoked,
      authorize,
      workspaceGrant,
      projectFile,
      projectWindowsTerminal,
      retryMs: { min: 20, max: 40 },
    });
  }
  async function connection(index = 0) {
    while (sockets.length <= index) await once(wss, "connection");
    return sockets[index]!;
  }
  function frames(ws: WebSocket) {
    const received: Frame[] = [];
    ws.on("message", (data) => received.push(JSON.parse(data.toString())));
    return received;
  }
  async function until(check: () => boolean) {
    await vi.waitFor(() => expect(check()).toBe(true), { timeout: 10_000, interval: 10 });
  }

  it("returns a terminal diagnostic through the fixed project channel without taking general consent", async () => {
    const authorize = vi.fn(async () => false);
    const terminal = vi.fn<NonNullable<UserDeviceClientOptions["projectWindowsTerminal"]>>(
      async () => ({ status: "completed", stdout: "10.0.26100" }),
    );
    start(authorize, undefined, undefined, terminal);
    const ws = await connection();
    const received = frames(ws);
    const request = {
      method: "projectWindowsTerminal", projectId: "project-a", projectName: "Project A",
      spaceId: "space-a", runId: "run-a", command: "ver",
    };
    ws.send(JSON.stringify({ type: "request", id: "terminal", request }));
    await until(() => received.some((frame) => frame.id === "terminal" && "done" in frame.frame));
    expect(terminal).toHaveBeenCalledExactlyOnceWith(request, expect.any(AbortSignal));
    expect(received.find((frame) => frame.id === "terminal")?.frame).toEqual({
      value: { status: "completed", stdout: "10.0.26100" },
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform !== "win32")("moves bounded text through the device socket using real Windows handles", async () => {
    const projectRoot = await captureWindowsProjectRoot(root);
    const authorize = vi.fn(async () => false);
    await writeFile(path.join(root, "input.txt"), "样本");
    start(authorize, undefined, (request, signal) => executeWindowsProjectFile(projectRoot, request.file, signal));
    const ws = await connection();
    const received = frames(ws);
    const request = {
      method: "projectFile", spaceId: "space-a", projectId: "project-a",
      grantId: "746acaf1-0a4f-477d-822d-7357e7e8fe72",
    };
    ws.send(JSON.stringify({ type: "request", id: "read", request: {
      ...request, file: { operation: "read", path: "input.txt" },
    } }));
    await until(() => received.some((frame) => frame.id === "read" && "done" in frame.frame));
    expect(received.find((frame) => frame.id === "read")?.frame).toEqual({
      value: {
        operation: "read", text: "样本",
        sha256: createHash("sha256").update("样本", "utf8").digest("hex"),
      },
    });
    const sampleHash = createHash("sha256").update("样本", "utf8").digest("hex");
    ws.send(JSON.stringify({ type: "request", id: "update", request: {
      ...request,
      file: { operation: "update", path: "input.txt", expectedSha256: sampleHash, text: "已修改" },
    } }));
    await until(() => received.some((frame) => frame.id === "update" && "done" in frame.frame));
    const updatedHash = createHash("sha256").update("已修改", "utf8").digest("hex");
    expect(received.find((frame) => frame.id === "update")?.frame).toEqual({
      value: { operation: "update", bytes: Buffer.byteLength("已修改", "utf8"), sha256: updatedHash },
    });
    ws.send(JSON.stringify({ type: "request", id: "conflict", request: {
      ...request,
      file: { operation: "update", path: "input.txt", expectedSha256: sampleHash, text: "不应覆盖" },
    } }));
    await until(() => received.some((frame) => frame.id === "conflict" && "done" in frame.frame));
    expect(received.find((frame) => frame.id === "conflict")?.frame).toEqual({
      value: { operation: "conflict", sha256: updatedHash },
    });
    expect(await readFile(path.join(root, "input.txt"), "utf8")).toBe("已修改");
    ws.send(JSON.stringify({ type: "request", id: "create", request: {
      ...request, file: { operation: "create", path: "result.md", text: "结果" },
    } }));
    await until(() => received.some((frame) => frame.id === "create" && "done" in frame.frame));
    expect(received.find((frame) => frame.id === "create")?.frame).toEqual({
      value: { operation: "create", bytes: 6 },
    });
    expect(await readFile(path.join(root, "result.md"), "utf8")).toBe("结果");
    expect(authorize).not.toHaveBeenCalled();
  });

  it.each(["cancel", "disconnect"] as const)(
    "aborts a project file transfer on %s without sending the result or requesting shell consent",
    async (mode) => {
      const authorize = vi.fn(async () => false);
      let operationSignal: AbortSignal | undefined;
      let finish!: () => void;
      const file = vi.fn<NonNullable<UserDeviceClientOptions["projectFile"]>>(async (_request, signal) => {
        operationSignal = signal;
        await new Promise<void>((resolve) => { finish = resolve; });
        return { operation: "read", text: "private sample", sha256: "a".repeat(64) };
      });
      start(authorize, undefined, file);
      const ws = await connection();
      const received = frames(ws);
      const request = {
        method: "projectFile", spaceId: "space-a", projectId: "project-a",
        grantId: "746acaf1-0a4f-477d-822d-7357e7e8fe72",
        file: { operation: "read", path: "notes/input.md" },
      };
      ws.send(JSON.stringify({ type: "request", id: "file", request }));
      await until(() => Boolean(operationSignal));
      if (mode === "cancel") ws.send(JSON.stringify({ type: "cancel", id: "file" }));
      else ws.terminate();
      await until(() => operationSignal?.aborted === true);
      finish();
      if (mode === "cancel") {
        ws.send(JSON.stringify({ type: "request", id: "barrier", request: { ...request, method: "workspaceGrant", file: undefined, operation: "status" } }));
        await until(() => received.some((frame) => frame.id === "barrier" && "done" in frame.frame));
      } else {
        await connection(1);
      }
      expect(received.some((frame) => frame.id === "file")).toBe(false);
      expect(authorize).not.toHaveBeenCalled();
      expect(file).toHaveBeenCalledExactlyOnceWith(request, expect.any(AbortSignal));
    },
  );

  it("checks a project grant without asking for whole-computer access", async () => {
    const authorize = vi.fn(async () => false);
    const workspaceGrant = vi.fn(async () => ({ state: "authorized" as const }));
    start(authorize, workspaceGrant);
    const ws = await connection();
    const received = frames(ws);
    const request = { method: "workspaceGrant", operation: "status", spaceId: "space-a", projectId: "project-a", grantId: "746acaf1-0a4f-477d-822d-7357e7e8fe72" };
    ws.send(JSON.stringify({ type: "request", id: "grant-status", request }));
    await until(() => received.some((frame) => "done" in frame.frame));
    expect(workspaceGrant).toHaveBeenCalledWith(request);
    expect(authorize).not.toHaveBeenCalled();
    expect(received[0]?.frame).toEqual({ value: { state: "authorized" } });
  });

  it("reports unsupported grants without invoking whole-computer consent", async () => {
    const authorize = vi.fn(async () => false);
    start(authorize);
    const ws = await connection();
    const received = frames(ws);
    ws.send(JSON.stringify({ type: "request", id: "grant-status", request: { method: "workspaceGrant", operation: "status", spaceId: "space-a", projectId: "project-a", grantId: "746acaf1-0a4f-477d-822d-7357e7e8fe72" } }));
    await until(() => received.some((frame) => "done" in frame.frame));
    expect(received[0]?.frame).toEqual({ value: { state: "unavailable" } });
    expect(authorize).not.toHaveBeenCalled();
  });

  it("drops a grant result after the server cancels the request", async () => {
    let finish!: (result: { state: "authorized" }) => void;
    const workspaceGrant = vi.fn(() => new Promise<{ state: "authorized" }>((resolve) => { finish = resolve; }));
    start(async () => false, workspaceGrant);
    const ws = await connection();
    const received = frames(ws);
    ws.send(JSON.stringify({ type: "request", id: "grant-status", request: { method: "workspaceGrant", operation: "status", spaceId: "space-a", projectId: "project-a", grantId: "746acaf1-0a4f-477d-822d-7357e7e8fe72" } }));
    await until(() => workspaceGrant.mock.calls.length === 1);
    ws.send(JSON.stringify({ type: "cancel", id: "grant-status" }));
    const pinged = once(ws, "pong");
    ws.ping();
    await pinged;
    finish({ state: "authorized" });
    const drained = once(ws, "pong");
    ws.ping();
    await drained;
    expect(received).toEqual([]);
  });

  it("authenticates outbound and streams request frames back by id", async () => {
    start();
    const ws = await connection();
    expect(upgrades[0]!.headers.origin).toBeUndefined();
    const received = frames(ws);
    ws.send(
      JSON.stringify({ type: "request", id: "a", request: { method: "provision", botId: "bot" } }),
    );
    await until(() => received.some((frame) => frame.id === "a" && "done" in frame.frame));
    ws.send(
      JSON.stringify({
        type: "request",
        id: "b",
        request: {
          method: "execute",
          botId: "bot",
          command: { env: nodeEnv, argv: [process.execPath, "-e", "process.stdout.write('hi')"] },
        },
      }),
    );
    await until(() => received.some((frame) => frame.id === "b" && "done" in frame.frame));
    const values = received
      .filter((frame) => frame.id === "b" && "value" in frame.frame)
      .map((frame) => frame.frame.value);
    expect(values).toContainEqual({ type: "stdout", data: "hi" });
    expect(values.at(-1)).toMatchObject({ type: "exit", code: 0 });
  });

  it("stops a cancelled command without answering for it, and keeps serving", async () => {
    start();
    const ws = await connection();
    const received = frames(ws);
    ws.send(
      JSON.stringify({ type: "request", id: "p", request: { method: "provision", botId: "bot" } }),
    );
    await until(() => received.some((frame) => frame.id === "p" && "done" in frame.frame));
    ws.send(
      JSON.stringify({
        type: "request",
        id: "long",
        request: {
          method: "execute",
          botId: "bot",
          command: {
            env: nodeEnv,
            argv: [process.execPath, "-e", "console.log('started'); setInterval(() => {}, 1000)"],
          },
        },
      }),
    );
    await until(() =>
      received.some(
        (frame) =>
          frame.id === "long" && (frame.frame.value as { type?: string })?.type === "stdout",
      ),
    );
    ws.send(JSON.stringify({ type: "cancel", id: "long" }));
    ws.send(
      JSON.stringify({
        type: "request",
        id: "env",
        request: { method: "environment", botId: "x" },
      }),
    );
    await until(() => received.some((frame) => frame.id === "env" && "done" in frame.frame));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(
      received.some(
        (frame) => frame.id === "long" && ("done" in frame.frame || "error" in frame.frame),
      ),
    ).toBe(false);
  });

  it("asks before every request and refuses what this computer does not allow", async () => {
    let answer: (allowed: boolean) => void = () => undefined;
    const authorize = vi.fn(() => new Promise<boolean>((resolve) => (answer = resolve)));
    start(authorize);
    const ws = await connection();
    const received = frames(ws);
    ws.send(
      JSON.stringify({ type: "request", id: "a", request: { method: "provision", botId: "bot" } }),
    );
    await until(() => authorize.mock.calls.length === 1);
    expect(received).toEqual([]);
    answer(false);
    await until(() => received.length === 1);
    expect(received[0]).toEqual({
      type: "frame",
      id: "a",
      frame: { error: "Not allowed on this computer" },
    });

    ws.send(
      JSON.stringify({ type: "request", id: "b", request: { method: "provision", botId: "bot" } }),
    );
    await until(() => authorize.mock.calls.length === 2);
    ws.send(JSON.stringify({ type: "cancel", id: "b" }));
    answer(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received.filter((frame) => frame.id === "b")).toEqual([]);
  });

  it("stops running commands and refuses waiting requests on cancelAll, and keeps serving", async () => {
    let answer: (allowed: boolean) => void = () => undefined;
    let ask = false;
    start(() =>
      ask ? new Promise<boolean>((resolve) => (answer = resolve)) : Promise.resolve(true),
    );
    const ws = await connection();
    const received = frames(ws);
    ws.send(
      JSON.stringify({ type: "request", id: "p", request: { method: "provision", botId: "bot" } }),
    );
    await until(() => received.some((frame) => frame.id === "p" && "done" in frame.frame));
    ws.send(
      JSON.stringify({
        type: "request",
        id: "long",
        request: {
          method: "execute",
          botId: "bot",
          command: {
            env: nodeEnv,
            argv: [process.execPath, "-e", "console.log('started'); setInterval(() => {}, 1000)"],
          },
        },
      }),
    );
    await until(() =>
      received.some(
        (frame) =>
          frame.id === "long" && (frame.frame.value as { type?: string })?.type === "stdout",
      ),
    );
    ask = true;
    ws.send(
      JSON.stringify({
        type: "request",
        id: "wait",
        request: { method: "provision", botId: "bot" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    client!.cancelAll();
    await until(() => received.some((frame) => frame.id === "long" && "error" in frame.frame));
    await until(() => received.some((frame) => frame.id === "wait"));
    expect(received.find((frame) => frame.id === "wait")?.frame).toEqual({
      error: "Not allowed on this computer",
    });
    answer(true);
    ask = false;
    ws.send(
      JSON.stringify({
        type: "request",
        id: "env",
        request: { method: "environment", botId: "x" },
      }),
    );
    await until(() => received.some((frame) => frame.id === "env" && "done" in frame.frame));
    expect(received.filter((frame) => frame.id === "wait")).toHaveLength(1);
  });

  it("ignores malformed messages and refuses oversized ones by reconnecting", async () => {
    start();
    const ws = await connection();
    const received = frames(ws);
    ws.send("not json");
    ws.send(JSON.stringify({ type: "request", id: "x", request: { method: "rm", botId: "b" } }));
    ws.send("x".repeat(USER_DEVICE_MAX_MESSAGE_BYTES + 1));
    await connection(1);
    expect(received).toEqual([]);
    expect(revoked).not.toHaveBeenCalled();
  });

  it("reconnects after the connection drops, until closed", async () => {
    start();
    (await connection()).terminate();
    const second = await connection(1);
    client!.close();
    await once(second, "close");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(upgrades).toHaveLength(2);
  });

  it("stops for good when the server revokes the device", async () => {
    start();
    const ws = await connection();
    ws.send(JSON.stringify({ type: "revoked" }));
    await once(ws, "close");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(revoked).toHaveBeenCalledTimes(1);
    expect(revoked).toHaveBeenCalledWith(undefined);
    expect(upgrades).toHaveLength(1);
  });

  it("passes on that the sign-in which paired the device ended", async () => {
    start();
    const ws = await connection();
    ws.send(JSON.stringify({ type: "revoked", reason: "session-ended" }));
    await until(() => revoked.mock.calls.length === 1);
    expect(revoked).toHaveBeenCalledWith("session-ended");
  });

  it("treats a rejected token as revoked", async () => {
    reject401 = true;
    start();
    await until(() => revoked.mock.calls.length === 1);
    expect(revoked).toHaveBeenCalledWith(undefined);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(upgrades).toHaveLength(1);
  });

  it("passes on why a refused token was revoked, and only a reason it knows", async () => {
    reject401 = true;
    refusedBecause = "session-ended";
    start();
    await until(() => revoked.mock.calls.length === 1);
    expect(revoked).toHaveBeenCalledWith("session-ended");

    client!.close();
    refusedBecause = "something-else";
    start();
    await until(() => revoked.mock.calls.length === 2);
    expect(revoked).toHaveBeenLastCalledWith(undefined);
  });

  it("keeps quiet commands alive with heartbeat frames", async () => {
    start();
    const ws = await connection();
    const received = frames(ws);
    ws.send(
      JSON.stringify({ type: "request", id: "p", request: { method: "provision", botId: "bot" } }),
    );
    await until(() => received.some((frame) => frame.id === "p" && "done" in frame.frame));
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      ws.send(
        JSON.stringify({
          type: "request",
          id: "quiet",
          request: {
            method: "execute",
            botId: "bot",
            command: {
              env: nodeEnv,
              argv: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
            },
          },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      await vi.advanceTimersByTimeAsync(30_000);
      await until(() =>
        received.some((frame) => frame.id === "quiet" && frame.frame.heartbeat === true),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("forwards custom server headers on loopback/TLS upgrades without letting them override Bearer auth", async () => {
    client = startUserDeviceClient({
      serverUrl,
      token,
      root,
      headers: {
        "CF-Access-Client-Id": "client-123",
        Authorization: "Bearer wrong-token",
        Host: "spoofed.example",
        Origin: "https://spoofed.example",
        Cookie: "session=leaked",
        "Sec-Fetch-Site": "cross-site",
      },
      onRevoked: revoked,
      authorize: async () => true,
      retryMs: { min: 20, max: 40 },
    });
    await connection();
    expect(upgrades[0]!.headers["cf-access-client-id"]).toBe("client-123");
    expect(upgrades[0]!.headers.authorization).toBe(`Bearer ${token}`);
    expect(upgrades[0]!.headers.host).not.toBe("spoofed.example");
    expect(upgrades[0]!.headers.origin).toBeUndefined();
    expect(upgrades[0]!.headers.cookie).toBeUndefined();
    expect(upgrades[0]!.headers["sec-fetch-site"]).toBeUndefined();
  });
});
