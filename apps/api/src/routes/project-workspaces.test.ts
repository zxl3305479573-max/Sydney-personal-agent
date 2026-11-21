import { describe, expect, it, vi } from "vitest";
import { currentDbContext } from "@rakazo/db";
import type { RouterContext } from "./context.js";
import { projectWorkspaceRoutes } from "./project-workspaces.js";

describe("project workspace creation gate", () => {
  it.each([false, true])("reports creation availability as %s", async (enabled) => {
    const handler = (callback: unknown) => callback;
    const routes = projectWorkspaceRoutes({
      deps: { env: { projectWorkspaceCreateExperiment: enabled } },
      authed: { projectWorkspaces: {
        directoryCapability: { handler }, directory: { handler }, unbindDirectory: { handler },
        cloudDirectory: { handler }, bindCloudDirectory: { handler }, unbindCloudDirectory: { handler },
        getBot: { handler }, updateBot: { handler },
        capabilities: { handler }, conversationCapabilities: { handler }, groupCreationCapability: { handler }, list: { handler }, get: { handler }, roster: { handler }, create: { handler }, removeEmpty: { handler }, createBot: { handler }, createGroup: { handler }, threadSnapshot: { handler }, sendText: { handler }, cancelRun: { handler }, answerApproval: { handler }, getArtifact: { handler }, subscribe: { handler }, consentStatus: { handler }, consentAllow: { handler },
      } },
    } as unknown as RouterContext);
    const capabilities = routes.projectWorkspaces.capabilities as unknown as () => Promise<unknown>;
    await expect(capabilities()).resolves.toEqual({ create: enabled, removeEmpty: enabled });
  });

  it("rejects creation without accessing the database", async () => {
    const query = vi.fn();
    const handler = (callback: unknown) => callback;
    const context = {
      deps: { prisma: { $queryRaw: query } },
      authed: {
        projectWorkspaces: {
          directoryCapability: { handler }, directory: { handler }, unbindDirectory: { handler },
          cloudDirectory: { handler }, bindCloudDirectory: { handler }, unbindCloudDirectory: { handler },
          capabilities: { handler },
          conversationCapabilities: { handler },
          groupCreationCapability: { handler },
          list: { handler },
          get: { handler },
          roster: { handler },
          create: { handler },
          removeEmpty: { handler },
          createBot: { handler },
          getBot: { handler },
          updateBot: { handler },
          createGroup: { handler },
          threadSnapshot: { handler },
          sendText: { handler },
          cancelRun: { handler },
          answerApproval: { handler },
          getArtifact: { handler },
          subscribe: { handler },
          consentStatus: { handler },
          consentAllow: { handler },
        },
      },
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
    const handler = (callback: unknown) => callback;
    const routes = projectWorkspaceRoutes({
      deps: {
        env: { projectWorkspaceCreateExperiment: true },
        prisma: { $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) },
      },
      authed: {
        projectWorkspaces: {
          directoryCapability: { handler }, directory: { handler }, unbindDirectory: { handler },
          cloudDirectory: { handler }, bindCloudDirectory: { handler }, unbindCloudDirectory: { handler },
          getBot: { handler }, updateBot: { handler },
          capabilities: { handler }, conversationCapabilities: { handler }, groupCreationCapability: { handler }, list: { handler }, get: { handler }, roster: { handler }, create: { handler }, removeEmpty: { handler }, createBot: { handler }, createGroup: { handler }, threadSnapshot: { handler }, sendText: { handler }, cancelRun: { handler }, answerApproval: { handler }, getArtifact: { handler }, subscribe: { handler }, consentStatus: { handler }, consentAllow: { handler },
        },
      },
    } as unknown as RouterContext);
    const create = routes.projectWorkspaces.create as unknown as (args: unknown) => Promise<unknown>;
    await expect(create({
      context: { actor: { userId: "user-a", spaceId: "space-a" } },
      input: { id, name: "Project" },
    })).resolves.toMatchObject({ id, name: "Project" });
    expect(query).toHaveBeenCalledTimes(3);
  });
});

describe("project workspace roster", () => {
  it("returns not found for an inaccessible project and an empty roster for an accessible one", async () => {
    const query = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([
      { kind: "workspace", id: "project-a", name: "" },
    ]);
    const handler = (callback: unknown) => callback;
    const routes = projectWorkspaceRoutes({
      deps: { prisma: { $queryRaw: query } },
      authed: {
        projectWorkspaces: {
          directoryCapability: { handler }, directory: { handler }, unbindDirectory: { handler },
          cloudDirectory: { handler }, bindCloudDirectory: { handler }, unbindCloudDirectory: { handler },
          getBot: { handler }, updateBot: { handler },
          capabilities: { handler }, conversationCapabilities: { handler }, groupCreationCapability: { handler }, list: { handler }, get: { handler }, roster: { handler }, create: { handler }, removeEmpty: { handler }, createBot: { handler }, createGroup: { handler }, threadSnapshot: { handler }, sendText: { handler }, cancelRun: { handler }, answerApproval: { handler }, getArtifact: { handler }, subscribe: { handler }, consentStatus: { handler }, consentAllow: { handler },
        },
      },
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
    const handler = (callback: unknown) => callback;
    const query = vi.fn().mockResolvedValue(rows);
    const createBot = vi.fn(async () => currentDbContext());
    const createGroup = vi.fn(async () => currentDbContext());
    const routes = projectWorkspaceRoutes({
      deps: { env: { projectConversationCreateExperiment: enabled }, prisma: { $queryRaw: query } },
      repos: { createBot },
      groupRepos: { createGroup },
      authed: { projectWorkspaces: {
        directoryCapability: { handler }, directory: { handler }, unbindDirectory: { handler },
        cloudDirectory: { handler }, bindCloudDirectory: { handler }, unbindCloudDirectory: { handler },
        getBot: { handler }, updateBot: { handler },
        capabilities: { handler }, conversationCapabilities: { handler }, groupCreationCapability: { handler }, list: { handler }, get: { handler }, roster: { handler },
        create: { handler }, removeEmpty: { handler }, createBot: { handler }, createGroup: { handler }, threadSnapshot: { handler }, sendText: { handler }, cancelRun: { handler }, answerApproval: { handler }, getArtifact: { handler }, subscribe: { handler }, consentStatus: { handler }, consentAllow: { handler },
      } },
    } as unknown as RouterContext);
    return { routes, query, createBot, createGroup };
  }

  it.each([false, true])("reports the test creation switch as %s", async (enabled) => {
    const { routes } = routesFor(enabled, []);
    const call = routes.projectWorkspaces.conversationCapabilities as unknown as () => Promise<unknown>;
    const groupCall = routes.projectWorkspaces.groupCreationCapability as unknown as () => Promise<unknown>;
    await expect(call()).resolves.toEqual({ createBot: enabled, botSettings: enabled });
    await expect(groupCall()).resolves.toEqual({ createGroup: enabled });
  });

  it.each(["createBot", "createGroup", "getBot", "updateBot"] as const)("keeps %s closed by default", async (method) => {
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

  it.each(["createBot", "createGroup", "getBot", "updateBot"] as const)("does not run %s for an inaccessible project", async (method) => {
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
