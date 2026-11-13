import { describe, expect, it } from "vitest";
import { belongsToWorkspaceScope } from "./workspace-scope.js";

const actor = { userId: "user-a", spaceId: "space-a" };
const home = { ...actor, workspaceId: null };
const folder = { ...actor, workspaceId: "folder-a" };

describe("belongsToWorkspaceScope", () => {
  it("keeps the ordinary home separate from folder workspaces", () => {
    expect(belongsToWorkspaceScope(actor, { kind: "home" }, home)).toBe(true);
    expect(belongsToWorkspaceScope(actor, { kind: "home" }, folder)).toBe(false);
    expect(
      belongsToWorkspaceScope(actor, { kind: "workspace", workspaceId: "folder-a" }, folder),
    ).toBe(true);
    expect(
      belongsToWorkspaceScope(actor, { kind: "workspace", workspaceId: "folder-a" }, home),
    ).toBe(false);
    expect(
      belongsToWorkspaceScope(actor, { kind: "workspace", workspaceId: "folder-b" }, folder),
    ).toBe(false);
  });

  it("rejects missing resources and other users or spaces", () => {
    const scope = { kind: "workspace" as const, workspaceId: "folder-a" };
    expect(belongsToWorkspaceScope(actor, scope, null)).toBe(false);
    expect(belongsToWorkspaceScope(actor, scope, undefined)).toBe(false);
    expect(belongsToWorkspaceScope(actor, scope, { ...folder, userId: "user-b" })).toBe(false);
    expect(belongsToWorkspaceScope(actor, scope, { ...folder, spaceId: "space-b" })).toBe(false);
  });

  it("does not treat empty or malformed identifiers as a scope", () => {
    expect(belongsToWorkspaceScope({ ...actor, userId: "" }, { kind: "home" }, home)).toBe(false);
    expect(belongsToWorkspaceScope({ ...actor, spaceId: " " }, { kind: "home" }, home)).toBe(false);
    expect(
      belongsToWorkspaceScope(
        actor,
        { kind: "workspace", workspaceId: "" },
        { ...folder, workspaceId: "" },
      ),
    ).toBe(false);
    expect(
      belongsToWorkspaceScope(actor, { kind: "workspace", workspaceId: " folder-a" }, folder),
    ).toBe(false);
    expect(
      belongsToWorkspaceScope(actor, { kind: "home" }, {
        ...home,
        workspaceId: undefined,
      } as never),
    ).toBe(false);
  });

  it("rejects malformed runtime inputs without throwing", () => {
    const invalidInputs = [
      [null, { kind: "home" }, home],
      [undefined, { kind: "home" }, home],
      ["actor", { kind: "home" }, home],
      [actor, null, home],
      [actor, 1, home],
      [actor, { kind: "unknown" }, home],
      [actor, { kind: "workspace", workspaceId: 42 }, folder],
      [actor, { kind: "home" }, "resource"],
      [actor, { kind: "home" }, { spaceId: "space-a", workspaceId: null }],
      [actor, { kind: "home" }, { ...home, userId: 1 }],
    ] as const;

    for (const [invalidActor, invalidScope, invalidResource] of invalidInputs) {
      expect(
        belongsToWorkspaceScope(
          invalidActor as never,
          invalidScope as never,
          invalidResource as never,
        ),
      ).toBe(false);
    }
  });
});
