import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { listProjectWorkspaces } from "./project-workspace-read.js";
import { currentDbContext } from "./row-security.js";

const actor = { userId: "user-a", spaceId: "space-a" };
const date = new Date("2026-11-10T00:00:00.000Z");

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
