import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ProjectWindowsCommandRequest, ProjectWindowsCommandResult } from "@rakazo/contracts";
import {
  ProjectWindowsCommandRequestSchema,
  ProjectWindowsCommandResultSchema,
} from "@rakazo/contracts";

const RUNNER_USER = "sydney-project-runner";
const MAX_RUNNER_OUTPUT = 1024 * 1024;
const MAX_RUNNER_SOURCE_BYTES = 18 * 1024;
const HEALTH_CACHE_MS = 15_000;

type RunnerReply = { stdout: string; stderr: string; code: number };

function configuredDistribution(value: string | undefined) {
  return value && /^[A-Za-z0-9_.-]{1,64}$/u.test(value) ? value : null;
}

export function createProjectWindowsCommandRunner(options: {
  runnerPath: string;
  distribution?: string;
  platform?: NodeJS.Platform;
  systemRoot?: string;
  spawnProcess?: typeof spawn;
}) {
  const platform = options.platform ?? process.platform;
  const systemRoot = options.systemRoot ?? process.env.SystemRoot;
  const distribution = configuredDistribution(
    options.distribution ?? process.env.SYDNEY_PROJECT_WSL_DISTRIBUTION,
  );
  const spawnProcess = options.spawnProcess ?? spawn;
  let encodedRunner: Promise<string> | undefined;
  let cachedHealth: { expiresAt: number; available: boolean } | undefined;

  function commandPrefix(source: string) {
    return [
      "--distribution",
      distribution!,
      "--user",
      RUNNER_USER,
      "--exec",
      "/usr/bin/python3",
      "-I",
      "-c",
      `exec(compile(__import__('base64').b64decode('${source}'),'<sydney-project-runner>','exec'))`,
    ];
  }

  async function invoke(
    input:
      | {
          request: ProjectWindowsCommandRequest;
          files: { path: string; content: string }[];
        }
      | undefined,
    signal: AbortSignal,
    timeoutMs: number,
  ): Promise<unknown> {
    signal.throwIfAborted();
    if (platform !== "win32" || !systemRoot || !path.win32.isAbsolute(systemRoot) || !distribution)
      throw new Error("An explicitly configured isolated WSL 2 distribution is required");
    encodedRunner ??= readFile(options.runnerPath).then((source) => {
      if (source.byteLength > MAX_RUNNER_SOURCE_BYTES)
        throw new Error("The isolated WSL project runner exceeds the supported size");
      return source.toString("base64");
    });
    const runner = await encodedRunner;
    signal.throwIfAborted();
    const executable = path.win32.join(systemRoot, "System32", "wsl.exe");
    const child = spawnProcess(
      executable,
      [...commandPrefix(runner), ...(input ? [] : ["--health"])],
      {
        cwd: path.win32.join(systemRoot, "System32"),
        env: { SystemRoot: systemRoot, WINDIR: systemRoot, WSLENV: "" },
        windowsHide: true,
        stdio: input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
      },
    );
    return await new Promise((resolve, reject) => {
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputBytes = 0;
      let settled = false;
      let killTimer: NodeJS.Timeout | undefined;
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        child.stdout?.removeAllListeners();
        child.stderr?.removeAllListeners();
      };
      const finish = (error?: Error, result?: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(result);
      };
      const terminate = () => {
        if (input && child.stdin && !child.stdin.destroyed) {
          child.stdin.write('{"cancel":true}\n');
          child.stdin.end();
          killTimer = setTimeout(() => child.kill(), 2_000);
          killTimer.unref();
        } else {
          child.kill();
        }
      };
      const abort = () => {
        terminate();
        finish(
          signal.reason instanceof Error ? signal.reason : new Error("Project command cancelled"),
        );
      };
      const timer = setTimeout(() => {
        terminate();
        finish(new Error("The isolated WSL project command timed out"));
      }, timeoutMs);
      timer.unref();
      signal.addEventListener("abort", abort, { once: true });
      child.stdout?.on("data", (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_RUNNER_OUTPUT) {
          terminate();
          finish(new Error("The isolated WSL project command returned too much output"));
          return;
        }
        stdout.push(Buffer.from(chunk));
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_RUNNER_OUTPUT) {
          terminate();
          finish(new Error("The isolated WSL project command returned too much output"));
          return;
        }
        stderr.push(Buffer.from(chunk));
      });
      child.once("error", (error) => finish(error));
      child.once("close", (code) => {
        clearTimeout(killTimer);
        if (settled) return;
        const text = Buffer.concat(stdout).toString("utf8").trim();
        if (code !== 0) {
          finish(
            new Error("The isolated WSL project runtime is unavailable or the command failed"),
          );
          return;
        }
        try {
          finish(undefined, JSON.parse(text));
        } catch {
          finish(new Error("The isolated WSL project runtime returned an invalid response"));
        }
      });
      if (input) {
        child.stdin?.on("error", () => undefined);
        child.stdin?.write(
          `${JSON.stringify({
            argv: input.request.command.argv,
            inputFiles: input.request.command.inputFiles,
            timeoutMs: input.request.command.timeoutMs,
            files: input.files.map((file) => ({
              path: file.path,
              content: Buffer.from(file.content, "utf8").toString("base64"),
            })),
          })}\n`,
        );
      }
      if (signal.aborted) abort();
    });
  }

  async function available(signal: AbortSignal) {
    if (platform !== "win32" || !distribution) return false;
    if (cachedHealth && cachedHealth.expiresAt > Date.now()) return cachedHealth.available;
    const result = await invoke(undefined, signal, 8_000).catch(() => null);
    const availability = Boolean(
      result &&
        typeof result === "object" &&
        (result as { available?: unknown }).available === true,
    );
    cachedHealth = { available: availability, expiresAt: Date.now() + HEALTH_CACHE_MS };
    return availability;
  }

  return {
    available,
    async execute(
      input: ProjectWindowsCommandRequest,
      files: { path: string; content: string }[],
      signal: AbortSignal,
    ): Promise<ProjectWindowsCommandResult> {
      const request = ProjectWindowsCommandRequestSchema.parse(input);
      signal.throwIfAborted();
      const result = await invoke({ request, files }, signal, request.command.timeoutMs + 10_000);
      signal.throwIfAborted();
      if (
        result &&
        typeof result === "object" &&
        (result as { status?: unknown }).status === "unavailable"
      )
        return { status: "unavailable" };
      const parsed = ProjectWindowsCommandResultSchema.parse({
        status: "completed",
        ...(result as RunnerReply),
      });
      return parsed;
    },
  };
}
