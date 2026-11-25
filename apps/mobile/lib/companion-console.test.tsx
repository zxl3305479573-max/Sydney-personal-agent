// @vitest-environment jsdom
import type { CSSProperties, ReactNode } from "react";
import { act, createElement, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  publishCompanionRuntimeState,
  resetCompanionSessionStateForTest,
  setActiveCompanionSessionState,
  setCompanionPreferencesState,
} from "./companion-session-state";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  rpc: vi.fn(),
  available: false,
  startUnified: vi.fn(),
  switchUnified: vi.fn(),
  stopUnified: vi.fn(),
  loadPrefs: vi.fn(async () => undefined),
  updatePrefs: vi.fn(),
  confirmVoice: vi.fn(),
}));

vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mocks.push }),
  useFocusEffect: (cb: () => (() => void) | undefined) => {
    useEffect(() => cb(), [cb]);
  },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));
vi.mock("./side-insets", () => ({ useSideInsets: () => ({}) }));
vi.mock("./scoped-theme-context", () => ({
  useScreenBackground: (fallback: string) => fallback,
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN", t: (s: string) => s }) }));
vi.mock("./native", () => ({
  native: { groupedPage: "#F3F1EC" },
  useResolvedAppearance: () => "light" as const,
  useMobileTokens: () => ({ foreground: "#26231F", mutedForeground: "#6E675E" }),
}));
vi.mock("./api", () => ({
  rpc: mocks.rpc,
  selectedSpaceId: () => "space-1",
}));
vi.mock("./session", () => ({
  currentSessionGeneration: () => 1,
}));
vi.mock("./companion-activity", () => ({
  companionAvailable: () => mocks.available,
  companionScreenState: vi.fn(async () => "unsupported"),
  subscribeCompanionScreenState: () => () => undefined,
  presentCompanionScreen: vi.fn(),
  stopCompanionScreen: vi.fn(),
  takeCompanionScreenText: vi.fn(async () => null),
}));
vi.mock("./companion-screen-auto", () => ({
  useCompanionScreenAuto: () => ({ phase: "idle" }),
  startCompanionScreenAuto: vi.fn(),
  stopCompanionScreenAuto: vi.fn(),
}));
vi.mock("./companion-screen-send", () => ({
  captureScreenSendScope: vi.fn(),
  screenSendScopeCurrent: () => true,
  sendReviewedScreenText: vi.fn(),
}));
vi.mock("./companion-voice-launch", () => ({
  confirmAndLaunchCompanionVoiceCall: mocks.confirmVoice,
}));
vi.mock("./companion-session", async () => {
  const stateMod = await import("./companion-session-state");
  const { useSyncExternalStore } = await import("react");
  return {
    useCompanionSession: () =>
      useSyncExternalStore(
        stateMod.subscribeCompanionSessionState,
        stateMod.getCompanionSessionState,
        stateMod.getCompanionSessionState,
      ),
    loadCompanionPreferences: mocks.loadPrefs,
    updateCompanionPreferences: mocks.updatePrefs,
    startUnifiedCompanion: mocks.startUnified,
    switchUnifiedCompanionBot: mocks.switchUnified,
    stopUnifiedCompanion: mocks.stopUnified,
    companionStatusDisplay: () => ({ label: "我一直都在", tone: "active" }),
  };
});
vi.mock("../components/glass-title", () => ({ glassHeaderOptions: () => ({}) }));
vi.mock("../components/bot-avatar", () => ({
  BotAvatar: ({ identity }: { identity: string }) =>
    createElement("span", { "data-bot": identity }),
}));
vi.mock("../components/native-symbol", () => ({
  NativeSymbol: ({ ios }: { ios: string }) => createElement("i", { "data-symbol": ios }),
}));
vi.mock("../components/native-switch", () => ({
  NativeSwitch: ({
    accessibilityLabel,
    value,
    onValueChange,
  }: {
    accessibilityLabel: string;
    value: boolean;
    onValueChange: (next: boolean) => void;
  }) =>
    createElement("input", {
      type: "checkbox",
      "aria-label": accessibilityLabel,
      checked: value,
      onChange: () => onValueChange(!value),
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
      label && createElement("h3", null, label),
      children,
      footer && createElement("p", null, footer),
    ),
  SettingsRow: ({
    title,
    detail,
    value,
    trailing,
    onPress,
  }: {
    title: string;
    detail?: string;
    value?: string;
    trailing?: ReactNode;
    onPress?: () => void;
  }) =>
    createElement(
      "div",
      null,
      onPress
        ? createElement("button", { type: "button", onClick: onPress }, title, detail, value)
        : createElement("span", null, title, detail, value),
      trailing,
    ),
}));
vi.mock("react-native", () => {
  const flatten = (style: unknown): CSSProperties =>
    Object.assign({}, ...[style].flat(Number.POSITIVE_INFINITY).filter(Boolean));
  return {
    StyleSheet: { hairlineWidth: 1 },
    Alert: { alert: vi.fn() },
    AppState: { addEventListener: () => ({ remove: () => undefined }) },
    ScrollView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
    View: ({
      children,
      style,
      testID,
    }: {
      children?: ReactNode;
      style?: unknown;
      testID?: string;
    }) => createElement("div", { "data-testid": testID, style: flatten(style) }, children),
    Text: ({ children, style }: { children?: ReactNode; style?: unknown }) =>
      createElement("span", { style: flatten(style) }, children),
    Pressable: ({
      children,
      onPress,
      testID,
      disabled,
    }: {
      children?: ReactNode;
      onPress?: () => void;
      testID?: string;
      disabled?: boolean;
    }) =>
      createElement(
        "button",
        { type: "button", "data-testid": testID, disabled, onClick: onPress },
        children,
      ),
  };
});

import CompanionConsoleScreen from "../app/companion";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  resetCompanionSessionStateForTest();
  mocks.available = false;
  mocks.rpc.mockResolvedValue({
    current: {
      bots: [
        { id: "bot-1", name: "Sydney", color: "#4F7CAC", status: "idle" },
        { id: "bot-2", name: "Claude", color: "#8B5CF6", status: "idle" },
      ],
    },
  });
  mocks.startUnified.mockImplementation(
    async (input: {
      botId: string;
      botName: string;
      botColor: string;
      spaceId?: string | null;
      showReply?: boolean;
    }) => {
      setActiveCompanionSessionState({
        id: "in-app-1",
        botId: input.botId,
        botName: input.botName,
        botColor: input.botColor,
        spaceId: input.spaceId ?? null,
        mode: "in-app",
        showReply: input.showReply ?? true,
        startedAt: 1,
      });
    },
  );
  mocks.updatePrefs.mockImplementation(async (patch: Record<string, unknown>) => {
    const current = {
      preferredBotId: null,
      showReply: true,
      showFloatingBar: true,
      notifyOnReply: true,
      speakReplies: false,
      ...patch,
    };
    setCompanionPreferencesState(current);
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("CompanionConsoleScreen (CMP-03)", () => {
  it("starts companion, toggles preferences, shows live reply and honest capability summary", async () => {
    await act(async () => root.render(createElement(CompanionConsoleScreen)));
    expect(container.textContent).toContain("Sydney");
    expect(container.textContent).toContain("应用内跨页陪伴");

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="companion-console-toggle"]')
        ?.click(),
    );
    expect(mocks.startUnified).toHaveBeenCalledWith(
      expect.objectContaining({ botId: "bot-1", botName: "Sydney" }),
    );

    await act(async () => {
      publishCompanionRuntimeState({
        activityId: "in-app-1",
        botId: "bot-1",
        status: "present",
        detailStatus: "present",
        latestReply: "控制台实时回复测试",
      });
    });
    expect(container.textContent).toContain("控制台实时回复测试");

    const speechSwitch = container.querySelector<HTMLInputElement>(
      'input[aria-label="新回复本机语音播报"]',
    )!;
    await act(async () => speechSwitch.click());
    expect(mocks.updatePrefs).toHaveBeenCalledWith({ speakReplies: true });

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="companion-console-voice-call"]')
        ?.click(),
    );
    expect(mocks.confirmVoice).toHaveBeenCalledOnce();
  });
});
