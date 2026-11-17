import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "./client.js";
import { getProjectWorkspace } from "./project-workspace-read.js";
import { currentDbContext, runAsTenant } from "./row-security.js";
import { IsolationError } from "./scope.js";

export async function runInProjectWorkspace<T>(
  prisma: PrismaClient,
  actor: Pick<Actor, "spaceId" | "userId">,
  projectWorkspaceId: string,
  fn: () => T | PromiseLike<T>,
): Promise<T> {
  const tenant = { spaceId: actor.spaceId, userId: actor.userId };
  const parent = currentDbContext();
  if (parent?.kind === "tenant" &&
    (parent.spaceId !== tenant.spaceId || parent.userId !== tenant.userId)) {
    throw new IsolationError();
  }
  const workspace = await getProjectWorkspace(prisma, tenant, projectWorkspaceId);
  if (!workspace) throw new IsolationError();
  return runAsTenant({ ...tenant, projectWorkspaceId }, fn);
}

export function conversationProjectId(actor: Pick<Actor, "spaceId" | "userId">): string | null {
  const context = currentDbContext();
  if (context?.kind !== "tenant") return null;
  if (context.spaceId !== actor.spaceId || context.userId !== actor.userId) {
    throw new IsolationError();
  }
  return context.projectWorkspaceId ?? null;
}

export function conversationScopeWhere(actor: Pick<Actor, "spaceId" | "userId">) {
  return {
    spaceId: actor.spaceId,
    userId: actor.userId,
    projectWorkspaceId: conversationProjectId(actor),
  };
}
