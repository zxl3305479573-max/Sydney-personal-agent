import { describe, expect, it, vi } from "vitest";
import type { RunContext } from "./run-context.js";
import { COMPUTER_SANDBOX_TOOL_NAMES, selectBuiltinToolsForRun } from "./run-tool-selection.js";
import { applyTool } from "./run-tools.js";

describe("executor feature access tool gating", () => {
  it("strips all cloud computer sandbox tools when computerEnabled is false while preserving chat tools", () => {
    const tools = selectBuiltinToolsForRun({
      computerEnabled: false,
      graphicalToolsAllowed: false,
      pageBrowserAllowed: false,
      groupId: null,
      trigger: "user",
      semanticMemoryEnabled: false,
      githubEnabled: false,
      messagingChannelRun: false,
      followUpFromUser: true,
    });
    const names = new Set(tools.map((tool) => tool.name));
    for (const forbidden of COMPUTER_SANDBOX_TOOL_NAMES) {
      expect(names.has(forbidden), `expected ${forbidden} to be excluded`).toBe(false);
    }
    expect(names.has("web_search")).toBe(true);
    expect(names.has("web_fetch")).toBe(true);
    expect(names.has("remember")).toBe(true);
    expect(names.has("finance_list_bills")).toBe(true);
    expect(names.has("github_get_profile")).toBe(false);
  });

  it("rejects computer, github, and connector tool calls in dispatchTool when featureAccess denies them", async () => {
    const getComputer = vi.fn();
    const connectorCall = vi.fn();
    const ctx = {
      context: { signal: new AbortController().signal },
      run: { projectWorkspaceId: null, trigger: "user" },
      state: { handedOff: false, tainted: false },
      tools: {
        disabled: new Set<string>(),
        connector: new Map([["mcp_slack_post", { name: "mcp_slack_post" }]]),
      },
      computer: {
        get: getComputer,
        pageBrowserAllowed: false,
        acceptsImages: false,
      },
      deps: {
        connector: { invokeTool: connectorCall },
      },
      featureAccess: {
        computer: false,
        projects: false,
        github: false,
        integrations: false,
      },
    } as unknown as RunContext;

    await expect(applyTool(ctx, "shell", { command: "id" }, "exec-1")).resolves.toEqual({
      error: "Cloud computer access is disabled for this account.",
    });
    await expect(applyTool(ctx, "computer_observe", {}, "exec-2")).resolves.toEqual({
      error: "Cloud computer access is disabled for this account.",
    });
    await expect(applyTool(ctx, "read_file", { path: "notes.txt" }, "exec-3")).resolves.toEqual({
      error: "Cloud computer access is disabled for this account.",
    });
    await expect(applyTool(ctx, "github_get_profile", {}, "exec-4")).resolves.toEqual({
      error: "GitHub access is disabled for this account.",
    });
    await expect(applyTool(ctx, "mcp_slack_post", {}, "exec-5")).resolves.toEqual({
      error: "Connected apps and MCP plugins are disabled for this account.",
    });

    expect(getComputer).not.toHaveBeenCalled();
    expect(connectorCall).not.toHaveBeenCalled();
  });
});
