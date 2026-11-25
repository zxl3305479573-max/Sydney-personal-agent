import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import {
  createProjectWorkspace,
  getProjectWorkspace,
  listProjectWorkspaceRoster,
  listProjectWorkspaces,
  ProjectWorkspaceConflictError,
  removeEmptyProjectWorkspace,
  renameProjectWorkspace,
} from "./project-workspace-read.js";
import { currentDbContext } from "./row-security.js";

const actor = { userId: "user-a", spaceId: "space-a" };
const date = new Date("2026-11-10T00:00:00.000Z");

describe("createProjectWorkspace", () => {
  it("throws ProjectWorkspaceConflictError when an existing id has a different name", async () => {
    const id = "a374627e-87a5-4f8d-a619-1c662ae431b7";
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ projectDeletionClaimedAt: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id, name: "Original", createdAt: date, updatedAt: date }]);
    const tx = {
      $queryRaw: query,
      spaceMember: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ organizationId: "org", space: { deletingAt: null } }),
      },
    };
    const prisma = {
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    } as unknown as PrismaClient;
    await expect(
      createProjectWorkspace(prisma, actor, { id, name: "Different" }),
    ).rejects.toBeInstanceOf(ProjectWorkspaceConflictError);
  });
});

describe("renameProjectWorkspace", () => {
  it("updates only an active owned workspace under the project tenant context", async () => {
    const query = vi.fn(async (statement: { text: string; values: unknown[] }) => {
      if (statement.text.includes('UPDATE "project_workspaces"')) {
        expect(currentDbContext()).toEqual({
          kind: "tenant",
          ...actor,
          projectWorkspaceId: "project-a",
        });
        expect(statement.text).toContain('w."deletingAt" IS NULL');
        expect(statement.text).toContain('s."deletingAt" IS NULL');
        expect(statement.values).toEqual(
          expect.arrayContaining(["Renamed", "project-a", actor.spaceId, actor.userId]),
        );
        return [{ id: "project-a", name: "Renamed", createdAt: date, updatedAt: date }];
      }
      return [];
    });
    const tx = {
      $queryRaw: query,
      spaceMember: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ organizationId: "org", space: { deletingAt: null } }),
      },
    };
    const prisma = {
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    } as unknown as PrismaClient;
    await expect(
      renameProjectWorkspace(prisma, actor, { id: "project-a", name: "  Renamed  " }),
    ).resolves.toEqual({
      id: "project-a",
      name: "Renamed",
      locationType: null,
      connectionStatus: "unknown",
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
    });
  });

  it("returns null when the workspace is inaccessible or deleting", async () => {
    const query = vi.fn().mockResolvedValue([]);
    const tx = {
      $queryRaw: query,
      spaceMember: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ organizationId: "org", space: { deletingAt: null } }),
      },
    };
    const prisma = {
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    } as unknown as PrismaClient;
    await expect(
      renameProjectWorkspace(prisma, actor, { id: "project-missing", name: "New" }),
    ).resolves.toBeNull();
  });
});

describe("removeEmptyProjectWorkspace", () => {
  it.each([true, false])("returns %s when the scoped delete succeeds", async (deleted) => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(deleted ? [{ id: "project-a" }] : []);
    const tx = {
      $queryRaw: query,
      spaceMember: {
        findUnique: vi.fn().mockResolvedValue({
          organizationId: "org",
          space: { deletingAt: null },
        }),
      },
    };
    const prisma = {
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    } as unknown as PrismaClient;
    await expect(
      removeEmptyProjectWorkspace(prisma, actor, {
        id: "project-a",
        confirmRemoveAppData: true,
      }),
    ).resolves.toBe(deleted);
    const sql = query.mock.calls[1]?.[0];
    expect(sql.text).toContain('DELETE FROM "project_workspaces"');
    expect(sql.text).toContain('NOT EXISTS (SELECT 1 FROM "artifacts"');
    expect(sql.values).toEqual(expect.arrayContaining(["project-a", actor.spaceId, actor.userId]));
  });
});

function fixture(count: number) {
  const query = vi.fn(async (statement: { text: string; values: unknown[] }) => {
    expect(currentDbContext()).toEqual({ kind: "tenant", ...actor });
    expect(statement.text).toContain('m."userId" = w."userId"');
    expect(statement.text).toContain('s."deletingAt" IS NULL');
    expect(statement.values).toContain(actor.userId);
    expect(statement.values).toContain(actor.spaceId);
    return Array.from({ length: count }, (_, index) => ({
      id: `workspace-${index}`,
      name: `Project ${index}`,
      createdAt: date,
      updatedAt: date,
      localPath: "private",
    }));
  });
  return {
    prisma: { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">,
    query,
  };
}

describe("listProjectWorkspaces", () => {
  it("returns only public metadata in the requesting tenant", async () => {
    const { prisma, query } = fixture(1);
    const result = await listProjectWorkspaces(prisma, actor);

    expect(result).toEqual({
      items: [
        {
          id: "workspace-0",
          name: "Project 0",
          locationType: null,
          connectionStatus: "unknown",
          createdAt: date.toISOString(),
          updatedAt: date.toISOString(),
        },
      ],
      nextCursor: null,
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("limits the page and provides a cursor for the next page", async () => {
    const { prisma } = fixture(101);
    const result = await listProjectWorkspaces(prisma, actor);
    expect(result.items).toHaveLength(100);
    expect(result.nextCursor).toEqual({ createdAt: date, id: "workspace-99" });
  });

  it("uses a parameterized cursor and rejects invalid cursor values", async () => {
    const { prisma, query } = fixture(0);
    await listProjectWorkspaces(prisma, actor, { createdAt: date, id: "workspace-1" });
    expect(query.mock.calls[0]?.[0].values).toContain("workspace-1");
    await expect(
      listProjectWorkspaces(prisma, actor, { createdAt: date, id: "../secret" }),
    ).rejects.toThrow("Invalid workspace listing scope");
    await expect(
      listProjectWorkspaces(prisma, actor, { createdAt: new Date("invalid"), id: "workspace-1" }),
    ).rejects.toThrow("Invalid workspace listing scope");
    expect(query).toHaveBeenCalledOnce();
  });

  it("propagates database errors", async () => {
    const failure = new Error("database unavailable");
    const prisma = {
      $queryRaw: vi.fn(async () => {
        throw failure;
      }),
    } as unknown as Pick<PrismaClient, "$queryRaw">;
    await expect(listProjectWorkspaces(prisma, actor)).rejects.toBe(failure);
  });
});

describe("getProjectWorkspace", () => {
  it("binds the requested id to the authenticated user and space", async () => {
    const { prisma, query } = fixture(1);
    const result = await getProjectWorkspace(prisma, actor, "workspace-0");
    expect(query.mock.calls[0]?.[0].values).toContain("workspace-0");
    expect(query.mock.calls[0]?.[0].text).toContain('w."deletingAt" IS NULL');
    expect(result?.id).toBe("workspace-0");
    expect(result).not.toHaveProperty("localPath");
    expect(result).not.toHaveProperty("userId");
  });

  it("returns no metadata when the scoped lookup finds nothing", async () => {
    const { prisma } = fixture(0);
    await expect(getProjectWorkspace(prisma, actor, "workspace-elsewhere")).resolves.toBeNull();
  });

  it("rejects invalid identity before querying and propagates database failures", async () => {
    const { prisma, query } = fixture(0);
    await expect(getProjectWorkspace(prisma, actor, "../workspace")).rejects.toThrow(
      "Invalid workspace scope",
    );
    expect(query).not.toHaveBeenCalled();
    const failure = new Error("database unavailable");
    query.mockRejectedValueOnce(failure);
    await expect(getProjectWorkspace(prisma, actor, "workspace-1")).rejects.toBe(failure);
  });
});

describe("listProjectWorkspaceRoster", () => {
  it("returns stored image avatars and group member identities from the project roster", async () => {
    const color = "data:image/png;base64,aW1hZ2U=";
    const member = { botId: "bot-image", name: "Selected avatar", color, avatarSet: "rakazo" };
    const query = vi.fn().mockResolvedValue([
      { kind: "workspace", id: "project-a", name: "" },
      { kind: "bot", id: member.botId, name: member.name, color, avatarSet: "rakazo" },
      { kind: "group", id: "group-a", name: "Group", members: [member] },
    ]);
    const prisma = { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">;
    const roster = await listProjectWorkspaceRoster(prisma, actor, { id: "project-a" });
    expect(roster?.bots[0]).toEqual({
      id: member.botId,
      name: member.name,
      color,
      avatarSet: "rakazo",
    });
    expect(roster?.groups[0]?.members).toEqual([member]);
    const statement = query.mock.calls[0]![0] as { text: string };
    expect(statement.text).toContain('b."color"');
    expect(statement.text).toContain('b."avatarSet"');
    expect(statement.text).toContain('b."projectWorkspaceId" =');
  });

  it("uses the requested tenant and project and bounds each result list", async () => {
    const query = vi.fn(async (statement: { text: string; values: unknown[] }) => {
      expect(currentDbContext()).toEqual({
        kind: "tenant",
        ...actor,
        projectWorkspaceId: "project-a",
      });
      expect(statement.text).toContain('b."projectWorkspaceId"');
      expect(statement.text).toContain('g."projectWorkspaceId"');
      expect(statement.text).toContain('w."deletingAt" IS NULL');
      expect(statement.text).toContain('ORDER BY "kind", "id"');
      expect(statement.values).toContain(actor.userId);
      expect(statement.values).toContain(actor.spaceId);
      expect(statement.values).toContain("project-a");
      return [
        { kind: "workspace", id: "project-a", name: "" },
        ...Array.from({ length: 101 }, (_, index) => ({
          kind: "bot",
          id: `bot-${index}`,
          name: "Bot",
        })),
        { kind: "group", id: "group-1", name: "Group" },
      ];
    });
    const prisma = { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">;
    const result = await listProjectWorkspaceRoster(prisma, actor, { id: "project-a" });
    if (!result) throw new Error("Expected an accessible project");
    expect(result.bots).toHaveLength(100);
    expect(result.groups).toEqual([{ id: "group-1", name: "Group" }]);
    expect(result.nextBotId).toBe("bot-99");
    expect(result.nextGroupId).toBeNull();
  });

  it("rejects an invalid project before querying", async () => {
    const { prisma, query } = fixture(0);
    await expect(listProjectWorkspaceRoster(prisma, actor, { id: "../project" })).rejects.toThrow(
      "Invalid workspace scope",
    );
    await expect(
      listProjectWorkspaceRoster(prisma, actor, { id: "project-a", afterBotId: "../bot" }),
    ).rejects.toThrow("Invalid workspace scope");
    expect(query).not.toHaveBeenCalled();
  });

  it("uses separate, parameterized cursors for bots and groups", async () => {
    const query = vi.fn(async (statement: { text: string; values: unknown[] }) => {
      expect(statement.text).toContain('b."id" >');
      expect(statement.text).toContain('g."id" >');
      expect(statement.values).toContain("bot-previous");
      expect(statement.values).toContain("group-previous");
      return [{ kind: "workspace", id: "project-a", name: "" }];
    });
    const prisma = { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">;
    await expect(
      listProjectWorkspaceRoster(prisma, actor, {
        id: "project-a",
        afterBotId: "bot-previous",
        afterGroupId: "group-previous",
      }),
    ).resolves.toEqual({ bots: [], groups: [], nextBotId: null, nextGroupId: null });
  });

  it("distinguishes an inaccessible project from an empty project", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ kind: "workspace", id: "project-a", name: "" }]);
    const prisma = { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">;
    await expect(
      listProjectWorkspaceRoster(prisma, actor, { id: "project-a" }),
    ).resolves.toBeNull();
    await expect(listProjectWorkspaceRoster(prisma, actor, { id: "project-a" })).resolves.toEqual({
      bots: [],
      groups: [],
      nextBotId: null,
      nextGroupId: null,
    });
  });
});
