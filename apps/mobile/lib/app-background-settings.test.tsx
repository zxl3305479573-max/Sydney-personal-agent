// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { AppBackgroundSettings } from "../components/app-background-settings";
import { DEFAULT_APP_BACKGROUND, getAppBackground, updateAppBackground } from "./app-background";

const device = vi.hoisted(() => ({ stored: null as string | null, fail: false }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => device.stored,
  setItemAsync: async (_key: string, value: string) => {
    if (device.fail) throw new Error("failed");
    device.stored = value;
  },
}));
vi.mock("expo-file-system", () => ({
  File: class {
    exists = true;
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
    copy() {}
    delete() {}
  },
  Paths: { document: "file://documents" },
}));
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: "file://photo" }] }),
}));
vi.mock("react-native", () => ({
  StyleSheet: { absoluteFill: {} },
  View: ({
    children,
    testID,
    style,
  }: {
    children: ReactNode;
    testID?: string;
    style?: unknown;
  }) => (
    <div data-testid={testID} data-style={JSON.stringify(style)}>
      {children}
    </div>
  ),
  Text: ({ children, accessibilityRole }: { children: ReactNode; accessibilityRole?: string }) => (
    <span role={accessibilityRole}>{children}</span>
  ),
  Image: ({ source, resizeMode }: { source: { uri: string }; resizeMode: string }) => (
    <img src={source.uri} data-fit={resizeMode} alt="" />
  ),
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN" }) }));
vi.mock("./native", () => ({
  useResolvedAppearance: () => "light",
  useMobileTokens: () => ({
    background: "#F4EFE7",
    card: "#FFFFFF",
    foreground: "#111111",
    border: "#DDDDDD",
    primary: "#111111",
    muted: "#EEEEEE",
    destructive: "red",
  }),
}));
vi.mock("../components/motion-pressable", () => ({
  MotionPressable: ({
    children,
    accessibilityLabel,
    accessibilityState,
    onPress,
    disabled,
  }: {
    children: ReactNode;
    accessibilityLabel: string;
    accessibilityState: { selected: boolean };
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      aria-label={accessibilityLabel}
      aria-pressed={accessibilityState.selected}
      disabled={disabled}
      onClick={onPress}
    >
      {children}
    </button>
  ),
}));
vi.mock("../components/settings-group", () => ({
  SettingsGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SettingsRow: ({
    title,
    onPress,
    disabled,
  }: {
    title: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onPress} disabled={disabled}>
      {title}
    </button>
  ),
}));
vi.mock("../components/native-segmented-control", () => ({
  NativeSegmentedControl: ({
    accessibilityLabel,
    value,
    options,
    onChange,
    disabled,
  }: {
    accessibilityLabel: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <select
      aria-label={accessibilityLabel}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  device.fail = false;
  await updateAppBackground(DEFAULT_APP_BACKGROUND);
});

it("uses the photo, display controls, palette and reset through the actual persistent store", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AppBackgroundSettings />));
    const click = async (label: string) => {
      const button = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === label || button.getAttribute("aria-label") === label,
      );
      expect(button).toBeDefined();
      await act(async () => button!.click());
    };
    const select = async (label: string, value: string) => {
      const input = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
      expect(input).not.toBeNull();
      await act(async () => {
        input.value = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    await click("从相册选择背景");
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(
      /^file:\/\/documents\/sydney-app-background-/,
    );
    await select("显示方式", "contain");
    await select("图片透明度", "50");
    await select("遮罩强度", "60");
    await click("薄荷");
    expect(
      container
        .querySelector('[data-testid="app-background-preview"] img')
        ?.nextElementSibling?.getAttribute("data-style"),
    ).toContain('"backgroundColor":"#EAF3ED"');
    await select("全局组件透明度", "75");
    expect(getAppBackground().componentOpacity).toBe(0.25);
    expect(
      container
        .querySelector('[data-testid="component-opacity-preview"]')
        ?.getAttribute("data-style"),
    ).toContain("rgba(255, 255, 255, 0.25)");
    expect(getAppBackground()).toMatchObject({
      fit: "contain",
      opacity: 0.5,
      overlayOpacity: 0.6,
      palette: "mint",
    });
    expect(container.querySelector("img")?.getAttribute("data-fit")).toBe("contain");
    expect(container.querySelector('[aria-label="薄荷"]')?.getAttribute("aria-pressed")).toBe(
      "true",
    );
    await click("移除背景图片");
    expect(getAppBackground()).toMatchObject({ imageUri: null, palette: "mint" });
    expect(container.querySelector("img")).toBeNull();
    await click("恢复默认 App 背景");
    expect(getAppBackground()).toEqual({ ...DEFAULT_APP_BACKGROUND, componentOpacity: 0.25 });
    await click("恢复默认组件透明度");
    expect(getAppBackground()).toEqual(DEFAULT_APP_BACKGROUND);
    expect(JSON.parse(device.stored!)).toEqual(DEFAULT_APP_BACKGROUND);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("shows a readable save error and keeps the previous selection", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AppBackgroundSettings />));
    device.fail = true;
    const control = container.querySelector<HTMLSelectElement>(
      'select[aria-label="全局组件透明度"]',
    )!;
    await act(async () => {
      control.value = "50";
      control.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(getAppBackground().componentOpacity).toBe(1);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="薄荷"]')!.click(),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "外观设置未能保存，请重试",
    );
    expect(getAppBackground()).toEqual(DEFAULT_APP_BACKGROUND);
    expect(container.querySelector('[aria-label="跟随主题"]')?.getAttribute("aria-pressed")).toBe(
      "true",
    );
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
