import { describe, expect, it, vi } from "vitest";
import { currentDbContext } from "@rakazo/db";
import type { RouterContext } from "./context.js";
import { projectWorkspaceRoutes } from "./project-workspaces.js";

function authedProjectWorkspaces() {
  const handler = (callback: unknown) => callback;
  return {
    projectWorkspaces: {
      capabilities: { handler },
      conversationCapabilities: { handler },
      groupCreationCapability: { handler },
      list: { handler },
      get: { handler },
      roster: { handler },
      create: { handler },
      rename: { handler },
      removeEmpty: { handler },
      remove: { handler },
      createBot: { handler },
      createGroup: { handler },
      threadHead: { handler },
      threadSnapshot: { handler },
      messages: { handler },
      sendText: { handler },
      stop: { handler },
      markRead: { handler },
      subscribe: { handler },
      consentStatus: { handler },
      consentAllow: { handler },
    },
  };
}

describe("project workspace creation gate", () => {
  it.each([false, true])("reports creation availability as %s", async (enabled) => {
    const routes = projectWorkspaceRoutes({
      deps: { env: { projectWorkspaceCreateExperiment: enabled } },
      authed: authedProjectWorkspaces(),
    } as unknown as RouterContext);
    const capabilities = routes.projectWorkspaces.capabilities as unknown as () => Promise<unknown>;
    await expect(capabilities()).resolves.toEqual({ create: enabled, removeEmpty: enabled, remove: enabled });
  });

  it("gates non-empty project removal behind the experiment flag and maps lifecycle errors", async () => {
    const query = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const tx = {
      $queryRaw: query,
      spaceMember: { findUnique: vi.fn().mockResolvedValue({ organizationId: "org-a", space: { deletingAt: null } }) },
    };
    const disabledRoutes = projectWorkspaceRoutes({
      deps: { env: { projectWorkspaceCreateExperiment: false }, prisma: { $queryRaw: query } },
      authed: authedProjectWorkspaces(),
    } as unknown as RouterContext);
    const removeDisabled = disabledRoutes.projectWorkspaces.remove as unknown as (args: unknown) => Promise<unknown>;
    await expect(removeDisabled({ context: {}, input: {} })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    expect(query).not.toHaveBeenCalled();

    const enabledRoutes = projectWorkspaceRoutes({
      deps: {
        env: { projectWorkspaceCreateExperiment: true },
        prisma: { $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) },
      },
      authed: authedProjectWorkspaces(),
    } as unknown as RouterContext);
    const remove = enabledRoutes.projectWorkspaces.remove as unknown as (args: unknown) => Promise<unknown>;
    await expect(
      remove({
        context: { actor: { userId: "user-a", spaceId: "space-a" } },
        input: { id: "project-missing", confirmRemoveAppData: true },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const deletingSpaceTx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([]),
      spaceMember: {
        findUnique: vi.fn().mockResolvedValue({
          organizationId: "org-a",
          space: { deletingAt: new Date() },
        }),
      },
    };
    const deletingSpaceRoutes = projectWorkspaceRoutes({
      deps: {
        env: { projectWorkspaceCreateExperiment: true },
        prisma: {
          $transaction: async (callback: (client: typeof deletingSpaceTx) => unknown) =>
            callback(deletingSpaceTx),
        },
      },
      authed: authedProjectWorkspaces(),
    } as unknown as RouterContext);
    const removeDuringSpaceDelete = deletingSpaceRoutes.projectWorkspaces.remove as unknown as (
      args: unknown,
    ) => Promise<unknown>;
    await expect(
      removeDuringSpaceDelete({
        context: { actor: { userId: "user-a", spaceId: "space-a" } },
        input: { id: "project-a", confirmRemoveAppData: true },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects creation without accessing the database", async () => {
    const query = vi.fn();
    const context = {
      deps: { prisma: { $queryRaw: query } },
      authed: authedProjectWorkspaces(),
    } as unknown as RouterContext;
    const routes = projectWorkspaceRoutes(context);
    const create = routes.projectWorkspaces.create as unknown as (args: unknown) => Promise<unknown>;

    await expect(create({ context: {}, input: {} })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(query).not.toHaveBeenCalled();
  });

  it("uses the scoped creation transaction when the test experiment is enabled", async () => {
    const id = "a374627e-87a5-4f8d-a619-1c662ae431b7";
    const query = vi.fn()
      .mockResolvedValueOnce([{ projectDeletionClaimedAt: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id, name: "Project", createdAt: new Date(0), updatedAt: new Date(0),
      }]);
    const tx = {
      $queryRaw: query,
      spaceMember: { findUnique: vi.fn().mockResolvedValue({
        organizationId: "org-a", space: { deletingAt: null },
      }) },
    };
    const routes = projectWorkspaceRoutes({
      deps: {
        env: { projectWorkspaceCreateExperiment: true },
        prisma: { $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) },
      },
      authed: authedProjectWorkspaces(),
    } as unknown as RouterContext);
    const create = routes.projectWorkspaces.create as unknown as (args: unknown) => Promise<unknown>;
    await expect(create({
      context: { actor: { userId: "user-a", spaceId: "space-a" } },
      input: { id, name: "Project" },
    })).resolves.toMatchObject({ id, name: "Project" });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("maps account deletion and id conflict errors to CONFLICT on create", async () => {
    const id = "a374627e-87a5-4f8d-a619-1c662ae431b7";
    const makeRoutes = (query: ReturnType<typeof vi.fn>) => {
      const tx = {
        $queryRaw: query,
        spaceMember: { findUnique: vi.fn().mockResolvedValue({
          organizationId: "org-a", space: { deletingAt: null },
        }) },
      };
      return projectWorkspaceRoutes({
        deps: {
          env: { projectWorkspaceCreateExperiment: true },
          prisma: { $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) },
        },
        authed: authedProjectWorkspaces(),
      } as unknown as RouterContext);
    };
    const actor = { userId: "user-a", spaceId: "space-a" };
    const deletingRoutes = makeRoutes(vi.fn().mockResolvedValueOnce([{ projectDeletionClaimedAt: new Date(0) }]));
    const createDeleting = deletingRoutes.projectWorkspaces.create as unknown as (args: unknown) => Promise<unknown>;
    await expect(createDeleting({ context: { actor }, input: { id, name: "Project" } })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const conflictQuery = vi.fn()
      .mockResolvedValueOnce([{ projectDeletionClaimedAt: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id, name: "Existing", createdAt: new Date(0), updatedAt: new Date(0) }]);
    const conflictRoutes = makeRoutes(conflictQuery);
    const createConflict = conflictRoutes.projectWorkspaces.create as unknown as (args: unknown) => Promise<unknown>;
    await expect(createConflict({ context: { actor }, input: { id, name: "Other" } })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("gates rename and returns NOT_FOUND when the workspace is unavailable", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "project-a", name: "Renamed", createdAt: new Date(0), updatedAt: new Date(0) }]);
    const tx = {
      $queryRaw: query,
      spaceMember: { findUnique: vi.fn().mockResolvedValue({
        organizationId: "org-a", space: { deletingAt: null },
      }) },
    };
    const disabledRoutes = projectWorkspaceRoutes({
      deps: { env: { projectWorkspaceCreateExperiment: false }, prisma: { $queryRaw: query } },
      authed: authedProjectWorkspaces(),
    } as unknown as RouterContext);
    const renameDisabled = disabledRoutes.projectWorkspaces.rename as unknown as (args: unknown) => Promise<unknown>;
    await expect(renameDisabled({ context: {}, input: {} })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(query).not.toHaveBeenCalled();

    const enabledRoutes = projectWorkspaceRoutes({
      deps: {
        env: { projectWorkspaceCreateExperiment: true },
        prisma: { $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) },
      },
      authed: authedProjectWorkspaces(),
    } as unknown as RouterContext);
    const rename = enabledRoutes.projectWorkspaces.rename as unknown as (args: unknown) => Promise<unknown>;
    const actor = { userId: "user-a", spaceId: "space-a" };
    await expect(rename({ context: { actor }, input: { id: "project-missing", name: "Renamed" } }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(rename({ context: { actor }, input: { id: "project-a", name: "Renamed" } }))
      .resolves.toMatchObject({ id: "project-a", name: "Renamed" });
  });
});

describe("project workspace roster", () => {
  it("returns not found for an inaccessible project and an empty roster for an accessible one", async () => {
    const query = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([
      { kind: "workspace", id: "project-a", name: "" },
    ]);
    const routes = projectWorkspaceRoutes({
      deps: { prisma: { $queryRaw: query } },
      authed: authedProjectWorkspaces(),
    } as unknown as RouterContext);
    const roster = routes.projectWorkspaces.roster as unknown as (args: unknown) => Promise<unknown>;
    const request = {
      context: { actor: { userId: "user-a", spaceId: "space-a" } },
      input: { id: "project-a" },
    };

    await expect(roster(request)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(roster(request)).resolves.toEqual({
      bots: [], groups: [], nextBotId: null, nextGroupId: null,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });
});

describe("project conversation creation experiment", () => {
  function routesFor(enabled: boolean, rows: unknown[]) {
    const query = vi.fn().mockResolvedValue(rows);
    const createBot = vi.fn(async () => currentDbContext());
    const createGroup = vi.fn(async () => currentDbContext());
    const routes = projectWorkspaceRoutes({
      deps: { env: { projectConversationCreateExperiment: enabled }, prisma: { $queryRaw: query } },
      repos: { createBot },
      groupRepos: { createGroup },
      authed: authedProjectWorkspaces(),
    } as unknown as RouterContext);
    return { routes, query, createBot, createGroup };
  }

  it.each([false, true])("reports the test creation switch as %s", async (enabled) => {
    const { routes } = routesFor(enabled, []);
    const call = routes.projectWorkspaces.conversationCapabilities as unknown as () => Promise<unknown>;
    const groupCall = routes.projectWorkspaces.groupCreationCapability as unknown as () => Promise<unknown>;
    await expect(call()).resolves.toEqual({ createBot: enabled });
    await expect(groupCall()).resolves.toEqual({ createGroup: enabled });
  });

  it.each(["createBot", "createGroup"] as const)("keeps %s closed by default", async (method) => {
    const { routes, query, createBot, createGroup } = routesFor(false, []);
    const call = routes.projectWorkspaces[method] as unknown as (args: unknown) => Promise<unknown>;
    await expect(call({ context: {}, input: {} })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(query).not.toHaveBeenCalled();
    expect(createBot).not.toHaveBeenCalled();
    expect(createGroup).not.toHaveBeenCalled();
  });

  it.each(["createBot", "createGroup"] as const)("enters the authorized project for %s", async (method) => {
    const { routes } = routesFor(true, [{
      id: "project-a", name: "Project", createdAt: new Date(0), updatedAt: new Date(0),
    }]);
    const call = routes.projectWorkspaces[method] as unknown as (args: unknown) => Promise<unknown>;
    const actor = { userId: "user-a", spaceId: "space-a" };
    await expect(call({
      context: { actor },
      input: { projectId: "project-a", requestId: "project-group-request", bot: { name: "Bot" }, group: { name: "Group", botIds: [] } },
    })).resolves.toEqual({ kind: "tenant", ...actor, projectWorkspaceId: "project-a" });
  });

  it.each(["createBot", "createGroup"] as const)("does not run %s for an inaccessible project", async (method) => {
    const { routes, createBot, createGroup } = routesFor(true, []);
    const call = routes.projectWorkspaces[method] as unknown as (args: unknown) => Promise<unknown>;
    await expect(call({
      context: { actor: { userId: "user-a", spaceId: "space-a" } },
      input: { projectId: "project-a", bot: {}, group: {} },
    })).rejects.toThrow();
    expect(createBot).not.toHaveBeenCalled();
    expect(createGroup).not.toHaveBeenCalled();
  });
});
