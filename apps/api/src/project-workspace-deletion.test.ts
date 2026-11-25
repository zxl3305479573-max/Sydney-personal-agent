import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectWorkspaceDeletionDeps } from "./project-workspace-deletion.js";
import { deleteProjectWorkspaceWithContent } from "./project-workspace-deletion.js";

const dbMocks = vi.hoisted(() => ({
  claim: vi.fn(),
  renew: vi.fn(),
  release: vi.fn(),
  cancelRuns: vi.fn(),
  listBots: vi.fn(),
  finalize: vi.fn(),
}));

const adapterMocks = vi.hoisted(() => ({
  destroyBot: vi.fn(),
  cancelComputerRunWork: vi.fn(),
}));

vi.mock("@rakazo/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@rakazo/db")>();
  return {
    ...original,
    claimProjectWorkspaceDeletion: dbMocks.claim,
    renewProjectWorkspaceDeletionClaim: dbMocks.renew,
    releaseProjectWorkspaceDeletionClaim: dbMocks.release,
    cancelClaimedProjectWorkspaceRuns: dbMocks.cancelRuns,
    listClaimedProjectWorkspaceBots: dbMocks.listBots,
    finalizeProjectWorkspaceDeletion: dbMocks.finalize,
  };
});

vi.mock("@rakazo/adapters", async (importOriginal) => {
  const original = await importOriginal<typeof import("@rakazo/adapters")>();
  return {
    ...original,
    destroyBot: adapterMocks.destroyBot,
    cancelComputerRunWork: adapterMocks.cancelComputerRunWork,
  };
});

const actor = { spaceId: "space-a", userId: "user-a" };
const input = { id: "project-a", confirmRemoveAppData: true as const };

function makeDeps() {
  const deps = {
    prisma: {
      bot: { findUnique: vi.fn().mockResolvedValue({ id: "bot-1" }) },
    },
    sandbox: { releaseScreen: vi.fn().mockResolvedValue(undefined) },
    home: {},
    jobs: { cancel: vi.fn().mockResolvedValue(undefined) },
    events: { notify: vi.fn().mockResolvedValue(undefined) },
    artifacts: {},
    dataDir: "/tmp/sydney-test",
  } as unknown as ProjectWorkspaceDeletionDeps;
  return deps;
}

describe("deleteProjectWorkspaceWithContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.claim.mockResolvedValue({ claimId: "claim-1", name: "Alpha", recovered: false });
    dbMocks.renew.mockResolvedValue(true);
    dbMocks.release.mockResolvedValue(undefined);
    dbMocks.cancelRuns.mockResolvedValue({
      cancelledRunIds: ["run-1"],
      routineIds: ["routine-1"],
      threadNotifications: [{ threadId: "thread-1", seq: 7 }],
      teardownTargets: [
        {
          computer: { id: "comp-1", homeKey: "home-1", kind: "docker", providerRef: "sandbox-1" },
          botId: "bot-1",
          runId: "run-1",
          lease: { id: "lease-1" },
        },
      ],
    });
    dbMocks.listBots.mockResolvedValue([
      { id: "bot-1", userId: actor.userId, spaceId: actor.spaceId, name: "Bot 1", archivedAt: null, computerId: null, webhookSecretId: null },
      { id: "bot-2", userId: actor.userId, spaceId: actor.spaceId, name: "Bot 2", archivedAt: null, computerId: null, webhookSecretId: null },
    ]);
    dbMocks.finalize.mockResolvedValue(undefined);
    adapterMocks.destroyBot.mockResolvedValue(undefined);
    adapterMocks.cancelComputerRunWork.mockResolvedValue(undefined);
  });

  it("stops runs, wakes SSE streams, destroys every bot under system context, and finalizes deletion", async () => {
    const order: string[] = [];
    dbMocks.cancelRuns.mockImplementation(async () => {
      order.push("cancelRuns");
      return {
        cancelledRunIds: ["run-1"],
        routineIds: ["routine-1"],
        threadNotifications: [{ threadId: "thread-1", seq: 7 }],
        teardownTargets: [],
      };
    });
    adapterMocks.destroyBot.mockImplementation(async (_deps, bot: { id: string }) => {
      order.push(`destroy:${bot.id}`);
    });
    dbMocks.finalize.mockImplementation(async () => {
      order.push("finalize");
    });

    const deps = makeDeps();
    const result = await deleteProjectWorkspaceWithContent(deps, actor, input);

    expect(result).toEqual({ id: "project-a", name: "Alpha" });
    expect(order).toEqual(["cancelRuns", "destroy:bot-1", "destroy:bot-2", "finalize"]);
    expect(deps.jobs.cancel).toHaveBeenCalledTimes(2);
    expect(deps.events.notify).toHaveBeenCalledWith("thread-1", 7);
    expect(dbMocks.release).not.toHaveBeenCalled();
  });

  it("keeps the claim intact when bot teardown fails so a later retry can resume", async () => {
    const deps = makeDeps();
    adapterMocks.destroyBot.mockRejectedValueOnce(new Error("sandbox destroy failed"));

    await expect(deleteProjectWorkspaceWithContent(deps, actor, input)).rejects.toThrow(
      "sandbox destroy failed",
    );
    expect(dbMocks.release).not.toHaveBeenCalled();
    expect(dbMocks.finalize).not.toHaveBeenCalled();
  });

  it("releases a fresh claim when aborted before any destructive teardown starts", async () => {
    const deps = makeDeps();
    const abort = new AbortController();
    abort.abort(new Error("caller cancelled"));

    await expect(
      deleteProjectWorkspaceWithContent(deps, actor, input, abort.signal),
    ).rejects.toThrow("caller cancelled");
    expect(dbMocks.release).toHaveBeenCalledWith(deps.prisma, actor, {
      id: "project-a",
      claimId: "claim-1",
    });
    expect(dbMocks.cancelRuns).not.toHaveBeenCalled();
    expect(adapterMocks.destroyBot).not.toHaveBeenCalled();
  });

  it("does not release a claim when claim renewal fails before teardown", async () => {
    const deps = makeDeps();
    dbMocks.renew.mockRejectedValueOnce(new Error("transient db error"));

    await expect(deleteProjectWorkspaceWithContent(deps, actor, input)).rejects.toThrow(
      "transient db error",
    );
    expect(dbMocks.release).not.toHaveBeenCalled();
    expect(dbMocks.cancelRuns).not.toHaveBeenCalled();
    expect(adapterMocks.destroyBot).not.toHaveBeenCalled();
  });
});
