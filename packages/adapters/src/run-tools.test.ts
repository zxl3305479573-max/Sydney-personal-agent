import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApprovedEffectReplayQueue, terminatingToolResult } from "./approval-effect.js";

const audited = vi.hoisted(() => [] as { tool: string; outcome: string; metadata: unknown }[]);
vi.mock("./run-tool-gate.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./run-tool-gate.js")>()),
  // The approval gate is covered by its own tests; here it always lets the call through,
  // so the audit outcome dispatchTool records is the only behavior under test.
  gateToolCall: vi.fn(async (_ctx: unknown, request: { name: string; args: unknown }) => ({
    call: {
      name: request.name,
      args: request.args,
      executionId: "call-1",
      observer: undefined,
      connectorCall: { tool: request.name, args: request.args, executionId: "call-1" },
      effectKey: `effect-${request.name}`,
      applied: { effect: { id: `effect-${request.name}` } },
      nextApprovedTool: undefined,
      bypassApproval: false,
      claimedEffect: false,
      persistEffectResult: async () => true,
      finish: async (result: unknown) => result,
      claimOrReturn: async () => undefined,
    },
  })),
  auditToolCall: vi.fn(async (_ctx: unknown, tool: string, outcome: string, metadata: unknown) => {
    audited.push({ tool, outcome, metadata });
  }),
}));

import { gateToolCall } from "./run-tool-gate.js";
import { applyTool, isToolError } from "./run-tools.js";

function dispatchContext(tainted: boolean) {
  return {
    deps: {
      prisma: {
        user: {
          findUniqueOrThrow: async () => ({
            timezone: "UTC" as string | null,
            marketingEmailOptOutAt: null,
          }),
        },
      },
    },
    run: { userId: "user-1" },
    source: { ownerStartedRun: true },
    runId: "run-1",
    state: {
      tainted,
      handedOff: false,
      ownerSettingsRefused: false,
      earlierAttempt: Promise.resolve(false),
    },
    trust: {
      loadAutoReviewPreference: async () => ({ enabled: true, skipApprovals: false }),
      receivedOutsideMessage: async () => false,
    },
    tools: {
      disabled: new Set<string>(),
      approvedReplays: createApprovedEffectReplayQueue([]),
      connector: new Map(),
    },
    context: { signal: new AbortController().signal },
    secrets: [],
  };
}

beforeEach(() => {
  audited.length = 0;
});

describe("project text dispatch", () => {
  it.each([
    "shell",
    "read_file",
    "user_computer_shell",
    "run_subagent",
    "catalog_execute",
    "plugin_tool",
  ])("rejects %s before resolution, approval or execution", async (name) => {
    const ctx = dispatchContext(false);
    const resolveCall = vi.fn();
    const project = {
      ...ctx,
      run: { ...ctx.run, projectWorkspaceId: "project-a" },
      deps: { ...ctx.deps, connector: { resolveCall } },
    };
    vi.mocked(gateToolCall).mockClear();
    await expect(applyTool(project as never, name, {}, "call-1")).resolves.toEqual({
      error: "This tool or setting is unavailable in project text conversations.",
    });
    expect(resolveCall).not.toHaveBeenCalled();
    expect(gateToolCall).not.toHaveBeenCalled();
    expect(audited).toEqual([]);
  });

  it.each([{ dailyCheckIns: true }, { bot_id: "bot-other", name: "Changed" }])(
    "rejects an unsupported profile setting before approval: %j",
    async (args) => {
      const ctx = dispatchContext(false);
      const project = { ...ctx, run: { ...ctx.run, projectWorkspaceId: "project-a" } };
      vi.mocked(gateToolCall).mockClear();
      await expect(
        applyTool(project as never, "update_bot", args, "call-1"),
      ).resolves.toHaveProperty("error");
      expect(gateToolCall).not.toHaveBeenCalled();
    },
  );

  it("rejects a restored unsupported approval before reaching the gate", async () => {
    const ctx = dispatchContext(false);
    const project = {
      ...ctx,
      run: { ...ctx.run, projectWorkspaceId: "project-a" },
      tools: {
        ...ctx.tools,
        approvedReplays: createApprovedEffectReplayQueue([
          { kind: "update_bot", request: { dailyCheckIns: true } },
        ]),
      },
    };
    vi.mocked(gateToolCall).mockClear();
    await expect(
      applyTool(project as never, "update_bot", { name: "Writer" }, "call-1"),
    ).resolves.toEqual({
      error: "This tool or setting is unavailable in project text conversations.",
    });
    expect(gateToolCall).not.toHaveBeenCalled();
    expect(audited).toEqual([]);
  });
});

describe("dispatchTool audit outcomes", () => {
  function managedMandate(overrides?: Partial<{ expiresAt: number }>) {
    return {
      id: "mandate-1",
      userId: "user-1",
      spaceId: "space-1",
      botId: "bot-1",
      threadId: "thread-1",
      taskId: "task-1",
      runId: "run-1",
      source: "authenticated_user" as const,
      issuedAt: 1,
      expiresAt: overrides?.expiresAt ?? 9_999_999_999_999,
      scopes: [{ tool: "read_file", action: "execute", resource: "workspace" }],
    };
  }

  function managedExecutionState(
    overrides?: Partial<{
      intent: "continue" | "pause" | "cancel";
      maxToolCalls: number;
      toolCalls: Array<{ id: string; tool: string; reservedTokens: number }>;
    }>,
  ) {
    return {
      format: 1 as const,
      version: 1,
      currentRunId: "run-1",
      control: { intent: overrides?.intent ?? ("continue" as const), quiesced: false },
      completionEvidence: null,
      budget: {
        maxRuns: 3,
        maxToolCalls: overrides?.maxToolCalls ?? 10,
        maxModelCalls: 10,
        maxReservedTokens: 10_000,
        timeoutMs: 60_000,
      },
      deadline: null,
      modelCalls: 0,
      reservedTokens: 0,
      toolCalls: overrides?.toolCalls ?? [],
    };
  }

  function managedDispatchFixture(options?: {
    controller?: AbortController;
    mandate?: ReturnType<typeof managedMandate>;
    executionState?: ReturnType<typeof managedExecutionState>;
    computerGet?: ReturnType<typeof vi.fn>;
    onTransaction?: (callIndex: number, tx: Record<string, unknown>) => Promise<unknown> | void;
    onTaskUpdate?: () => Promise<unknown>;
  }) {
    const controller = options?.controller ?? new AbortController();
    const mandate = options?.mandate ?? managedMandate();
    const executionState = options?.executionState ?? managedExecutionState();
    const taskUpdate = vi.fn(async () => (options?.onTaskUpdate ? options.onTaskUpdate() : {}));
    const queryRaw = vi.fn(async () => [{ id: "task-1" }]);
    let txCall = 0;
    const tx = {
      $queryRaw: queryRaw,
      task: {
        findMany: vi.fn(async () => [
          {
            id: "task-1",
            userId: "user-1",
            spaceId: "space-1",
            projectWorkspaceId: null,
            botId: "bot-1",
            threadId: "thread-1",
            prompt: "read note",
            status: "running",
            createdAt: new Date(),
            updatedAt: new Date(),
            executionState,
          },
        ]),
        update: taskUpdate,
      },
      run: {
        findFirst: vi.fn(async () => ({
          id: "run-1",
          status: "running",
          leaseOwner: "worker-1",
          leaseFence: 1,
          leaseExpiresAt: new Date(Date.now() + 60_000),
          taskMandate: mandate,
        })),
      },
    };
    const managed = {
      ...dispatchContext(false),
      bot: { id: "bot-1" },
      workerId: "worker-1",
      fence: 1,
      context: { signal: controller.signal },
      computer: {
        get: options?.computerGet ?? vi.fn(),
        mode: "dedicated",
        checkpoint: { markDirty: vi.fn() },
        pageBrowserAllowed: false,
        acceptsImages: false,
      },
      deps: {
        ...dispatchContext(false).deps,
        prisma: {
          ...dispatchContext(false).deps.prisma,
          $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => {
            txCall += 1;
            if (options?.onTransaction) {
              const override = await options.onTransaction(txCall, tx);
              if (override !== undefined) return override;
            }
            return callback(tx);
          }),
        },
      },
      run: {
        userId: "user-1",
        spaceId: "space-1",
        projectWorkspaceId: null,
        trigger: "managed_task",
        taskMandate: mandate,
      },
    };
    return { managed, controller, taskUpdate, queryRaw, tx };
  }

  it("does not execute a managed tool when cancelled during the approval gate", async () => {
    const { managed, controller } = managedDispatchFixture();
    const originalGate = vi.mocked(gateToolCall).getMockImplementation()!;
    vi.mocked(gateToolCall).mockImplementationOnce(async (...arguments_) => {
      const outcome = await originalGate(...arguments_);
      controller.abort(new Error("stopped"));
      return outcome;
    });
    await expect(
      applyTool(managed as never, "read_file", { path: "note.txt" }, "call-1"),
    ).rejects.toThrow("stopped");
    expect(audited).toEqual([]);
  });

  it("denies a managed tool during pre-approval DB preflight without calling gateToolCall or mutating usage", async () => {
    const { managed, taskUpdate, queryRaw } = managedDispatchFixture({
      executionState: managedExecutionState({ intent: "pause" }),
    });
    vi.mocked(gateToolCall).mockClear();

    await expect(
      applyTool(managed as never, "read_file", { path: "note.txt" }, "call-1"),
    ).resolves.toEqual({
      error: "Managed task authorization or execution budget rejected this tool.",
    });
    expect(gateToolCall).not.toHaveBeenCalled();
    expect(taskUpdate).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
    expect(audited).toEqual([]);
  });

  it("runs read-only preflight before gateToolCall and commits usage only in guardManagedRun after approval", async () => {
    const order: string[] = [];
    const computerGet = vi.fn(async () => {
      order.push("handler");
      return { id: "comp-1", providerRef: "ref-1", botId: "home-1", kind: "fake" };
    });
    const { managed, taskUpdate, queryRaw } = managedDispatchFixture({
      computerGet,
      onTransaction: async (callIndex) => {
        order.push(callIndex === 1 ? "preflight" : "guard");
      },
    });
    (managed.deps as Record<string, unknown>).sandbox = {
      readFile: vi.fn(async () => new TextEncoder().encode("hello")),
    };
    const originalGate = vi.mocked(gateToolCall).getMockImplementation()!;
    vi.mocked(gateToolCall).mockClear();
    vi.mocked(gateToolCall).mockImplementationOnce(async (...arguments_) => {
      order.push("gate");
      expect(taskUpdate).not.toHaveBeenCalled();
      expect(queryRaw).not.toHaveBeenCalled();
      return originalGate(...arguments_);
    });

    const result = await applyTool(managed as never, "read_file", { path: "note.txt" }, "call-1");

    expect(result).toEqual({ path: "note.txt", content: "hello" });
    expect(order).toEqual(["preflight", "gate", "guard", "handler"]);
    expect(gateToolCall).toHaveBeenCalledOnce();
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(taskUpdate).toHaveBeenCalledOnce();
  });

  it("does not resolve, gate, or execute a handler when already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("already stopped"));
    const findUser = vi.fn(async () => ({ timezone: "UTC", marketingEmailOptOutAt: null }));
    const ctx = {
      ...dispatchContext(false),
      context: { signal: controller.signal },
      deps: { prisma: { user: { findUniqueOrThrow: findUser } } },
    };
    vi.mocked(gateToolCall).mockClear();

    await expect(applyTool(ctx as never, "update_preferences", {}, "call-1")).rejects.toThrow(
      "already stopped",
    );
    expect(gateToolCall).not.toHaveBeenCalled();
    expect(findUser).not.toHaveBeenCalled();
    expect(audited).toEqual([]);
  });

  it("does not gate or execute a handler when aborted during tool resolution", async () => {
    const controller = new AbortController();
    const resolveCall = vi.fn(async () => {
      controller.abort(new Error("stopped during resolve"));
      return undefined;
    });
    const executeTool = vi.fn(async () => ({ ok: true }));
    const ctx = {
      ...dispatchContext(false),
      context: { signal: controller.signal },
      deps: {
        ...dispatchContext(false).deps,
        connector: { resolveCall, executeTool },
      },
      tools: {
        ...dispatchContext(false).tools,
        connector: new Map([
          [
            "github_list",
            {
              name: "github_list",
              description: "List repos",
              inputSchema: {},
              route: { connectorId: "composio", toolName: "github_list" },
            },
          ],
        ]),
      },
    };
    vi.mocked(gateToolCall).mockClear();

    await expect(applyTool(ctx as never, "github_list", {}, "call-1")).rejects.toThrow(
      "stopped during resolve",
    );
    expect(resolveCall).toHaveBeenCalledOnce();
    expect(gateToolCall).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
    expect(audited).toEqual([]);
  });

  it("does not gate or execute a handler when aborted during request preparation", async () => {
    const controller = new AbortController();
    const ctx = {
      ...dispatchContext(false),
      context: { signal: controller.signal },
      trust: {
        ...dispatchContext(false).trust,
        loadAutoReviewPreference: vi.fn(async () => {
          controller.abort(new Error("stopped during prepare"));
          return { enabled: true, skipApprovals: false };
        }),
      },
    };
    vi.mocked(gateToolCall).mockClear();

    await expect(
      applyTool(ctx as never, "update_bot", { model: "test-model" }, "call-1"),
    ).rejects.toThrow("stopped during prepare");
    expect(gateToolCall).not.toHaveBeenCalled();
    expect(audited).toEqual([]);
  });

  it("does not execute the handler when an ordinary run aborts during the approval gate", async () => {
    const controller = new AbortController();
    const findUser = vi.fn(async () => ({ timezone: "UTC", marketingEmailOptOutAt: null }));
    const ctx = {
      ...dispatchContext(false),
      context: { signal: controller.signal },
      deps: { prisma: { user: { findUniqueOrThrow: findUser } } },
    };
    const originalGate = vi.mocked(gateToolCall).getMockImplementation()!;
    vi.mocked(gateToolCall).mockImplementationOnce(async (...arguments_) => {
      const outcome = await originalGate(...arguments_);
      controller.abort(new Error("stopped in gate"));
      return outcome;
    });

    await expect(applyTool(ctx as never, "update_preferences", {}, "call-1")).rejects.toThrow(
      "stopped in gate",
    );
    expect(findUser).not.toHaveBeenCalled();
    expect(audited).toEqual([]);
  });

  it.each(["resolved", "rejected"] as const)(
    "does not execute a managed handler when aborted while the DB guard %s",
    async (guardOutcome) => {
      const controller = new AbortController();
      const computerGet = vi.fn();
      const mandate = {
        id: "mandate-1",
        userId: "user-1",
        spaceId: "space-1",
        botId: "bot-1",
        threadId: "thread-1",
        taskId: "task-1",
        runId: "run-1",
        source: "authenticated_user" as const,
        issuedAt: 1,
        expiresAt: 9_999_999_999_999,
        scopes: [{ tool: "read_file", action: "execute", resource: "workspace" }],
      };
      const executionState = {
        format: 1 as const,
        version: 1,
        currentRunId: "run-1",
        control: { intent: "continue" as const, quiesced: false },
        completionEvidence: null,
        budget: {
          maxRuns: 3,
          maxToolCalls: 10,
          maxModelCalls: 10,
          maxReservedTokens: 10_000,
          timeoutMs: 60_000,
        },
        deadline: null,
        modelCalls: 0,
        reservedTokens: 0,
        toolCalls: [],
      };
      let txCalls = 0;
      const managed = {
        ...dispatchContext(false),
        workerId: "worker-1",
        fence: 1,
        context: { signal: controller.signal },
        computer: { get: computerGet },
        deps: {
          prisma: {
            $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
              txCalls += 1;
              if (guardOutcome === "rejected" && txCalls === 2) {
                controller.abort(new Error("stopped in guard"));
                throw new Error("db error after abort");
              }
              return callback({
                $queryRaw: vi.fn(async () => [{ id: "task-1" }]),
                task: {
                  findMany: vi.fn(async () => [
                    {
                      id: "task-1",
                      userId: "user-1",
                      spaceId: "space-1",
                      projectWorkspaceId: null,
                      botId: "bot-1",
                      threadId: "thread-1",
                      prompt: "read note",
                      status: "running",
                      createdAt: new Date(),
                      updatedAt: new Date(),
                      executionState,
                    },
                  ]),
                  update: vi.fn(async () => {
                    controller.abort(new Error("stopped in guard"));
                    return {};
                  }),
                },
                run: {
                  findFirst: vi.fn(async () => ({
                    id: "run-1",
                    status: "running",
                    leaseOwner: "worker-1",
                    leaseFence: 1,
                    leaseExpiresAt: new Date(Date.now() + 60_000),
                    taskMandate: mandate,
                  })),
                },
              });
            }),
          },
        },
        run: {
          userId: "user-1",
          spaceId: "space-1",
          projectWorkspaceId: null,
          trigger: "managed_task",
          taskMandate: mandate,
        },
      };

      vi.mocked(gateToolCall).mockClear();
      await expect(
        applyTool(managed as never, "read_file", { path: "note.txt" }, "call-1"),
      ).rejects.toThrow("stopped in guard");
      expect(gateToolCall).toHaveBeenCalledOnce();
      expect(computerGet).not.toHaveBeenCalled();
      expect(audited).toEqual([]);
    },
  );

  it("refuses managed helper delegation before the approval gate", async () => {
    const ctx = dispatchContext(false);
    const managed = {
      ...ctx,
      run: {
        userId: "user-1",
        trigger: "managed_task",
        taskMandate: {
          id: "mandate-1",
          userId: "user-1",
          spaceId: "space-1",
          botId: "bot-1",
          threadId: "thread-1",
          taskId: "task-1",
          runId: "run-1",
          source: "authenticated_user",
          issuedAt: 1,
          expiresAt: 9_999_999_999_999,
          scopes: [{ tool: "run_subagent", action: "execute", resource: "workspace" }],
        },
      },
    };
    vi.mocked(gateToolCall).mockClear();
    await expect(applyTool(managed as never, "run_subagent", {}, "call-1")).resolves.toEqual({
      error: "Managed task permission does not allow this tool or resource.",
    });
    expect(gateToolCall).not.toHaveBeenCalled();
  });

  it("records an ordinary successful call as a success", async () => {
    const ctx = dispatchContext(true);
    const result = await applyTool(ctx as never, "update_preferences", {}, "call-1");
    expect(result).toEqual({ timezone: "UTC", marketingEmails: true });
    expect(audited).toEqual([
      {
        tool: "update_preferences",
        outcome: "success",
        metadata: { effectId: "effect-update_preferences", autoApproved: false },
      },
    ]);
  });

  it("records every owner-settings refusal of update_preferences as a failure", async () => {
    const ctx = dispatchContext(true);
    const first = await applyTool(
      ctx as never,
      "update_preferences",
      { marketingEmails: false },
      "call-1",
    );
    expect(first).toEqual({ error: expect.stringContaining("outside content") });
    const repeat = await applyTool(
      ctx as never,
      "update_preferences",
      { marketingEmails: false },
      "call-2",
    );
    expect(repeat).toMatchObject({ terminate: true, details: { refused: "owner-settings" } });
    expect(audited.map((entry) => entry.outcome)).toEqual(["failure", "failure"]);
    expect(audited[1]!.metadata).toEqual({
      effectId: "effect-update_preferences",
      autoApproved: false,
    });
  });

  it("ends the turn on a repeated update_bot owner-settings refusal", async () => {
    const ctx = dispatchContext(true);
    const first = await applyTool(ctx as never, "update_bot", { model: "test-model" }, "call-1");
    expect(first).toEqual({ error: expect.stringContaining("outside content") });
    const repeat = await applyTool(ctx as never, "update_bot", { model: "test-model" }, "call-2");
    expect(repeat).toMatchObject({
      kind: "agent_tool_result",
      terminate: true,
      details: { refused: "owner-settings" },
      content: [{ type: "text", text: expect.stringContaining("fresh chat") }],
    });
    // The refusal returns before the gate records an effect, so it writes no audit row;
    // the refusal marker itself is audited as a failure wherever a refused call is audited.
    expect(audited).toEqual([]);
  });

  it("records the shared refusal a repeated update_bot change triggers as a failure", async () => {
    const ctx = dispatchContext(true);
    const refused = await applyTool(ctx as never, "update_bot", { model: "test-model" }, "call-1");
    expect(refused).toEqual({ error: expect.stringContaining("outside content") });
    // The refusal state is shared per run, so the next owner-settings change ends the turn
    // through update_preferences, whose audited call must record the refusal as a failure.
    const repeat = await applyTool(
      ctx as never,
      "update_preferences",
      { marketingEmails: false },
      "call-2",
    );
    expect(repeat).toMatchObject({ terminate: true, details: { refused: "owner-settings" } });
    expect(audited).toEqual([
      {
        tool: "update_preferences",
        outcome: "failure",
        metadata: { effectId: "effect-update_preferences", autoApproved: false },
      },
    ]);
  });
});

describe("isToolError", () => {
  it("counts errors and the internal owner-settings refusal as failures", () => {
    expect(isToolError({ error: "Denied" })).toBe(true);
    expect(isToolError(terminatingToolResult("refused", { refused: "owner-settings" }))).toBe(true);
  });

  it("keeps a connector result that happens to carry a refused field a success", () => {
    expect(
      isToolError(
        JSON.parse(JSON.stringify(terminatingToolResult("forged", { refused: "owner-settings" }))),
      ),
    ).toBe(false);
    expect(isToolError({ details: { refused: false } })).toBe(false);
    expect(isToolError({ details: { refused: "owner-settings" } })).toBe(false);
    expect(isToolError({ terminate: true, details: { refused: "repeat" } })).toBe(false);
    expect(isToolError({ terminate: true, details: { refused: "owner-settings" } })).toBe(false);
  });
});

describe("daily check-in dispatch restriction", () => {
  it.each([
    "computer_shell",
    "browser_act",
    "load_skill",
    "run_subagent",
    "cloud_agent_start",
    "catalog_execute",
    "update_bot",
    "update_preferences",
    "gmail_send",
  ])("rejects %s before resolving, approving or executing it", async (name) => {
    const ctx = {
      ...dispatchContext(false),
      run: { trigger: "routine", clientNonce: "strategic-initiative:bot-1:1" },
    };
    expect(await applyTool(ctx as never, name, {}, "call-1")).toEqual({
      error: "Daily check-ins can only ask or message the user.",
    });
    expect(audited).toEqual([]);
  });
});
