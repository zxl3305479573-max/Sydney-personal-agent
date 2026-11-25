import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createProjectWindowsCommandRunner } from "./project-windows-command.js";

function fakeSpawn(options: { holdCommands?: boolean } = {}) {
  const payloads: Record<string, unknown>[] = [];
  const writes: string[] = [];
  const children: (EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  })[] = [];
  const start = vi.fn((_executable: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: PassThrough;
      stdout: PassThrough;
      stderr: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn(() => true);
    children.push(child);
    child.stdin.on("data", (chunk) => writes.push(chunk.toString()));
    if (args.includes("--health")) {
      queueMicrotask(() => {
        child.stdout.end(JSON.stringify({ available: true }));
        child.emit("close", 0);
      });
    } else {
      let body = "";
      let requestRead = false;
      child.stdin.on("data", (chunk) => {
        body += chunk.toString();
        if (requestRead || !body.includes("\n")) return;
        requestRead = true;
        const payload = JSON.parse(body.split("\n", 1)[0] ?? "") as Record<string, unknown>;
        payloads.push(payload);
        if (options.holdCommands) return;
        queueMicrotask(() => {
          child.stdout.end(JSON.stringify({ stdout: "ok", stderr: "", code: 0 }));
          child.emit("close", 0);
        });
      });
    }
    return child as unknown as ReturnType<typeof spawn>;
  });
  return { start, payloads, writes, children };
}

describe("isolated Windows project command runner", () => {
  it("stays disabled unless a WSL distribution is explicitly configured", async () => {
    const { start } = fakeSpawn();
    const runner = createProjectWindowsCommandRunner({
      runnerPath: fileURLToPath(
        new URL("../../../infra/windows-wsl/project-command-runner.py", import.meta.url),
      ),
      distribution: "",
      platform: "win32",
      systemRoot: "C:\\Windows",
      spawnProcess: start as unknown as typeof spawn,
    });
    await expect(runner.available(new AbortController().signal)).resolves.toBe(false);
    expect(start).not.toHaveBeenCalled();
  });

  it("probes the explicitly selected guest and sends only the approved file copy", async () => {
    const { start, payloads } = fakeSpawn();
    const runner = createProjectWindowsCommandRunner({
      runnerPath: fileURLToPath(
        new URL("../../../infra/windows-wsl/project-command-runner.py", import.meta.url),
      ),
      distribution: "SydneyProjectGuest",
      platform: "win32",
      systemRoot: "C:\\Windows",
      spawnProcess: start as unknown as typeof spawn,
    });
    await expect(runner.available(new AbortController().signal)).resolves.toBe(true);
    const request = {
      method: "projectWindowsCommand" as const,
      spaceId: "space-a",
      projectId: "project-a",
      grantId: "a374627e-87a5-4f8d-a619-1c662ae431b7",
      projectName: "Project A",
      runId: "run-a",
      command: {
        argv: ["/usr/bin/python3", "-c", "print('ok')"],
        inputFiles: ["src/main.py"],
        timeoutMs: 2000,
      },
    };
    await expect(
      runner.execute(
        request,
        [{ path: "src/main.py", content: "print('ok')" }],
        new AbortController().signal,
      ),
    ).resolves.toEqual({ status: "completed", stdout: "ok", stderr: "", code: 0 });
    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[0]?.[1]).toContain("SydneyProjectGuest");
    expect(payloads).toEqual([
      {
        argv: request.command.argv,
        inputFiles: ["src/main.py"],
        timeoutMs: 2000,
        files: [{ path: "src/main.py", content: Buffer.from("print('ok')").toString("base64") }],
      },
    ]);
  });

  it("sends cancellation to the running guest and force-stops a stuck WSL process", async () => {
    const { start, writes, children } = fakeSpawn({ holdCommands: true });
    const runner = createProjectWindowsCommandRunner({
      runnerPath: fileURLToPath(
        new URL("../../../infra/windows-wsl/project-command-runner.py", import.meta.url),
      ),
      distribution: "SydneyProjectGuest",
      platform: "win32",
      systemRoot: "C:\\Windows",
      spawnProcess: start as unknown as typeof spawn,
    });
    await expect(runner.available(new AbortController().signal)).resolves.toBe(true);
    const controller = new AbortController();
    const execution = runner.execute(
      {
        method: "projectWindowsCommand",
        spaceId: "space-a",
        projectId: "project-a",
        grantId: "a374627e-87a5-4f8d-a619-1c662ae431b7",
        projectName: "Project A",
        runId: "run-a",
        command: { argv: ["/usr/bin/true"], inputFiles: [], timeoutMs: 2000 },
      },
      [],
      controller.signal,
    );
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    vi.useFakeTimers();
    try {
      controller.abort();
      await expect(execution).rejects.toThrow("aborted");
      expect(writes.join("")).toContain('{"cancel":true}');
      await vi.advanceTimersByTimeAsync(2_000);
      expect(children[1]?.kill).toHaveBeenCalledOnce();
      children[1]?.emit("close", 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
