import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import {
  CannotDeleteSpaceAsNonOwnerError,
  CannotDeleteSpaceWithProjectWorkspacesError,
  claimSpaceDeletionForMember,
} from "./spaces.js";

const input = { currentSpaceId: "current", spaceId: "target", userId: "owner" };

function fixture(
  options: {
    workspaceExists?: boolean;
    role?: string;
    queryFails?: boolean;
    authorized?: boolean | null;
    existingClaim?: boolean;
  } = {},
) {
  const events: string[] = [];
  const queryRaw = vi.fn(
    async (query: TemplateStringsArray | { text: string; values: unknown[] }) => {
      if ("text" in query) {
        if (query.text.includes("pg_advisory_xact_lock")) {
          events.push("lock");
          return [];
        }
        events.push("workspaces");
        expect(query.text).toContain('WHERE "spaceId" = $1');
        expect(query.values).toEqual([input.spaceId]);
        if (options.queryFails) throw new Error("workspace query failed");
        return [{ exists: options.workspaceExists ?? false }];
      }
      const sql = query.join("?");
      if (sql.includes("current_setting")) {
        events.push("system-read");
        return [{ bypass: "off", key: "", login: "test" }];
      }
      if (sql.includes("app_rls_bypass()")) {
        events.push("system-verify");
        return [{ authorized: options.authorized === undefined ? true : options.authorized }];
      }
      events.push(sql.includes("'on'") ? "system-on" : "system-restore");
      return [];
    },
  );
  const findUnique = vi
    .fn()
    .mockImplementationOnce(async () => {
      events.push("authenticate");
      return { organizationId: "org" };
    })
    .mockImplementationOnce(async () => {
      events.push("authorize");
      return {
        organizationId: "org",
        role: options.role ?? "owner",
        space: { isDefault: false, deletingAt: null },
      };
    });
  const updateMany = vi.fn(async () => {
    events.push("claim");
    return { count: 1 };
  });
  const tx = {
    $queryRaw: queryRaw,
    spaceMember: {
      findUnique,
      findMany: vi.fn().mockResolvedValue([
        { spaceId: "current", space: { isDefault: true } },
        { spaceId: "target", space: { isDefault: false } },
      ]),
    },
    space: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ deletingAt: options.existingClaim ? new Date(0) : null }),
      updateMany,
    },
  };
  const prisma = { $transaction: async (run: (client: typeof tx) => unknown) => run(tx) };
  return { prisma: prisma as unknown as PrismaClient, events, queryRaw, updateMany };
}

describe("Space deletion project workspace protection", () => {
  it("checks all users under system context before claiming an empty Space", async () => {
    const test = fixture();
    await expect(claimSpaceDeletionForMember(test.prisma, input)).resolves.toMatchObject({
      recovered: false,
    });
    expect(test.events).toEqual([
      "lock",
      "authenticate",
      "authorize",
      "system-read",
      "system-on",
      "system-verify",
      "workspaces",
      "system-restore",
      "claim",
    ]);
  });

  it("rejects a Space containing any member's workspace before claiming it", async () => {
    const test = fixture({ workspaceExists: true });
    await expect(claimSpaceDeletionForMember(test.prisma, input)).rejects.toBeInstanceOf(
      CannotDeleteSpaceWithProjectWorkspacesError,
    );
    expect(test.events).toContain("system-restore");
    expect(test.updateMany).not.toHaveBeenCalled();
  });

  it("does not inspect workspaces for a non-owner", async () => {
    const test = fixture({ role: "member" });
    await expect(claimSpaceDeletionForMember(test.prisma, input)).rejects.toBeInstanceOf(
      CannotDeleteSpaceAsNonOwnerError,
    );
    expect(test.events).toEqual(["lock", "authenticate", "authorize"]);
    expect(test.updateMany).not.toHaveBeenCalled();
  });

  it.each([false, null])("fails closed when system authorization is %s", async (authorized) => {
    const test = fixture({ authorized });
    await expect(claimSpaceDeletionForMember(test.prisma, input)).rejects.toThrow(
      "Cannot verify system authorization",
    );
    expect(test.events).toContain("system-restore");
    expect(test.events).not.toContain("workspaces");
    expect(test.updateMany).not.toHaveBeenCalled();
  });

  it("does not recover an existing claim when workspaces remain", async () => {
    const test = fixture({ workspaceExists: true, existingClaim: true });
    await expect(claimSpaceDeletionForMember(test.prisma, input)).rejects.toBeInstanceOf(
      CannotDeleteSpaceWithProjectWorkspacesError,
    );
    expect(test.updateMany).not.toHaveBeenCalled();
  });

  it("fails closed and restores system context if the query fails", async () => {
    const test = fixture({ queryFails: true });
    await expect(claimSpaceDeletionForMember(test.prisma, input)).rejects.toThrow(
      "workspace query failed",
    );
    expect(test.events).toContain("system-restore");
    expect(test.updateMany).not.toHaveBeenCalled();
  });
});
