import type { AgentRuntime, SecretStore } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { currentDbContext, runAsTenant } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import type { ExecutorDeps } from "./executor-deps.js";
import { serializeModelSecret } from "./pi-oauth.js";
import { resolveRunModel } from "./run-model.js";
import { isAdminModelSharingEnabled, resolveSharedAdminModelRole } from "./shared-admin-model.js";

describe("isAdminModelSharingEnabled", () => {
  it("defaults to enabled on native-linux with admin emails and respects explicit overrides", () => {
    expect(
      isAdminModelSharingEnabled({
        sandboxProvider: "native-linux",
        adminEmails: ["owner@example.test"],
      }),
    ).toBe(true);
    expect(
      isAdminModelSharingEnabled({
        sandboxProvider: "native-linux",
        adminEmails: ["owner@example.test"],
        shareAdminModels: false,
      }),
    ).toBe(false);
    expect(
      isAdminModelSharingEnabled({
        sandboxProvider: "docker",
        adminEmails: ["owner@example.test"],
      }),
    ).toBe(false);
    expect(
      isAdminModelSharingEnabled({
        sandboxProvider: "docker",
        adminEmails: ["owner@example.test"],
        shareAdminModels: true,
      }),
    ).toBe(true);
    expect(
      isAdminModelSharingEnabled({
        sandboxProvider: "native-linux",
        adminEmails: [],
        shareAdminModels: true,
      }),
    ).toBe(false);
  });
});

describe("shared admin model resolution", () => {
  it("resolves verified admin primary and backup models and lets non-admin runs decrypt under runAsSystem", async () => {
    const adminId = "admin-1";
    const friendId = "friend-1";
    const primaryPlaintext = serializeModelSecret({
      kind: "openai_compatible",
      baseUrl: "https://models.example.test/v1",
      apiKey: "sk-admin-shared-key",
      enabledModelIds: ["x-deepseek-v4.1-flash"],
    });
    const backupPlaintext = serializeModelSecret({
      kind: "api_key",
      key: "sk-admin-deepseek-backup",
    });
    const secretsById = new Map([
      ["sec-primary", { id: "sec-primary", userId: adminId, spaceId: null, ciphertext: "ct-1" }],
      ["sec-backup", { id: "sec-backup", userId: adminId, spaceId: null, ciphertext: "ct-2" }],
    ]);
    const credentialsById = new Map([
      [
        "cred-primary",
        {
          id: "cred-primary",
          userId: adminId,
          provider: "openai-compatible",
          label: "Shared Primary",
          secretId: "sec-primary",
          supportsImages: true,
          createdAt: new Date("2026-11-01T00:00:00Z"),
          updatedAt: new Date("2026-11-01T00:00:00Z"),
          userPreferences: [
            {
              userId: adminId,
              credentialId: "cred-primary",
              modelId: "x-deepseek-v4.1-flash",
              thinkingLevel: null,
              createdAt: new Date("2026-11-01T00:00:00Z"),
              updatedAt: new Date("2026-11-01T00:00:00Z"),
            },
          ],
        },
      ],
      [
        "cred-backup",
        {
          id: "cred-backup",
          userId: adminId,
          provider: "deepseek",
          label: "Shared Backup",
          secretId: "sec-backup",
          supportsImages: false,
          createdAt: new Date("2026-11-01T00:00:00Z"),
          updatedAt: new Date("2026-11-01T00:00:00Z"),
          userPreferences: [
            {
              userId: adminId,
              credentialId: "cred-backup",
              modelId: "deepseek-flash",
              thinkingLevel: null,
              createdAt: new Date("2026-11-01T00:00:00Z"),
              updatedAt: new Date("2026-11-01T00:00:00Z"),
            },
          ],
        },
      ],
    ]);

    let systemReads = 0;
    const isSystemContext = () => currentDbContext()?.kind === "system";
    const prisma = {
      user: {
        findMany: vi.fn(async () => {
          if (isSystemContext()) systemReads += 1;
          return [{ id: adminId, email: "owner@sydney.test" }];
        }),
      },
      spaceSettingOverride: {
        findUnique: vi.fn(async () => null),
      },
      userModelRoleChoice: {
        findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
          where.userId === adminId && isSystemContext()
            ? [
                {
                  role: "main",
                  position: 0,
                  provider: "openai-compatible",
                  modelId: "x-deepseek-v4.1-flash",
                  thinkingLevel: null,
                  credentialId: "cred-primary",
                },
                {
                  role: "main",
                  position: 1,
                  provider: "deepseek",
                  modelId: "deepseek-flash",
                  thinkingLevel: null,
                  credentialId: "cred-backup",
                },
              ]
            : [],
        ),
      },
      spaceModelRoleChoice: {
        findMany: vi.fn(async () => []),
      },
      userModelCredential: {
        findFirst: vi.fn(async ({ where }: { where: { id?: string; userId?: string } }) => {
          if (where.userId === adminId && !isSystemContext()) return null;
          const found = where.id ? credentialsById.get(where.id) : undefined;
          return found && found.userId === where.userId ? found : null;
        }),
        findMany: vi.fn(async () => []),
      },
      userModelPreference: {
        findMany: vi.fn(async () => []),
      },
      secret: {
        findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => {
          // Simulate PostgreSQL RLS: friend cannot read admin secrets outside runAsSystem.
          if (where.userId === adminId && !isSystemContext()) return null;
          if (where.userId === adminId) systemReads += 1;
          const found = secretsById.get(where.id);
          return found && found.userId === where.userId ? found : null;
        }),
      },
      deploymentSettings: {
        findUnique: vi.fn(async () => null),
      },
    } as unknown as PrismaClient;

    const secretStore: Pick<SecretStore, "load"> = {
      load: vi.fn(async (ciphertext: string) =>
        ciphertext === "ct-1" ? primaryPlaintext : backupPlaintext,
      ),
    };

    const { shared, resolvedModel } = await runAsTenant(
      { userId: friendId, spaceId: "space-friend" },
      async () => {
        const resolvedShared = await resolveSharedAdminModelRole(
          { prisma, secretStore },
          { adminEmails: ["owner@sydney.test"], enabled: true },
        );
        const model = await resolveRunModel(
          {
            prisma,
            secretStore: secretStore as SecretStore,
            runtime: { describe: () => ({ capabilities: { scripted: false } }) } as AgentRuntime,
            deploymentModelConfigured: false,
            resolveSharedAdminModelRole: async () => resolvedShared,
          } as unknown as ExecutorDeps,
          { userId: friendId, spaceId: "space-friend" },
        );
        return { shared: resolvedShared, resolvedModel: model };
      },
    );

    expect(shared?.ownerUserId).toBe(adminId);
    expect(shared?.primary).toMatchObject({
      ownerUserId: adminId,
      provider: "openai-compatible",
      modelId: "x-deepseek-v4.1-flash",
      credential: expect.objectContaining({ id: "cred-primary", userId: adminId }),
    });
    expect(shared?.backups).toHaveLength(1);
    expect(shared?.backups[0]).toMatchObject({
      ownerUserId: adminId,
      provider: "deepseek",
      modelId: "deepseek-flash",
    });

    expect(resolvedModel).toMatchObject({
      provider: "openai-compatible",
      id: "x-deepseek-v4.1-flash",
      apiKey: "sk-admin-shared-key",
      baseUrl: "https://models.example.test/v1",
      acceptsImages: true,
    });
    expect(systemReads).toBeGreaterThanOrEqual(3);
  });
});
