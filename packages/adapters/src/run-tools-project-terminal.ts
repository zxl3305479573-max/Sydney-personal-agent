import type { ProjectWindowsTerminalResult } from "@rakazo/contracts";
import {
  ProjectWindowsDiagnosticSchema,
  ProjectWindowsTerminalResultSchema,
} from "@rakazo/contracts";
import { getProjectWorkspace, getRunningProjectDirectory } from "@rakazo/db";
import type { RunContext } from "./run-context.js";
import { isSubagentToolExecution } from "./run-effects.js";
import type { ToolCall } from "./run-tool-gate.js";
import type { ToolRequest } from "./run-tool-request.js";

const TERMINAL_UNAVAILABLE = "The project's Windows terminal authorization is unavailable.";

async function liveWindowsTerminal(ctx: RunContext) {
  const { deps, run, runId, workerId, fence, source, context } = ctx;
  if (
    !run.projectWorkspaceId ||
    !deps.userDevices ||
    !source.ownerStartedRun ||
    source.messagingChannelRun ||
    source.userComputerOwner !== run.userId ||
    context.signal.aborted
  )
    return null;
  const [binding, project] = await Promise.all([
    getRunningProjectDirectory(deps.prisma, {
      projectId: run.projectWorkspaceId,
      spaceId: run.spaceId,
      userId: run.userId,
      runId,
      threadId: run.threadId,
      taskId: run.taskId,
      workerId,
      fence,
    }),
    getProjectWorkspace(deps.prisma, run, run.projectWorkspaceId),
  ]);
  context.signal.throwIfAborted();
  return binding && project ? { binding, project, devices: deps.userDevices } : null;
}

export async function prepareProjectWindowsTerminal(ctx: RunContext, request: ToolRequest) {
  if (isSubagentToolExecution(request.executionId)) return { error: TERMINAL_UNAVAILABLE };
  const { command, ...extra } = request.args;
  const diagnostic = ProjectWindowsDiagnosticSchema.safeParse(command);
  if (!diagnostic.success || (!request.approvedEffectKey && Object.keys(extra).length > 0))
    return { error: "Choose the fixed Windows diagnostic ver or chcp." };
  const target = await liveWindowsTerminal(ctx);
  if (!target) return { error: TERMINAL_UNAVAILABLE };
  const { deviceId, grantId, deviceName } = target.binding;
  if (request.approvedEffectKey && (extra.deviceId !== deviceId || extra.grantId !== grantId))
    return { error: TERMINAL_UNAVAILABLE };
  request.args = { command: diagnostic.data, deviceId, grantId };
  request.effectRequest = request.args;
  request.fleetSummary = {
    title: "Run this Windows diagnostic?",
    lines: [
      `Execution location: ${deviceName} (Windows)`,
      `Command: ${diagnostic.data}`,
      "Scope: read the Windows version or console code page. This device also asks for native confirmation.",
    ],
    onceOnly: true,
  };
}

export async function runProjectWindowsTerminal(ctx: RunContext, call: ToolCall) {
  const diagnostic = ProjectWindowsDiagnosticSchema.safeParse(call.args.command);
  const { signal } = ctx.context;
  if (!diagnostic.success || !call.applied || !call.claimedEffect || call.bypassApproval)
    return call.finish({ error: TERMINAL_UNAVAILABLE });
  const target = await liveWindowsTerminal(ctx);
  const matchesApproval = (current: Awaited<ReturnType<typeof liveWindowsTerminal>>) =>
    current &&
    current.binding.deviceId === call.args.deviceId &&
    current.binding.grantId === call.args.grantId;
  if (!target || !matchesApproval(target)) return call.finish({ error: TERMINAL_UNAVAILABLE });

  const pending = new AbortController();
  const requestSignal = AbortSignal.any([signal, pending.signal]);
  let checking = false;
  const timer = setInterval(() => {
    if (checking || requestSignal.aborted) return;
    checking = true;
    void liveWindowsTerminal(ctx)
      .then(
        (current) => {
          if (!matchesApproval(current)) pending.abort();
        },
        () => pending.abort(),
      )
      .finally(() => {
        checking = false;
      });
  }, 1_000);
  let result: ProjectWindowsTerminalResult | undefined;
  try {
    for await (const response of target.devices.request<unknown>(
      ctx.run.userId,
      {
        method: "projectWindowsTerminal",
        spaceId: ctx.run.spaceId,
        projectId: target.project.id,
        projectName: target.project.name,
        runId: ctx.runId,
        command: diagnostic.data,
      },
      requestSignal,
      target.binding.deviceId,
    )) {
      if (result) throw new Error("Multiple Windows diagnostic responses");
      result = ProjectWindowsTerminalResultSchema.parse(response);
    }
    requestSignal.throwIfAborted();
  } catch {
    signal.throwIfAborted();
    return call.finish({
      error: "The Windows diagnostic was stopped or its result is unconfirmed.",
    });
  } finally {
    clearInterval(timer);
  }
  const current = await liveWindowsTerminal(ctx);
  if (!matchesApproval(current)) return call.finish({ error: TERMINAL_UNAVAILABLE });
  if (!result || result.status === "declined")
    return call.finish({
      error: result
        ? "The Windows device declined."
        : "The Windows device did not confirm a result.",
    });
  return call.finish({ command: diagnostic.data, stdout: result.stdout });
}
