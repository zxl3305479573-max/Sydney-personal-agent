import type { PrismaClient } from "./client.js";
import { Prisma } from "./client.js";
import { runAsSystem } from "./row-security.js";
import { withTransactionRetry } from "./transaction-retry.js";

export class ProjectAccountDeletionInProgressError extends Error {
  constructor() {
    super("Account deletion is in progress");
    this.name = "ProjectAccountDeletionInProgressError";
  }
}

export class AccountHasProjectWorkspacesError extends Error {
  constructor() {
    super("Remove project workspaces before deleting the account");
    this.name = "AccountHasProjectWorkspacesError";
  }
}

export async function lockProjectAccountForCreation(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  if (!userId) throw new Error("Invalid account scope");
  const rows = await tx.$queryRaw<Array<{ projectDeletionClaimedAt: Date | null }>>(Prisma.sql`
    SELECT "projectDeletionClaimedAt" FROM "user" WHERE "id" = ${userId} FOR UPDATE
  `);
  if (rows.length !== 1) throw new Error("Account is unavailable");
  if (rows[0]!.projectDeletionClaimedAt !== null) throw new ProjectAccountDeletionInProgressError();
}

export async function claimProjectAccountDeletion(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  if (!userId) throw new Error("Invalid account scope");
  await runAsSystem("claim account deletion for project lifecycle", () =>
    withTransactionRetry(() =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ authorized: boolean }>>(Prisma.sql`
          SELECT app_rls_bypass() AS "authorized" FROM "user"
          WHERE "id" = ${userId} FOR UPDATE
        `);
        if (rows.length !== 1 || rows[0]!.authorized !== true)
          throw new Error("Cannot verify account deletion access");
        const projects = await tx.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
          SELECT EXISTS (SELECT 1 FROM "project_workspaces" WHERE "userId" = ${userId}) AS "exists"
        `);
        if (projects.length !== 1 || typeof projects[0]!.exists !== "boolean")
          throw new Error("Cannot verify project workspaces");
        if (projects[0]!.exists) throw new AccountHasProjectWorkspacesError();
        await tx.$executeRaw(Prisma.sql`
          UPDATE "user" SET "projectDeletionClaimedAt" = COALESCE("projectDeletionClaimedAt", CURRENT_TIMESTAMP)
          WHERE "id" = ${userId}
        `);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }),
    ),
  );
}
