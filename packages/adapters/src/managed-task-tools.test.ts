import { expect, it } from "vitest";
import { filterManagedTaskTools } from "./managed-task-tools.js";

it("exposes only supported tools explicitly granted for execution", () => {
  const tools = ["read_file", "write_file", "run_subagent", "ask_user", "request_takeover", "web_fetch"]
    .map((name) => ({ name }));
  const grants = [
    { tool: "read_file", action: "execute", resource: "workspace" },
    { tool: "write_file", action: "inspect", resource: "workspace" },
    { tool: "run_subagent", action: "execute", resource: "workspace" },
    { tool: "ask_user", action: "execute", resource: "task:1" },
    { tool: "web_fetch", action: "execute", resource: "https://example.com/" },
  ];
  expect(filterManagedTaskTools(tools, grants).map((tool) => tool.name)).toEqual([
    "read_file",
    "web_fetch",
  ]);
});
