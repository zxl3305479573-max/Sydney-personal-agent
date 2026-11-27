// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import type { ColorValue } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScopedThemeContext, useScreenBackground } from "./scoped-theme-context";
import type { ResolvedScopedTheme, ThemePackV1 } from "./theme-pack";
import { resolveScopedTheme } from "./theme-pack";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../app");

// Layouts, redirects, re-exports, media/picker wrappers, or screens that do not paint a root fill.
const NON_ROOT_FILL_APP_FILES = new Set([
  "_layout.tsx",
  "(tabs)/_layout.tsx",
  "(tabs)/index.tsx",
  "(settings)/_layout.tsx",
  "+native-intent.tsx",
  "group-thread.tsx",
  "integration-setup.tsx",
  "image.tsx",
  "bot-model.tsx",
  "thread-model.tsx",
  "(settings)/model-picker.tsx",
  "(settings)/billing.tsx",
  "(settings)/wallet.tsx",
]);

function walkAppFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkAppFiles(full));
    else if (full.endsWith(".tsx") || full.endsWith(".ts")) files.push(full);
  }
  return files.sort();
}

describe("useScreenBackground", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function renderWithScope<T extends ColorValue>(
    scope: ResolvedScopedTheme | null | undefined,
    fallback: T,
  ): T | string | undefined {
    let observed: T | string | undefined;
    function Probe() {
      observed = useScreenBackground(fallback);
      return null;
    }
    const tree =
      scope === undefined
        ? createElement(Probe)
        : createElement(ScopedThemeContext.Provider, { value: scope }, createElement(Probe));
    act(() => root.render(tree));
    return observed;
  }

  it("returns 'transparent' when ScopedThemeContext provides a background image", () => {
    const pack: ThemePackV1 = {
      schemaVersion: 1,
      id: "ocean",
      name: "Ocean",
      author: "Test",
      version: "1.0.0",
      coverage: "all",
      defaults: {
        background: { dark: "bg", opacity: 0.25 },
      },
      assets: { bg: TINY_PNG },
    };
    const scope = resolveScopedTheme(
      [pack],
      { schemaVersion: 1, globalPackId: "ocean", pages: {} },
      "settings",
      "dark",
    );
    expect(scope.background).not.toBeNull();
    expect(renderWithScope(scope, "#0A0A0A")).toBe("transparent");
  });

  it("returns the exact fallback when ScopedThemeContext has background === null", () => {
    const pack: ThemePackV1 = {
      schemaVersion: 1,
      id: "solid-pack",
      name: "Solid Pack",
      author: "Test",
      version: "1.0.0",
      coverage: "all",
      defaults: {
        colors: { dark: { background: "#101820" } },
      },
    };
    const scope = resolveScopedTheme(
      [pack],
      { schemaVersion: 1, globalPackId: "solid-pack", pages: {} },
      "settings",
      "dark",
    );
    expect(scope.background).toBeNull();
    expect(renderWithScope(scope, "#101820")).toBe("#101820");
  });

  it("returns the exact fallback when no ScopedThemeContext provider is mounted", () => {
    const platformColorFallback = {
      semantic: ["systemGroupedBackground"],
    } as unknown as ColorValue;
    expect(renderWithScope(undefined, "#FFFFFF")).toBe("#FFFFFF");
    expect(renderWithScope(null, platformColorFallback)).toBe(platformColorFallback);
  });

  it("replaces native page colors with the selected global palette", () => {
    const scope = resolveScopedTheme(
      [],
      { schemaVersion: 1, globalPackId: "classic", pages: {} },
      "settings",
      "light",
    );
    expect(renderWithScope({ ...scope, pageBackgroundColor: "#EAF3ED" }, "#FFFFFF")).toBe(
      "#EAF3ED",
    );
  });
});

describe("apps/mobile/app screen theme coverage", () => {
  const allFiles = walkAppFiles(APP_DIR).map((fullPath) => ({
    rel: path.relative(APP_DIR, fullPath).split(path.sep).join("/"),
    source: readFileSync(fullPath, "utf8"),
  }));

  it("does not call global mobileTokens() or resolveMobileAppearance() in component bodies", () => {
    const violations: string[] = [];
    for (const { rel, source } of allFiles) {
      const lines = source.split(/\r?\n/);
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (
          /\bmobileTokens\s*\(/.test(trimmed) &&
          !/:\s*ColorTokens\s*=\s*mobileTokens\s*\(\)/.test(trimmed)
        ) {
          violations.push(`${rel}:${index + 1}: ${trimmed}`);
        }
        if (/\bresolveMobileAppearance\s*\(/.test(trimmed)) {
          violations.push(`${rel}:${index + 1}: ${trimmed}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it("reads colors from parameters rather than global native.* inside create*Styles factories", () => {
    const violations: string[] = [];
    for (const { rel, source } of allFiles) {
      for (const match of source.matchAll(/function\s+(create\w*Styles)\s*\(([\s\S]*?)\)\s*\{/g)) {
        const body = source.slice((match.index ?? 0) + match[0].length);
        const refs = body.match(/\bnative\.\w+/g);
        if (refs) {
          violations.push(`${rel} (${match[1]}): ${[...new Set(refs)].join(", ")}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("wires useScreenBackground or transparent scope background on every migrated screen", () => {
    const coveredScreens = allFiles.filter(({ rel }) => !NON_ROOT_FILL_APP_FILES.has(rel));
    expect(coveredScreens.length).toBeGreaterThanOrEqual(40);
    for (const required of [
      "(settings)/space.tsx",
      "(settings)/team-conversation.tsx",
      "(settings)/vault.tsx",
      "(settings)/voice.tsx",
    ]) {
      expect(coveredScreens.some((file) => file.rel === required)).toBe(true);
    }

    const missing = coveredScreens
      .filter(
        ({ source }) =>
          !/\buseScreenBackground\s*\(/.test(source) &&
          !/\b(?:scope|scopedTheme)\?\.background\s*\?\s*["']transparent["']/.test(source),
      )
      .map(({ rel }) => rel);
    expect(missing).toEqual([]);
  });
});
