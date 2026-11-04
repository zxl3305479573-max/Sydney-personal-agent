import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { runAsTenant } from "./row-security.js";
import { readTaskExecutionHistory } from "./task-execution-history.js";

const actor = { userId: "user-1", spaceId: "space-1" };

function harness(rows: Array<{ id: string; status: string; attempts: { id: string }[]; effects: { id: string; status: string }[] }>) {
  const findMany = vi.fn(async () => rows);
  const prisma = {
    $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({ run: { findMany } }),
    ),
  } as unknown as PrismaClient;
  return { prisma, findMany };
}

describe("managed task history bounds", () => {
  it("accepts exactly the Run limit and uses stable ordering", async () => {
    const db = harness([{ id: "run-1", status: "completed", attempts: [], effects: [] }]);
    const result = await runAsTenant(actor, () =>
      readTaskExecutionHistory(db.prisma, actor, "task-1", { maxRuns: 1 }),
    );
    expect(result.historyComplete).toBe(true);
    expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 2,
    }));
  });

  it("marks excess Runs incomplete without exposing the sentinel", async () => {
    const db = harness([
      { id: "run-1", status: "completed", attempts: [], effects: [] },
      { id: "run-2", status: "running", attempts: [], effects: [{ id: "effect-2", status: "intended" }] },
    ]);
    const result = await runAsTenant(actor, () =>
      readTaskExecutionHistory(db.prisma, actor, "task-1", { maxRuns: 1 }),
    );
    expect(result.historyComplete).toBe(false);
    expect(result.runs.map((run) => run.id)).toEqual(["run-1"]);
    expect(result.unresolvedEffects).toEqual([]);
  });
});
