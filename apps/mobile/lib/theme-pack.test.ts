import { describe, expect, it } from "vitest";
import { parseThemePack, resolveScopedTheme, themeScopeForRoute } from "./theme-pack";

describe("theme pack protocol", () => {
  it("accepts a scoped declarative pack and rejects code-like fields", () => {
    const pack = parseThemePack({
      schemaVersion: 1,
      id: "inbox-skin",
      name: "Inbox",
      author: "Test",
      version: "1.0.0",
      coverage: ["inbox"],
      defaults: { layout: "cards", colors: { dark: { background: "#001122" } } },
    });
    expect(pack.coverage).toEqual(["inbox"]);
    expect(() => parseThemePack({ ...pack, script: "alert(1)" })).toThrow();
  });

  it("inherits the global theme and lets a page pack override it", () => {
    const global = parseThemePack({
      schemaVersion: 1,
      id: "global-skin",
      name: "Global",
      author: "Test",
      version: "1.0.0",
      coverage: "all",
      defaults: { colors: { dark: { background: "#001122", foreground: "#ffffff" } } },
    });
    const local = parseThemePack({
      schemaVersion: 1,
      id: "thread-skin",
      name: "Thread",
      author: "Test",
      version: "1.0.0",
      coverage: ["thread"],
      defaults: { colors: { dark: { background: "#220011" } } },
    });
    const resolved = resolveScopedTheme(
      [global, local],
      {
        schemaVersion: 1,
        globalPackId: "global-skin",
        pages: { thread: "thread-skin" },
      },
      "thread",
      "dark",
    );
    expect(resolved.tokens.background).toBe("#220011");
    expect(
      resolveScopedTheme(
        [global, local],
        {
          schemaVersion: 1,
          globalPackId: "global-skin",
          pages: { thread: "thread-skin" },
        },
        "settings",
        "dark",
      ).tokens.background,
    ).toBe("#001122");
  });

  it("maps routes to stable page scopes", () => {
    expect(themeScopeForRoute("/")).toBe("inbox");
    expect(themeScopeForRoute("/thread")).toBe("thread");
    expect(themeScopeForRoute("/group-thread")).toBe("groupThread");
    expect(themeScopeForRoute("/(settings)/ui-mode")).toBe("settings");
    expect(themeScopeForRoute("/projects/abc/chat")).toBe("projectThread");
  });
});
