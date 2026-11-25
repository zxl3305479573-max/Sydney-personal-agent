// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  alert: vi.fn(),
  openSettings: vi.fn(async () => undefined),
  permission: "granted" as "granted" | "denied" | "undetermined",
  sideload: true,
  prefs: {
    prompted: true,
    enabled: true,
    messages: true,
    needsAttention: true,
    completions: false,
    sound: false,
  },
  listeners: new Set<() => void>(),
  enable: vi.fn(async () => ({ granted: true, preferences: fixture.prefs })),
  update: vi.fn(async (patch: Record<string, unknown>) => {
    fixture.prefs = { ...fixture.prefs, ...patch };
    for (const listener of fixture.listeners) listener();
    return fixture.prefs;
  }),
  sendTest: vi.fn(async () => "sent" as "sent" | "denied"),
}));

vi.mock("react-native", () => ({
  Alert: { alert: fixture.alert },
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
  Linking: { openSettings: fixture.openSettings },
  ScrollView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));
vi.mock("../components/native-switch", () => ({
  NativeSwitch: (props: {
    accessibilityLabel?: string;
    value: boolean;
    disabled?: boolean;
    onValueChange: (v: boolean) => void;
  }) =>
    createElement("input", {
      type: "checkbox",
      "aria-label": props.accessibilityLabel,
      checked: props.value,
      disabled: props.disabled,
      onChange: (event: { target: { checked: boolean } }) =>
        props.onValueChange(event.target.checked),
    }),
}));
vi.mock("../components/settings-group", () => ({
  SettingsGroup: ({
    label,
    footer,
    children,
  }: {
    label?: string;
    footer?: string;
    children?: ReactNode;
  }) =>
    createElement(
      "section",
      null,
      label ? createElement("h2", null, label) : null,
      children,
      footer ? createElement("p", null, footer) : null,
    ),
  SettingsRow: ({
    title,
    detail,
    trailing,
    onPress,
    disabled,
  }: {
    title: string;
    detail?: string;
    trailing?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) =>
    createElement(
      "div",
      null,
      onPress
        ? createElement("button", { type: "button", disabled, onClick: onPress }, title)
        : createElement("span", null, title),
      detail ? createElement("small", null, detail) : null,
      trailing,
    ),
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN", t: (s: string) => s }) }));
vi.mock("./native", () => ({ native: { groupedPage: "#F3F1EC" } }));
vi.mock("./scoped-theme-context", () => ({ useScreenBackground: (fallback: string) => fallback }));
vi.mock("./side-insets", () => ({ useSideInsets: () => ({}) }));
vi.mock("./notification-preferences", () => ({
  getCachedNotificationPreferences: () => fixture.prefs,
  subscribeNotificationPreferences: (listener: () => void) => {
    fixture.listeners.add(listener);
    return () => fixture.listeners.delete(listener);
  },
  loadNotificationPreferences: vi.fn(async () => fixture.prefs),
  getSystemNotificationPermissionStatus: vi.fn(async () => fixture.permission),
  enableNotificationsWithPrompt: fixture.enable,
  updateNotificationPreferences: fixture.update,
  sendTestLocalNotification: fixture.sendTest,
  isSideloadBuild: () => fixture.sideload,
}));

import NotificationsSettingsScreen from "../app/(settings)/notifications";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  fixture.permission = "granted";
  fixture.sideload = true;
  fixture.prefs = {
    prompted: true,
    enabled: true,
    messages: true,
    needsAttention: true,
    completions: false,
    sound: false,
  };
  fixture.listeners.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("NotificationsSettingsScreen", () => {
  it("renders toggles, sideload note, and triggers a local test notification", async () => {
    await act(async () => root.render(createElement(NotificationsSettingsScreen)));
    expect(container.textContent).toContain("开启消息通知");
    expect(container.textContent).toContain("当前侧载版本支持本地通知提醒");

    const testButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("发送测试通知"),
    );
    expect(testButton).toBeDefined();
    await act(async () => testButton?.click());
    expect(fixture.sendTest).toHaveBeenCalledWith("zh-CN");
    expect(fixture.alert).toHaveBeenCalledWith("已发送测试通知");
  });

  it("shows open system settings button when iOS permission is denied", async () => {
    fixture.permission = "denied";
    await act(async () => root.render(createElement(NotificationsSettingsScreen)));
    const settingsButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("前往系统设置"),
    );
    expect(settingsButton).toBeDefined();
    await act(async () => settingsButton?.click());
    expect(fixture.openSettings).toHaveBeenCalledOnce();
  });
});
