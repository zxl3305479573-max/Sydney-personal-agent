import { describe, expect, it } from "vitest";
import { taskToolResource } from "./task-tool-resource.js";

const binding = {
  taskId: "task",
  botId: "bot",
  requireExactWebUrl: "https://example.org/doc",
  grants: [
    { tool: "read_file", action: "execute", resource: "workspace" },
    { tool: "web_fetch", action: "execute", resource: "https://example.org/doc" },
    { tool: "remember", action: "execute", resource: "memory:bot" },
    { tool: "ask_user", action: "execute", resource: "task:task" },
  ],
};

describe("taskToolResource", () => {
  it("resolves workspace paths without escapes and exact URLs only", () => {
    expect(taskToolResource("read_file", { path: "a/b.txt" }, binding)).toBe("workspace");
    expect(taskToolResource("read_file", { path: "../escape" }, binding)).toBeNull();
    expect(taskToolResource("read_file", { path: "C:/x" }, binding)).toBeNull();
    expect(taskToolResource("web_fetch", { url: "https://example.org/doc#part" }, binding)).toBe(
      "https://example.org/doc",
    );
    expect(taskToolResource("web_fetch", { url: "http://example.org" }, binding)).toBeNull();
    expect(
      taskToolResource("web_fetch", { url: "https://user:pass@example.org" }, binding),
    ).toBeNull();
  });

  it.each(["run_subagent", "spawn_bot", "paid_request", "unknown", "user_computer_shell"])(
    "does not implicitly authorize %s",
    (tool) => {
      expect(taskToolResource(tool, {}, binding)).toBeNull();
    },
  );
});
