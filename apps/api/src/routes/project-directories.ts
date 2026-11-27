import { ORPCError } from "@orpc/server";
import { UserDeviceOfflineError } from "@rakazo/adapters";
import type { Actor, ProjectDirectoryBinding, ProjectDirectorySnapshot } from "@rakazo/contracts";
import { WorkspaceGrantResultSchema } from "@rakazo/contracts";
import {
  getProjectDirectoryBinding,
  getProjectWorkspace,
  recordSecurityEvent,
  removeProjectDirectoryBinding,
} from "@rakazo/db";
import type { RouterDeps } from "../router.js";
import type { RouterContext } from "./context.js";

async function queryGrant(
  deps: RouterDeps,
  actor: Actor,
  projectId: string,
  binding: ProjectDirectoryBinding,
  operation: "status" | "revoke",
  signal?: AbortSignal,
) {
  if (!deps.userDevices) throw new Error("Device connection is unavailable");
  const deadline = AbortSignal.any([
    signal ?? new AbortController().signal,
    AbortSignal.timeout(5_000),
  ]);
  let result: ReturnType<typeof WorkspaceGrantResultSchema.parse> | undefined;
  for await (const value of deps.userDevices.request(
    actor.userId,
    {
      method: "workspaceGrant",
      operation,
      spaceId: actor.spaceId,
      projectId,
      grantId: binding.grantId,
    },
    deadline,
    binding.deviceId,
  )) {
    if (result) throw new Error("Unexpected directory response");
    result = WorkspaceGrantResultSchema.parse(value);
  }
  if (!result) throw new Error("Missing directory response");
  return result;
}

export function projectDirectoryRoutes(ctx: RouterContext) {
  const { deps } = ctx;
  const authed = ctx.projectsAuthed ?? ctx.authed;
  const enabled = () =>
    deps.env?.projectWorkspaceCreateExperiment === true &&
    deps.env?.projectDeviceToolsEnabled === true &&
    Boolean(deps.userDevices);
  const authorize = async (actor: Actor, projectId: string) => {
    if (!enabled())
      throw new ORPCError("SERVICE_UNAVAILABLE", {
        message: "Project folders are not available yet",
      });
    if (!(await getProjectWorkspace(deps.prisma, actor, projectId)))
      throw new ORPCError("NOT_FOUND");
  };
  return {
    directoryCapability: authed.projectWorkspaces.directoryCapability.handler(async () => ({
      localDevice: enabled(),
    })),
    directory: authed.projectWorkspaces.directory.handler(
      async ({ context, input }): Promise<ProjectDirectorySnapshot> => {
        await authorize(context.actor, input.id);
        const binding = await getProjectDirectoryBinding(deps.prisma, context.actor, input.id);
        if (!binding) return { binding: null, deviceName: null, status: "unknown" };
        await deps.userDevices!.releaseSignedOut(context.actor.userId);
        const devices = await deps.userDevices!.list(context.actor.userId);
        const device = devices.find((candidate) => candidate.deviceId === binding.deviceId);
        const base = { binding, deviceName: device?.name ?? null };
        if (!device) return { ...base, status: "unauthorized" };
        if (!device.connected) return { ...base, status: "offline" };
        try {
          const result = await queryGrant(
            deps,
            context.actor,
            input.id,
            binding,
            "status",
            context.signal,
          );
          return { ...base, status: result.state === "authorized" ? "online" : result.state };
        } catch (error) {
          return {
            ...base,
            status: error instanceof UserDeviceOfflineError ? "offline" : "unavailable",
          };
        }
      },
    ),
    unbindDirectory: authed.projectWorkspaces.unbindDirectory.handler(
      async ({ context, input }) => {
        await authorize(context.actor, input.id);
        const binding = await getProjectDirectoryBinding(deps.prisma, context.actor, input.id);
        if (!binding) return { removed: true as const, localRevocation: "pending" as const };
        if (
          binding.grantId !== input.grantId ||
          !(await removeProjectDirectoryBinding(
            deps.prisma,
            context.actor,
            input.id,
            input.grantId,
          ))
        )
          throw new ORPCError("CONFLICT", {
            message: "Project binding changed; refresh before removing it",
          });
        let localRevocation: "confirmed" | "pending" = "pending";
        try {
          const result = await queryGrant(
            deps,
            context.actor,
            input.id,
            binding,
            "revoke",
            context.signal,
          );
          if (result.state === "unauthorized") localRevocation = "confirmed";
        } catch {}
        await recordSecurityEvent({
          type: "project.directory.unbound",
          userId: context.actor.userId,
          spaceId: context.actor.spaceId,
          metadata: {
            projectId: input.id,
            deviceId: binding.deviceId,
            grantId: binding.grantId,
            localRevocation,
          },
        });
        return { removed: true as const, localRevocation };
      },
    ),
  };
}
