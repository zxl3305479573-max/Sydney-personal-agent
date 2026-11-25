import type {
  AdapterContext,
  AgentHomeStore,
  ArtifactStore,
  JobPublisher,
  SandboxProvider,
} from "@rakazo/adapter-kit";
import { routineJobKey, runJobKey } from "@rakazo/adapter-kit";
import {
  cancelComputerRunWork,
  destroyBot,
  screenLeaseIdForRun,
  toComputerRef,
} from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import {
  cancelClaimedProjectWorkspaceRuns,
  claimProjectWorkspaceDeletion,
  finalizeProjectWorkspaceDeletion,
  listClaimedProjectWorkspaceBots,
  PROJECT_WORKSPACE_DELETION_CLAIM_TIMEOUT_MS,
  ProjectWorkspaceDeletionInProgressError,
  releaseProjectWorkspaceDeletionClaim,
  renewProjectWorkspaceDeletionClaim,
  runAsSystem,
} from "@rakazo/db";
import { getLogger } from "@rakazo/logging";

const PROJECT_TEARDOWN_TIMEOUT_MS = 120_000;

export type ProjectWorkspaceDeletionDeps = {
  prisma: PrismaClient;
  sandbox: SandboxProvider;
  home: AgentHomeStore;
  jobs: JobPublisher;
  events: ThreadEvents;
  artifacts: ArtifactStore;
  dataDir: string;
  messagingInstallations?: Parameters<typeof destroyBot>[0]["messagingInstallations"];
  /** Test hook for bounding one teardown step without introducing global env knobs. */
  teardownTimeoutMs?: number;
};

/**
 * Removes a non-empty project workspace's server-side app data (never local user files).
 * Claiming sets `deletingAt` + `deletionClaimId`, immediately hiding project rows from
 * tenant RLS and blocking concurrent writes. A crashed worker leaves the claim intact so
 * a retry after five minutes can safely resume from the remaining bots.
 */
export async function deleteProjectWorkspaceWithContent(
  deps: ProjectWorkspaceDeletionDeps,
  actor: Pick<Actor, "spaceId" | "userId">,
  input: { id: string; confirmRemoveAppData: true },
  signal?: AbortSignal,
): Promise<{ id: string; name: string }> {
  const stepTimeoutMs =
    deps.teardownTimeoutMs && deps.teardownTimeoutMs > 0
      ? deps.teardownTimeoutMs
      : PROJECT_TEARDOWN_TIMEOUT_MS;
  let claimId: string | null = null;
  let claimActive = false;
  let claimHealthy = true;
  let claimReleasable = false;
  let claimRenewal: ReturnType<typeof setInterval> | null = null;
  const context = (botId?: string): AdapterContext => ({
    operationId: `projectWorkspaces.remove:${input.id}`,
    traceId: `projectWorkspaces.remove:${input.id}`,
    spaceId: actor.spaceId,
    userId: actor.userId,
    ...(botId ? { botId } : {}),
    signal: new AbortController().signal,
  });

  try {
    const claim = await claimProjectWorkspaceDeletion(deps.prisma, actor, input);
    claimId = claim.claimId;
    claimActive = true;
    claimReleasable = !claim.recovered;
    const claimedInput = { id: input.id, claimId };

    const assertClaim = async () => {
      if (!claimHealthy) throw new ProjectWorkspaceDeletionInProgressError();
      try {
        const renewed = await renewProjectWorkspaceDeletionClaim(deps.prisma, actor, claimedInput);
        if (!renewed) {
          claimHealthy = false;
          claimReleasable = false;
          throw new ProjectWorkspaceDeletionInProgressError();
        }
      } catch (error) {
        claimHealthy = false;
        claimReleasable = false;
        throw error;
      }
    };

    claimRenewal = setInterval(() => {
      void assertClaim().catch((renewalError) => {
        if (claimActive) {
          getLogger().error("project workspace deletion claim renewal failed", renewalError);
        }
      });
    }, PROJECT_WORKSPACE_DELETION_CLAIM_TIMEOUT_MS / 5);
    claimRenewal.unref?.();

    const teardown = async (work: () => Promise<unknown>, timeoutMessage: string) => {
      await assertClaim();
      claimReleasable = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          work(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              claimHealthy = false;
              claimReleasable = false;
              reject(new Error(timeoutMessage));
            }, stepTimeoutMs);
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      await assertClaim();
    };

    // If the caller already aborted before any destructive teardown starts, release a fresh
    // claim cleanly instead of leaving the workspace locked for five minutes.
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error("Project deletion aborted");
    }

    // Once `deletingAt` is stamped, RESTRICTIVE RLS hides project rows from tenant queries,
    // so run cancellation and per-bot teardown execute under controlled system context with
    // explicit `(id, spaceId, userId, deletionClaimId)` checks.
    await assertClaim();
    claimReleasable = false;
    const stopped = await cancelClaimedProjectWorkspaceRuns(deps.prisma, actor, claimedInput);
    await Promise.allSettled([
      ...stopped.cancelledRunIds.map((runId) => deps.jobs.cancel(runJobKey(runId))),
      ...stopped.routineIds.map((routineId) => deps.jobs.cancel(routineJobKey(routineId))),
    ]);
    await Promise.allSettled(
      stopped.teardownTargets.map(async ({ computer, botId, runId, lease }) => {
        if (!computer.providerRef) return;
        const stopContext = {
          operationId: `projectWorkspaces.remove:${input.id}`,
          traceId: `projectWorkspaces.remove:${input.id}`,
          spaceId: actor.spaceId,
          userId: actor.userId,
          botId,
          runId,
          screenLeaseId: screenLeaseIdForRun(lease, runId),
          cancelRunWork: true,
          signal: new AbortController().signal,
        };
        const ref = toComputerRef(computer);
        await cancelComputerRunWork(deps.sandbox, ref, computer.id, runId, stopContext);
        await deps.sandbox.releaseScreen?.(ref, stopContext).catch(() => undefined);
      }),
    );
    await Promise.allSettled(
      stopped.threadNotifications.map(({ threadId, seq }) =>
        deps.events.notify(threadId, seq).catch(() => undefined),
      ),
    );

    await runAsSystem("destroy bots in claimed project workspace", async () => {
      const bots = await listClaimedProjectWorkspaceBots(deps.prisma, actor, claimedInput);
      for (const bot of bots) {
        try {
          await teardown(
            () =>
              destroyBot(deps, bot, context(bot.id), {
                deleteMemories: true,
                strictTeardown: true,
              }),
            "Project bot teardown timed out",
          );
        } catch (error) {
          if (!claimHealthy) throw error;
          const remaining = await deps.prisma.bot.findUnique({
            where: { id: bot.id },
            select: { id: true },
          });
          if (remaining) throw error;
        }
      }
    });

    await assertClaim();
    claimActive = false;
    if (claimRenewal) {
      clearInterval(claimRenewal);
      claimRenewal = null;
    }
    await finalizeProjectWorkspaceDeletion(deps.prisma, actor, claimedInput);
    return { id: input.id, name: claim.name };
  } catch (error) {
    if (claimId && claimReleasable) {
      await releaseProjectWorkspaceDeletionClaim(deps.prisma, actor, {
        id: input.id,
        claimId,
      }).catch((releaseError) => {
        getLogger().error("project workspace deletion claim release failed", releaseError);
      });
    }
    throw error;
  } finally {
    claimActive = false;
    if (claimRenewal) clearInterval(claimRenewal);
  }
}
