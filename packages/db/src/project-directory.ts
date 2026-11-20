import type { Actor, ProjectDirectoryBinding } from "@rakazo/contracts";
import { ProjectDirectoryBindingSchema, ProjectWorkspaceIdInput } from "@rakazo/contracts";
import type { PrismaClient } from "./client.js";
import { Prisma } from "./client.js";
import { lockProjectAccountForCreation } from "./project-account-lifecycle.js";
import { runAsTenant } from "./row-security.js";
import { lockSpaceForContentCreation } from "./spaces.js";

type Scope = Pick<Actor, "spaceId" | "userId">;

function scopeFor(actor: Scope, projectId: string) {
  if (!actor?.spaceId || !actor.userId) throw new Error("Invalid workspace scope");
  ProjectWorkspaceIdInput.parse({ id: projectId });
  return { spaceId: actor.spaceId, userId: actor.userId, projectWorkspaceId: projectId };
}

export async function getProjectDirectoryBinding(
  prisma: Pick<PrismaClient, "$queryRaw">,
  actor: Scope,
  projectId: string,
): Promise<ProjectDirectoryBinding | null> {
  const rows = await runAsTenant(scopeFor(actor, projectId), () =>
    prisma.$queryRaw<ProjectDirectoryBinding[]>(Prisma.sql`
      SELECT b."deviceId", b."grantId", b."directoryName", b."intent"
      FROM "project_directory_bindings" b
      JOIN "project_workspaces" w ON w."id" = b."projectId"
      JOIN "space_members" m ON m."spaceId" = w."spaceId" AND m."userId" = w."userId"
      JOIN "spaces" s ON s."id" = w."spaceId"
      WHERE b."projectId" = ${projectId} AND b."spaceId" = ${actor.spaceId}
        AND b."userId" = ${actor.userId} AND w."deletingAt" IS NULL AND s."deletingAt" IS NULL
    `),
  );
  return rows[0] ? ProjectDirectoryBindingSchema.parse(rows[0]) : null;
}

export async function getRunningProjectDirectory(
  prisma: Pick<PrismaClient, "$queryRaw">,
  scope: Scope & {
    projectId: string;
    runId: string;
    threadId: string;
    taskId: string;
    workerId: string;
    fence: number;
  },
): Promise<ProjectDirectoryBinding | null> {
  const rows = await runAsTenant(scopeFor(scope, scope.projectId), () =>
    prisma.$queryRaw<ProjectDirectoryBinding[]>(Prisma.sql`
      SELECT b."deviceId", b."grantId", b."directoryName", b."intent"
      FROM "runs" r
      JOIN "project_directory_bindings" b ON
        (b."projectId", b."spaceId", b."userId") = (r."projectWorkspaceId", r."spaceId", r."userId")
      JOIN "project_workspaces" w ON w."id" = b."projectId"
      JOIN "spaces" s ON s."id" = b."spaceId"
      JOIN "space_members" m ON m."spaceId" = b."spaceId" AND m."userId" = b."userId"
      JOIN "user_devices" d ON d."id" = b."deviceId" AND d."userId" = b."userId"
      JOIN "session" ss ON ss."id" = d."sessionId" AND ss."userId" = d."userId"
      WHERE r."id" = ${scope.runId} AND r."threadId" = ${scope.threadId} AND r."taskId" = ${scope.taskId}
        AND r."projectWorkspaceId" = ${scope.projectId} AND r."spaceId" = ${scope.spaceId}
        AND r."userId" = ${scope.userId} AND r."status" = 'running'
        AND r."leaseOwner" = ${scope.workerId} AND r."leaseFence" = ${scope.fence}
        AND r."leaseExpiresAt" > CURRENT_TIMESTAMP
        AND s."deletingAt" IS NULL AND w."deletingAt" IS NULL
        AND d."revokedAt" IS NULL AND d."platform" = 'win32' AND ss."expiresAt" > CURRENT_TIMESTAMP
    `),
  );
  return rows[0] ? ProjectDirectoryBindingSchema.parse(rows[0]) : null;
}

export async function bindProjectDirectory(
  prisma: PrismaClient,
  actor: Scope,
  projectId: string,
  sessionId: string,
  input: ProjectDirectoryBinding,
): Promise<ProjectDirectoryBinding | null> {
  const binding = ProjectDirectoryBindingSchema.parse(input);
  return runAsTenant(scopeFor(actor, projectId), () =>
    prisma.$transaction(async (tx) => {
      await lockProjectAccountForCreation(tx, actor.userId);
      await lockSpaceForContentCreation(tx, actor);
      const projects = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "project_workspaces"
      WHERE "id" = ${projectId} AND "spaceId" = ${actor.spaceId}
        AND "userId" = ${actor.userId} AND "deletingAt" IS NULL
      FOR UPDATE
    `);
      if (!projects[0]) return null;
      const devices = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT d."id" FROM "user_devices" d JOIN "session" s ON s."id" = d."sessionId"
      WHERE d."id" = ${binding.deviceId} AND d."userId" = ${actor.userId}
        AND d."sessionId" = ${sessionId} AND d."revokedAt" IS NULL
        AND s."userId" = ${actor.userId} AND s."expiresAt" > CURRENT_TIMESTAMP
      FOR SHARE OF d, s
    `);
      if (!devices[0]) return null;
      const rows = await tx.$queryRaw<Array<{ grantId: string }>>(Prisma.sql`
      INSERT INTO "project_directory_bindings"
        ("projectId", "spaceId", "userId", "deviceId", "grantId", "directoryName", "intent")
      SELECT ${projectId}, ${actor.spaceId}, ${actor.userId}, ${binding.deviceId},
        ${binding.grantId}, ${binding.directoryName}, ${binding.intent}
      WHERE NOT EXISTS (
        SELECT 1 FROM "project_cloud_directory_bindings" WHERE "projectId" = ${projectId}
      )
      ON CONFLICT ("projectId") DO UPDATE SET "grantId" = EXCLUDED."grantId"
      WHERE "project_directory_bindings"."spaceId" = EXCLUDED."spaceId"
        AND "project_directory_bindings"."userId" = EXCLUDED."userId"
        AND "project_directory_bindings"."deviceId" = EXCLUDED."deviceId"
        AND "project_directory_bindings"."grantId" = EXCLUDED."grantId"
        AND "project_directory_bindings"."directoryName" = EXCLUDED."directoryName"
        AND "project_directory_bindings"."intent" = EXCLUDED."intent"
      RETURNING "grantId"
    `);
      return rows[0] ? binding : null;
    }),
  );
}

export async function removeProjectDirectoryBinding(
  prisma: Pick<PrismaClient, "$queryRaw">,
  actor: Scope,
  projectId: string,
  grantId: string,
): Promise<boolean> {
  const rows = await runAsTenant(scopeFor(actor, projectId), () =>
    prisma.$queryRaw<Array<{ grantId: string }>>(Prisma.sql`
    DELETE FROM "project_directory_bindings" b
    USING "project_workspaces" w, "spaces" s, "space_members" m
    WHERE b."projectId" = ${projectId} AND b."spaceId" = ${actor.spaceId}
      AND b."userId" = ${actor.userId} AND b."grantId" = ${grantId}
      AND w."id" = b."projectId" AND w."deletingAt" IS NULL
      AND s."id" = w."spaceId" AND s."deletingAt" IS NULL
      AND m."spaceId" = w."spaceId" AND m."userId" = w."userId"
    RETURNING b."grantId"
  `),
  );
  return rows.length === 1;
}
