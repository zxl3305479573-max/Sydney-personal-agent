import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluatePackContrast } from "./theme-contrast";
import { createThemeManager } from "./theme-manager";
import type { ThemePackV1 } from "./theme-pack";
import { isBuiltInTheme, parseThemePack } from "./theme-pack";
import { STARTER_THEME_PACKS, starterThemeDescription } from "./theme-presets";

const REPO_ROOT = resolve(__dirname, "../../..");

describe("official starter theme packs", () => {
  it("matches the official docx starter JSON files and passes schema & contrast validation", () => {
    expect(STARTER_THEME_PACKS.map((pack) => pack.id)).toEqual(["global-ocean", "inbox-cards"]);

    for (const pack of STARTER_THEME_PACKS) {
      const jsonPath = resolve(REPO_ROOT, "docx/theme-packs", `${pack.id}.sydney-theme.json`);
      const fromFile = parseThemePack(readFileSync(jsonPath, "utf8"));
      expect(pack).toEqual(fromFile);
      expect(isBuiltInTheme(pack.id)).toBe(false);
      expect(evaluatePackContrast(pack).issues).toEqual([]);
    }
  });

  it("provides localized short descriptions in zh-CN, zh-TW and en", () => {
    for (const pack of STARTER_THEME_PACKS) {
      const zhCn = starterThemeDescription(pack.id, "zh-CN");
      const zhTw = starterThemeDescription(pack.id, "zh-TW");
      const en = starterThemeDescription(pack.id, "en");
      expect(zhCn).toBeTruthy();
      expect(zhTw).toBeTruthy();
      expect(en).toBeTruthy();
      expect(zhCn).not.toBe(en);
    }
    expect(starterThemeDescription("unknown-pack", "en")).toBeNull();
  });

  it("is installed on demand and can be uninstalled normally (never undeletable built-in)", async () => {
    const kv = new Map<string, string>();
    const saved = new Map<string, ThemePackV1>();
    const manager = createThemeManager(
      {
        getItemAsync: async (key) => kv.get(key) ?? null,
        setItemAsync: async (key, value) => {
          kv.set(key, value);
        },
      },
      "ios",
    );
    await manager.load({
      list: async () => [...saved.values()],
      save: async (pack) => {
        saved.set(pack.id, pack);
      },
      remove: async (id) => {
        saved.delete(id);
      },
    });

    // Not auto-installed on load
    expect(manager.getSnapshot().packs.map((pack) => pack.id)).toEqual(["classic", "midnight"]);

    for (const preset of STARTER_THEME_PACKS) {
      await manager.install(preset);
      expect(manager.getSnapshot().packs.some((pack) => pack.id === preset.id)).toBe(true);
      await manager.uninstall(preset.id);
      expect(manager.getSnapshot().packs.some((pack) => pack.id === preset.id)).toBe(false);
    }
  });
});
