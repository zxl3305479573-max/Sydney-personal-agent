import type { AdapterContext } from "@rakazo/adapter-kit";
import type { TaskToolBinding } from "@rakazo/core";
import { taskToolResource } from "@rakazo/core";
import type { guardManagedRun } from "@rakazo/db";

type GuardFn = typeof guardManagedRun;

export function managedTaskToolGuard(
  binding: TaskToolBinding,
  guard: GuardFn,
  prisma: Parameters<GuardFn>[0],
  actor: { userId: string; spaceId: string },
) {
  return async (
    tool: string,
    input: { url?: string; path?: string },
    context: AdapterContext,
  ): Promise<{ allowed: boolean; reason?: string }> => {
    const resource = taskToolResource(tool, input, binding);
    if (!resource) return { allowed: false, reason: "scope_mismatch" };
    try {
      await guard(
        prisma,
        actor,
        binding.taskId,
        {
          runId: context.runId ?? "",
          workerId: context.operationId,
          fence: context.nativeRunLease?.fence ?? 0,
          action: { tool, action: "execute", resource },
        },
        0,
      );
      return { allowed: true };
    } catch {
      return { allowed: false, reason: "guard_rejected" };
    }
  };
}

export function managedTaskModelGuard(
  binding: TaskToolBinding,
  guard: GuardFn,
  prisma: Parameters<GuardFn>[0],
  actor: { userId: string; spaceId: string },
  tokenEstimate: number,
) {
  return async (context: AdapterContext): Promise<{ allowed: boolean; reason?: string }> => {
    try {
      await guard(
        prisma,
        actor,
        binding.taskId,
        {
          runId: context.runId ?? "",
          workerId: context.operationId,
          fence: context.nativeRunLease?.fence ?? 0,
          action: { tool: "model_call", action: "execute", resource: "model" },
        },
        tokenEstimate,
      );
      return { allowed: true };
    } catch {
      return { allowed: false, reason: "budget_or_control_blocked" };
    }
  };
}

export async function watchManagedTask(
  _prisma: Parameters<GuardFn>[0],
  _actor: { userId: string; spaceId: string },
  _taskId: string,
  _runId: string,
  isAborted: () => boolean,
): Promise<"continue" | "stop"> {
  for (let round = 0; round < 300; round += 1) {
    if (isAborted()) return "stop";
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return "stop";
}
