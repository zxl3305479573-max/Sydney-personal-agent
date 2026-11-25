import { describe, expect, it } from "vitest";
import {
  BUILTIN_THEME_PACKS,
  hasCustomThemeForScope,
  parseThemePack,
  resolveScopedTheme,
  themeScopeForRoute,
} from "./theme-pack";

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

  it("lets a page override to built-in classic or midnight cleanly", () => {
    const global = parseThemePack({
      schemaVersion: 1,
      id: "global-skin",
      name: "Global",
      author: "Test",
      version: "1.0.0",
      coverage: "all",
      defaults: { colors: { dark: { background: "#001122" } }, layout: "cards" },
    });
    const packs = [...BUILTIN_THEME_PACKS, global];
    const classicOverride = {
      schemaVersion: 1 as const,
      globalPackId: "global-skin",
      pages: { inbox: "classic" },
    };
    expect(hasCustomThemeForScope(packs, classicOverride, "inbox")).toBe(true);
    const resolvedClassic = resolveScopedTheme(packs, classicOverride, "inbox", "dark");
    expect(resolvedClassic.tokens.background).not.toBe("#001122");
    expect(resolvedClassic.layout).toBe("classic");

    const midnightOverride = {
      schemaVersion: 1 as const,
      globalPackId: "classic",
      pages: { thread: "midnight" },
    };
    expect(hasCustomThemeForScope(packs, midnightOverride, "thread")).toBe(true);
    const resolvedMidnight = resolveScopedTheme(packs, midnightOverride, "thread", "light");
    expect(resolvedMidnight.appearance).toBe("dark");
    expect(resolvedMidnight.tokens.background).toBe("#0F172A");
  });

  it("supports optional background overlayOpacity (0–0.6) while keeping legacy v1 packs compatible", () => {
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const legacyPack = parseThemePack({
      schemaVersion: 1,
      id: "legacy-bg",
      name: "Legacy BG",
      author: "Test",
      version: "1.0.0",
      coverage: "all",
      defaults: { background: { dark: "bg", opacity: 0.25 } },
      assets: { bg: tinyPng },
    });
    const resolvedLegacy = resolveScopedTheme(
      [legacyPack],
      { schemaVersion: 1, globalPackId: "legacy-bg", pages: {} },
      "inbox",
      "dark",
    );
    expect(resolvedLegacy.background).toEqual({
      uri: tinyPng,
      fit: "cover",
      opacity: 0.25,
      overlayOpacity: 0,
    });

    const scrimPack = parseThemePack({
      schemaVersion: 1,
      id: "scrim-bg",
      name: "Scrim BG",
      author: "Test",
      version: "1.0.0",
      coverage: "all",
      defaults: { background: { dark: "bg", opacity: 0.3, overlayOpacity: 0.45 } },
      assets: { bg: tinyPng },
    });
    const resolvedScrim = resolveScopedTheme(
      [scrimPack],
      { schemaVersion: 1, globalPackId: "scrim-bg", pages: {} },
      "inbox",
      "dark",
    );
    expect(resolvedScrim.background?.overlayOpacity).toBe(0.45);

    expect(() =>
      parseThemePack({
        ...scrimPack,
        id: "scrim-too-high",
        defaults: { background: { dark: "bg", overlayOpacity: 0.61 } },
      }),
    ).toThrow(/overlayOpacity/);
    expect(() =>
      parseThemePack({
        ...scrimPack,
        id: "scrim-negative",
        defaults: { background: { dark: "bg", overlayOpacity: -0.05 } },
      }),
    ).toThrow(/overlayOpacity/);
  });
});
