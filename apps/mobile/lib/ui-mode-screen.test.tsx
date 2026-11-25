// @vitest-environment jsdom
import type { EffectCallback, ReactNode } from "react";
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { Alert } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThemePackV1 } from "./theme-pack";

const runtime = vi.hoisted(() => ({
  platform: { OS: "ios" },
  storage: new Map<string, string>(),
  focused: true,
  alert: vi.fn(),
  pickThemePack: vi.fn<() => Promise<ThemePackV1 | null>>(async () => null),
}));

vi.mock("./theme-library", () => ({
  pickThemePack: () => runtime.pickThemePack(),
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: EffectCallback) => {
    useEffect(() => (runtime.focused ? callback() : undefined), [callback, runtime.focused]);
  },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => runtime.storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    runtime.storage.set(key, value);
  },
}));
vi.mock("react-native", () => ({
  Platform: runtime.platform,
  Alert: { alert: runtime.alert },
  Appearance: {
    getColorScheme: () => "dark",
    setColorScheme: vi.fn(),
    addChangeListener: () => ({ remove: vi.fn() }),
  },
  StyleSheet: {
    absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
    create: <T,>(styles: T) => styles,
    hairlineWidth: 1,
  },
  ScrollView: ({ children, style }: { children: ReactNode; style?: unknown }) => (
    <div data-testid="ui-mode-scroll" data-style={JSON.stringify(style ?? null)}>
      {children}
    </div>
  ),
  View: ({
    children,
    pointerEvents,
    accessibilityRole,
    style,
  }: {
    children?: ReactNode;
    pointerEvents?: string;
    accessibilityRole?: string;
    style?: unknown;
  }) => (
    <div
      role={accessibilityRole === "alert" ? "alert" : undefined}
      data-pointer-events={pointerEvents}
      data-style={JSON.stringify(style ?? null)}
    >
      {children}
    </div>
  ),
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Image: ({ source }: { source: { uri: string } }) => <img src={source.uri} alt="" />,
  Pressable: ({
    children,
    onPress,
    disabled,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
  }) => (
    <button type="button" disabled={disabled} aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock("../components/native-action-button", () => ({
  NativeActionButton: ({
    label,
    onPress,
    disabled,
    busy,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    busy?: boolean;
  }) => (
    <button type="button" disabled={disabled || busy} onClick={onPress}>
      {label}
    </button>
  ),
}));
vi.mock("../components/settings-group", () => ({
  SettingsGroup: ({ label, children }: { label?: string; children: ReactNode }) => (
    <section aria-label={label}>{children}</section>
  ),
  SettingsRow: ({
    title,
    value,
    onPress,
    disabled,
    accessibilityRole,
    accessibilityState,
  }: {
    title: string;
    value?: string;
    onPress: () => void;
    disabled?: boolean;
    accessibilityRole?: string;
    accessibilityState?: { checked?: boolean; expanded?: boolean };
  }) =>
    accessibilityRole === "radio" ? (
      <label>
        <input
          type="radio"
          name="ui-mode"
          aria-label={title}
          checked={Boolean(accessibilityState?.checked)}
          disabled={disabled}
          onChange={onPress}
        />
        {title}
        {value ? ` (${value})` : ""}
      </label>
    ) : (
      <button type="button" disabled={disabled} onClick={onPress}>
        {title}
        {value ? ` · ${value}` : ""}
      </button>
    ),
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN" }) }));
vi.mock("./native", () => ({
  native: { groupedPage: "white" },
  useResolvedAppearance: () => "dark",
  useMobileTokens: () => ({
    foreground: "black",
    mutedForeground: "gray",
    border: "gray",
    background: "white",
    card: "white",
    muted: "#eee",
    primary: "#2563eb",
    primaryForeground: "white",
  }),
}));
vi.mock("./side-insets", () => ({ useSideInsets: () => ({}) }));

import UiModeScreen from "../app/(settings)/ui-mode";
import { UI_MODE_STORAGE_KEY } from "../ui-modes/types";
import { ScopedThemeContext } from "./scoped-theme-context";
import { isBuiltInTheme, resolveScopedTheme } from "./theme-pack";
import { themeManager } from "./theme-state";
import { getUiModeSnapshot, loadUiMode, resetUiModeToClassic, setUiMode } from "./ui-mode";
import { resolveUiModeDefinition } from "./ui-mode-registry";
import { createUiModeStore } from "./ui-mode-store";

const oceanPack: ThemePackV1 = {
  schemaVersion: 1,
  id: "ocean",
  name: "深海蓝",
  author: "Sydney",
  version: "1.2.0",
  coverage: "all",
  defaults: {
    colors: { dark: { background: "#061826", primary: "#38BDF8" } },
    layout: "cards",
    surface: "outlined",
  },
};

const homeOnlyPack: ThemePackV1 = {
  schemaVersion: 1,
  id: "mint-home",
  name: "薄荷首页",
  author: "Sydney",
  version: "1.0.0",
  coverage: ["inbox"],
  defaults: {
    colors: { dark: { background: "#071E18", primary: "#34D399" } },
    layout: "cards",
  },
};

describe("interface mode settings", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    runtime.platform.OS = "ios";
    runtime.focused = true;
    runtime.storage.clear();
    runtime.alert.mockReset();
    runtime.pickThemePack.mockReset();
    runtime.pickThemePack.mockResolvedValue(null);
    await resetUiModeToClassic();
    await loadUiMode();
    if (themeManager.getSnapshot().hydrated) {
      await themeManager.reset();
    }
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  async function click(label: string) {
    const button =
      container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`) ??
      [...container.querySelectorAll("button")].find((element) => element.textContent === label) ??
      [...container.querySelectorAll("button")].find((element) =>
        element.textContent?.startsWith(`${label} · `),
      );
    expect(button, label).toBeDefined();
    await act(async () => button!.click());
  }

  it("previews without saving, cancels, applies across a fresh store and restores Classic", async () => {
    await act(async () => root.render(<UiModeScreen />));
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(2);
    const original = runtime.storage.get(UI_MODE_STORAGE_KEY);
    await click("午夜");
    expect(getUiModeSnapshot()).toMatchObject({
      activeModeId: "midnight",
      savedModeId: "classic",
      previewModeId: "midnight",
    });
    expect(runtime.storage.get(UI_MODE_STORAGE_KEY)).toBe(original);
    await click("取消预览");
    expect(getUiModeSnapshot().activeModeId).toBe("classic");
    expect(runtime.storage.get(UI_MODE_STORAGE_KEY)).toBe(original);
    await click("午夜");
    await click("应用模式");
    expect(getUiModeSnapshot()).toMatchObject({ savedModeId: "midnight", previewModeId: null });
    const restored = createUiModeStore({
      isModeAvailable: (modeId) => resolveUiModeDefinition(modeId, "ios").id === modeId,
    });
    await restored.load();
    expect(restored.getSnapshot().activeModeId).toBe("midnight");
    await click("恢复经典模式");
    expect(getUiModeSnapshot().activeModeId).toBe("classic");
    expect(JSON.parse(runtime.storage.get(UI_MODE_STORAGE_KEY)!)).toMatchObject({
      activeModeId: "classic",
    });
  });

  it("cancels an unconfirmed preview on blur and unmount without altering user appearance", async () => {
    await setUiMode("midnight");
    if (themeManager.getSnapshot().hydrated) {
      await themeManager.assign("all", "midnight");
    }
    runtime.storage.set("rakazo.uiAppearance", "light");
    runtime.storage.set("rakazo.chatAppearance.mobile", "existing-chat-settings");
    const original = new Map(runtime.storage);
    await act(async () => root.render(<UiModeScreen />));
    await click("经典");
    expect(getUiModeSnapshot().activeModeId).toBe("classic");
    runtime.focused = false;
    await act(async () => root.render(<UiModeScreen />));
    expect(getUiModeSnapshot()).toMatchObject({ activeModeId: "midnight", previewModeId: null });
    runtime.focused = true;
    await act(async () => root.render(<UiModeScreen />));
    await click("经典");
    await act(async () => root.render(null));
    expect(getUiModeSnapshot()).toMatchObject({ activeModeId: "midnight", previewModeId: null });
    expect(runtime.storage).toEqual(original);
  });

  it.each(["android", "web"])(
    "only offers Classic on %s, including a direct settings link",
    async (platform) => {
      runtime.platform.OS = platform;
      await act(async () => root.render(<UiModeScreen />));
      expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(1);
      expect(container.textContent).not.toContain("午夜");
      expect(container.textContent).not.toContain("导入主题包");
      expect(getUiModeSnapshot().activeModeId).toBe("classic");
    },
  );

  it("unifies custom packs, per-page overrides, clear action and uninstall confirmation", async () => {
    const installed = new Map<string, ThemePackV1>([
      [oceanPack.id, oceanPack],
      [homeOnlyPack.id, homeOnlyPack],
    ]);
    await themeManager.load({
      list: async () => [...installed.values()],
      save: async (pack) => {
        installed.set(pack.id, pack);
      },
      remove: async (id) => {
        installed.delete(id);
      },
    });
    if (!themeManager.getSnapshot().packs.some((pack) => pack.id === oceanPack.id)) {
      await themeManager.install(oceanPack);
    }
    if (!themeManager.getSnapshot().packs.some((pack) => pack.id === homeOnlyPack.id)) {
      await themeManager.install(homeOnlyPack);
    }

    await act(async () => root.render(<UiModeScreen />));
    // Built-in Classic + Midnight + global custom pack Ocean = 3 radio items (no 16-button wall).
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(3);
    expect(container.textContent).toContain("深海蓝");
    expect(container.textContent).toContain("薄荷首页");
    // Only one reset button should appear when non-default, hidden when default.
    expect(
      [...container.querySelectorAll("button")].filter((btn) => btn.textContent === "恢复经典模式"),
    ).toHaveLength(0);

    // Apply global custom pack via unified preview bar.
    await click("深海蓝");
    expect(
      [...container.querySelectorAll("button")].filter((btn) => btn.textContent === "应用模式"),
    ).toHaveLength(1);
    await click("应用模式");
    expect(themeManager.getSnapshot().assignments.globalPackId).toBe("ocean");

    // Expand Home scope, apply page-only pack, then clear just that single page override.
    await click("首页");
    await click("薄荷首页");
    await click("应用模式");
    expect(themeManager.getSnapshot().assignments.pages.inbox).toBe("mint-home");
    await click("清除此页覆盖");
    expect(themeManager.getSnapshot().assignments.pages.inbox).toBeUndefined();
    expect(themeManager.getSnapshot().assignments.globalPackId).toBe("ocean");

    // Uninstall prompts confirmation mentioning active scope before removing.
    const uninstallButtons = [...container.querySelectorAll("button")].filter(
      (btn) => btn.textContent === "卸载",
    );
    expect(uninstallButtons.length).toBeGreaterThanOrEqual(1);
    await act(async () => uninstallButtons[0]!.click());
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = runtime.alert.mock.calls[0] as [
      string,
      string,
      Array<{ text: string; onPress?: () => void }>,
    ];
    expect(title).toBe("卸载主题包？");
    expect(message).toContain("全部界面");
    expect(themeManager.getSnapshot().packs.some((pack) => pack.id === "ocean")).toBe(true);
    await act(async () => buttons.find((item) => item.text === "卸载")?.onPress?.());
    expect(themeManager.getSnapshot().packs.some((pack) => pack.id === "ocean")).toBe(false);
    expect(themeManager.getSnapshot().assignments.globalPackId).toBe("classic");
  });

  it("installs official starter packs in 1 tap, toggles pack details, and keeps Android/Web Classic-only", async () => {
    for (const pack of themeManager.getSnapshot().packs) {
      if (!isBuiltInTheme(pack.id)) await themeManager.uninstall(pack.id);
    }

    await act(async () => root.render(<UiModeScreen />));
    expect(container.textContent).toContain("载入示例 · Ocean Global");
    expect(container.textContent).toContain("载入示例 · Inbox Cards");

    // 1-tap install does not auto-apply, removes the starter button, and adds the custom pack
    await click("载入示例 · Inbox Cards");
    expect(themeManager.getSnapshot().packs.some((pack) => pack.id === "inbox-cards")).toBe(true);
    expect(themeManager.getSnapshot().assignments.globalPackId).toBe("classic");
    expect(themeManager.getSnapshot().assignments.pages.inbox).toBeUndefined();
    expect(container.textContent).not.toContain("载入示例 · Inbox Cards");
    expect(container.textContent).toContain("载入示例 · Ocean Global");

    // Expand details for Inbox Cards
    await click("详情");
    expect(container.textContent).toContain("ID：inbox-cards · v1.0.0");
    expect(container.textContent).toContain("覆盖范围：首页、单聊、群聊");
    expect(container.textContent).toContain("自定义页面：单聊、群聊");
    expect(container.textContent).toContain("卡片圆角 22 / 控件 16 / 边框 1");
    expect(container.textContent).toContain("背景图片：0 张");
    expect(container.textContent).toContain("对比度检查：通过（WCAG AA）");

    // Collapse details
    await click("收起详情");
    expect(container.textContent).not.toContain("ID：inbox-cards · v1.0.0");

    // On Android, starter rows and theme pack tools stay hidden even when hydrated (TH-10)
    runtime.platform.OS = "android";
    await act(async () => root.render(<UiModeScreen />));
    expect(container.textContent).not.toContain("载入示例");
    expect(container.textContent).not.toContain("导入主题包");
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(1);
  });

  it("shows contrast warnings on preview & severe import without blocking, renders preview scrim, and uses transparent ScrollView with theme backgrounds", async () => {
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const lowContrastPack: ThemePackV1 = {
      schemaVersion: 1,
      id: "dim-glass",
      name: "雾灰低对比",
      author: "Tester",
      version: "2.0.0",
      coverage: "all",
      defaults: {
        colors: {
          dark: { background: "#222222", foreground: "#303030" },
        },
        background: { dark: "bg", opacity: 0.25, overlayOpacity: 0.35 },
      },
      assets: { bg: tinyPng },
    };

    for (const pack of themeManager.getSnapshot().packs) {
      if (!isBuiltInTheme(pack.id)) await themeManager.uninstall(pack.id);
    }

    runtime.pickThemePack.mockResolvedValueOnce(lowContrastPack);
    await act(async () => root.render(<UiModeScreen />));
    await click("导入主题包");

    // Severe contrast pack is still installed (not blocked) AND alerts the user clearly
    expect(themeManager.getSnapshot().packs.some((pack) => pack.id === "dim-glass")).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith(
      "已安装，但对比度过低",
      expect.stringContaining("雾灰低对比"),
    );

    // Previewing shows the high-contrast warning strip AND the overlayOpacity scrim inside ThemePreviewCard
    await click("雾灰低对比");
    const alertStrip = container.querySelector('[role="alert"]');
    expect(alertStrip?.textContent).toContain("对比度过低");
    expect(alertStrip?.textContent).toContain("正文");
    const previewBgWrapper = container.querySelector('[data-pointer-events="none"]');
    expect(previewBgWrapper?.querySelector("img")).not.toBeNull();
    expect(previewBgWrapper?.querySelector("div")?.getAttribute("data-style")).toContain(
      '"opacity":0.35',
    );

    // Details panel reports background asset count and contrast warning count
    await click("详情");
    expect(container.textContent).toContain("背景图片：1 张");
    expect(container.textContent).toContain("含严重低对比度");

    // ScrollView background turns transparent when screen scope has a theme background
    const defaultScrollStyle = container
      .querySelector('[data-testid="ui-mode-scroll"]')
      ?.getAttribute("data-style");
    expect(defaultScrollStyle).toContain('"backgroundColor":"white"');

    const scopedWithBg = resolveScopedTheme(
      [lowContrastPack],
      { schemaVersion: 1, globalPackId: "dim-glass", pages: {} },
      "settings",
      "dark",
    );
    await act(async () =>
      root.render(
        <ScopedThemeContext.Provider value={scopedWithBg}>
          <UiModeScreen />
        </ScopedThemeContext.Provider>,
      ),
    );
    const transparentScrollStyle = container
      .querySelector('[data-testid="ui-mode-scroll"]')
      ?.getAttribute("data-style");
    expect(transparentScrollStyle).toContain('"backgroundColor":"transparent"');
  });
});
