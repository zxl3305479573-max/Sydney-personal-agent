import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { HotPluginEvent, HotPluginState } from "@rakazo/core/hot-plugin-lifecycle";
import {
  decideHotPluginTransition,
  hotPluginAcceptsNewCalls,
} from "@rakazo/core/hot-plugin-lifecycle";

type PilotMode =
  | "normal"
  | "slow"
  | "crash"
  | "hang"
  | "no-handshake"
  | "bad-version"
  | "big-output";
type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

const MAX_MESSAGE_BYTES = 64 * 1024;

export class HotPluginPilot {
  private state: HotPluginState = "stopped";
  private child: ChildProcessWithoutNullStreams | undefined;
  private pending: Pending | undefined;
  private buffer = Buffer.alloc(0);
  private nextId = 0;
  private expectedId = 0;
  private closed: Promise<void> = Promise.resolve();
  private stopPromise: Promise<void> | undefined;

  constructor(
    private readonly mode: PilotMode = "normal",
    private readonly timeoutMs = 1000,
  ) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
      throw new Error("Invalid pilot timeout");
    }
  }

  getState(): HotPluginState {
    return this.state;
  }

  private transition(event: HotPluginEvent): void {
    const decision = decideHotPluginTransition(this.state, event);
    if (!decision.accepted) throw new Error(`Invalid pilot transition: ${event.type}`);
    this.state = decision.state;
  }

  private rejectPending(error: Error): void {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    const pending = this.pending;
    this.pending = undefined;
    pending.reject(error);
  }

  private fail(error: Error): void {
    if (this.state !== "failed" && this.state !== "stopped") this.transition({ type: "failure" });
    this.rejectPending(error);
    this.child?.kill();
  }

  private waitForResponse(): Promise<unknown> {
    if (this.pending) throw new Error("Pilot already has an active request");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.fail(new Error("Pilot response timed out")),
        this.timeoutMs,
      );
      this.pending = { resolve, reject, timer };
    });
  }

  private receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > MAX_MESSAGE_BYTES) {
      this.fail(new Error("Pilot response too large"));
      return;
    }
    const newline = this.buffer.indexOf(10);
    if (newline < 0) return;
    const line = this.buffer.subarray(0, newline);
    this.buffer = this.buffer.subarray(newline + 1);
    if (this.buffer.length || !this.pending) {
      this.fail(new Error("Unexpected pilot response"));
      return;
    }
    try {
      const value: unknown = JSON.parse(line.toString("utf8"));
      if (!value || typeof value !== "object") throw new Error("Invalid response");
      const response = value as Record<string, unknown>;
      const valid =
        (this.state === "starting" && response.type === "ready" && response.version === 1) ||
        ((this.state === "ready" || this.state === "draining") &&
          response.type === "result" &&
          response.id === this.expectedId &&
          Array.isArray(response.headings) &&
          response.headings.every((heading) => typeof heading === "string"));
      if (!valid) throw new Error("Invalid response");
      const pending = this.pending;
      this.pending = undefined;
      clearTimeout(pending.timer);
      pending.resolve(response);
    } catch {
      this.fail(new Error("Invalid pilot response"));
    }
  }

  async start(): Promise<void> {
    this.transition({ type: "start" });
    this.stopPromise = undefined;
    this.buffer = Buffer.alloc(0);
    const fixture = fileURLToPath(new URL("./hot-plugin-pilot-fixture.cjs", import.meta.url));
    const child = spawn(process.execPath, [fixture, this.mode], {
      env: {},
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    child.stderr.resume();
    child.stdin.on("error", () => this.fail(new Error("Pilot input closed")));
    child.stdout.on("data", (chunk: Buffer) => this.receive(chunk));
    child.on("error", () => this.fail(new Error("Pilot process error")));
    this.closed = new Promise((resolve) => {
      child.on("close", () => {
        if (this.state !== "stopping" && this.state !== "failed") {
          this.transition({ type: "failure" });
        }
        this.rejectPending(new Error("Pilot process exited"));
        this.transition({ type: "exit_confirmed" });
        this.child = undefined;
        resolve();
      });
    });
    const response = this.waitForResponse();
    child.stdin.write(`${JSON.stringify({ type: "hello", version: 1 })}\n`);
    await response;
    this.transition({ type: "healthy" });
  }

  async extractHeadings(text: string): Promise<string[]> {
    if (!hotPluginAcceptsNewCalls(this.state)) throw new Error("Pilot is not ready");
    if (typeof text !== "string" || Buffer.byteLength(text) > 16 * 1024) {
      throw new Error("Pilot input too large");
    }
    const response = this.waitForResponse();
    this.expectedId = ++this.nextId;
    this.child?.stdin.write(`${JSON.stringify({ type: "extract", id: this.expectedId, text })}\n`);
    const result = (await response) as { headings: string[] };
    return result.headings;
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    if (this.state === "stopped") return Promise.resolve();
    if (this.state !== "ready")
      return Promise.reject(new Error("Pilot cannot be stopped in this state"));
    this.transition({ type: "disable" });
    this.stopPromise = (async () => {
      while (this.pending && this.state === "draining") {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      if (this.state === "draining") {
        this.transition({ type: "drained", activeCalls: 0 });
        this.child?.stdin.end();
        let timedOut = false;
        let forceTimer: NodeJS.Timeout | undefined;
        const timer = setTimeout(() => {
          timedOut = true;
          this.fail(new Error("Pilot exit timed out"));
        }, this.timeoutMs);
        try {
          await Promise.race([
            this.closed,
            new Promise<never>((_, reject) => {
              forceTimer = setTimeout(
                () => reject(new Error("Pilot exit was not confirmed")),
                this.timeoutMs * 2,
              );
            }),
          ]);
          if (timedOut) throw new Error("Pilot exit timed out");
        } finally {
          clearTimeout(timer);
          clearTimeout(forceTimer);
        }
      } else {
        await this.closed;
      }
    })();
    return this.stopPromise;
  }
}
