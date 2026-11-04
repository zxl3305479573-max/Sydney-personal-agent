import type {
  AdapterContext,
  AdapterDescriptor,
  BackgroundWorkEvidence,
  CommandRequest,
  ComputerActionRequest,
  ComputerActionResult,
  ComputerInput,
  ComputerObservation,
  ComputerRef,
  ControlLeaseRef,
  PortableFile,
  ProcessEvent,
  SandboxCapabilities,
  SandboxProvider,
  ScreenRequest,
  ScreenSession,
  SnapshotRef,
} from "@rakazo/adapter-kit";
import * as net from "node:net";
import { computerHomeKey } from "@rakazo/db";

type Transport = (
  method: string,
  params: unknown,
  context?: AdapterContext,
  computer?: ComputerRef,
  provisionBotId?: string,
) => Promise<unknown>;

type DriverResponse = { ok: true; value: unknown } | { ok: false; error: string };

function socketTransport(socketPath: string) {
  return (
    method: string,
    params: unknown,
    context?: AdapterContext,
    computer?: ComputerRef,
    provisionBotId?: string,
  ): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const signal =
        method === "cancel" || method === "inspect" ? undefined : context?.signal;
      if (signal?.aborted) {
        reject(new Error("native_driver_aborted_result_unknown"));
        return;
      }
      const socket = net.createConnection(socketPath);
      const chunks: Buffer[] = [];
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        socket.destroy();
        reject(new Error("native_driver_aborted_result_unknown"));
      };
      const timer = setTimeout(() => {
        cleanup();
        socket.destroy();
        reject(new Error(`native_driver_timeout:${method}`));
      }, 10_000);
      signal?.addEventListener("abort", onAbort, { once: true });
      socket.once("error", (error) => {
        cleanup();
        reject(error);
      });
      socket.once("close", () => {
        cleanup();
        reject(new Error("native_driver_disconnected_result_unknown"));
      });
      socket.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        const data = Buffer.concat(chunks).toString("utf8");
        const lineEnd = data.indexOf("\n");
        if (lineEnd < 0) return;
        cleanup();
        socket.end();
        try {
          const response = JSON.parse(data.slice(0, lineEnd)) as DriverResponse;
          if (!response.ok) reject(new Error(response.error));
          else resolve(response.value);
        } catch (error) {
          reject(error);
        }
      });
      socket.once("connect", () => {
        const request = {
          ...(typeof params === "object" && params !== null ? params : { value: params }),
          method,
          botId: computer?.botId ?? provisionBotId,
          ...(computer ? { generation: computer.providerRef.slice("native:".length) } : {}),
          ...(context?.nativeRunLease
            ? {
                run: {
                  id: context.runId,
                  fence: context.nativeRunLease.fence,
                  expiresAt: context.nativeRunLease.expiresAt,
                },
              }
            : {}),
        };
        socket.write(`${JSON.stringify(request)}\n`);
      });
    });
}

function decodeBase64(value: unknown): Uint8Array {
  if (typeof value !== "string") throw new Error("native_driver_invalid_binary");
  return Uint8Array.from(Buffer.from(value, "base64"));
}

export class NativeLinuxSandbox implements SandboxProvider {
  constructor(
    private readonly runLeaseValid: (context: AdapterContext) => Promise<number | null>,
    private readonly transport: Transport,
    private readonly screen?: { userId: string; spaceId: string; botId: string; port: number },
  ) {}

  describe(): AdapterDescriptor<SandboxCapabilities> {
    return {
      id: "native-linux",
      contractVersion: "1",
      adapterVersion: "1",
      capabilities: {
        graphical: true,
        pty: false,
        snapshots: false,
        takeover: false,
        persistentHome: true,
      },
    };
  }

  private assertComputer(context: AdapterContext, computer: ComputerRef): void {
    const teamHomeKey = computerHomeKey({
      mode: "team",
      spaceId: context.spaceId,
      userId: context.userId,
    });
    if (
      computer.kind !== "native-linux" ||
      !context.botId ||
      (computer.botId !== context.botId && computer.botId !== teamHomeKey) ||
      !/^native:[A-Za-z0-9_-]{16,}$/.test(computer.providerRef)
    ) {
      throw new Error("native_generation_mismatch");
    }
  }

  private async guard(context: AdapterContext, computer: ComputerRef): Promise<AdapterContext> {
    this.assertComputer(context, computer);
    if (!context.nativeRunLease) throw new Error("missing_native_run_lease");
    const expiry = await this.runLeaseValid(context);
    const expiresAt = Math.min(expiry ?? 0, Date.now() + 8_000);
    if (!Number.isFinite(expiresAt) || context.signal.aborted || expiresAt <= Date.now()) {
      throw new Error("native_run_lease_invalid");
    }
    return { ...context, nativeRunLease: { ...context.nativeRunLease, expiresAt } };
  }

  async act(
    computer: ComputerRef,
    request: ComputerActionRequest,
    context: AdapterContext,
  ): Promise<ComputerActionResult> {
    const guardedContext = await this.guard(context, computer);
    const response = (await this.transport("act", { request }, guardedContext, computer)) as ComputerActionResult & {
      observation?: ComputerObservation & { imageBase64?: string };
    };
    if (response.observation?.imageBase64) {
      response.observation.image = decodeBase64(response.observation.imageBase64);
      response.observation.imageBase64 = undefined;
    }
    return response;
  }

  async observe(computer: ComputerRef, context: AdapterContext): Promise<ComputerObservation> {
    this.assertComputer(context, computer);
    const guardedContext = context.nativeRunLease ? await this.guard(context, computer) : context;
    const response = (await this.transport("observe", {}, guardedContext, computer)) as ComputerObservation & {
      imageBase64?: string;
    };
    if (!response.imageBase64) throw new Error("native_driver_missing_image");
    response.image = decodeBase64(response.imageBase64);
    response.imageBase64 = undefined;
    return response;
  }

  async provision(request: {
    botId: string;
    homePath: string;
    providerRef?: string;
    providerKind?: ComputerRef["kind"];
  }): Promise<ComputerRef> {
    const result = (await this.transport("provision", {}, undefined, undefined, request.botId)) as {
      generation?: unknown;
    };
    if (typeof result.generation !== "string" || result.generation.length < 16) {
      throw new Error("native_driver_invalid_generation");
    }
    const computer = {
      id: `native-${result.generation}`,
      botId: request.botId,
      kind: "native-linux",
      providerRef: `native:${result.generation}`,
    } as const;
    return computer;
  }

  async prepare(_computer: ComputerRef, _context: AdapterContext): Promise<void> {}

  async *execute(
    computer: ComputerRef,
    request: CommandRequest,
    context: AdapterContext,
  ): AsyncIterable<ProcessEvent> {
    const guardedContext = await this.guard(context, computer);
    const command = { ...request, timeoutMs: Math.min(request.timeoutMs ?? 8_000, 8_000) };
    const result = (await this.transport("execute", { command }, guardedContext, computer)) as {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    if (result.stdout) yield { type: "stdout", data: result.stdout };
    if (result.stderr) yield { type: "stderr", data: result.stderr };
    if (typeof result.code === "number") yield { type: "exit", code: result.code };
  }

  async connectScreen(
    computer: ComputerRef,
    request: ScreenRequest,
    context: AdapterContext,
  ): Promise<ScreenSession> {
    this.assertComputer(context, computer);
    if (
      request.view !== "stream" ||
      request.interactive ||
      !this.screen ||
      context.userId !== this.screen.userId ||
      context.spaceId !== this.screen.spaceId ||
      context.botId !== this.screen.botId ||
      !Number.isInteger(this.screen.port) ||
      this.screen.port < 1 ||
      this.screen.port > 65535 ||
      context.signal.aborted
    ) {
      throw new Error("native_screen_unsupported");
    }
    await this.transport("status", {}, context, computer);
    if (context.signal.aborted) throw new Error("native_screen_unsupported");
    return {
      url: `http://127.0.0.1:${this.screen.port}/vnc.html`,
      mimeType: "text/html",
      close: async () => {},
    };
  }

  async sendInput(
    computer: ComputerRef,
    input: ComputerInput,
    _lease: ControlLeaseRef,
    context: AdapterContext,
  ): Promise<void> {
    const guardedContext = await this.guard(context, computer);
    await this.transport("input", input, guardedContext, computer);
  }

  async listFiles(
    computer: ComputerRef,
    path: string,
    context: AdapterContext,
  ): Promise<{ path: string; kind: "file" | "dir"; size: number }[]> {
    const guardedContext = await this.guard(context, computer);
    return this.transport("list", { path: path === "/" ? "" : path }, guardedContext, computer) as Promise<
      { path: string; kind: "file" | "dir"; size: number }[]
    >;
  }

  async readFile(
    computer: ComputerRef,
    path: string,
    context: AdapterContext,
  ): Promise<Uint8Array> {
    const guardedContext = await this.guard(context, computer);
    const value = await this.transport("read", { path }, guardedContext, computer);
    return decodeBase64(value);
  }

  async writeFile(
    computer: ComputerRef,
    file: PortableFile,
    context: AdapterContext,
  ): Promise<void> {
    const guardedContext = await this.guard(context, computer);
    await this.transport(
      "write",
      {
        path: file.path,
        content: Buffer.from(file.content).toString("base64"),
        executable: file.executable ?? false,
      },
      guardedContext,
      computer,
    );
  }

  async *exportWorkspace(
    computer: ComputerRef,
    context: AdapterContext,
  ): AsyncIterable<PortableFile> {
    await this.guard(context, computer);
    throw new Error("native_workspace_export_unsupported");
  }

  async importWorkspace(
    computer: ComputerRef,
    files: AsyncIterable<PortableFile>,
    context: AdapterContext,
  ): Promise<void> {
    await this.guard(context, computer);
    for await (const file of files) await this.writeFile(computer, file, context);
  }

  async snapshot(computer: ComputerRef, context: AdapterContext): Promise<SnapshotRef> {
    await this.guard(context, computer);
    throw new Error("native_snapshot_unsupported");
  }

  async cancelRunWork(
    computer: ComputerRef,
    _computerId: string,
    runId: string,
    context: AdapterContext,
  ): Promise<void> {
    this.assertComputer(context, computer);
    await this.transport("cancel", { targetRunId: runId }, context, computer);
  }

  async inspectBackgroundWork(
    computer: ComputerRef,
    _computerId: string,
    context: AdapterContext,
  ): Promise<"active" | "idle" | "unknown"> {
    this.assertComputer(context, computer);
    const result = await this.transport("inspect", {}, context, computer);
    if (result === "active" || result === "idle") return result;
    return "unknown";
  }

  async inspectBackgroundWorkEvidence(
    computer: ComputerRef,
    computerId: string,
    context: AdapterContext,
  ): Promise<BackgroundWorkEvidence> {
    this.assertComputer(context, computer);
    const result = await this.transport("inspect", {}, context, computer);
    const observedAt = new Date().toISOString();
    if (result === "active") {
      return { status: "active", kind: "process_group_active", markerId: computerId, observedAt };
    }
    if (result === "idle") {
      return { status: "idle", kind: "process_group_empty", markerId: computerId, observedAt };
    }
    return {
      status: "unknown",
      kind: "unavailable",
      markerId: computerId,
      observedAt,
      reason: "native_driver_inspection_unknown",
    };
  }

  async stop(_computer: ComputerRef, _context: AdapterContext): Promise<void> {
    throw new Error("native_stop_unsupported");
  }

  async destroy(_computer: ComputerRef, _context: AdapterContext): Promise<void> {
    throw new Error("native_destroy_unsupported");
  }
}

export function createNativeLinuxTransport(socketPath: string): Transport {
  return socketTransport(socketPath);
}
