import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import {
  bindProjectDirectory,
  getProjectDirectoryBinding,
  removeProjectDirectoryBinding,
} from "./project-directory.js";
import { currentDbContext } from "./row-security.js";

const actor = { userId: "user-a", spaceId: "space-a" };
const projectId = "project-a";
const binding = {
  deviceId: "device-a",
  grantId: "746acaf1-0a4f-477d-822d-7357e7e8fe72",
  directoryName: "example",
  intent: "read-only" as const,
};

function transaction(rows: unknown[][]) {
  const statements: Array<{ text: string; values: unknown[] }> = [];
  const query = vi.fn(async (statement: { text: string; values: unknown[] }) => {
    expect(currentDbContext()).toEqual({ kind: "tenant", ...actor, projectWorkspaceId: projectId });
    statements.push(statement);
    return rows.shift() ?? [];
  });
  const tx = {
    $queryRaw: query,
    spaceMember: {
      findUnique: vi.fn(async () => ({ organizationId: "org-a", space: { deletingAt: null } })),
    },
  };
  const prisma = {
    $transaction: async (operation: (client: typeof tx) => unknown) => operation(tx),
  } as unknown as PrismaClient;
  return { prisma, query, statements };
}

describe("project directory storage", () => {
  it("binds under owner, membership, project, paired session and device locks", async () => {
    const state = transaction([
      [{ projectDeletionClaimedAt: null }],
      [],
      [{ id: projectId }],
      [{ id: binding.deviceId }],
      [{ grantId: binding.grantId }],
    ]);
    await expect(
      bindProjectDirectory(state.prisma, actor, projectId, "session-a", binding),
    ).resolves.toEqual(binding);
    expect(state.statements[2]?.text).toContain("FOR UPDATE");
    expect(state.statements[3]?.text).toContain('JOIN "session"');
    expect(state.statements[3]?.values).toEqual([
      binding.deviceId,
      actor.userId,
      "session-a",
      actor.userId,
    ]);
    expect(state.statements[4]?.text).toContain('ON CONFLICT ("projectId")');
    expect(state.statements[4]?.text).toContain(
      '"project_directory_bindings"."grantId" = EXCLUDED."grantId"',
    );
    expect(state.statements[4]?.text).toContain('"project_directory_bindings"."intent" = EXCLUDED."intent"');
  });

  it.each(["project", "device", "conflict"])(
    "does not bind when the %s is unavailable",
    async (kind) => {
      const rows = [
        [{ projectDeletionClaimedAt: null }],
        [],
        kind === "project" ? [] : [{ id: projectId }],
      ];
      if (kind !== "project") rows.push(kind === "device" ? [] : [{ id: binding.deviceId }]);
      if (kind === "conflict") rows.push([]);
      const state = transaction(rows);
      await expect(
        bindProjectDirectory(state.prisma, actor, projectId, "session-a", binding),
      ).resolves.toBeNull();
      expect(state.query).toHaveBeenCalledTimes(kind === "project" ? 3 : kind === "device" ? 4 : 5);
    },
  );

  it("reads metadata only in the fixed project tenant", async () => {
    const query = vi.fn(async (statement: { text: string; values: unknown[] }) => {
      expect(currentDbContext()).toEqual({
        kind: "tenant",
        ...actor,
        projectWorkspaceId: projectId,
      });
      expect(statement.values).toEqual([projectId, actor.spaceId, actor.userId]);
      return [
        {
          deviceId: binding.deviceId,
          grantId: binding.grantId,
          directoryName: binding.directoryName,
          intent: "read-only",
        },
      ];
    });
    await expect(
      getProjectDirectoryBinding({ $queryRaw: query } as unknown as PrismaClient, actor, projectId),
    ).resolves.toEqual(binding);
  });

  it("removes only the expected grant and checks current membership", async () => {
    const query = vi.fn().mockResolvedValue([{ grantId: binding.grantId }]);
    await expect(
      removeProjectDirectoryBinding(
        { $queryRaw: query } as unknown as PrismaClient,
        actor,
        projectId,
        binding.grantId,
      ),
    ).resolves.toBe(true);
    const statement = query.mock.calls[0]?.[0];
    expect(statement.text).toContain('m."userId" = w."userId"');
    expect(statement.values).toEqual([projectId, actor.spaceId, actor.userId, binding.grantId]);
  });
});
