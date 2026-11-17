import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import type { PrismaClient } from "./generated/prisma/client.js";
import { currentDbContext, installDbContext, rlsBypassKey, runAsSystem, runAsTenant, withRowLevelSecurity } from "./row-security.js";

describe("tenant project context", () => {
  const actor = { userId: "user-fixture", spaceId: "space-fixture" };

  it("inherits a project only for the same tenant and restores it after nested work", async () => {
    await runAsTenant({ ...actor, projectWorkspaceId: "project-a" }, async () => {
      await runAsTenant(actor, () => {
        expect(currentDbContext()).toEqual({ kind: "tenant", ...actor, projectWorkspaceId: "project-a" });
      });
      await runAsTenant({ ...actor, projectWorkspaceId: null }, () => {
        expect(currentDbContext()).toEqual({ kind: "tenant", ...actor });
      });
      await runAsTenant({ ...actor, userId: "other-user" }, () => {
        expect(currentDbContext()).toEqual({ kind: "tenant", ...actor, userId: "other-user" });
      });
      expect(currentDbContext()).toEqual({ kind: "tenant", ...actor, projectWorkspaceId: "project-a" });
    });
    expect(currentDbContext()).toBeUndefined();
  });

  it("keeps concurrent projects apart", async () => {
    await Promise.all(["project-a", "project-b"].map((projectWorkspaceId) =>
      runAsTenant({ ...actor, projectWorkspaceId }, async () => {
        await Promise.resolve();
        expect(currentDbContext()).toEqual({ kind: "tenant", ...actor, projectWorkspaceId });
      }),
    ));
    expect(currentDbContext()).toBeUndefined();
  });

  it("rejects an invalid project selection before invoking the callback", async () => {
    const callback = vi.fn();
    await expect(runAsTenant({ ...actor, projectWorkspaceId: "../other" }, callback)).rejects.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });

  it("clears a pooled project's SQL setting on home, system and unscoped checkouts", async () => {
    const query = vi.fn(async () => ({}));
    const client = { query, release: vi.fn() } as unknown as PoolClient;
    const pool = {
      options: { connectionString: "postgres://fixture:fixture@localhost/fixture" },
      connect: () => Promise.resolve(client),
    } as unknown as Pool;
    installDbContext(pool);
    await runAsTenant({ ...actor, projectWorkspaceId: "project-a" }, () => pool.connect());
    await runAsTenant({ ...actor, projectWorkspaceId: "project-b" }, () => pool.connect());
    await runAsTenant(actor, () => pool.connect());
    await runAsSystem("synthetic context test", () => pool.connect());
    await pool.connect();
    expect(query.mock.calls).toEqual([
      [expect.stringContaining("app.project_workspace_id"), [actor.spaceId, actor.userId, "off", "", "project-a"]],
      [expect.any(String), [actor.spaceId, actor.userId, "off", "", "project-b"]],
      [expect.any(String), [actor.spaceId, actor.userId, "off", "", ""]],
      [expect.any(String), ["", "", "on", expect.stringMatching(/^[a-f0-9]{64}$/), ""]],
      [expect.any(String), ["", "", "off", "", ""]],
    ]);
  });
});

describe("rlsBypassKey", () => {
  it("follows the password pg logs in with", () => {
    const key = rlsBypassKey("postgres://app:secret@db/rakazo");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(rlsBypassKey("postgres://app@db/rakazo?password=secret")).toBe(key);
    expect(rlsBypassKey("postgres://app:other@db/rakazo?password=secret")).toBe(key);
    expect(rlsBypassKey("postgres://app:secret@db/rakazo?password=")).toBe(key);
    expect(rlsBypassKey("postgres://app:s%cret@db/rakazo")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is empty without a password", () => {
    expect(rlsBypassKey("postgres://app@db/rakazo")).toBe("");
    expect(rlsBypassKey("not a url")).toBe("");
  });
});

describe("withRowLevelSecurity", () => {
  type AllOperations = (params: {
    model?: string;
    operation: string;
    args: unknown;
    query: (args: unknown) => Promise<unknown>;
    __internalParams?: { transaction?: { kind: string } };
  }) => Promise<unknown>;
  let extension: { query: { $allOperations: AllOperations } } | undefined;
  withRowLevelSecurity({
    $extends: (value: typeof extension) => {
      extension = value;
      return value;
    },
  } as unknown as PrismaClient);
  const allOperations = extension!.query.$allOperations;
  const deadlock = () => Object.assign(new Error("write conflict or deadlock"), { code: "P2034" });

  it("runs a statement that lost a deadlock again", async () => {
    const query = vi.fn().mockRejectedValueOnce(deadlock()).mockResolvedValueOnce(["row"]);

    const result = runAsTenant({ spaceId: "space-fixture", userId: "user-fixture" }, () =>
      allOperations({ model: "ExternalConversation", operation: "findMany", args: {}, query }),
    );

    await expect(result).resolves.toEqual(["row"]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("runs a findUnique rewritten as findFirst again after a deadlock", async () => {
    let rewritten: { query: { $allOperations: AllOperations } } | undefined;
    const findFirst = vi
      .fn()
      .mockRejectedValueOnce(deadlock())
      .mockResolvedValueOnce({ id: "row" });
    withRowLevelSecurity({
      _runtimeDataModel: { models: { UsageRecord: { fields: [{ name: "id" }] } } },
      usageRecord: { findFirst },
      $extends: (value: typeof rewritten) => {
        rewritten = value;
        return value;
      },
    } as unknown as PrismaClient);

    const result = runAsSystem("test fixture", () =>
      rewritten!.query.$allOperations({
        model: "UsageRecord",
        operation: "findUnique",
        args: { where: { id: "row" } },
        query: vi.fn(),
      }),
    );

    await expect(result).resolves.toEqual({ id: "row" });
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("leaves a statement inside a transaction to whoever opened it", async () => {
    const error = deadlock();
    const query = vi.fn().mockRejectedValue(error);

    const result = runAsSystem("test fixture", () =>
      allOperations({
        model: "UsageRecord",
        operation: "createMany",
        args: {},
        query,
        __internalParams: { transaction: { kind: "itx" } },
      }),
    );

    await expect(result).rejects.toBe(error);
    expect(query).toHaveBeenCalledOnce();
  });
});
