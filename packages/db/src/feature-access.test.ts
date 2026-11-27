import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import {
  FeatureAccessAdminLockedError,
  FeatureAccessUserNotFoundError,
  listUsersFeatureAccess,
  resolveUserFeatureAccess,
  upsertUserFeatureAccess,
} from "./feature-access.js";

type StoredUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  emailVerified: boolean;
  createdAt: Date;
};

type StoredOverride = {
  userId: string;
  computer: boolean | null;
  projects: boolean | null;
  github: boolean | null;
  integrations: boolean | null;
  updatedById: string | null;
};

function fakePrisma(users: StoredUser[], initialOverrides: StoredOverride[] = []) {
  const overrides = new Map<string, StoredOverride>(
    initialOverrides.map((row) => [row.userId, { ...row }]),
  );
  const attach = (user: StoredUser) => ({
    ...user,
    featureAccess: overrides.get(user.id) ?? null,
  });
  return {
    overrides,
    prisma: {
      user: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          const found = users.find((entry) => entry.id === where.id);
          return found ? attach(found) : null;
        }),
        findMany: vi.fn(async () => users.map(attach)),
      },
      userFeatureAccess: {
        findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
          return overrides.get(where.userId) ?? null;
        }),
        upsert: vi.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { userId: string };
            create: StoredOverride;
            update: Omit<StoredOverride, "userId">;
          }) => {
            const existing = overrides.get(where.userId);
            const saved: StoredOverride = existing ? { ...existing, ...update } : { ...create };
            overrides.set(where.userId, saved);
            return saved;
          },
        ),
      },
    } as unknown as PrismaClient,
  };
}

describe("user feature access repository", () => {
  const adminUser: StoredUser = {
    id: "admin-1",
    email: "owner@example.test",
    name: "Owner",
    image: null,
    emailVerified: true,
    createdAt: new Date("2026-11-01T00:00:00Z"),
  };
  const friendUser: StoredUser = {
    id: "friend-1",
    email: "friend@example.test",
    name: "Friend",
    image: null,
    emailVerified: true,
    createdAt: new Date("2026-11-02T00:00:00Z"),
  };

  it("resolves restricted defaults and stored overrides per user", async () => {
    const { prisma } = fakePrisma(
      [adminUser, friendUser],
      [
        {
          userId: "friend-1",
          computer: null,
          projects: true,
          github: null,
          integrations: false,
          updatedById: "admin-1",
        },
      ],
    );

    const adminResolved = await resolveUserFeatureAccess(prisma, {
      userId: "admin-1",
      adminEmails: ["owner@example.test"],
      restrictNonAdmins: true,
    });
    expect(adminResolved.isAdmin).toBe(true);
    expect(adminResolved.effective).toEqual({
      computer: true,
      projects: true,
      github: true,
      integrations: true,
    });

    const friendResolved = await resolveUserFeatureAccess(prisma, {
      userId: "friend-1",
      adminEmails: ["owner@example.test"],
      restrictNonAdmins: true,
    });
    expect(friendResolved.isAdmin).toBe(false);
    expect(friendResolved.effective).toEqual({
      computer: false,
      projects: true,
      github: false,
      integrations: false,
    });
  });

  it("lists users and merges partial override updates while blocking admin restrictions", async () => {
    const { prisma } = fakePrisma([adminUser, friendUser]);

    const listed = await listUsersFeatureAccess(prisma, {
      adminEmails: ["owner@example.test"],
      restrictNonAdmins: true,
    });
    expect(listed.map((u) => [u.userId, u.isAdmin, u.effective.computer])).toEqual([
      ["admin-1", true, true],
      ["friend-1", false, false],
    ]);

    const first = await upsertUserFeatureAccess(prisma, {
      userId: "friend-1",
      updatedById: "admin-1",
      patch: { github: true },
      adminEmails: ["owner@example.test"],
      restrictNonAdmins: true,
    });
    expect(first.effective).toEqual({
      computer: false,
      projects: false,
      github: true,
      integrations: false,
    });

    const second = await upsertUserFeatureAccess(prisma, {
      userId: "friend-1",
      updatedById: "admin-1",
      patch: { projects: true },
      adminEmails: ["owner@example.test"],
      restrictNonAdmins: true,
    });
    expect(second.effective).toEqual({
      computer: false,
      projects: true,
      github: true,
      integrations: false,
    });

    const reset = await upsertUserFeatureAccess(prisma, {
      userId: "friend-1",
      updatedById: "admin-1",
      patch: { computer: null, projects: null, github: null, integrations: null },
      adminEmails: ["owner@example.test"],
      restrictNonAdmins: true,
    });
    expect(reset.effective).toEqual({
      computer: false,
      projects: false,
      github: false,
      integrations: false,
    });

    await expect(
      upsertUserFeatureAccess(prisma, {
        userId: "admin-1",
        updatedById: "admin-1",
        patch: { computer: false },
        adminEmails: ["owner@example.test"],
        restrictNonAdmins: true,
      }),
    ).rejects.toBeInstanceOf(FeatureAccessAdminLockedError);

    await expect(
      upsertUserFeatureAccess(prisma, {
        userId: "missing-user",
        updatedById: "admin-1",
        patch: { computer: true },
        adminEmails: ["owner@example.test"],
        restrictNonAdmins: true,
      }),
    ).rejects.toBeInstanceOf(FeatureAccessUserNotFoundError);
  });

  it("falls back gracefully when a unit-test mock omits userFeatureAccess", async () => {
    const minimalPrisma = {
      user: {
        findUnique: vi.fn(async () => ({ email: "friend@example.test", emailVerified: true })),
      },
    } as unknown as PrismaClient;

    const resolved = await resolveUserFeatureAccess(minimalPrisma, {
      userId: "friend-1",
      adminEmails: [],
      restrictNonAdmins: false,
    });
    expect(resolved.effective).toEqual({
      computer: true,
      projects: true,
      github: true,
      integrations: true,
    });
  });
});
