import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThemePackV1 } from "./theme-pack";
import { THEME_SCOPES } from "./theme-pack";

const runtime = vi.hoisted(() => ({
  platform: { OS: "ios" },
  storage: new Map<string, string>(),
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => runtime.storage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    runtime.storage.set(key, value);
  }),
}));

vi.mock("react-native", () => ({
  Platform: runtime.platform,
  Appearance: {
    getColorScheme: () => "dark",
    setColorScheme: vi.fn(),
    addChangeListener: () => ({ remove: vi.fn() }),
  },
}));

const oceanPack: ThemePackV1 = {
  schemaVersion: 1,
  id: "ocean",
  name: "深海蓝",
  author: "Sydney",
  version: "1.0.0",
  coverage: "all",
  defaults: {
    colors: { dark: { background: "#061826", primary: "#38BDF8" } },
    layout: "cards",
    surface: "outlined",
  },
};

const inboxPack: ThemePackV1 = {
  schemaVersion: 1,
  id: "mint-home",
  name: "薄荷首页",
  author: "Sydney",
  version: "1.0.0",
  coverage: ["inbox"],
  defaults: {
    colors: { dark: { background: "#071E18", primary: "#34D399" } },
  },
};

function memoryRepo(initial: ThemePackV1[] = []) {
  const map = new Map(initial.map((pack) => [pack.id, pack]));
  return {
    list: async () => [...map.values()],
    save: async (pack: ThemePackV1) => {
      map.set(pack.id, pack);
    },
    remove: async (id: string) => {
      map.delete(id);
    },
  };
}

describe("unified theme controls", () => {
  beforeEach(() => {
    vi.resetModules();
    runtime.storage.clear();
    runtime.platform.OS = "ios";
  });

  it("keeps ui-mode and themeManager synchronized across global, page, uninstall and reset", async () => {
    const { themeManager } = await import("./theme-state");
    const uiMode = await import("./ui-mode");
    const controls = await import("./theme-controls");

    await uiMode.loadUiMode();
    await themeManager.load(memoryRepo([oceanPack, inboxPack]));
    await controls.reconcileUiModeAfterThemeLoad("ios");

    controls.previewUnifiedTheme("all", "midnight", "ios");
    expect(uiMode.getUiModeSnapshot().previewModeId).toBe("midnight");
    expect(themeManager.getSnapshot().preview).toEqual({ target: "all", packId: "midnight" });

    await controls.commitUnifiedThemePreview("ios");
    expect(uiMode.getUiModeSnapshot().savedModeId).toBe("midnight");
    expect(themeManager.getSnapshot().assignments.globalPackId).toBe("midnight");

    controls.previewUnifiedTheme("all", "ocean", "ios");
    expect(uiMode.getUiModeSnapshot().activeModeId).toBe("classic");
    await controls.commitUnifiedThemePreview("ios");
    expect(uiMode.getUiModeSnapshot().savedModeId).toBe("classic");
    expect(themeManager.getSnapshot().assignments.globalPackId).toBe("ocean");

    controls.previewUnifiedTheme("inbox", "mint-home", "ios");
    expect(uiMode.getUiModeSnapshot().previewModeId).toBeNull();
    await controls.commitUnifiedThemePreview("ios");
    expect(themeManager.getSnapshot().assignments.pages.inbox).toBe("mint-home");
    expect(controls.formatUnifiedThemeSummary(controls.getUnifiedThemeState("ios"), "zh-CN")).toBe(
      "深海蓝 · 1 页自定义",
    );

    await controls.assignUnifiedTheme("inbox", null, "ios");
    expect(themeManager.getSnapshot().assignments.pages).toEqual({});
    expect(themeManager.getSnapshot().assignments.globalPackId).toBe("ocean");

    await controls.uninstallUnifiedThemePack("ocean");
    expect(themeManager.getSnapshot().assignments.globalPackId).toBe("classic");
    expect(uiMode.getUiModeSnapshot().savedModeId).toBe("classic");

    await controls.assignUnifiedTheme("all", "midnight", "ios");
    await controls.assignUnifiedTheme("inbox", "mint-home", "ios");
    await controls.resetUnifiedThemeToDefault("ios");
    expect(themeManager.getSnapshot().assignments).toEqual({
      schemaVersion: 1,
      globalPackId: "classic",
      pages: {},
    });
    expect(uiMode.getUiModeSnapshot().savedModeId).toBe("classic");
  });

  it("reconciles stale ui-mode midnight when saved global theme is a custom pack", async () => {
    runtime.storage.set(
      "sydney.mobile.uiMode.v1",
      JSON.stringify({
        schemaVersion: 1,
        activeModeId: "midnight",
        lastAlternateModeId: "midnight",
      }),
    );
    runtime.storage.set(
      "sydney.mobile.themeAssignments.v1",
      JSON.stringify({ schemaVersion: 1, globalPackId: "ocean", pages: {} }),
    );
    const { themeManager } = await import("./theme-state");
    const uiMode = await import("./ui-mode");
    const controls = await import("./theme-controls");

    await uiMode.loadUiMode();
    expect(uiMode.getUiModeSnapshot().savedModeId).toBe("midnight");

    await themeManager.load(memoryRepo([oceanPack]));
    await controls.reconcileUiModeAfterThemeLoad("ios");
    expect(uiMode.getUiModeSnapshot().savedModeId).toBe("classic");
    expect(themeManager.getSnapshot().assignments.globalPackId).toBe("ocean");
  });

  it("provides localized labels for all theme scopes without raw identifiers", async () => {
    const controls = await import("./theme-controls");
    for (const scope of THEME_SCOPES) {
      for (const locale of ["zh-CN", "zh-TW", "en"]) {
        const label = controls.scopeLabel(scope, locale);
        expect(label.length).toBeGreaterThan(0);
        if (scope !== "github") {
          expect(label).not.toBe(scope);
        }
      }
    }
  });

  it("localizes theme pack validation errors and warnings across zh-CN, zh-TW and en", async () => {
    const controls = await import("./theme-controls");
    expect(
      controls.localizeThemeError(
        new Error("Select a .sydney-theme.json file"),
        "zh-CN",
        "fallback",
      ),
    ).toContain(".sydney-theme.json");
    expect(
      controls.localizeThemeError(
        new Error("theme: unsupported field script"),
        "zh-CN",
        "fallback",
      ),
    ).toContain("安全策略");
    expect(
      controls.localizeThemeError(new Error("Theme file exceeds 10 MiB"), "zh-TW", "fallback"),
    ).toContain("10 MiB");
    expect(
      controls.localizeThemeError(
        new Error("defaults.background.overlayOpacity: expected 0–0.6"),
        "zh-CN",
        "fallback",
      ),
    ).toContain("遮罩");
    expect(controls.localizeThemeError(new SyntaxError("Unexpected token"), "en", "fallback")).toBe(
      "The theme file is not valid JSON.",
    );
    expect(
      controls.localizeThemeWarning(
        "Some theme files could not be loaded. Built-in themes remain available.",
        "zh-CN",
      ),
    ).toContain("部分主题文件无法加载");
    expect(
      controls.localizeThemeWarning(
        "Theme settings could not be read or saved. Check your selection before restarting.",
        "zh-TW",
      ),
    ).toContain("主題設定讀取或儲存失敗");
  });
});
