// @vitest-environment jsdom
import type { EffectCallback, ReactNode } from "react";
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  platform: { OS: "ios" },
  storage: new Map<string, string>(),
  focused: true,
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
  Alert: { alert: vi.fn() },
  ScrollView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
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
  SettingsGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SettingsRow: ({
    title,
    onPress,
    disabled,
    accessibilityState,
  }: {
    title: string;
    onPress: () => void;
    disabled?: boolean;
    accessibilityState: { checked: boolean };
  }) => (
    <label>
      <input
        type="radio"
        name="ui-mode"
        aria-label={title}
        checked={accessibilityState.checked}
        disabled={disabled}
        onChange={onPress}
      />
      {title}
    </label>
  ),
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN" }) }));
vi.mock("./native", () => ({
  native: { groupedPage: "white" },
  useMobileTokens: () => ({ mutedForeground: "gray", border: "gray", background: "white" }),
}));
vi.mock("./side-insets", () => ({ useSideInsets: () => ({}) }));

import UiModeScreen from "../app/(settings)/ui-mode";
import { UI_MODE_STORAGE_KEY } from "../ui-modes/types";
import { getUiModeSnapshot, loadUiMode, resetUiModeToClassic, setUiMode } from "./ui-mode";
import { resolveUiModeDefinition } from "./ui-mode-registry";
import { createUiModeStore } from "./ui-mode-store";

describe("interface mode settings", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    runtime.platform.OS = "ios";
    runtime.focused = true;
    runtime.storage.clear();
    await resetUiModeToClassic();
    await loadUiMode();
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
      [...container.querySelectorAll("button")].find((element) => element.textContent === label);
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
      expect(getUiModeSnapshot().activeModeId).toBe("classic");
    },
  );
});
