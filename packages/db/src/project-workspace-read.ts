import type { Actor, ProjectWorkspace } from "@rakazo/contracts";
import { ProjectWorkspaceSchema } from "@rakazo/contracts";
import type { PrismaClient } from "./client.js";
import { Prisma } from "./client.js";
import { runAsTenant } from "./row-security.js";

const PAGE_SIZE = 100;

export type ProjectWorkspaceCursor = { createdAt: Date; id: string };

type WorkspaceRow = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

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
