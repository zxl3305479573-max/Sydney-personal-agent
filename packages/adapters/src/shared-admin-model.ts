import type { SecretStore } from "@rakazo/adapter-kit";
import type { ModelRole } from "@rakazo/contracts";
import { ThinkingLevelSchema } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { runAsSystem } from "@rakazo/db";
import type { MemberMainModel } from "./model-roles.js";
import { findConnectedModelCredential } from "./model-selection.js";

export interface SharedAdminModelChoice extends MemberMainModel {
  ownerUserId: string;
}

export interface SharedAdminModelRole {
  ownerUserId: string;
  primary: SharedAdminModelChoice;
  backups: SharedAdminModelChoice[];
}

/**
 * Whether non-admin accounts without their own model connection inherit the verified
 * server administrator's configured main model (and backups) at runtime without
 * exposing the administrator's keys or credentials in client APIs.
 *
 * Defaults to enabled on single-host `native-linux` deployments with `RAKAZO_ADMIN_EMAILS`
 * configured so invited friends can chat immediately. Explicit `SYDNEY_SHARE_ADMIN_MODELS`
 * (`true`/`false`) overrides the default whenever at least one admin email is configured.
 */
export function isAdminModelSharingEnabled(input: {
  sandboxProvider?: string | null;
  adminEmails?: readonly string[];
  shareAdminModels?: boolean;
}): boolean {
  if ((input.adminEmails?.length ?? 0) === 0) return false;
  if (input.shareAdminModels !== undefined) return input.shareAdminModels;
  return input.sandboxProvider === "native-linux";
}

function normalizeAdminEmails(emails?: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of emails ?? []) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    normalized.push(email);
  }
  return normalized;
}

/**
 * Resolves the first verified administrator's configured model role (primary + backups)
 * under `runAsSystem` so non-admin accounts with no personal model connection can run
 * chats, image inputs, receipt parsing, and compaction using the server's existing models
 * without ever exposing the admin's credentials or plaintext secrets.
 */
export async function resolveSharedAdminModelRole(
  deps: { prisma: PrismaClient; secretStore: Pick<SecretStore, "load"> },
  options: {
    adminEmails?: readonly string[];
    enabled: boolean;
    role?: ModelRole;
  },
): Promise<SharedAdminModelRole | null> {
  if (!options.enabled) return null;
  const adminEmails = normalizeAdminEmails(options.adminEmails);
  if (adminEmails.length === 0) return null;
  const prisma = deps.prisma as Partial<PrismaClient>;
  if (
    typeof prisma.user?.findMany !== "function" ||
    typeof prisma.userModelRoleChoice?.findMany !== "function" ||
    typeof prisma.secret?.findFirst !== "function"
  ) {
    return null;
  }

  const role: ModelRole = options.role ?? "main";
  return runAsSystem("shared-admin-model.resolve", async () => {
    const users = await deps.prisma.user.findMany({
      where: {
        emailVerified: true,
        OR: adminEmails.map((email) => ({
          email: { equals: email, mode: "insensitive" as const },
        })),
      },
      select: { id: true, email: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (users.length === 0) return null;

    const emailOrder = new Map(adminEmails.map((email, index) => [email, index]));
    const orderedAdmins = [...users].sort(
      (left, right) =>
        (emailOrder.get(left.email.toLowerCase()) ?? Number.MAX_SAFE_INTEGER) -
        (emailOrder.get(right.email.toLowerCase()) ?? Number.MAX_SAFE_INTEGER),
    );

    for (const admin of orderedAdmins) {
      const choices = await deps.prisma.userModelRoleChoice.findMany({
        where: { userId: admin.id, role },
        orderBy: [{ position: "asc" }],
        select: {
          position: true,
          provider: true,
          modelId: true,
          thinkingLevel: true,
          credentialId: true,
        },
      });
      if (choices.length === 0) continue;

      const resolveChoice = async (
        row: (typeof choices)[number],
      ): Promise<SharedAdminModelChoice | null> => {
        const credential = await findConnectedModelCredential(
          deps.prisma,
          deps.secretStore,
          { userId: admin.id, spaceId: "" },
          row.provider,
          row.modelId,
          { credentialId: row.credentialId },
        );
        if (!credential) return null;
        const secretRow = await deps.prisma.secret.findFirst({
          where: { id: credential.secretId, userId: admin.id, spaceId: null },
          select: { id: true },
        });
        if (!secretRow) return null;
        const thinking = ThinkingLevelSchema.safeParse(row.thinkingLevel);
        return {
          ownerUserId: admin.id,
          provider: row.provider,
          modelId: row.modelId,
          ...(thinking.success ? { thinkingLevel: thinking.data } : {}),
          ...(row.credentialId ? { credentialId: row.credentialId } : {}),
          credential,
        };
      };

      const primaryRow = choices.find((row) => row.position === 0);
      if (!primaryRow) continue;
      const primary = await resolveChoice(primaryRow);
      if (!primary) continue;

      const backups: SharedAdminModelChoice[] = [];
      for (const backupRow of choices.filter((row) => row.position > 0)) {
        const backup = await resolveChoice(backupRow);
        if (backup) backups.push(backup);
      }
      return {
        ownerUserId: admin.id,
        primary,
        backups,
      };
    }

    return null;
  });
}
