import { describe, expect, it } from "vitest";
import { builtinAgentTools } from "./builtin-tools.js";
import { filterProjectTextTools, projectTextToolAllowed } from "./run-project-policy.js";
import { selectBuiltinToolsForRun } from "./run-tool-selection.js";

const options = {
  projectWorkspaceId: "project-a",
  graphicalToolsAllowed: true,
  pageBrowserAllowed: true,
  groupId: null,
  trigger: "user",
  semanticMemoryEnabled: true,
  historyRetrievalEnabled: true,
  cloudAgentEnabled: true,
  paymentWalletEnabled: true,
  githubEnabled: true,
  mediaImagesEnabled: true,
  mediaVideoEnabled: true,
  ticketBoardEnabled: true,
  phoneCallsEnabled: true,
  fleetManagement: true,
  userComputer: true,
  userComputerScreen: true,
  messagingChannelRun: false,
};

describe("project text tool policy", () => {
  it("offers only text, scoped history and the current bot's text profile", () => {
    expect(
      selectBuiltinToolsForRun(options)
        .map((tool) => tool.name)
        .sort(),
    ).toEqual(["ask_user", "message_user", "read_history", "search_history", "update_bot"]);
  });

  it("preserves disabled tools and the creation-only selection", () => {
    expect(
      selectBuiltinToolsForRun({
        ...options,
        disabledBuiltinTools: ["search_history", "update_bot"],
      })
        .map((tool) => tool.name)
        .sort(),
    ).toEqual(["ask_user", "message_user", "read_history"]);
    expect(
      selectBuiltinToolsForRun({ ...options, trigger: "created" })
        .map((tool) => tool.name)
        .sort(),
    ).toEqual(["ask_user", "update_bot"]);
  });

  it.each([
    ["user", "project-a", "read-only", ["project_read_file"]],
    ["user", "project-a", "read-write", ["project_create_file", "project_read_file"]],
    ["routine", "project-a", "read-write", []],
    ["user", null, "read-write", []],
  ] as const)("restricts file tools for %s in %s with %s", (trigger, projectWorkspaceId, projectDirectoryIntent, names) => {
    expect(selectBuiltinToolsForRun({
      ...options, trigger, projectWorkspaceId, projectDirectoryIntent,
    }).map((tool) => tool.name).filter((name) => name.startsWith("project_")).sort()).toEqual(names);
  });

  it("offers independent Windows diagnostics only in owner-started projects", () => {
    const names = (overrides: Partial<Parameters<typeof selectBuiltinToolsForRun>[0]> = {}) =>
      selectBuiltinToolsForRun({ ...options, projectWindowsTerminal: true, ...overrides })
        .map((tool) => tool.name);
    expect(names()).toContain("project_windows_terminal");
    expect(names()).not.toContain("user_computer_shell");
    expect(names({ projectWorkspaceId: null })).not.toContain("project_windows_terminal");
    expect(names({ trigger: "routine" })).not.toContain("project_windows_terminal");
    expect(names({ messagingChannelRun: true })).not.toContain("project_windows_terminal");
  });

  it.each([null, undefined])("retains homepage tools for scope %s", (projectWorkspaceId) => {
    const names = selectBuiltinToolsForRun({ ...options, projectWorkspaceId }).map(
      (tool) => tool.name,
    );
    expect(names).toEqual(
      expect.arrayContaining([
        "shell",
        "read_file",
        "user_computer_shell",
        "connect_app",
        "schedule_create",
      ]),
    );
  });

  it("narrows the bot profile schema without changing homepage definitions", () => {
    const profile = filterProjectTextTools(builtinAgentTools).find(
      (tool) => tool.name === "update_bot",
    );
    expect(Object.keys(profile?.inputSchema.properties ?? {}).sort()).toEqual([
      "color",
      "description",
      "instructions",
      "name",
    ]);
    expect(profile?.inputSchema.additionalProperties).toBe(false);
    expect(
      builtinAgentTools.find((tool) => tool.name === "update_bot")?.inputSchema.properties,
    ).toHaveProperty("dailyCheckIns");
  });

  it.each([
    "shell",
    "read_file",
    "user_computer_shell",
    "computer_observe",
    "browser_act",
    "run_subagent",
    "remember",
    "save_shared_memory",
    "scratchpad_list",
    "ticket_get",
    "skill_read",
    "cloud_agent_launch",
    "request_purchase",
    "github_read_repo",
    "composio_github_search",
    "catalog_execute",
    "unknown_tool",
  ])("denies %s even if explicitly called", (name) => {
    expect(projectTextToolAllowed(name)).toBe(false);
  });

  it.each([
    { bot_id: "other-bot", name: "Changed" },
    { dailyCheckIns: true },
    { artifact_id: "artifact-other-project" },
    { use_attached_image: true },
    { voice: "default" },
  ])("rejects unsupported bot changes %j", (args) => {
    expect(projectTextToolAllowed("update_bot", args)).toBe(false);
  });

  it("allows its own profile and the existing approved instruction edit metadata", () => {
    expect(projectTextToolAllowed("update_bot", { name: "Writer", color: "#8899AA" })).toBe(true);
    expect(
      projectTextToolAllowed("update_bot", {
        instructions: "Write clearly.",
        reason: "User request",
        previousInstructions: "",
        previousInstructionsFromBaseline: true,
      }),
    ).toBe(true);
  });
});
