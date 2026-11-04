type NamedTool = { name: string };
type TaskGrant = { tool: string; action: string; resource: string };

const managedTools = new Set([
  "read_file",
  "list_files",
  "write_file",
  "shell",
  "computer_observe",
  "computer_act",
  "web_fetch",
  "remember",
]);

export function filterManagedTaskTools<Tool extends NamedTool>(
  tools: readonly Tool[],
  grants: readonly TaskGrant[],
): Tool[] {
  const granted = new Set(
    grants.filter((grant) => grant.action === "execute").map((grant) => grant.tool),
  );
  return tools.filter((tool) => managedTools.has(tool.name) && granted.has(tool.name));
}
