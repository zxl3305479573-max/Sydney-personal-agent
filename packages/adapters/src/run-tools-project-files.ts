import type { ProjectDirectoryBinding, ProjectFileOperation, ProjectFileResult } from "@rakazo/contracts";
import { ProjectFileOperationSchema, ProjectFileResultSchema } from "@rakazo/contracts";
import { messageBlockForArtifact } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { getProjectCloudDirectory, getRunningProjectDirectory, runAsTenant } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { settleUncertainEffect } from "./approval-effect.js";
import type { RunContext } from "./run-context.js";
import { isSubagentToolExecution } from "./run-effects.js";
import { persistMessageInTransaction } from "./run-messages.js";
import {
  PROJECT_FILE_CREATE,
  PROJECT_FILE_READ,
  projectFileToolAllowed,
} from "./run-project-policy.js";
import type { ToolCall, ToolHandlers } from "./run-tool-gate.js";
import type { ToolRequest } from "./run-tool-request.js";
import { attachWorkspaceFileToThread } from "./thread-artifacts.js";

const DIRECTORY_UNAVAILABLE = "The current project directory authorization is unavailable.";
const BINDING_CHECK_INTERVAL_MS = 1_000;

type CloudBinding = NonNullable<Awaited<ReturnType<typeof getProjectCloudDirectory>>>;
type BoundDirectory = ProjectDirectoryBinding | CloudBinding;

async function liveBinding(ctx: RunContext, prisma: Pick<PrismaClient, "$queryRaw"> = ctx.deps.prisma) {
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
    id: runId, threadId: run.threadId, taskId: run.taskId, workerId, fence,
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
  const operation = name === PROJECT_FILE_READ ? "read" : "create";
  return ProjectFileOperationSchema.safeParse({ ...args, operation });
}

export async function prepareProjectFile(ctx: RunContext, request: ToolRequest) {
  if (isSubagentToolExecution(request.executionId))
    return { error: "Only the main project run can request project files." };
  const { projectDirectory, ...savedArgs } = request.args;
  const file = parseFile(request.name, request.approvedEffectKey ? savedArgs : request.args);
  if (!file.success)
    return { error: "Use a valid project-relative path and, for creation, UTF-8 Markdown text." };
  const binding = await liveBinding(ctx);
  ctx.context.signal.throwIfAborted();
  if (!binding || !projectFileToolAllowed(request.name, binding.intent))
    return { error: DIRECTORY_UNAVAILABLE };
  if (request.approvedEffectKey && !matchesBinding(projectDirectory, binding))
    return { error: "The project directory changed after approval. Ask the owner to review a new request." };
  const { operation, ...fileArgs } = file.data;
  request.args = {
    ...fileArgs,
    projectDirectory: bindingReference(binding),
  };
  request.effectRequest = request.args;
  const windows = "deviceId" in binding;
  request.fleetSummary = {
    title: operation === "read" ? "Read this project file?" : "Create this project file?",
    lines: [
      `Execution location: ${windows ? "Windows" : "Cloud computer"}`,
      `Authorized folder: ${windows ? binding.directoryName : binding.folder.path}`,
      `File: ${file.data.path}`,
      operation === "read"
        ? "The file text will be shared with this conversation's AI model."
        : "Creates a new Markdown file and saves a downloadable copy in this project chat.",
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
    !file.success || !projectId || !binding ||
    !matchesBinding(projectDirectory, binding) ||
    !projectFileToolAllowed(call.name, binding.intent) ||
    !call.applied || !call.claimedEffect || call.bypassApproval
  ) return call.finish({ error: DIRECTORY_UNAVAILABLE });

  const inFlight = new AbortController();
  const requestSignal = AbortSignal.any([signal, inFlight.signal]);
  let checking = false;
  const check = setInterval(() => {
    if (checking || requestSignal.aborted) return;
    checking = true;
    void liveBinding(ctx).then(
      (current) => {
        if (!matchesBinding(projectDirectory, current)) inFlight.abort();
      },
      () => inFlight.abort(),
    ).finally(() => {
      checking = false;
    });
  }, BINDING_CHECK_INTERVAL_MS);
  let result: ProjectFileResult;
  try {
    result = await dispatchProjectFile(ctx, binding, projectId, file.data, requestSignal);
    requestSignal.throwIfAborted();
    if (!matchesOperation(file.data, result)) throw new Error("Mismatched project file result");
  } catch {
    if (file.data.operation === "create") {
      const uncertain = await settleUncertainEffect(ctx.deps.prisma, call.applied.effect.id, call.name);
      signal.throwIfAborted();
      return uncertain;
    }
    signal.throwIfAborted();
    return call.finish({ error: "The bound computer did not complete the file read." });
  } finally {
    clearInterval(check);
  }

  if (result.operation === "create") {
    const completed = file.data.operation === "create"
      ? await publishProjectFile(ctx, call, binding, file.data, result.bytes)
      : await call.finish({ error: "The bound computer returned a mismatched result." });
    signal.throwIfAborted();
    return completed;
  }
  const completed = { read: true, bytes: Buffer.byteLength(result.text, "utf8") };
  const durable = await call.persistEffectResult(completed);
  const current = await liveBinding(ctx);
  signal.throwIfAborted();
  if (!matchesBinding(projectDirectory, current)) return { error: DIRECTORY_UNAVAILABLE };
  if (!durable) return { error: "File read could not be recorded. Request a new approval to read it again." };
  return { ...completed, text: result.text };
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
    return ProjectFileResultSchema.parse(await sandbox.executeProjectFile(
      {
        id: binding.computerId, kind: "native-linux", botId: binding.homeKey,
        providerRef: binding.providerRef,
      },
      binding.folder, file, { ...ctx.context, botId: binding.homeKey, signal },
    ));
  }

  const devices = ctx.deps.userDevices;
  if (!devices) throw new Error(DIRECTORY_UNAVAILABLE);
  let result: ProjectFileResult | undefined;
  for await (const raw of devices.request<unknown>(
    ctx.run.userId,
    { method: "projectFile", projectId, spaceId: ctx.run.spaceId, grantId: binding.grantId, file },
    signal, binding.deviceId,
  )) {
    if (result) throw new Error("Multiple project file results");
    result = ProjectFileResultSchema.parse(raw);
  }
  if (!result) throw new Error("Missing project file result");
  return result;
}

function matchesOperation(
  file: ProjectFileOperation,
    result: ProjectFileResult,
) {
  return file.operation === "read"
    ? result.operation === "read"
    : result.operation === "create" && result.bytes === Buffer.byteLength(file.text, "utf8");
}

async function publishProjectFile(
  ctx: RunContext,
  call: ToolCall,
  binding: BoundDirectory,
  file: Extract<ProjectFileOperation, { operation: "create" }>,
  bytes: number,
) {
  const { deps, run, thread, workerId, fence } = ctx;
  const { signal } = ctx.context;
  const completed = { created: true, bytes };
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
        { prisma: deps.prisma, artifacts: deps.artifacts!, maxUploadSizeBytes: deps.maxUploadSizeBytes },
        {
          ...scope, runId: run.id, botId: run.botId, groupId: thread.groupId ?? undefined,
          filePath: file.path, bytes: Buffer.from(file.text, "utf8"), operationId: call.effectKey,
          signal,
          async onAttached(tx, artifact) {
            signal.throwIfAborted();
            notification = await persistMessageInTransaction(
              tx, run, "bot", [messageBlockForArtifact(artifact)], undefined, undefined,
              false, { owner: workerId, fence },
            );
            const current = await liveBinding(ctx, tx);
            signal.throwIfAborted();
            if (!matchesBinding(bindingReference(binding), current)) throw new Error(DIRECTORY_UNAVAILABLE);
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
      await deps.events.notify(thread.id, notification.eventSeq, notification.firstResponseRunId)
        .catch(() => getLogger().warn("project file artifact notification failed", { runId: run.id }));
    return { ...completed, artifactId: attached.artifactId };
  } catch {
    return call.finish({ ...completed, downloadAvailable: false });
  }
}

export const projectFileHandlers: ToolHandlers = {
  [PROJECT_FILE_READ]: runProjectFile,
  [PROJECT_FILE_CREATE]: runProjectFile,
};
