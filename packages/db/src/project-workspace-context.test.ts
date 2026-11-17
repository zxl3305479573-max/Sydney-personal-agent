import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { conversationScopeWhere, runInProjectWorkspace } from "./project-workspace-context.js";
import { currentDbContext, runAsSystem, runAsTenant } from "./row-security.js";
import { IsolationError } from "./scope.js";

const actor = { userId: "user-fixture", spaceId: "space-fixture" };

function fixture(rows: unknown[]) {
  const query = vi.fn(async () => rows);
  return { query, prisma: { $queryRaw: query } as unknown as PrismaClient };
}

describe("project conversation scope", () => {
  it("enters a project after its scoped metadata lookup and restores the outer tenant", async () => {
    const { prisma, query } = fixture([{
      id: "project-a", name: "Project", createdAt: new Date(0), updatedAt: new Date(0),
    }]);
    await runAsTenant(actor, async () => {
      await runInProjectWorkspace(prisma, actor, "project-a", () => {
        expect(conversationScopeWhere(actor)).toEqual({ ...actor, projectWorkspaceId: "project-a" });
        expect(currentDbContext()).toEqual({ kind: "tenant", ...actor, projectWorkspaceId: "project-a" });
      });
      expect(conversationScopeWhere(actor)).toEqual({ ...actor, projectWorkspaceId: null });
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("does not invoke project work when lookup returns no authorized metadata", async () => {
    const { prisma } = fixture([]);
    const callback = vi.fn();
    await expect(runInProjectWorkspace(prisma, actor, "project-a", callback)).rejects.toThrow(IsolationError);
    expect(callback).not.toHaveBeenCalled();
  });

  it("propagates lookup failures without running project work", async () => {
    const { prisma, query } = fixture([]);
    query.mockRejectedValueOnce(new Error("database unavailable"));
    const callback = vi.fn();
    await expect(runInProjectWorkspace(prisma, actor, "project-a", callback)).rejects.toThrow("database unavailable");
    expect(callback).not.toHaveBeenCalled();
  });

  it.each([
    { ...actor, userId: "other-user" },
    { ...actor, spaceId: "other-space" },
  ])("refuses to enter a different tenant from an existing tenant context", async (otherActor) => {
    const { prisma, query } = fixture([]);
    const callback = vi.fn();
    await expect(runAsTenant(actor, () =>
      runInProjectWorkspace(prisma, otherActor, "project-a", callback),
    )).rejects.toThrow(IsolationError);
    expect(query).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it("allows an audited system continuation to enter an authorized project", async () => {
    const { prisma } = fixture([{
      id: "project-a", name: "Project", createdAt: new Date(0), updatedAt: new Date(0),
    }]);
    await runAsSystem("synthetic continuation", () =>
      runInProjectWorkspace(prisma, actor, "project-a", () => {
        expect(conversationScopeWhere(actor)).toEqual({ ...actor, projectWorkspaceId: "project-a" });
      }),
    );
  });

  it("rejects actor mismatch and does not spread unrelated actor properties into queries", async () => {
    await runAsTenant({ ...actor, projectWorkspaceId: "project-a" }, () => {
      expect(() => conversationScopeWhere({ ...actor, userId: "other-user" })).toThrow(IsolationError);
      const extendedActor = { ...actor, email: "fixture@example.test", isDeploymentOwner: false };
      expect(conversationScopeWhere(extendedActor)).toEqual({ ...actor, projectWorkspaceId: "project-a" });
    });
  });

  it("uses home, not a wildcard, outside a project context", async () => {
    expect(conversationScopeWhere(actor)).toEqual({ ...actor, projectWorkspaceId: null });
    await runAsSystem("synthetic context test", () => {
      expect(conversationScopeWhere(actor)).toEqual({ ...actor, projectWorkspaceId: null });
    });
  });
});
