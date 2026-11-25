import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProjectCloudDirectory } from "@rakazo/db";
import type { RunContext } from "./run-context.js";
import type { ToolCall } from "./run-tool-gate.js";
import type { ToolRequest } from "./run-tool-request.js";
import {
  prepareProjectCloudCommand,
  runProjectCloudCommand,
} from "./run-tools-project-command.js";

vi.mock("@rakazo/db", async () => {
  const actual = await vi.importActual<typeof import("@rakazo/db")>("@rakazo/db");
  return { ...actual, getProjectCloudDirectory: vi.fn() };
});

const cloud = {
  computerId: "cloud-a",
  grantId: "a374627e-87a5-4f8d-a619-1c662ae431b7",
  homeKey: "private-bot-a",
  providerRef: "native:0123456789abcdef",
  folder: { path: "project", device: "12", inode: "34" },
  intent: "read-write" as const,
  available: true,
};

function fixture() {
  const projectCommandAvailable = vi.fn().mockResolvedValue(true);
  const executeProjectCommand = vi.fn().mockResolvedValue({
    stdout: "ok\n",
    stderr: "",
    code: 0,
  });
  const persistEffectResult = vi.fn().mockResolvedValue(true);
  const ctx = {
    context: {
      signal: new AbortController().signal,
      nativeRunLease: { owner: "worker-a", fence: 4, validate: async () => Date.now() + 5_000 },
    },
    deps: {
      sandbox: { projectCommandAvailable, executeProjectCommand },
      prisma: { externalEffect: { updateMany: vi.fn(), findUnique: vi.fn() } },
    },
    run: {
      id: "run-a",
      projectWorkspaceId: "project-a",
      spaceId: "space-a",
      userId: "owner-a",
      threadId: "thread-a",
      taskId: "task-a",
    },
    source: { ownerStartedRun: true, messagingChannelRun: false },
    runId: "run-a",
    workerId: "worker-a",
    fence: 4,
  } as unknown as RunContext;
  const call = {
    name: "project_cloud_command",
    args: {
      argv: ["python3", "-c", "print('ok')"],
      inputFiles: ["README.md"],
      timeoutMs: 1000,
      projectDirectory: { computerId: cloud.computerId, grantId: cloud.grantId },
    },
    claimedEffect: true,
    bypassApproval: false,
    applied: { effect: { id: "effect-a", status: "approved" } },
    persistEffectResult,
    finish: vi.fn(async (result: unknown) => result),
  } as unknown as ToolCall;
  return { ctx, call, projectCommandAvailable, executeProjectCommand, persistEffectResult };
}

describe("project cloud command tool", () => {
  beforeEach(() => {
    vi.mocked(getProjectCloudDirectory).mockReset().mockResolvedValue(cloud);
  });

  it("requires an available dedicated sandbox before creating an approval card", async () => {
    const { ctx, projectCommandAvailable } = fixture();
    const request = {
      name: "project_cloud_command",
      args: {
        argv: ["python3", "-c", "print('ok')"],
        inputFiles: ["README.md"],
        timeoutMs: 1000,
      },
      executionId: "command-a",
    } as unknown as ToolRequest;
    await expect(prepareProjectCloudCommand(ctx, request)).resolves.toBeUndefined();
    expect(projectCommandAvailable).toHaveBeenCalledWith(
      expect.objectContaining({ id: cloud.computerId, botId: cloud.homeKey }),
      expect.objectContaining({ botId: cloud.homeKey }),
    );
    expect(request.fleetSummary).toMatchObject({
      title: "Run this isolated project command?",
      onceOnly: true,
    });
  });

  it("executes only after approval and records the confirmed result", async () => {
    const { ctx, call, executeProjectCommand, persistEffectResult } = fixture();
    await expect(runProjectCloudCommand(ctx, call)).resolves.toEqual({
      stdout: "ok\n",
      stderr: "",
      code: 0,
    });
    expect(executeProjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: cloud.computerId, botId: cloud.homeKey }),
      cloud.folder,
      expect.objectContaining({ inputFiles: ["README.md"] }),
      expect.objectContaining({ botId: cloud.homeKey }),
    );
    expect(persistEffectResult).toHaveBeenCalledWith({ stdout: "ok\n", stderr: "", code: 0 });
  });

  it("refuses a changed cloud binding before dispatch", async () => {
    const { ctx, call, executeProjectCommand } = fixture();
    vi.mocked(getProjectCloudDirectory).mockResolvedValue({
      ...cloud,
      grantId: "f5a1e4bb-4a6f-4a9d-8c7f-1ce0d1e61a6b",
    });
    await expect(runProjectCloudCommand(ctx, call)).resolves.toEqual({
      error: expect.stringContaining("unavailable"),
    });
    expect(executeProjectCommand).not.toHaveBeenCalled();
  });
});
