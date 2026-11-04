import type { PrismaClient } from "./client.js";
import { IsolationError } from "./scope.js";
import { currentDbContext } from "./row-security.js";
import { RUN_TURN_CHECKPOINT_KIND } from "./run-turn-checkpoint.js";
import { Prisma } from "./generated/prisma/client.js";

type Tenant = { userId: string; spaceId: string };

export type TaskExecutionHistoryLimits = {
  maxRuns?: number;
  maxAttempts?: number;
  maxEffects?: number;
};

export type TaskExecutionHistory = {
  runs: { id: string; status: string; attempts: number }[];
  unresolvedEffects: string[];
  pendingEffects: string[];
  historyComplete: boolean;
};

const DEFAULT_LIMITS = { maxRuns: 100, maxAttempts: 1000, maxEffects: 1000 };

export async function readTaskExecutionHistory(
  prisma: PrismaClient,
  actor: Tenant,
  taskId: string,
  limits: TaskExecutionHistoryLimits = {},
): Promise<TaskExecutionHistory> {
  const context = currentDbContext();
  if (!context || context.kind !== "tenant" || context.userId !== actor.userId || context.spaceId !== actor.spaceId) {
    throw new IsolationError();
  }
  const maxRuns = Math.min(Math.max(limits.maxRuns ?? DEFAULT_LIMITS.maxRuns, 1), 10_000);
  const maxAttempts = Math.min(Math.max(limits.maxAttempts ?? DEFAULT_LIMITS.maxAttempts, 1), 10_000);
  const maxEffects = Math.min(Math.max(limits.maxEffects ?? DEFAULT_LIMITS.maxEffects, 1), 10_000);
  const effectsPerRun = Math.max(1, Math.floor(maxEffects / maxRuns));
  return prisma.$transaction(async (tx) => {
    const runs = await tx.run.findMany({
      where: { taskId, ...actor },
      select: {
        id: true,
        status: true,
        attempts: { select: { id: true }, take: maxAttempts + 1 },
        effects: {
          where: {
            NOT: [{ kind: RUN_TURN_CHECKPOINT_KIND }, { status: { in: ["completed", "denied", "reconciled"] } }],
          },
          select: { id: true, status: true },
          take: effectsPerRun + 1,
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: maxRuns + 1,
    });
    const visibleRuns = runs.slice(0, maxRuns);
    const totalEffects = visibleRuns.reduce((total, run) => total + run.effects.length, 0);
    const historyComplete =
      runs.length <= maxRuns &&
      totalEffects <= maxEffects &&
      visibleRuns.every((run) => run.attempts.length <= maxAttempts && run.effects.length <= effectsPerRun);
    return {
      runs: visibleRuns.map((run) => ({ id: run.id, status: run.status, attempts: Math.min(run.attempts.length, maxAttempts) })),
      unresolvedEffects: visibleRuns.flatMap((run) => run.effects.filter((e) => e.status === "intended").map((e) => e.id)),
      pendingEffects: visibleRuns.flatMap((run) => run.effects.filter((e) => !["completed", "denied", "intended"].includes(e.status)).map((e) => e.id)),
      historyComplete,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
