import { createHash } from "node:crypto";
import { runContinueJob } from "@rakazo/adapter-kit";
import type {
  ProjectDirectoryBinding,
  ProjectFileOperation,
  ProjectFileResult,
} from "@rakazo/contracts";
import { ProjectFileOperationSchema, ProjectFileResultSchema } from "@rakazo/contracts";
import { messageBlockForArtifact } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import {
  appendEventInTransaction,
  getProjectCloudDirectory,
  getRunningProjectDirectory,
  runAsTenant,
} from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { settleUncertainEffect } from "./approval-effect.js";
import { NativeProjectFileDispatchError } from "./native-linux-sandbox.js";
import type { RunContext } from "./run-context.js";
import { pauseForApproval, persistTurnCheckpoint } from "./run-context.js";
import { isSubagentToolExecution } from "./run-effects.js";
import { persistMessageInTransaction } from "./run-messages.js";
import {
  PROJECT_FILE_CREATE,
  PROJECT_FILE_LIST,
  PROJECT_FILE_READ,
  PROJECT_FILE_SEARCH,
  PROJECT_FILE_UPDATE,
  projectFileToolAllowed,
} from "./run-project-policy.js";
import type { ToolCall, ToolHandlers } from "./run-tool-gate.js";
import type { ToolRequest } from "./run-tool-request.js";
import { attachWorkspaceFileToThread } from "./thread-artifacts.js";
import { UserDeviceNotConnectedError } from "./user-device-gateway.js";

const DIRECTORY_UNAVAILABLE = "The current project directory authorization is unavailable.";
const BINDING_CHECK_INTERVAL_MS = 1_000;
const DEVICE_RETRY_DELAY_MS = 30_000;
const WAITING_FOR_DEVICE = { waitingForDevice: true };

type CloudBinding = NonNullable<Awaited<ReturnType<typeof getProjectCloudDirectory>>>;
type BoundDirectory = ProjectDirectoryBinding | CloudBinding;

function textSha256(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function liveBinding(
  ctx: RunContext,
  prisma: Pick<PrismaClient, "$queryRaw"> = ctx.deps.prisma,
) {
  const { run, runId, workerId, fence } = ctx;
  const projectId = run.projectWorkspaceId;
  if (!projectId || ctx.context.signal.aborted) return null;
  const coordinates = {
    projectId,
    spaceId: run.spaceId,
    userId: run.userId,
    runId,
    threadId: run.threadId,
    taskId: run.taskId,
    workerId,
    fence,
  };
  const local = ctx.deps.userDevices ? await getRunningProjectDirectory(prisma, coordinates) : null;
  if (local) return local;
  if (!ctx.deps.sandbox?.executeProjectFile) return null;
  const cloud = await getProjectCloudDirectory(prisma, run, projectId, {
    id: runId,
    threadId: run.threadId,
    taskId: run.taskId,
    workerId,
    fence,
  });
  return cloud?.available ? cloud : null;
}

function bindingReference(binding: BoundDirectory) {
  return "deviceId" in binding
    ? { deviceId: binding.deviceId, grantId: binding.grantId }
    : { computerId: binding.computerId, grantId: binding.grantId };
}

function matchesBinding(reference: unknown, binding: BoundDirectory | null) {
  if (!binding || !reference || typeof reference !== "object") return false;
  return Object.entries(bindingReference(binding)).every(
    ([name, value]) => (reference as Record<string, unknown>)[name] === value,
  );
}

function parseFile(name: string, args: Record<string, unknown>) {
  if ("operation" in args) return ProjectFileOperationSchema.safeParse(null);
  const operation =
    name === PROJECT_FILE_READ
      ? "read"
      : name === PROJECT_FILE_LIST
        ? "list"
        : name === PROJECT_FILE_SEARCH
          ? "search"
          : name === PROJECT_FILE_CREATE
            ? "create"
            : "update";
  return ProjectFileOperationSchema.safeParse({ ...args, operation });
}

export async function prepareProjectFile(ctx: RunContext, request: ToolRequest) {
  if (isSubagentToolExecution(request.executionId))
    return { error: "Only the main project run can request project files." };
  const { projectDirectory, ...savedArgs } = request.args;
  const file = parseFile(request.name, request.approvedEffectKey ? savedArgs : request.args);
  if (!file.success)
    return {
      error:
        "Use a valid project-relative path and UTF-8 text; updates must include the SHA-256 from the last read.",
    };
  const binding = await liveBinding(ctx);
  ctx.context.signal.throwIfAborted();
  if (!binding || !projectFileToolAllowed(request.name, binding.intent))
    return { error: DIRECTORY_UNAVAILABLE };
  if (request.approvedEffectKey && !matchesBinding(projectDirectory, binding))
    return {
      error: "The project directory changed after approval. Ask the owner to review a new request.",
    };
  const { operation, ...fileArgs } = file.data;
  request.args = {
    ...fileArgs,
    projectDirectory: bindingReference(binding),
  };
  request.effectRequest = request.args;
  const windows = "deviceId" in binding;
  request.fleetSummary = {
    title:
      operation === "list"
        ? "List this project folder?"
        : operation === "search"
          ? "Search this project folder?"
          : operation === "read"
            ? "Read this project file?"
            : operation === "create"
              ? "Create this project file?"
              : "Update this project file?",
    lines: [
      `Execution location: ${windows ? "Windows" : "Cloud computer"}`,
      `Authorized folder: ${windows ? binding.directoryName : binding.folder.path}`,
      `${operation === "list" || operation === "search" ? "Folder" : "File"}: ${file.data.path || "."}`,
      ...(file.data.operation === "search" ? [`Query: ${file.data.query}`] : []),
      operation === "list"
        ? "Lists immediate file and folder names from this authorized directory and shares the paths with this conversation's AI model."
        : operation === "search"
          ? "Searches bounded UTF-8 text files inside this authorized directory and shares matching file paths and line excerpts with this conversation's AI model."
          : operation === "read"
            ? "The file text will be shared with this conversation's AI model."
            : operation === "create"
              ? "Creates a new Markdown file and saves a downloadable copy in this project chat."
              : "Replaces the existing file only if it still matches the last-read SHA-256; saves a downloadable copy in this project chat.",
    ],
    onceOnly: true,
  };
}

async function runProjectFile(ctx: RunContext, call: ToolCall) {
  const { signal } = ctx.context;
  const { projectDirectory, ...args } = call.args;
  const file = parseFile(call.name, args);
  const binding = await liveBinding(ctx);
  signal.throwIfAborted();
  const projectId = ctx.run.projectWorkspaceId;
  if (
    !file.success ||
    !projectId ||
    !binding ||
    !matchesBinding(projectDirectory, binding) ||
    !projectFileToolAllowed(call.name, binding.intent) ||
    !call.applied ||
    !call.claimedEffect ||
    call.bypassApproval
  )
    return call.finish({ error: DIRECTORY_UNAVAILABLE });

  const effect = call.applied.effect;
  const inFlight = new AbortController();
  const requestSignal = AbortSignal.any([signal, inFlight.signal]);
  let checking = false;
  const check = setInterval(() => {
    if (checking || requestSignal.aborted) return;
    checking = true;
    void liveBinding(ctx)
      .then(
        (current) => {
          if (!matchesBinding(projectDirectory, current)) inFlight.abort();
        },
        () => inFlight.abort(),
      )
      .finally(() => {
        checking = false;
      });
  }, BINDING_CHECK_INTERVAL_MS);
  let result: ProjectFileResult;
  try {
    result = await dispatchProjectFile(ctx, binding, projectId, file.data, requestSignal);
    requestSignal.throwIfAborted();
    if (!matchesOperation(file.data, result)) throw new Error("Mismatched project file result");
  } catch (error) {
    const windows = "deviceId" in binding;
    const cloudRefusal =
      !windows && error instanceof NativeProjectFileDispatchError ? error.reason : undefined;
    if (cloudRefusal === "generation_changed") {
      signal.throwIfAborted();
      return call.finish({
        error:
          "The cloud computer has restarted. Reconnect the project directory and request a new approval.",
      });
    }
    const offline = windows
      ? error instanceof UserDeviceNotConnectedError
      : cloudRefusal === "offline";
    if (offline && effect.status === "approved") {
      signal.throwIfAborted();
      if (inFlight.signal.aborted) return call.finish({ error: DIRECTORY_UNAVAILABLE });
      return waitForProjectDevice(ctx, call, effect, windows ? "Windows 电脑" : "云电脑");
    }
    if (file.data.operation === "create" || file.data.operation === "update") {
      const uncertain = await settleUncertainEffect(ctx.deps.prisma, effect.id, call.name);
      signal.throwIfAborted();
      return uncertain;
    }
    signal.throwIfAborted();
    return call.finish({
      error: "The bound computer did not complete the project directory request.",
    });
  } finally {
    clearInterval(check);
  }

  if (result.operation === "conflict") {
    const completed = await call.persistEffectResult({ conflict: true, sha256: result.sha256 });
    signal.throwIfAborted();
    return completed
      ? {
          conflict: true,
          sha256: result.sha256,
          message: "The project file changed after it was read. Read it again before updating.",
        }
      : { error: "The file conflict could not be recorded. Read the file again before retrying." };
  }
  if (result.operation === "create" || result.operation === "update") {
    const completed =
      file.data.operation === "create" || file.data.operation === "update"
        ? await publishProjectFile(ctx, call, binding, file.data, result.bytes)
        : await call.finish({ error: "The bound computer returned a mismatched result." });
    signal.throwIfAborted();
    return completed;
  }
  if (result.operation === "list") {
    const completed = {
      listed: true,
      entries: result.entries.length,
      truncated: result.truncated,
    };
    const durable = await call.persistEffectResult(completed);
    const current = await liveBinding(ctx);
    signal.throwIfAborted();
    if (!matchesBinding(projectDirectory, current)) return { error: DIRECTORY_UNAVAILABLE };
    return durable
      ? { ...completed, entries: result.entries }
      : {
          error: "Directory listing could not be recorded. Request a new approval before retrying.",
        };
  }
  if (result.operation === "search") {
    const completed = {
      searched: true,
      matches: result.matches.length,
      truncated: result.truncated,
    };
    const durable = await call.persistEffectResult(completed);
    const current = await liveBinding(ctx);
    signal.throwIfAborted();
    if (!matchesBinding(projectDirectory, current)) return { error: DIRECTORY_UNAVAILABLE };
    return durable
      ? { ...completed, matches: result.matches }
      : {
          error: "Directory search could not be recorded. Request a new approval before retrying.",
        };
  }
  const completed = {
    read: true,
    bytes: Buffer.byteLength(result.text, "utf8"),
    sha256: result.sha256 ?? textSha256(result.text),
  };
  const durable = await call.persistEffectResult(completed);
  const current = await liveBinding(ctx);
  signal.throwIfAborted();
  if (!matchesBinding(projectDirectory, current)) return { error: DIRECTORY_UNAVAILABLE };
  if (!durable)
    return { error: "File read could not be recorded. Request a new approval to read it again." };
  return { ...completed, text: result.text };
}

export async function waitForProjectDevice(
  ctx: RunContext,
  call: ToolCall,
  effect: NonNullable<ToolCall["applied"]>["effect"],
  deviceName: "Windows 电脑" | "云电脑",
) {
  const { deps, run, runId, workerId, fence, attempt, context } = ctx;
  await persistTurnCheckpoint(ctx, call.executionId);
  context.signal.throwIfAborted();
  const committed = await runAsTenant(run, () =>
    deps.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM threads WHERE id = ${run.threadId} FOR UPDATE`;
      context.signal.throwIfAborted();
      const now = new Date();
      const wakeAt = new Date(now.getTime() + DEVICE_RETRY_DELAY_MS);
      const released = await tx.run.updateMany({
        where: {
          id: runId,
          status: "running",
          leaseOwner: workerId,
          leaseFence: fence,
          leaseExpiresAt: { gt: now },
        },
        data: { status: "queued", wakeAt, leaseOwner: null, leaseExpiresAt: null },
      });
      if (released.count !== 1) return null;
      const restored = await tx.externalEffect.updateMany({
        where: { id: effect.id, runId, status: "executing" },
        data: { status: "approved", result: WAITING_FOR_DEVICE },
      });
      const interrupted = await tx.attempt.updateMany({
        where: { id: attempt.id, runId, fence, status: "running" },
        data: { status: "interrupted", finishedAt: now },
      });
      if (restored.count !== 1 || interrupted.count !== 1) {
        throw new Error("Could not save the project device wait");
      }
      const notified = (effect.result as { waitingForDevice?: boolean } | null)?.waitingForDevice;
      const notice = notified
        ? undefined
        : await persistMessageInTransaction(
            tx,
            run,
            "bot",
            [
              {
                kind: "text",
                text: `正在等待绑定的${deviceName}上线。原目录授权有效时，连接恢复后将继续。`,
              },
            ],
            false,
            undefined,
            false,
            { owner: workerId, fence },
          );
      const waiting = await appendEventInTransaction(tx, {
        type: "run.queued",
        runId,
        spaceId: run.spaceId,
        threadId: run.threadId,
        botId: run.botId,
        lease: { owner: workerId, fence },
        payload: {
          reason: "project_device_offline",
          trigger: run.trigger,
          wakeAt: wakeAt.toISOString(),
        },
      });
      return { wakeAt, seq: waiting.seq, firstResponseRunId: notice?.firstResponseRunId };
    }),
  );
  const paused = pauseForApproval(ctx);
  if (!committed) return paused;
  await deps.jobs
    .enqueue({ ...runContinueJob(runId), availableAt: committed.wakeAt })
    .catch((error) => getLogger().error("project device continuation enqueue", error));
  await deps.events
    .notify(run.threadId, committed.seq, committed.firstResponseRunId)
    .catch((error) => getLogger().error("project device wait notification", error));
  return paused;
}

async function dispatchProjectFile(
  ctx: RunContext,
  binding: BoundDirectory,
  projectId: string,
  file: ProjectFileOperation,
  signal: AbortSignal,
): Promise<ProjectFileResult> {
  if (!("deviceId" in binding)) {
    const sandbox = ctx.deps.sandbox;
    if (!sandbox.executeProjectFile) throw new Error(DIRECTORY_UNAVAILABLE);
    return ProjectFileResultSchema.parse(
      await sandbox.executeProjectFile(
        {
          id: binding.computerId,
          kind: "native-linux",
          botId: binding.homeKey,
          providerRef: binding.providerRef,
        },
        binding.folder,
        file,
        { ...ctx.context, botId: binding.homeKey, signal },
      ),
    );
  }

  const devices = ctx.deps.userDevices;
  if (!devices) throw new Error(DIRECTORY_UNAVAILABLE);
  let result: ProjectFileResult | undefined;
  for await (const raw of devices.request<unknown>(
    ctx.run.userId,
    { method: "projectFile", projectId, spaceId: ctx.run.spaceId, grantId: binding.grantId, file },
    signal,
    binding.deviceId,
  )) {
    if (result) throw new Error("Multiple project file results");
    result = ProjectFileResultSchema.parse(raw);
  }
  if (!result) throw new Error("Missing project file result");
  return result;
}

function matchesOperation(file: ProjectFileOperation, result: ProjectFileResult) {
  return file.operation === "list"
    ? result.operation === "list" &&
        result.entries.length <= 500 &&
        result.entries.every((entry, index) => {
          const prefix = file.path ? `${file.path}/` : "";
          const relative = entry.path.slice(prefix.length);
          return (
            entry.path.startsWith(prefix) &&
            !relative.includes("/") &&
            result.entries.findIndex((candidate) => candidate.path === entry.path) === index
          );
        })
    : file.operation === "search"
      ? result.operation === "search" &&
        result.matches.length <= 50 &&
        result.matches.every((match) => {
          const prefix = file.path ? `${file.path}/` : "";
          return match.path.startsWith(prefix) && match.path.length > prefix.length;
        })
      : file.operation === "read"
        ? result.operation === "read" &&
          (result.sha256 === undefined || result.sha256 === textSha256(result.text))
        : file.operation === "create"
          ? result.operation === "create" && result.bytes === Buffer.byteLength(file.text, "utf8")
          : result.operation === "conflict"
            ? /^[a-f0-9]{64}$/u.test(result.sha256)
            : result.operation === "update" &&
              result.bytes === Buffer.byteLength(file.text, "utf8") &&
              result.sha256 === textSha256(file.text);
}

async function publishProjectFile(
  ctx: RunContext,
  call: ToolCall,
  binding: BoundDirectory,
  file: Extract<ProjectFileOperation, { operation: "create" | "update" }>,
  bytes: number,
) {
  const { deps, run, thread, workerId, fence } = ctx;
  const { signal } = ctx.context;
  const completed =
    file.operation === "create"
      ? { created: true as const, bytes }
      : { updated: true as const, bytes, sha256: textSha256(file.text) };
  const projectWorkspaceId = run.projectWorkspaceId;
  const effectId = call.applied?.effect.id;
  if (!deps.artifacts || !projectWorkspaceId || !effectId)
    return call.finish({ ...completed, downloadAvailable: false });

  const scope = { spaceId: run.spaceId, userId: run.userId, projectWorkspaceId };
  let notification: { eventSeq: number; firstResponseRunId?: string } | undefined;
  try {
    signal.throwIfAborted();
    const attached = await runAsTenant(scope, () =>
      attachWorkspaceFileToThread(
        {
          prisma: deps.prisma,
          artifacts: deps.artifacts!,
          maxUploadSizeBytes: deps.maxUploadSizeBytes,
        },
        {
          ...scope,
          runId: run.id,
          botId: run.botId,
          groupId: thread.groupId ?? undefined,
          filePath: file.path,
          bytes: Buffer.from(file.text, "utf8"),
          operationId: call.effectKey,
          signal,
          async onAttached(tx, artifact) {
            signal.throwIfAborted();
            notification = await persistMessageInTransaction(
              tx,
              run,
              "bot",
              [messageBlockForArtifact(artifact)],
              undefined,
              undefined,
              false,
              { owner: workerId, fence },
            );
            const current = await liveBinding(ctx, tx);
            signal.throwIfAborted();
            if (!matchesBinding(bindingReference(binding), current))
              throw new Error(DIRECTORY_UNAVAILABLE);
            const effect = await tx.externalEffect.updateMany({
              where: { id: effectId, runId: run.id, status: "executing" },
              data: { status: "completed", result: { ...completed, artifactId: artifact.id } },
            });
            if (effect.count !== 1) throw new Error("Project file effect is no longer active");
          },
        },
      ),
    );
    if (notification)
      await deps.events
        .notify(thread.id, notification.eventSeq, notification.firstResponseRunId)
        .catch(() =>
          getLogger().warn("project file artifact notification failed", { runId: run.id }),
        );
    return { ...completed, artifactId: attached.artifactId };
  } catch {
    return call.finish({ ...completed, downloadAvailable: false });
  }
}

export const projectFileHandlers: ToolHandlers = {
  [PROJECT_FILE_LIST]: runProjectFile,
  [PROJECT_FILE_SEARCH]: runProjectFile,
  [PROJECT_FILE_READ]: runProjectFile,
  [PROJECT_FILE_CREATE]: runProjectFile,
  [PROJECT_FILE_UPDATE]: runProjectFile,
};
