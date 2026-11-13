export type WorkspaceScope = { kind: "home" } | { kind: "workspace"; workspaceId: string };

export type WorkspaceActor = {
  userId: string;
  spaceId: string;
};

export type WorkspaceScopedResource = WorkspaceActor & {
  workspaceId: string | null;
};

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

export function belongsToWorkspaceScope(
  actor: WorkspaceActor,
  scope: WorkspaceScope,
  resource: WorkspaceScopedResource | null | undefined,
): boolean {
  if (
    !actor ||
    typeof actor !== "object" ||
    !scope ||
    typeof scope !== "object" ||
    !resource ||
    typeof resource !== "object" ||
    !validId(actor.userId) ||
    !validId(actor.spaceId) ||
    resource.userId !== actor.userId ||
    resource.spaceId !== actor.spaceId
  ) {
    return false;
  }

  if (scope.kind === "home") {
    return resource.workspaceId === null;
  }

  return (
    scope.kind === "workspace" &&
    validId(scope.workspaceId) &&
    resource.workspaceId === scope.workspaceId
  );
}
