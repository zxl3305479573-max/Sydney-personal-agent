import { ProjectWorkspaceIdInput } from "@rakazo/contracts";
import type { PrismaClient } from "./client.js";
import { Prisma } from "./client.js";
import { conversationProjectId } from "./project-workspace-context.js";
import { currentDbContext } from "./row-security.js";
import { IsolationError } from "./scope.js";

type ExecutionOwner = { spaceId: string; userId: string; projectWorkspaceId: string | null };

export async function resolveConversationExecutionScope(
  prisma: Pick<PrismaClient, "$queryRaw">,
  target: { spaceId: string; userId: string; threadId: string; botId: string },
): Promise<ExecutionOwner> {
  const context = currentDbContext();
  if (!context) throw new IsolationError();
  const expectedProject = context.kind === "tenant" ? conversationProjectId(target) : undefined;
  const projectFilter =
    expectedProject === undefined
      ? Prisma.empty
      : Prisma.sql`AND t."projectWorkspaceId" IS NOT DISTINCT FROM ${expectedProject}`;
  const rows = await prisma.$queryRaw<ExecutionOwner[]>(Prisma.sql`
    SELECT t."spaceId", t."userId", t."projectWorkspaceId"
    FROM "threads" t
    JOIN "bots" b ON b."id" = ${target.botId}
      AND b."spaceId" = t."spaceId" AND b."userId" = t."userId"
      AND b."projectWorkspaceId" IS NOT DISTINCT FROM t."projectWorkspaceId"
    WHERE t."id" = ${target.threadId}
      AND t."spaceId" = ${target.spaceId} AND t."userId" = ${target.userId}
      ${projectFilter}
      AND (
        (t."botId" = b."id" AND t."groupId" IS NULL AND t."externalConversationId" IS NULL)
        OR (t."botId" IS NULL AND t."externalConversationId" IS NULL AND EXISTS (
          SELECT 1 FROM "chat_groups" g
          JOIN "chat_group_members" gm ON gm."groupId" = g."id" AND gm."botId" = b."id"
          WHERE g."id" = t."groupId" AND g."spaceId" = t."spaceId" AND g."userId" = t."userId"
            AND g."projectWorkspaceId" IS NOT DISTINCT FROM t."projectWorkspaceId"
        ))
        OR (t."botId" IS NULL AND t."groupId" IS NULL AND EXISTS (
          SELECT 1 FROM "external_conversations" c
          WHERE c."id" = t."externalConversationId" AND c."botId" = b."id"
            AND c."spaceId" = t."spaceId" AND c."userId" = t."userId"
        ))
      )
      AND (t."projectWorkspaceId" IS NULL OR EXISTS (
        SELECT 1 FROM "project_workspaces" w
        JOIN "space_members" m ON m."spaceId" = w."spaceId" AND m."userId" = w."userId"
        JOIN "spaces" s ON s."id" = w."spaceId"
        WHERE w."id" = t."projectWorkspaceId" AND w."spaceId" = t."spaceId"
          AND w."userId" = t."userId" AND w."deletingAt" IS NULL AND s."deletingAt" IS NULL
      ))
    LIMIT 2
  `);
  const scope = rows[0];
  if (
    rows.length !== 1 ||
    !scope ||
    scope.spaceId !== target.spaceId ||
    scope.userId !== target.userId ||
    (expectedProject !== undefined && scope.projectWorkspaceId !== expectedProject) ||
    (scope.projectWorkspaceId !== null &&
      !ProjectWorkspaceIdInput.safeParse({ id: scope.projectWorkspaceId }).success)
  ) {
    throw new IsolationError();
  }
  return {
    spaceId: scope.spaceId,
    userId: scope.userId,
    projectWorkspaceId: scope.projectWorkspaceId,
  };
}
