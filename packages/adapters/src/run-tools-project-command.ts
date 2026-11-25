import type { ProjectCloudCommandResult } from "@rakazo/contracts";
import {
  ProjectCloudCommandResultSchema,
  ProjectCloudCommandSchema,
} from "@rakazo/contracts";
import { getProjectCloudDirectory } from "@rakazo/db";
import { settleUncertainEffect } from "./approval-effect.js";
import { getLogger } from "@rakazo/logging";
import { NativeProjectFileDispatchError } from "./native-linux-sandbox.js";
import type { RunContext } from "./run-context.js";
import { isSubagentToolExecution } from "./run-effects.js";
import type { ToolCall } from "./run-tool-gate.js";
import type { ToolRequest } from "./run-tool-request.js";
import { PROJECT_CLOUD_COMMAND } from "./run-project-policy.js";
import { waitForProjectDevice } from "./run-tools-project-files.js";

const COMMAND_UNAVAILABLE = "The isolated project command is unavailable on the bound cloud computer.";
const BINDING_CHECK_INTERVAL_MS = 1_000;

type CloudBinding = NonNullable<Awaited<ReturnType<typeof getProjectCloudDirectory>>>;

async function liveCloudBinding(ctx: RunContext) {
  const { deps, run, runId, workerId, fence, context } = ctx;
  const projectId = run.projectWorkspaceId;
  if (
    !projectId || !deps.sandbox.executeProjectCommand || !deps.sandbox.projectCommandAvailable ||
    !ctx.source.ownerStartedRun || ctx.source.messagingChannelRun || context.signal.aborted
  ) return null;
  const binding = await getProjectCloudDirectory(deps.prisma, run, projectId, {
    id: runId, threadId: run.threadId, taskId: run.taskId, workerId, fence,
  });
  return binding?.available ? binding : null;
}

function commandComputer(binding: CloudBinding) {
  return {
    id: binding.computerId,
    kind: "native-linux" as const,
    botId: binding.homeKey,
    providerRef: binding.providerRef,
  };
}

function commandContext(ctx: RunContext, binding: CloudBinding, signal: AbortSignal) {
  return { ...ctx.context, botId: binding.homeKey, signal };
}

function matchesBinding(reference: unknown, binding: CloudBinding | null) {
  return Boolean(reference && typeof reference === "object" && binding &&
    (reference as Record<string, unknown>).computerId === binding.computerId &&
    (reference as Record<string, unknown>).grantId === binding.grantId);
}

export async function prepareProjectCloudCommand(ctx: RunContext, request: ToolRequest) {
  if (isSubagentToolExecution(request.executionId)) return { error: COMMAND_UNAVAILABLE };
  const { projectDirectory, ...input } = request.args;
  const parsed = ProjectCloudCommandSchema.safeParse(input);
  if (!parsed.success) return { error: "Provide a bounded argv array, distinct relative UTF-8 input files, and a timeout up to seven seconds." };
  const binding = await liveCloudBinding(ctx);
  ctx.context.signal.throwIfAborted();
  if (!binding || (request.approvedEffectKey && !matchesBinding(projectDirectory, binding)))
    return { error: COMMAND_UNAVAILABLE };
  const available = await ctx.deps.sandbox.projectCommandAvailable!(
    commandComputer(binding), commandContext(ctx, binding, AbortSignal.any([
      ctx.context.signal, AbortSignal.timeout(2_000),
    ])),
  ).catch(() => false);
  ctx.context.signal.throwIfAborted();
  if (!available) return { error: COMMAND_UNAVAILABLE };
  request.args = { ...parsed.data, projectDirectory: { computerId: binding.computerId, grantId: binding.grantId } };
  request.effectRequest = request.args;
  request.fleetSummary = {
    title: "Run this isolated project command?",
    lines: [
      `Execution location: dedicated cloud computer`,
      `Command: ${JSON.stringify(parsed.data.argv)}`,
      `Input files: ${parsed.data.inputFiles.length ? parsed.data.inputFiles.join(", ") : "none"}`,
      "The command runs without network or host-filesystem access in a temporary workspace. Changes are discarded when it exits.",
    ],
    onceOnly: true,
  };
}

export async function runProjectCloudCommand(ctx: RunContext, call: ToolCall) {
  const { signal } = ctx.context;
  const { projectDirectory, ...input } = call.args;
  const parsed = ProjectCloudCommandSchema.safeParse(input);
  if (!parsed.success || !call.applied || !call.claimedEffect || call.bypassApproval)
    return call.finish({ error: COMMAND_UNAVAILABLE });
  let binding = await liveCloudBinding(ctx);
  if (!matchesBinding(projectDirectory, binding)) return call.finish({ error: COMMAND_UNAVAILABLE });
  if (!await ctx.deps.sandbox.projectCommandAvailable!(
    commandComputer(binding!), commandContext(ctx, binding!, AbortSignal.any([
      signal, AbortSignal.timeout(2_000),
    ])),
  ).catch(() => false)) return call.finish({ error: COMMAND_UNAVAILABLE });

  const pending = new AbortController();
  const requestSignal = AbortSignal.any([signal, pending.signal]);
  let checking = false;
  const check = setInterval(() => {
    if (checking || requestSignal.aborted) return;
    checking = true;
    void liveCloudBinding(ctx).then(
      (current) => { if (!matchesBinding(projectDirectory, current)) pending.abort(); },
      () => pending.abort(),
    ).finally(() => { checking = false; });
  }, BINDING_CHECK_INTERVAL_MS);

  let result: ProjectCloudCommandResult;
  try {
    result = ProjectCloudCommandResultSchema.parse(await ctx.deps.sandbox.executeProjectCommand!(
      commandComputer(binding!), binding!.folder, parsed.data,
      commandContext(ctx, binding!, requestSignal),
    ));
    requestSignal.throwIfAborted();
    binding = await liveCloudBinding(ctx);
    requestSignal.throwIfAborted();
    if (!matchesBinding(projectDirectory, binding)) throw new Error(COMMAND_UNAVAILABLE);
  } catch (error) {
    signal.throwIfAborted();
    if (pending.signal.aborted) return call.finish({ error: COMMAND_UNAVAILABLE });
    if (error instanceof NativeProjectFileDispatchError && error.reason === "offline") {
      return waitForProjectDevice(ctx, call, call.applied.effect, "云电脑");
    }
    if (error instanceof NativeProjectFileDispatchError && error.reason === "generation_changed")
      return call.finish({ error: "The cloud computer restarted. Reconnect its project directory and approve a new command." });
    const uncertain = await settleUncertainEffect(
      ctx.deps.prisma,
      call.applied.effect.id,
      PROJECT_CLOUD_COMMAND,
      parsed.data,
    );
    signal.throwIfAborted();
    getLogger().warn("isolated project command result is uncertain", { runId: ctx.runId });
    return uncertain;
  } finally {
    clearInterval(check);
  }
  const durable = await call.persistEffectResult(result);
  signal.throwIfAborted();
  return durable ? result : { error: "The command result could not be recorded. Do not retry until the conversation state is checked." };
}
