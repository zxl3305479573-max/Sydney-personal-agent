import type { Actor, ProjectWorkspace } from "@rakazo/contracts";
import {
  CreateProjectWorkspaceInput,
  DeleteProjectWorkspaceInput,
  ProjectWorkspaceIdInput,
  ProjectWorkspaceRosterInput,
  ProjectWorkspaceRosterSchema,
  ProjectWorkspaceSchema,
} from "@rakazo/contracts";
import type { PrismaClient } from "./client.js";
import { Prisma } from "./client.js";
import { lockProjectAccountForCreation } from "./project-account-lifecycle.js";
import { runAsTenant } from "./row-security.js";
import { lockSpaceForContentCreation } from "./spaces.js";
import { withTransactionRetry } from "./transaction-retry.js";

const PAGE_SIZE = 100;

export type ProjectWorkspaceCursor = { createdAt: Date; id: string };

export async function listProjectWorkspaceRoster(
  prisma: Pick<PrismaClient, "$queryRaw">,
  actor: Pick<Actor, "spaceId" | "userId">,
  input: { id: string; afterBotId?: string; afterGroupId?: string },
) {
  const parsed = ProjectWorkspaceRosterInput.safeParse(input);
  if (!actor?.spaceId || !actor.userId || !parsed.success)
    throw new Error("Invalid workspace scope");
  const { id, afterBotId, afterGroupId } = parsed.data;
  const botCursor = afterBotId ? Prisma.sql`AND b."id" > ${afterBotId}` : Prisma.empty;
  const groupCursor = afterGroupId ? Prisma.sql`AND g."id" > ${afterGroupId}` : Prisma.empty;
  const rows = await runAsTenant({ ...actor, projectWorkspaceId: id }, () =>
    prisma.$queryRaw<Array<{ kind: "workspace" | "bot" | "group"; id: string; name: string }>>(Prisma.sql`
      WITH permitted AS (
        SELECT w."id" FROM "project_workspaces" w
        JOIN "space_members" m ON m."spaceId" = w."spaceId" AND m."userId" = w."userId"
        JOIN "spaces" s ON s."id" = w."spaceId"
        WHERE w."id" = ${id} AND w."spaceId" = ${actor.spaceId}
          AND w."userId" = ${actor.userId} AND w."deletingAt" IS NULL
          AND s."deletingAt" IS NULL
      )
      (SELECT 'workspace' AS kind, p."id", '' AS "name" FROM permitted p)
      UNION ALL
      (SELECT 'bot' AS kind, b."id", b."name"
        FROM "bots" b
        WHERE b."spaceId" = ${actor.spaceId} AND b."userId" = ${actor.userId}
          AND b."projectWorkspaceId" = ${id} AND b."archivedAt" IS NULL
          AND EXISTS (SELECT 1 FROM permitted)
          ${botCursor}
        ORDER BY b."id" LIMIT 101)
      UNION ALL
      (SELECT 'group' AS kind, g."id", g."name"
        FROM "chat_groups" g
        WHERE g."spaceId" = ${actor.spaceId} AND g."userId" = ${actor.userId}
          AND g."projectWorkspaceId" = ${id} AND g."archivedAt" IS NULL
          AND EXISTS (SELECT 1 FROM permitted)
          ${groupCursor}
        ORDER BY g."id" LIMIT 101)
      ORDER BY "kind", "id"
    `),
  );
  if (!rows.some((row) => row.kind === "workspace")) return null;
  const bots = rows.filter((row) => row.kind === "bot");
  const groups = rows.filter((row) => row.kind === "group");
  return ProjectWorkspaceRosterSchema.parse({
    bots: bots.slice(0, 100).map(({ id: itemId, name }) => ({ id: itemId, name })),
    groups: groups.slice(0, 100).map(({ id: itemId, name }) => ({ id: itemId, name })),
    nextBotId: bots.length > 100 ? bots[99]!.id : null,
    nextGroupId: groups.length > 100 ? groups[99]!.id : null,
  });
}

type WorkspaceRow = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

export async function createProjectWorkspace(
  prisma: PrismaClient,
  actor: Pick<Actor, "spaceId" | "userId">,
  input: { id: string; name: string },
): Promise<ProjectWorkspace> {
  const { id, name } = CreateProjectWorkspaceInput.parse(input);
  if (!actor?.spaceId || !actor.userId) throw new Error("Invalid workspace scope");
  const now = new Date();
  const row = await runAsTenant({ ...actor, projectWorkspaceId: null }, () =>
    withTransactionRetry(() =>
      prisma.$transaction(async (tx) => {
        await lockProjectAccountForCreation(tx, actor.userId);
        await lockSpaceForContentCreation(tx, actor);
        const rows = await tx.$queryRaw<WorkspaceRow[]>(Prisma.sql`
          INSERT INTO "project_workspaces" ("id", "spaceId", "userId", "name", "createdAt", "updatedAt")
          VALUES (${id}, ${actor.spaceId}, ${actor.userId}, ${name}, ${now}, ${now})
          ON CONFLICT ("id") DO NOTHING
          RETURNING "id", "name", "createdAt", "updatedAt"
        `);
        if (rows[0]) return rows[0];
        const existing = await tx.$queryRaw<WorkspaceRow[]>(Prisma.sql`
          SELECT "id", "name", "createdAt", "updatedAt"
          FROM "project_workspaces"
          WHERE "id" = ${id} AND "spaceId" = ${actor.spaceId}
            AND "userId" = ${actor.userId} AND "deletingAt" IS NULL
        `);
        if (!existing[0] || existing[0].name !== name)
          throw new Error("Project creation request conflicts with an existing resource");
        return existing[0];
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }),
    ),
  );
  return ProjectWorkspaceSchema.parse({
    id: row.id,
    name: row.name,
    locationType: null,
    connectionStatus: "unknown",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function removeEmptyProjectWorkspace(
  prisma: PrismaClient,
  actor: Pick<Actor, "spaceId" | "userId">,
  input: { id: string; confirmRemoveAppData: true },
): Promise<boolean> {
  const { id } = DeleteProjectWorkspaceInput.parse(input);
  if (!actor?.spaceId || !actor.userId) throw new Error("Invalid workspace scope");
  return runAsTenant({ ...actor, projectWorkspaceId: id }, () =>
    withTransactionRetry(() => prisma.$transaction(async (tx) => {
      await lockSpaceForContentCreation(tx, actor);
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        DELETE FROM "project_workspaces" w
        WHERE w."id" = ${id} AND w."spaceId" = ${actor.spaceId}
          AND w."userId" = ${actor.userId} AND w."deletingAt" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "bots" b WHERE b."projectWorkspaceId" = w."id")
          AND NOT EXISTS (SELECT 1 FROM "chat_groups" g WHERE g."projectWorkspaceId" = w."id")
          AND NOT EXISTS (SELECT 1 FROM "threads" t WHERE t."projectWorkspaceId" = w."id")
          AND NOT EXISTS (SELECT 1 FROM "tasks" t WHERE t."projectWorkspaceId" = w."id")
          AND NOT EXISTS (SELECT 1 FROM "runs" r WHERE r."projectWorkspaceId" = w."id")
          AND NOT EXISTS (SELECT 1 FROM "artifacts" a WHERE a."projectWorkspaceId" = w."id")
          AND NOT EXISTS (SELECT 1 FROM "cloud_agents" c WHERE c."projectWorkspaceId" = w."id")
          AND NOT EXISTS (SELECT 1 FROM "purchases" p WHERE p."projectWorkspaceId" = w."id")
        RETURNING w."id"
      `);
      return rows.length === 1;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })),
  );
}

export async function listProjectWorkspaces(
  prisma: Pick<PrismaClient, "$queryRaw">,
  actor: Pick<Actor, "spaceId" | "userId">,
  after?: ProjectWorkspaceCursor,
): Promise<{ items: ProjectWorkspace[]; nextCursor: ProjectWorkspaceCursor | null }> {
  if (
    !actor?.spaceId ||
    !actor.userId ||
    (after &&
      (!(after.createdAt instanceof Date) ||
        !Number.isFinite(after.createdAt.getTime()) ||
        !/^[A-Za-z0-9_-]{1,128}(?![\s\S])/.test(after.id)))
  ) {
    throw new Error("Invalid workspace listing scope");
  }

  const cursor = after
    ? Prisma.sql`AND (w."createdAt", w."id") > (${after.createdAt}, ${after.id})`
    : Prisma.empty;
  const rows = await runAsTenant(actor, () =>
    prisma.$queryRaw<WorkspaceRow[]>(Prisma.sql`
      SELECT w."id", w."name", w."createdAt", w."updatedAt"
      FROM "project_workspaces" w
      WHERE w."spaceId" = ${actor.spaceId} AND w."userId" = ${actor.userId}
        AND w."deletingAt" IS NULL
        AND EXISTS (
          SELECT 1 FROM "space_members" m
          JOIN "spaces" s ON s."id" = m."spaceId"
          WHERE m."spaceId" = w."spaceId" AND m."userId" = w."userId"
            AND s."deletingAt" IS NULL
        )
        ${cursor}
      ORDER BY w."createdAt", w."id"
      LIMIT ${PAGE_SIZE + 1}
    `),
  );

  const page = rows.slice(0, PAGE_SIZE);
  const items = page.map((row) =>
    ProjectWorkspaceSchema.parse({
      id: row.id,
      name: row.name,
      locationType: null,
      connectionStatus: "unknown",
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }),
  );
  const last = page.at(-1);
  return {
    items,
    nextCursor: rows.length > PAGE_SIZE && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

export async function getProjectWorkspace(
  prisma: Pick<PrismaClient, "$queryRaw">,
  actor: Pick<Actor, "spaceId" | "userId">,
  id: string,
): Promise<ProjectWorkspace | null> {
  if (!actor?.spaceId || !actor.userId || !ProjectWorkspaceIdInput.safeParse({ id }).success)
    throw new Error("Invalid workspace scope");
  const rows = await runAsTenant(actor, () =>
    prisma.$queryRaw<WorkspaceRow[]>(Prisma.sql`
      SELECT w."id", w."name", w."createdAt", w."updatedAt"
      FROM "project_workspaces" w
      WHERE w."id" = ${id} AND w."spaceId" = ${actor.spaceId}
        AND w."userId" = ${actor.userId} AND w."deletingAt" IS NULL
        AND EXISTS (
          SELECT 1 FROM "space_members" m
          JOIN "spaces" s ON s."id" = m."spaceId"
          WHERE m."spaceId" = w."spaceId" AND m."userId" = w."userId"
            AND s."deletingAt" IS NULL
        )
      LIMIT 1
    `),
  );
  const row = rows[0];
  if (!row) return null;
  return ProjectWorkspaceSchema.parse({
    id: row.id,
    name: row.name,
    locationType: null,
    connectionStatus: "unknown",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
