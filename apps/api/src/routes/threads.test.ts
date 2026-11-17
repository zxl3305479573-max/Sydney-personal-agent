import type { Actor } from "@rakazo/contracts";
import { runAsTenant } from "@rakazo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RouterDeps } from "../router.js";
import type { ThreadTarget } from "../thread-target.js";
import { releaseComputerControl } from "./computer.js";
import { assertProjectStreamAccess, takeoverReleaser } from "./threads.js";
import type { PrismaClient } from "@rakazo/db";

vi.mock("./computer.js", () => ({ releaseComputerControl: vi.fn().mockResolvedValue(undefined) }));

const actor = { spaceId: "space-1", userId: "user-1" } as Actor;

describe("takeoverReleaser", () => {
  const findUnique = vi.fn();
  const deps = { prisma: { run: { findUnique } } } as unknown as RouterDeps;

  beforeEach(() => {
    findUnique.mockReset();
    vi.mocked(releaseComputerControl).mockClear();
  });

  it("hands the screen back to the bot of a direct chat", async () => {
    findUnique.mockResolvedValue({ botId: "bot-1" });
    const target = { kind: "bot", botId: "bot-1", threadId: "thread-1" } as ThreadTarget;
    await takeoverReleaser(deps, actor, target)("run-1");
    expect(releaseComputerControl).toHaveBeenCalledWith(deps, actor, "bot-1", "done", "run-1");
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "run-1", threadId: "thread-1", spaceId: "space-1", userId: "user-1", projectWorkspaceId: null, botId: "bot-1" },
      select: { botId: true },
    });
  });

  it("hands the screen back to the group member whose run the reply steers", async () => {
    findUnique.mockResolvedValue({ botId: "bot-2" });
    const target = { kind: "group", threadId: "thread-2", memberBotIds: ["bot-1", "bot-2"] } as ThreadTarget;
    await runAsTenant({ ...actor, projectWorkspaceId: "project-1" }, () =>
      takeoverReleaser(deps, actor, target)("run-2"),
    );
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "run-2", threadId: "thread-2", spaceId: "space-1", userId: "user-1", projectWorkspaceId: "project-1" },
      select: { botId: true },
    });
    expect(releaseComputerControl).toHaveBeenCalledWith(deps, actor, "bot-2", "done", "run-2");
  });

  it("releases nothing when the run is gone", async () => {
    findUnique.mockResolvedValue(null);
    const target = { kind: "group", threadId: "thread-3", memberBotIds: ["bot-1"] } as ThreadTarget;
    await takeoverReleaser(deps, actor, target)("run-3");
    expect(releaseComputerControl).not.toHaveBeenCalled();
  });
});

describe("project stream access", () => {
  it("does not add a project lookup to home streams", async () => {
    const query = vi.fn();
    await assertProjectStreamAccess({ $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">, actor, null);
    expect(query).not.toHaveBeenCalled();
  });

  it("rechecks access and fails closed after the project becomes unavailable", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ id: "project-1", name: "Project", createdAt: new Date(0), updatedAt: new Date(0) }])
      .mockResolvedValueOnce([]);
    const prisma = { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">;
    await expect(assertProjectStreamAccess(prisma, actor, "project-1")).resolves.toBeUndefined();
    await expect(assertProjectStreamAccess(prisma, actor, "project-1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("does not allow a project event through when the access lookup fails", async () => {
    const query = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const prisma = { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">;
    await expect(assertProjectStreamAccess(prisma, actor, "project-1"))
      .rejects.toThrow("database unavailable");
  });
});
