import type { ProjectWindowsCommandResult } from "@rakazo/contracts";
import { ProjectWindowsCommandResultSchema, ProjectWindowsCommandSchema } from "@rakazo/contracts";
import { getProjectWorkspace, getRunningProjectDirectory } from "@rakazo/db";
import { settleUncertainEffect } from "./approval-effect.js";
import type { RunContext } from "./run-context.js";
import { isSubagentToolExecution } from "./run-effects.js";
import { PROJECT_WINDOWS_COMMAND } from "./run-project-policy.js";
import type { ToolCall } from "./run-tool-gate.js";
import type { ToolRequest } from "./run-tool-request.js";
import { waitForProjectDevice } from "./run-tools-project-files.js";
import { UserDeviceNotConnectedError } from "./user-device-gateway.js";

const COMMAND_UNAVAILABLE =
  "The isolated project command is unavailable on the bound Windows computer.";

async function liveWindowsBinding(ctx: RunContext) {
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

export async function prepareProjectWindowsCommand(ctx: RunContext, request: ToolRequest) {
  if (isSubagentToolExecution(request.executionId)) return { error: COMMAND_UNAVAILABLE };
  const { deviceId, grantId, ...args } = request.args;
  if (
    !request.approvedEffectKey &&
    Object.keys(request.args).some((key) => !["argv", "inputFiles", "timeoutMs"].includes(key))
  )
    return { error: "The project command contains unsupported fields." };
  const parsed = ProjectWindowsCommandSchema.safeParse(args);
  if (!parsed.success)
    return {
      error:
        "Provide argv, distinct project-relative UTF-8 input files, and a timeout up to seven seconds.",
    };
  const target = await liveWindowsBinding(ctx);
  if (
    !target ||
    (request.approvedEffectKey &&
      (deviceId !== target.binding.deviceId || grantId !== target.binding.grantId))
  )
    return { error: COMMAND_UNAVAILABLE };
  request.args = {
    ...parsed.data,
    deviceId: target.binding.deviceId,
    grantId: target.binding.grantId,
  };
  request.effectRequest = request.args;
  request.fleetSummary = {
    title: "Run this isolated Windows project command?",
    lines: [
      `Execution location: ${target.binding.deviceName} (Windows, isolated WSL 2)`,
      `Command: ${JSON.stringify(parsed.data.argv)}`,
      `Input files: ${parsed.data.inputFiles.length ? parsed.data.inputFiles.join(", ") : "none"}`,
      "The Windows device checks its isolated WSL 2 runtime before asking for native confirmation. If it is offline, this same run waits for the bound device; if the runtime is unavailable, no command starts. Only selected UTF-8 file copies enter a temporary sandbox without network or Windows mounts, and changes are discarded.",
    ],
    onceOnly: true,
  };
}

export async function runProjectWindowsCommand(ctx: RunContext, call: ToolCall) {
  const { signal } = ctx.context;
  const { deviceId, grantId, ...args } = call.args;
  const command = ProjectWindowsCommandSchema.safeParse(args);
  if (!command.success || !call.applied || !call.claimedEffect || call.bypassApproval)
    return call.finish({ error: COMMAND_UNAVAILABLE });
  const target = await liveWindowsBinding(ctx);
  const matches = (current: Awaited<ReturnType<typeof liveWindowsBinding>>) =>
    current && current.binding.deviceId === deviceId && current.binding.grantId === grantId;
  if (!target || !matches(target)) return call.finish({ error: COMMAND_UNAVAILABLE });

  const pending = new AbortController();
  const requestSignal = AbortSignal.any([signal, pending.signal]);
  let checking = false;
  const timer = setInterval(() => {
    if (checking || requestSignal.aborted) return;
    checking = true;
    void liveWindowsBinding(ctx)
      .then(
        (current) => {
          if (!matches(current)) pending.abort();
        },
        () => pending.abort(),
      )
      .finally(() => {
        checking = false;
      });
  }, 1_000);
  let result: ProjectWindowsCommandResult | undefined;
  try {
    for await (const raw of target.devices.request<unknown>(
      ctx.run.userId,
      {
        method: "projectWindowsCommand",
        spaceId: ctx.run.spaceId,
        projectId: target.project.id,
        projectName: target.project.name,
        runId: ctx.runId,
        grantId: target.binding.grantId,
        command: command.data,
      },
      requestSignal,
      target.binding.deviceId,
    )) {
      if (result) throw new Error("Multiple Windows project command responses");
      result = ProjectWindowsCommandResultSchema.parse(raw);
    }
    requestSignal.throwIfAborted();
  } catch (error) {
    signal.throwIfAborted();
    if (pending.signal.aborted) return call.finish({ error: COMMAND_UNAVAILABLE });
    if (error instanceof UserDeviceNotConnectedError)
      return waitForProjectDevice(ctx, call, call.applied.effect, "Windows 电脑");
    const uncertain = await settleUncertainEffect(
      ctx.deps.prisma,
      call.applied.effect.id,
      PROJECT_WINDOWS_COMMAND,
      command.data,
    );
    signal.throwIfAborted();
    return uncertain;
  } finally {
    clearInterval(timer);
  }

  const current = await liveWindowsBinding(ctx);
  signal.throwIfAborted();
  if (!matches(current) || !result) {
    const uncertain = await settleUncertainEffect(
      ctx.deps.prisma,
      call.applied.effect.id,
      PROJECT_WINDOWS_COMMAND,
      command.data,
    );
    signal.throwIfAborted();
    return uncertain;
  }
  if (result.status === "declined")
    return call.finish({ error: "The Windows computer declined this command." });
  if (result.status === "unavailable")
    return call.finish({
      error: "The isolated WSL project runtime is unavailable. No command was started.",
    });
  const completed = await call.persistEffectResult({
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  signal.throwIfAborted();
  return completed
    ? { code: result.code, stdout: result.stdout, stderr: result.stderr }
    : {
        error:
          "The command result could not be recorded. Do not retry until the conversation state is checked.",
      };
}
