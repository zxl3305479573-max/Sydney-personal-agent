import {
  ProjectWindowsDiagnosticSchema,
  ProjectWindowsTerminalResultSchema,
} from "@rakazo/contracts";
import type { ProjectWindowsTerminalResult } from "@rakazo/contracts";
import { getProjectWorkspace } from "@rakazo/db";
import { isSubagentToolExecution } from "./run-effects.js";
import type { RunContext } from "./run-context.js";
import type { ToolCall } from "./run-tool-gate.js";
import type { ToolRequest } from "./run-tool-request.js";

const TERMINAL_UNAVAILABLE = "The project's Windows terminal authorization is unavailable.";

async function liveWindowsTerminal(ctx: RunContext) {
  const { deps, run, source, context } = ctx;
  if (!run.projectWorkspaceId || !deps.userDevices || !source.ownerStartedRun ||
    source.messagingChannelRun || source.userComputerOwner !== run.userId || context.signal.aborted)
    return null;
  const [device, project, expiry] = await Promise.all([
    deps.userDevices.connected(run.userId).catch(() => null),
    getProjectWorkspace(deps.prisma, run, run.projectWorkspaceId),
    context.nativeRunLease?.validate(),
  ]);
  context.signal.throwIfAborted();
  return device?.platform === "win32" && project && expiry && expiry > Date.now()
    ? { device, project, devices: deps.userDevices }
    : null;
}

export async function prepareProjectWindowsTerminal(ctx: RunContext, request: ToolRequest) {
  if (isSubagentToolExecution(request.executionId)) return { error: TERMINAL_UNAVAILABLE };
  const { command, deviceId, ...extra } = request.args;
  const diagnostic = ProjectWindowsDiagnosticSchema.safeParse(command);
  if (!diagnostic.success || Object.keys(extra).length || (!request.approvedEffectKey && "deviceId" in request.args))
    return { error: "Choose the fixed Windows diagnostic ver or chcp." };
  const target = await liveWindowsTerminal(ctx);
  if (!target || (request.approvedEffectKey && deviceId !== target.device.deviceId))
    return { error: TERMINAL_UNAVAILABLE };
  request.args = { command: diagnostic.data, deviceId: target.device.deviceId };
  request.effectRequest = request.args;
  request.fleetSummary = {
    title: "Run this Windows diagnostic?",
    lines: [
      `Execution location: ${target.device.name} (Windows)`,
      `Command: ${diagnostic.data}`,
      "Scope: read the Windows version or console code page. This device also asks for native confirmation.",
    ],
    onceOnly: true,
  };
}

export async function runProjectWindowsTerminal(ctx: RunContext, call: ToolCall) {
  const diagnostic = ProjectWindowsDiagnosticSchema.safeParse(call.args.command);
  const { signal, nativeRunLease } = ctx.context;
  if (!diagnostic.success || !nativeRunLease || !call.applied || !call.claimedEffect || call.bypassApproval)
    return call.finish({ error: TERMINAL_UNAVAILABLE });
  const target = await liveWindowsTerminal(ctx);
  if (!target || call.args.deviceId !== target.device.deviceId)
    return call.finish({ error: TERMINAL_UNAVAILABLE });

  const pending = new AbortController();
  const requestSignal = AbortSignal.any([signal, pending.signal]);
  let checking = false;
  const timer = setInterval(() => {
    if (checking || requestSignal.aborted) return;
    checking = true;
    void liveWindowsTerminal(ctx).then(
      (current) => { if (current?.device.deviceId !== target.device.deviceId) pending.abort(); },
      () => pending.abort(),
    ).finally(() => { checking = false; });
  }, 1_000);
  let result: ProjectWindowsTerminalResult | undefined;
  try {
    for await (const response of target.devices.request<unknown>(ctx.run.userId, {
      method: "projectWindowsTerminal",
      spaceId: ctx.run.spaceId,
      projectId: target.project.id,
      projectName: target.project.name,
      runId: ctx.runId,
      command: diagnostic.data,
    }, requestSignal, target.device.deviceId)) {
      if (result) throw new Error("Multiple Windows diagnostic responses");
      result = ProjectWindowsTerminalResultSchema.parse(response);
    }
    requestSignal.throwIfAborted();
  } catch {
    signal.throwIfAborted();
    return call.finish({ error: "The Windows diagnostic was stopped or its result is unconfirmed." });
  } finally {
    clearInterval(timer);
  }
  const current = await liveWindowsTerminal(ctx);
  if (current?.device.deviceId !== target.device.deviceId) return call.finish({ error: TERMINAL_UNAVAILABLE });
  if (!result || result.status === "declined")
    return call.finish({ error: result ? "The Windows device declined." : "The Windows device did not confirm a result." });
  return call.finish({ command: diagnostic.data, stdout: result.stdout });
}
