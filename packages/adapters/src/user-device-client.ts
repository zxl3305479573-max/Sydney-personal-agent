import {
  ProjectFileResultSchema,
  ProjectWindowsTerminalResultSchema,
  USER_DEVICE_CONNECT_PATH,
  WorkspaceGrantResultSchema,
} from "@rakazo/contracts";
import type {
  ProjectFileRequest, ProjectFileResult, ProjectWindowsTerminalRequest, ProjectWindowsTerminalResult,
  WorkspaceGrantRequest, WorkspaceGrantResult,
} from "@rakazo/contracts";
import { isLoopbackHost } from "@rakazo/contracts/network-host";
import WebSocket from "ws";
import type { HostComputerFrame } from "./host-computer-protocol.js";
import { HOST_COMPUTER_MAX_BYTES } from "./host-computer-protocol.js";
import type { HostComputerCall } from "./host-computer-runner.js";
import { createHostComputerRunner } from "./host-computer-runner.js";
import type { HostScreen } from "./host-screen.js";
import type { UserDeviceClientMessage, UserDeviceRevokeReason } from "./user-device-protocol.js";
import {
  USER_DEVICE_REVOKED_HEADER,
  userDeviceRevokeReason,
  userDeviceServerMessage,
} from "./user-device-protocol.js";

/** One frame or request plus its small envelope, in either direction. */
export const USER_DEVICE_MAX_MESSAGE_BYTES = HOST_COMPUTER_MAX_BYTES + 4096;
const PING_INTERVAL_MS = 30_000;
const BUSY_MESSAGE = "Local computer is busy. Try again shortly.";
const NOT_ALLOWED_MESSAGE = "Not allowed on this computer";

export interface UserDeviceClientOptions {
  serverUrl: string;
  token: string;
  root: string;
  /** Optional validated server headers (e.g. Cloudflare Access) sent on TLS or loopback upgrades. */
  headers?: Readonly<Record<string, string>>;
  /** Drives this computer's apps. Owned by the caller, which closes it. */
  screen?: HostScreen;
  /** The server revoked the device or rejected its token. The client has already stopped. */
  onRevoked: (reason?: UserDeviceRevokeReason) => void;
  /** Whether this computer lets the server's bots run anything. Asked before every request. */
  authorize: () => Promise<boolean>;
  workspaceGrant?: (request: WorkspaceGrantRequest) => Promise<WorkspaceGrantResult>;
  projectFile?: (request: ProjectFileRequest, signal: AbortSignal) => Promise<ProjectFileResult>;
  projectWindowsTerminal?: (
    request: ProjectWindowsTerminalRequest, signal: AbortSignal,
  ) => Promise<ProjectWindowsTerminalResult>;
  retryMs?: { min: number; max: number };
}

const RESERVED_UPGRADE_HEADERS = new Set([
  "authorization",
  "connection",
  "cookie",
  "host",
  "keep-alive",
  "origin",
  "proxy-authenticate",
  "proxy-authorization",
  "sec-websocket-extensions",
  "sec-websocket-key",
  "sec-websocket-protocol",
  "sec-websocket-version",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function buildUpgradeHeaders(
  url: URL,
  token: string,
  extra?: Readonly<Record<string, string>>,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (extra && (url.protocol === "wss:" || isLoopbackHost(url.hostname))) {
    for (const [name, value] of Object.entries(extra)) {
      const lower = name.toLowerCase();
      if (
        RESERVED_UPGRADE_HEADERS.has(lower) ||
        lower.startsWith("sec-") ||
        lower.startsWith("proxy-")
      ) {
        continue;
      }
      headers[lower] = value;
    }
  }
  headers.authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Connects outbound to a Rakazo server so its bots can use this computer. The server never
 * connects in. Runs only while started; `close` stops every command and the connection, and
 * `cancelAll` stops every command and refuses requests still waiting on `authorize`.
 */
export function startUserDeviceClient(options: UserDeviceClientOptions) {
  const retry = options.retryMs ?? { min: 1_000, max: 60_000 };
  const runner = createHostComputerRunner({ root: options.root, screen: options.screen });
  runner.setEnabled(true);
  const url = new URL(USER_DEVICE_CONNECT_PATH, options.serverUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const upgradeHeaders = buildUpgradeHeaders(url, options.token, options.headers);
  let stopped = false;
  let attempt = 0;
  let socket: WebSocket | undefined;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let refuseWaiting: (() => void) | undefined;

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(reconnectTimer);
    refuseWaiting?.();
    runner.close();
    socket?.terminate();
  }

  function cancelAll() {
    if (stopped) return;
    refuseWaiting?.();
    runner.setEnabled(false);
    runner.setEnabled(true);
  }

  function revoked(reason?: UserDeviceRevokeReason) {
    if (stopped) return;
    stop();
    options.onRevoked(reason);
  }

  function scheduleReconnect() {
    if (stopped) return;
    // Full jitter keeps many devices from reconnecting in lockstep after a server restart.
    const ceiling = Math.min(retry.max, retry.min * 2 ** attempt);
    attempt += 1;
    reconnectTimer = setTimeout(connect, retry.min / 2 + Math.random() * ceiling);
    reconnectTimer.unref();
  }

  function connect() {
    if (stopped) return;
    const ws = new WebSocket(url, {
      headers: upgradeHeaders,
      maxPayload: USER_DEVICE_MAX_MESSAGE_BYTES,
      handshakeTimeout: 15_000,
      followRedirects: false,
      perMessageDeflate: false,
    });
    socket = ws;
    const calls = new Map<
      string,
      { call: HostComputerCall; cancelled: boolean; settled: boolean }
    >();
    const authorizing = new Set<string>();
    const projectCalls = new Map<string, AbortController>();
    let alive = true;
    let openedAt = 0;
    let ping: NodeJS.Timeout | undefined;
    refuseWaiting = () => {
      for (const id of authorizing)
        void send(id, { error: NOT_ALLOWED_MESSAGE }).catch(() => undefined);
      authorizing.clear();
      for (const [id, controller] of projectCalls) {
        controller.abort();
        void send(id, { error: "Project operation stopped or its result is unconfirmed" })
          .catch(() => undefined);
      }
      projectCalls.clear();
    };

    ws.on("unexpected-response", (request, response) => {
      request.destroy();
      ws.terminate();
      if (response.statusCode === 401)
        revoked(
          userDeviceRevokeReason.safeParse(response.headers[USER_DEVICE_REVOKED_HEADER]).data,
        );
    });
    ws.on("open", () => {
      openedAt = Date.now();
      // A silent network drop otherwise leaves the device looking connected for hours.
      ping = setInterval(() => {
        if (!alive) {
          ws.terminate();
          return;
        }
        alive = false;
        ws.ping();
      }, PING_INTERVAL_MS);
      ping.unref();
    });
    ws.on("pong", () => {
      alive = true;
    });
    ws.on("error", () => {
      /* "close" follows and reconnects. */
    });
    ws.on("close", () => {
      clearInterval(ping);
      // A lost response is never retried, so in-flight work stops with the connection.
      for (const { call } of calls.values()) call.abort();
      calls.clear();
      for (const controller of projectCalls.values()) controller.abort();
      projectCalls.clear();
      if (socket === ws) {
        socket = undefined;
        refuseWaiting = undefined;
      }
      if (openedAt && Date.now() - openedAt >= PING_INTERVAL_MS) attempt = 0;
      scheduleReconnect();
    });
    ws.on("message", (data, isBinary) => {
      alive = true;
      if (isBinary) return;
      let message: ReturnType<typeof userDeviceServerMessage.parse>;
      try {
        const parsed = userDeviceServerMessage.safeParse(JSON.parse(data.toString()));
        if (!parsed.success) return;
        message = parsed.data;
      } catch {
        return;
      }
      if (message.type === "revoked") {
        revoked(message.reason);
        return;
      }
      if (message.type === "cancel") {
        authorizing.delete(message.id);
        projectCalls.get(message.id)?.abort();
        const entry = calls.get(message.id);
        if (entry) {
          entry.cancelled = true;
          entry.call.abort();
        }
        return;
      }
      if (calls.has(message.id) || authorizing.has(message.id) || projectCalls.has(message.id)) return;
      void handle(message.id, message.request);
    });

    function send(id: string, frame: HostComputerFrame<unknown>) {
      const entry = calls.get(id);
      let body = JSON.stringify({ type: "frame", id, frame } satisfies UserDeviceClientMessage);
      if (Buffer.byteLength(body) > USER_DEVICE_MAX_MESSAGE_BYTES) {
        frame = { error: "Local computer response is too large" };
        body = JSON.stringify({ type: "frame", id, frame } satisfies UserDeviceClientMessage);
        entry?.call.abort();
      }
      if (entry && ("done" in frame || "error" in frame)) entry.settled = true;
      return new Promise<void>((resolve, reject) => {
        if (ws.readyState !== WebSocket.OPEN) {
          reject(new Error("Local computer disconnected"));
          return;
        }
        ws.send(body, (error) => (error ? reject(error) : resolve()));
      });
    }

    async function handle(id: string, request: import("./user-device-protocol.js").UserDeviceRequest) {
      if (request.method === "projectFile" || request.method === "projectWindowsTerminal") {
        if (url.protocol !== "wss:" && !isLoopbackHost(url.hostname)) {
          await send(id, { error: "Project operations require a secure device connection" }).catch(() => undefined);
          return;
        }
        const operation = new AbortController();
        projectCalls.set(id, operation);
        const current = () => socket === ws && !operation.signal.aborted;
        try {
          const result = request.method === "projectFile"
            ? ProjectFileResultSchema.parse(await options.projectFile?.(request, operation.signal))
            : ProjectWindowsTerminalResultSchema.parse(
                await options.projectWindowsTerminal?.(request, operation.signal),
              );
          if (!current()) return;
          if ("operation" in result && request.method === "projectFile" &&
            result.operation !== request.file.operation &&
            !(request.file.operation === "update" && result.operation === "conflict"))
            throw new Error("Mismatched project file response");
          await send(id, { value: result });
          if (current()) await send(id, { done: true });
        } catch {
          if (current())
            await send(id, { error: "Project operation unavailable or its result is unconfirmed" })
              .catch(() => undefined);
        } finally {
          if (projectCalls.get(id) === operation) projectCalls.delete(id);
        }
        return;
      }
      authorizing.add(id);
      if (request.method === "workspaceGrant") {
        const result = await Promise.resolve()
          .then(() => options.workspaceGrant?.(request) ?? { state: "unavailable" })
          .then((value) => WorkspaceGrantResultSchema.parse(value))
          .catch(() => ({ state: "unavailable" as const }));
        if (!authorizing.delete(id) || socket !== ws) return;
        await send(id, { value: result })
          .then(() => send(id, { done: true }))
          .catch(() => undefined);
        return;
      }
      const allowed = await options.authorize().catch(() => false);
      if (!authorizing.delete(id) || socket !== ws) return;
      if (!allowed) {
        await send(id, { error: NOT_ALLOWED_MESSAGE }).catch(() => undefined);
        return;
      }
      const call = runner.begin();
      if (!call) {
        await send(id, { error: BUSY_MESSAGE }).catch(() => undefined);
        return;
      }
      const entry = { call, cancelled: false, settled: false };
      calls.set(id, entry);
      try {
        const outcome = await call.run(request, {
          open() {},
          write: (frame) => (call.signal.aborted ? undefined : send(id, frame)),
        });
        let refusal: string | undefined;
        if (outcome === "invalid") refusal = "Local computer request is invalid";
        else if (outcome === "busy") refusal = BUSY_MESSAGE;
        else if (outcome === "disabled" || call.signal.aborted)
          refusal = "Local computer operation stopped";
        if (refusal && !entry.cancelled && !entry.settled) await send(id, { error: refusal });
      } catch {
        /* The connection closed; the server fails the request. */
      } finally {
        call.end();
        if (calls.get(id) === entry) calls.delete(id);
      }
    }
  }

  connect();
  return { close: stop, cancelAll };
}

export type UserDeviceClient = ReturnType<typeof startUserDeviceClient>;
