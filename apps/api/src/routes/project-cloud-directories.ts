import { ORPCError } from "@orpc/server";
import { createAdapterContext } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import {
  bindProjectCloudDirectory,
  getProjectCloudDirectory,
  getProjectWorkspace,
  listProjectCloudComputers,
  recordSecurityEvent,
  unbindProjectCloudDirectory,
} from "@rakazo/db";
import type { RouterContext } from "./context.js";

export function projectCloudDirectoryRoutes({ deps, authed }: RouterContext) {
  const available = () =>
    deps.env?.projectWorkspaceCreateExperiment === true &&
    deps.env?.projectDeviceToolsEnabled === true &&
    typeof deps.sandbox?.identifyProjectFolder === "function" &&
    typeof deps.sandbox?.executeProjectFile === "function";
  const authorize = async (actor: Actor, projectId: string) => {
    if (!(await getProjectWorkspace(deps.prisma, actor, projectId)))
      throw new ORPCError("NOT_FOUND");
  };
  const probe = (
    actor: Actor,
    computer: { id: string; homeKey: string; providerRef: string },
    path: string,
    signal?: AbortSignal,
  ) =>
    deps.sandbox.identifyProjectFolder!(
      {
        id: computer.id,
        botId: computer.homeKey,
        providerRef: computer.providerRef,
        kind: "native-linux",
      },
      path,
      {
        ...createAdapterContext(actor, computer.homeKey, `project-folder:${computer.id}`),
        signal: signal ?? new AbortController().signal,
      },
    );
  return {
    cloudDirectory: authed.projectWorkspaces.cloudDirectory.handler(async ({ context, input }) => {
      const enabled = available();
      if (!enabled)
        return { available: false, computers: [], binding: null, status: "unbound" as const };
      const { actor, signal } = context;
      await authorize(actor, input.id);
      const [computers, binding] = await Promise.all([
        listProjectCloudComputers(deps.prisma, actor),
        getProjectCloudDirectory(deps.prisma, actor, input.id),
      ]);
      const device =
        binding &&
        computers.find(
          (computer) =>
            computer.id === binding.computerId && computer.providerRef === binding.providerRef,
        );
      const current =
        binding && device && binding.available
          ? await probe(actor, device, binding.folder.path, signal).catch(() => null)
          : null;
      return {
        available: true,
        computers: computers.map(({ id, name }) => ({ id, name })),
        binding: binding
          ? {
              grantId: binding.grantId,
              computerId: binding.computerId,
              path: binding.folder.path,
              intent: binding.intent,
            }
          : null,
        status: !binding
          ? ("unbound" as const)
          : current?.device === binding.folder.device && current.inode === binding.folder.inode
            ? ("online" as const)
            : ("unavailable" as const),
      };
    }),
    bindCloudDirectory: authed.projectWorkspaces.bindCloudDirectory.handler(
      async ({ context, input }) => {
        if (!available()) throw new ORPCError("SERVICE_UNAVAILABLE");
        const { actor, signal } = context;
        await authorize(actor, input.projectId);
        const computers = await listProjectCloudComputers(deps.prisma, actor);
        const computer = computers.find(({ id }) => id === input.computerId);
        if (!computer) throw new ORPCError("NOT_FOUND");
        const folder = await probe(actor, computer, input.path, signal).catch(() => null);
        signal?.throwIfAborted();
        if (!folder)
          throw new ORPCError("BAD_REQUEST", { message: "Cloud workspace folder is unavailable" });
        const bound = await bindProjectCloudDirectory(deps.prisma, actor, input.projectId, {
          computerId: computer.id,
          providerRef: computer.providerRef,
          folder,
          intent: input.intent,
        });
        if (!bound)
          throw new ORPCError("CONFLICT", {
            message: "A directory is already bound or the computer changed",
          });
        await recordSecurityEvent({
          type: "project.directory.bound",
          spaceId: actor.spaceId,
          userId: actor.userId,
          metadata: {
            projectId: input.projectId,
            computerId: computer.id,
            intent: input.intent,
            location: "cloud",
          },
        });
        return { ok: true as const };
      },
    ),
    unbindCloudDirectory: authed.projectWorkspaces.unbindCloudDirectory.handler(
      async ({ context, input }) => {
        await authorize(context.actor, input.id);
        if (
          !(await unbindProjectCloudDirectory(deps.prisma, context.actor, input.id, input.grantId))
        )
          throw new ORPCError("CONFLICT", { message: "Cloud directory binding changed" });
        await recordSecurityEvent({
          type: "project.directory.unbound",
          spaceId: context.actor.spaceId,
          userId: context.actor.userId,
          metadata: { projectId: input.id, grantId: input.grantId, location: "cloud" },
        });
        return { ok: true as const };
      },
    ),
  };
}
