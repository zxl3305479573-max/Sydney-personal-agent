import { createRouterClient } from "@orpc/server";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import type { RouterDeps } from "./router.js";
import { createRouter } from "./router.js";

type FakeUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  emailVerified: boolean;
  timezone: string | null;
  locale: string | null;
  createdAt: Date;
};

type FakeOverride = {
  userId: string;
  computer: boolean | null;
  projects: boolean | null;
  github: boolean | null;
  integrations: boolean | null;
  updatedById: string | null;
};

function createHarness() {
  const users: FakeUser[] = [
    {
      id: "admin-1",
      email: "owner@sydney.test",
      name: "Owner",
      image: null,
      emailVerified: true,
      timezone: null,
      locale: "zh-CN",
      createdAt: new Date("2026-11-01T00:00:00Z"),
    },
    {
      id: "friend-1",
      email: "friend@sydney.test",
      name: "Friend",
      image: null,
      emailVerified: true,
      timezone: null,
      locale: "zh-CN",
      createdAt: new Date("2026-11-02T00:00:00Z"),
    },
  ];
  const overrides = new Map<string, FakeOverride>();
  const attach = (user: FakeUser) => ({
    ...user,
    signupSurvey: null,
    featureAccess: overrides.get(user.id) ?? null,
  });

  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const found = users.find((u) => u.id === where.id);
        return found ? attach(found) : null;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const found = users.find((u) => u.id === where.id);
        if (!found) throw new Error("not found");
        return attach(found);
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
          create: FakeOverride;
          update: Omit<FakeOverride, "userId">;
        }) => {
          const existing = overrides.get(where.userId);
          const saved: FakeOverride = existing ? { ...existing, ...update } : { ...create };
          overrides.set(where.userId, saved);
          return saved;
        },
      ),
    },
    userModelPreference: { findUnique: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    spaceModelPreference: { findUnique: vi.fn(async () => null) },
    userModelCredential: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
    },
    userModelRoleChoice: { findMany: vi.fn(async () => []) },
    spaceModelRoleChoice: { findMany: vi.fn(async () => []) },
    spaceSettingOverride: { findUnique: vi.fn(async () => null) },
    deploymentSettings: { findUnique: vi.fn(async () => null) },
    secret: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    connection: { findMany: vi.fn(async () => []) },
    mcpServer: { findMany: vi.fn(async () => []) },
    capabilityInstall: { findMany: vi.fn(async () => []) },
    projectWorkspace: { findMany: vi.fn(async () => []) },
    bot: { findFirst: vi.fn(async () => null) },
  } as unknown as PrismaClient;

  const deps = {
    prisma,
    secrets: { put: vi.fn(), load: vi.fn() },
    github: {
      getStatus: vi.fn(async () => ({ status: "disconnected" as const })),
    },
    env: {
      defaultProvider: "fake",
      defaultModel: "fake-model",
      webOrigin: "http://127.0.0.1:5173",
      screenProxySecret: "fake-screen-secret",
      sandboxProvider: "native-linux",
      adminEmails: ["owner@sydney.test"],
    },
  } as unknown as RouterDeps;

  const clientFor = (actor: Actor) =>
    createRouterClient(createRouter(deps), { context: { actor } as never });

  return {
    adminClient: clientFor({
      userId: "admin-1",
      spaceId: "space-admin",
      email: "owner@sydney.test",
      isDeploymentOwner: false,
    }),
    friendClient: clientFor({
      userId: "friend-1",
      spaceId: "space-friend",
      email: "friend@sydney.test",
      isDeploymentOwner: false,
    }),
    overrides,
    prisma,
  };
}

describe("featureAccess API enforcement and admin controls", () => {
  it("reports effective featureAccess in me and blocks restricted routes for non-admins on native-linux", async () => {
    const { adminClient, friendClient } = createHarness();

    const adminMe = await adminClient.me();
    expect(adminMe.isAdmin).toBe(true);
    expect(adminMe.featureAccess).toEqual({
      computer: true,
      projects: true,
      github: true,
      integrations: true,
    });

    const friendMe = await friendClient.me();
    expect(friendMe.isAdmin).toBe(false);
    expect(friendMe.featureAccess).toEqual({
      computer: false,
      projects: false,
      github: false,
      integrations: false,
    });

    await expect(friendClient.computer.status({ botId: "bot-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      friendClient.bots.setComputer({ botId: "bot-1", mode: "dedicated" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(friendClient.projectWorkspaces.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(friendClient.github.status({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(friendClient.connections.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(friendClient.mcp.servers.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(friendClient.capabilities.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("lets admins list and toggle individual features per user, and rejects non-admin admin calls", async () => {
    const { adminClient, friendClient } = createHarness();

    await expect(friendClient.featureAccess.listUsers()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      friendClient.featureAccess.updateUser({ userId: "friend-1", github: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const listed = await adminClient.featureAccess.listUsers();
    expect(listed.restrictNonAdmins).toBe(true);
    expect(listed.users).toHaveLength(2);

    const updated = await adminClient.featureAccess.updateUser({
      userId: "friend-1",
      github: true,
    });
    expect(updated.effective).toEqual({
      computer: false,
      projects: false,
      github: true,
      integrations: false,
    });

    // GitHub is now allowed for friend, while computer / projects / integrations remain forbidden.
    await expect(friendClient.github.status({})).resolves.toEqual({ status: "disconnected" });
    await expect(friendClient.computer.status({ botId: "bot-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(friendClient.projectWorkspaces.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(friendClient.connections.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const refreshedMe = await friendClient.me();
    expect(refreshedMe.featureAccess).toEqual({
      computer: false,
      projects: false,
      github: true,
      integrations: false,
    });

    await expect(
      adminClient.featureAccess.updateUser({ userId: "admin-1", computer: false }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      adminClient.featureAccess.updateUser({ userId: "missing-user", computer: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("shares the verified admin main model with non-admins without exposing admin credentials", async () => {
    const adminCred = {
      id: "cred-admin-main",
      userId: "admin-1",
      provider: "openai-compatible",
      label: "Admin Primary",
      secretId: "sec-admin-main",
      supportsImages: true,
      createdAt: new Date("2026-11-01T00:00:00Z"),
      updatedAt: new Date("2026-11-01T00:00:00Z"),
      userPreferences: [
        {
          userId: "admin-1",
          credentialId: "cred-admin-main",
          modelId: "x-deepseek-v4.1-flash",
          thinkingLevel: null,
          createdAt: new Date("2026-11-01T00:00:00Z"),
          updatedAt: new Date("2026-11-01T00:00:00Z"),
        },
      ],
    };
    const { friendClient, prisma } = createHarness();
    vi.mocked(prisma.userModelRoleChoice.findMany).mockImplementation((async (args?: {
      where?: { userId?: string; role?: string };
    }) => {
      const where = args?.where;
      if (where?.userId === "admin-1" && (!where.role || where.role === "main")) {
        return [
          {
            role: "main",
            position: 0,
            provider: "openai-compatible",
            modelId: "x-deepseek-v4.1-flash",
            thinkingLevel: null,
            credentialId: "cred-admin-main",
          },
        ];
      }
      return [];
    }) as never);
    vi.mocked(prisma.userModelCredential.findFirst).mockImplementation((async (args?: {
      where?: { id?: string; userId?: string };
    }) => {
      const where = args?.where;
      if (where?.userId === "admin-1" && (!where.id || where.id === "cred-admin-main")) {
        return adminCred;
      }
      return null;
    }) as never);
    vi.mocked(prisma.secret.findFirst).mockImplementation((async (args?: {
      where?: { id?: string; userId?: string };
    }) => {
      const where = args?.where;
      if (where?.id === "sec-admin-main" && where?.userId === "admin-1") {
        return {
          id: "sec-admin-main",
          userId: "admin-1",
          spaceId: null,
          ciphertext: "enc",
        };
      }
      return null;
    }) as never);

    const friendMe = await friendClient.me();
    expect(friendMe.needsModel).toBe(false);
    expect(friendMe.defaultProvider).toBe("openai-compatible");
    expect(friendMe.defaultModel).toBe("x-deepseek-v4.1-flash");

    const roleView = await friendClient.models.role({ role: "main" });
    expect(roleView.primary).toBeNull();
    expect(roleView.deploymentPrimary).toEqual({
      provider: "openai-compatible",
      modelId: "x-deepseek-v4.1-flash",
    });

    // Friends never see or edit the admin's model connections.
    const friendCredentials = await friendClient.models.credentials();
    expect(friendCredentials).toEqual([]);
  });
});
