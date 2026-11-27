import type {
  AdminUserFeatureAccess,
  FeatureAccessFlags,
  FeatureAccessOverrides,
  FeatureAccessOverridesPatch,
} from "@rakazo/contracts";
import {
  EMPTY_FEATURE_OVERRIDES,
  normalizeFeatureAccessOverrides,
  resolveFeatureAccess,
} from "@rakazo/contracts";
import type { PrismaClient } from "./generated/prisma/client.js";
import { currentDbContext, runAsSystem } from "./row-security.js";

export { isFeatureAccessRestrictedByDefault } from "@rakazo/contracts";
export type ResolvedUserFeatureAccess = {
  isAdmin: boolean;
  overrides: FeatureAccessOverrides;
  effective: FeatureAccessFlags;
};

type FeatureAccessRow = {
  computer: boolean | null;
  projects: boolean | null;
  github: boolean | null;
  integrations: boolean | null;
};

function isAdminUser(
  user: { email: string; emailVerified: boolean } | null | undefined,
  adminEmails: readonly string[],
): boolean {
  if (!user?.emailVerified || adminEmails.length === 0) return false;
  const email = user.email.toLowerCase();
  return adminEmails.some((candidate) => candidate.toLowerCase() === email);
}

async function readOverrideRow(
  prisma: PrismaClient,
  userId: string,
): Promise<FeatureAccessRow | null> {
  const table = (
    prisma as unknown as {
      userFeatureAccess?: {
        findUnique?: (args: { where: { userId: string } }) => Promise<FeatureAccessRow | null>;
      };
    }
  ).userFeatureAccess;
  if (!table?.findUnique) return null;
  const run = () => table.findUnique!({ where: { userId } });
  return currentDbContext() ? run() : runAsSystem("feature_access.resolve", run);
}

async function readUserIdentity(
  prisma: PrismaClient,
  userId: string,
): Promise<{ email: string; emailVerified: boolean } | null> {
  const table = (
    prisma as unknown as {
      user?: {
        findUnique?: (args: {
          where: { id: string };
          select: { email: true; emailVerified: true };
        }) => Promise<{ email: string; emailVerified: boolean } | null>;
      };
    }
  ).user;
  if (!table?.findUnique) return null;
  return table.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true },
  });
}

export async function resolveUserFeatureAccess(
  prisma: PrismaClient,
  options: {
    userId: string;
    adminEmails?: readonly string[];
    restrictNonAdmins: boolean;
  },
): Promise<ResolvedUserFeatureAccess> {
  const adminEmails = options.adminEmails ?? [];
  const [user, overrideRow] = await Promise.all([
    adminEmails.length > 0 ? readUserIdentity(prisma, options.userId) : Promise.resolve(null),
    readOverrideRow(prisma, options.userId),
  ]);
  const admin = isAdminUser(user, adminEmails);
  const overrides = overrideRow
    ? normalizeFeatureAccessOverrides(overrideRow)
    : { ...EMPTY_FEATURE_OVERRIDES };
  return {
    isAdmin: admin,
    overrides,
    effective: resolveFeatureAccess({
      isAdmin: admin,
      restrictNonAdmins: options.restrictNonAdmins,
      overrides,
    }),
  };
}

function toAdminUserDto(
  user: {
    id: string;
    email: string;
    name: string;
    image: string | null;
    emailVerified: boolean;
    createdAt: Date;
    featureAccess: FeatureAccessRow | null;
  },
  adminEmails: readonly string[],
  restrictNonAdmins: boolean,
): AdminUserFeatureAccess {
  const admin = isAdminUser(user, adminEmails);
  const overrides = user.featureAccess
    ? normalizeFeatureAccessOverrides(user.featureAccess)
    : { ...EMPTY_FEATURE_OVERRIDES };
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    emailVerified: user.emailVerified,
    isAdmin: admin,
    createdAt: user.createdAt.toISOString(),
    overrides,
    effective: resolveFeatureAccess({
      isAdmin: admin,
      restrictNonAdmins,
      overrides,
    }),
  };
}

export async function listUsersFeatureAccess(
  prisma: PrismaClient,
  options: {
    adminEmails: readonly string[];
    restrictNonAdmins: boolean;
  },
): Promise<AdminUserFeatureAccess[]> {
  const users = await runAsSystem("admin.feature_access.list", () =>
    prisma.user.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        emailVerified: true,
        createdAt: true,
        featureAccess: {
          select: {
            computer: true,
            projects: true,
            github: true,
            integrations: true,
          },
        },
      },
    }),
  );
  return users.map((user) => toAdminUserDto(user, options.adminEmails, options.restrictNonAdmins));
}

export class FeatureAccessUserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User ${userId} was not found`);
    this.name = "FeatureAccessUserNotFoundError";
  }
}

export class FeatureAccessAdminLockedError extends Error {
  constructor() {
    super("Admin accounts always have full feature access.");
    this.name = "FeatureAccessAdminLockedError";
  }
}

export async function upsertUserFeatureAccess(
  prisma: PrismaClient,
  options: {
    userId: string;
    updatedById: string;
    patch: FeatureAccessOverridesPatch;
    adminEmails: readonly string[];
    restrictNonAdmins: boolean;
  },
): Promise<AdminUserFeatureAccess> {
  return runAsSystem("admin.feature_access.update", async () => {
    const user = await prisma.user.findUnique({
      where: { id: options.userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        emailVerified: true,
        createdAt: true,
        featureAccess: {
          select: {
            computer: true,
            projects: true,
            github: true,
            integrations: true,
          },
        },
      },
    });
    if (!user) throw new FeatureAccessUserNotFoundError(options.userId);
    if (isAdminUser(user, options.adminEmails)) {
      throw new FeatureAccessAdminLockedError();
    }
    const existing = normalizeFeatureAccessOverrides(user.featureAccess);
    const next: FeatureAccessOverrides = {
      computer: options.patch.computer !== undefined ? options.patch.computer : existing.computer,
      projects: options.patch.projects !== undefined ? options.patch.projects : existing.projects,
      github: options.patch.github !== undefined ? options.patch.github : existing.github,
      integrations:
        options.patch.integrations !== undefined
          ? options.patch.integrations
          : existing.integrations,
    };
    const saved = await prisma.userFeatureAccess.upsert({
      where: { userId: options.userId },
      create: {
        userId: options.userId,
        ...next,
        updatedById: options.updatedById,
      },
      update: {
        ...next,
        updatedById: options.updatedById,
      },
      select: {
        computer: true,
        projects: true,
        github: true,
        integrations: true,
      },
    });
    return toAdminUserDto(
      { ...user, featureAccess: saved },
      options.adminEmails,
      options.restrictNonAdmins,
    );
  });
}
