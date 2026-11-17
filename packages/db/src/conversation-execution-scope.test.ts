import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { resolveConversationExecutionScope } from "./conversation-execution-scope.js";
import { runAsSystem, runAsTenant } from "./row-security.js";
import { IsolationError } from "./scope.js";

const actor = { spaceId: "space-fixture", userId: "user-fixture" };
const target = { ...actor, threadId: "thread-fixture", botId: "bot-fixture" };

function fixture(rows: unknown[]) {
  const query = vi.fn(async (_statement: { text: string; values: unknown[] }) => rows);
  return { query, prisma: { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw"> };
}

describe("conversation execution scope", () => {
  it("returns only stored ownership after an authorized project's relation query", async () => {
    const scope = { ...actor, projectWorkspaceId: "project-a" };
    const { prisma, query } = fixture([{ ...scope, localPath: "private" }]);
    await expect(runAsTenant(scope, () => resolveConversationExecutionScope(prisma, target)))
      .resolves.toEqual(scope);
    const statement = query.mock.calls[0]![0];
    expect(statement.values).toEqual(expect.arrayContaining([
      actor.spaceId, actor.userId, target.threadId, target.botId, "project-a",
    ]));
    expect(statement.text).toContain('b."projectWorkspaceId" IS NOT DISTINCT FROM t."projectWorkspaceId"');
    expect(statement.text).toContain('"chat_group_members"');
    expect(statement.text).toContain('c."botId" = b."id"');
    expect(statement.text).toContain('w."deletingAt" IS NULL');
    expect(statement.text).toContain('s."deletingAt" IS NULL');
  });

  it("allows a system continuation to derive its project from the stored thread", async () => {
    const scope = { ...actor, projectWorkspaceId: "project-original" };
    const { prisma } = fixture([scope]);
    await expect(runAsSystem("synthetic continuation", () =>
      resolveConversationExecutionScope(prisma, target),
    )).resolves.toEqual(scope);
  });

  it.each([
    { rows: [] },
    { rows: [
      { ...actor, projectWorkspaceId: null },
      { ...actor, projectWorkspaceId: null },
    ] },
  ])("rejects an absent or ambiguous relation", async ({ rows }) => {
    const { prisma } = fixture(rows);
    await expect(runAsTenant(actor, () => resolveConversationExecutionScope(prisma, target)))
      .rejects.toThrow(IsolationError);
  });

  it.each([
    { ...actor, projectWorkspaceId: "other-project" },
    { ...actor, projectWorkspaceId: "../invalid" },
    { ...actor, projectWorkspaceId: undefined },
    { ...actor, userId: "other-user", projectWorkspaceId: "project-a" },
    { ...actor, spaceId: "other-space", projectWorkspaceId: "project-a" },
  ])("rejects a row that does not prove the requested scope", async (row) => {
    const { prisma } = fixture([row]);
    await expect(runAsTenant({ ...actor, projectWorkspaceId: "project-a" }, () =>
      resolveConversationExecutionScope(prisma, target),
    )).rejects.toThrow(IsolationError);
  });

  it("does not query outside a database context or as another tenant", async () => {
    const { prisma, query } = fixture([]);
    await expect(resolveConversationExecutionScope(prisma, target)).rejects.toThrow(IsolationError);
    await expect(runAsTenant({ ...actor, userId: "other-user" }, () =>
      resolveConversationExecutionScope(prisma, target),
    )).rejects.toThrow(IsolationError);
    expect(query).not.toHaveBeenCalled();
  });

  it("propagates database failures", async () => {
    const { prisma, query } = fixture([]);
    query.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(runAsTenant(actor, () => resolveConversationExecutionScope(prisma, target)))
      .rejects.toThrow("database unavailable");
  });
});
