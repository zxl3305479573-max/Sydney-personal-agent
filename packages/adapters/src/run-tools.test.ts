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
    state: { tainted, handedOff: false, ownerSettingsRefused: false },
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

describe("dispatchTool audit outcomes", () => {
  it("does not execute a managed tool when cancelled during the approval gate", async () => {
    const ctx = dispatchContext(false);
    const controller = new AbortController();
    const managed = {
      ...ctx,
      context: { signal: controller.signal },
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
          scopes: [{ tool: "read_file", action: "execute", resource: "workspace" }],
        },
      },
    };
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
