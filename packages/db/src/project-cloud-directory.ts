import { randomUUID } from "node:crypto";
import type { ProjectCloudFolder, ProjectDirectoryIntent } from "@rakazo/contracts";
import { ProjectCloudFolderSchema } from "@rakazo/contracts";
import type { PrismaClient } from "./client.js";
import { Prisma } from "./client.js";
import { lockProjectAccountForCreation } from "./project-account-lifecycle.js";
import { runAsTenant } from "./row-security.js";
import { lockSpaceForContentCreation } from "./spaces.js";

type Owner = { userId: string; spaceId: string };
type CloudBinding = {
  computerId: string;
  grantId: string;
  providerRef: string;
  homeKey: string;
  folder: ProjectCloudFolder;
  intent: ProjectDirectoryIntent;
  available: boolean;
};

const cloudComputer = {
  scope: "dedicated",
  kind: "native-linux",
  state: "running",
  providerRef: { startsWith: "native:" },
} as const;

export function listProjectCloudComputers(prisma: Pick<PrismaClient, "computer">, owner: Owner) {
  return runAsTenant({ ...owner, projectWorkspaceId: null }, async () => {
    const { spaceId, userId } = owner;
    const rows = await prisma.computer.findMany({
      where: { spaceId, userId, ...cloudComputer },
      select: {
        id: true,
        homeKey: true,
        providerRef: true,
        bots: {
          where: { spaceId, userId, projectWorkspaceId: null, archivedAt: null },
          select: { id: true, name: true },
        },
      },
      orderBy: { id: "asc" },
    });
    return rows.flatMap((row) => {
      const bot = row.bots.find((candidate) => candidate.id === row.homeKey);
      if (!bot || !row.providerRef) return [];
      return [{ id: row.id, name: bot.name, homeKey: row.homeKey, providerRef: row.providerRef }];
    });
  });
}

export async function getProjectCloudDirectory(
  prisma: Pick<PrismaClient, "$queryRaw">,
  owner: Owner,
  projectId: string,
  run?: { id: string; threadId: string; taskId: string; workerId: string; fence: number },
): Promise<CloudBinding | null> {
  const runCheck = run
    ? Prisma.sql`AND EXISTS (
    SELECT 1 FROM "runs" r WHERE r."id" = ${run.id} AND r."threadId" = ${run.threadId}
      AND r."taskId" = ${run.taskId} AND r."projectWorkspaceId" = b."projectId"
      AND r."userId" = b."userId" AND r."spaceId" = b."spaceId" AND r."status" = 'running'
      AND r."leaseOwner" = ${run.workerId} AND r."leaseFence" = ${run.fence}
      AND r."leaseExpiresAt" > CURRENT_TIMESTAMP
      AND r."projectDirectoryPin" = jsonb_build_object(
        'kind', 'cloud', 'targetId', b."computerId", 'grantId', b."grantId", 'intent', b."intent"
      )
  ) AND c."controlHolder" = 'none' AND c."maintenanceId" IS NULL
    AND c."executionRunId" IS NULL AND NOT EXISTS (
      SELECT 1 FROM "computer_execution_leases" l
      WHERE l."computerId" = c."id" AND l."expiresAt" > CURRENT_TIMESTAMP
    )`
    : Prisma.empty;
  const rows = await runAsTenant({ ...owner, projectWorkspaceId: projectId }, () =>
    prisma.$queryRaw<CloudBinding[]>(Prisma.sql`
      SELECT b."computerId", b."grantId", b."providerRef", c."homeKey", b."folder", b."intent",
        (c."kind" = 'native-linux' AND c."scope" = 'dedicated' AND c."state" = 'running'
          AND c."providerRef" IS NOT DISTINCT FROM b."providerRef") AS "available"
      FROM "project_cloud_directory_bindings" b
      JOIN "computers" c ON (c."id", c."spaceId", c."userId") = (b."computerId", b."spaceId", b."userId")
      JOIN "project_workspaces" w ON w."id" = b."projectId"
      JOIN "spaces" s ON s."id" = b."spaceId"
      JOIN "space_members" m ON (m."spaceId", m."userId") = (b."spaceId", b."userId")
      WHERE b."projectId" = ${projectId} AND b."spaceId" = ${owner.spaceId} AND b."userId" = ${owner.userId}
        AND w."deletingAt" IS NULL AND s."deletingAt" IS NULL ${runCheck}
    `),
  );
  const row = rows[0];
  return row ? { ...row, folder: ProjectCloudFolderSchema.parse(row.folder) } : null;
}

export async function bindProjectCloudDirectory(
  prisma: Pick<PrismaClient, "$transaction">,
  owner: Owner,
  projectId: string,
  input: {
    computerId: string;
    providerRef: string;
    folder: ProjectCloudFolder;
    intent: ProjectDirectoryIntent;
  },
): Promise<boolean> {
  const folder = ProjectCloudFolderSchema.parse(input.folder);
  return runAsTenant({ ...owner, projectWorkspaceId: projectId }, () =>
    prisma.$transaction(async (tx) => {
      await lockProjectAccountForCreation(tx, owner.userId);
      await lockSpaceForContentCreation(tx, owner);
      const projects = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "project_workspaces"
        WHERE "id" = ${projectId} AND "spaceId" = ${owner.spaceId}
          AND "userId" = ${owner.userId} AND "deletingAt" IS NULL FOR UPDATE
      `);
      if (!projects[0]) return false;
      const grantId = randomUUID();
      const rows = await tx.$queryRaw<Array<{ grantId: string }>>(Prisma.sql`
        INSERT INTO "project_cloud_directory_bindings"
          ("projectId", "spaceId", "userId", "computerId", "grantId", "providerRef", "folder", "intent")
        SELECT ${projectId}, c."spaceId", c."userId", c."id", ${grantId},
          c."providerRef", ${JSON.stringify(folder)}::jsonb, ${input.intent}
        FROM "computers" c
        WHERE c."id" = ${input.computerId} AND c."spaceId" = ${owner.spaceId}
          AND c."userId" = ${owner.userId} AND c."scope" = 'dedicated'
          AND c."kind" = 'native-linux' AND c."state" = 'running' AND c."providerRef" = ${input.providerRef}
          AND NOT EXISTS (SELECT 1 FROM "project_directory_bindings" WHERE "projectId" = ${projectId})
        ON CONFLICT ("projectId") DO NOTHING RETURNING "grantId"
      `);
      return rows.length === 1;
    }),
  );
}

export async function unbindProjectCloudDirectory(
  prisma: Pick<PrismaClient, "$queryRaw">,
  owner: Owner,
  projectId: string,
  grantId: string,
) {
  const rows = await runAsTenant({ ...owner, projectWorkspaceId: projectId }, () =>
    prisma.$queryRaw<Array<{ grantId: string }>>(Prisma.sql`
      DELETE FROM "project_cloud_directory_bindings"
      WHERE "projectId" = ${projectId} AND "spaceId" = ${owner.spaceId}
        AND "userId" = ${owner.userId} AND "grantId" = ${grantId}
      RETURNING "grantId"
    `),
  );
  return rows.length === 1;
}
