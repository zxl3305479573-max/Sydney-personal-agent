export type TaskToolBinding = {
  taskId: string;
  botId: string;
  grants: { tool: string; action: string; resource: string }[];
  requireExactWebUrl?: string;
};

const WORKSPACE_TOOLS = new Set(["read_file", "list_files", "write_file"]);
const DESKTOP_TOOLS = new Set(["shell", "computer_observe", "computer_act"]);
const FORBIDDEN_TOOLS = new Set(["run_subagent", "spawn_bot", "paid_request"]);

export function taskToolResource(
  tool: string,
  input: { url?: string; path?: string },
  binding: TaskToolBinding,
): string | null {
  if (FORBIDDEN_TOOLS.has(tool)) return null;
  if (tool === "remember") {
    return binding.grants.some(
      (grant) => grant.tool === "remember" && grant.resource === `memory:${binding.botId}`,
    )
      ? `memory:${binding.botId}`
      : null;
  }
  if (tool === "ask_user") {
    return binding.grants.some(
      (grant) => grant.tool === "ask_user" && grant.resource === `task:${binding.taskId}`,
    )
      ? `task:${binding.taskId}`
      : null;
  }
  if (WORKSPACE_TOOLS.has(tool)) {
    const path = input.path ?? "";
    if (
      path.startsWith("/") ||
      /^[a-z]:/i.test(path) ||
      path.split("/").some((part) => part === "..")
    ) {
      return null;
    }
    return "workspace";
  }
  if (tool === "web_fetch") {
    const url = input.url ?? "";
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
      if (binding.requireExactWebUrl) {
        parsed.hash = "";
        if (parsed.href !== binding.requireExactWebUrl) return null;
      }
      return binding.grants.some(
        (grant) => grant.tool === "web_fetch" && grant.resource === parsed.href,
      )
        ? parsed.href
        : null;
    } catch {
      return null;
    }
  }
  if (DESKTOP_TOOLS.has(tool)) {
    return binding.grants.some(
      (grant) => grant.tool === tool && grant.resource === `computer:${binding.botId}`,
    )
      ? `computer:${binding.botId}`
      : null;
  }
  return null;
}
