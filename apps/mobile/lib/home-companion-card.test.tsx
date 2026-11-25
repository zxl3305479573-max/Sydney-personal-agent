// @vitest-environment jsdom
import type { CSSProperties, ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobileBot } from "./api";
import {
  publishCompanionRuntimeState,
  resetCompanionSessionStateForTest,
  setActiveCompanionSessionState,
  setCompanionPreferencesState,
} from "./companion-session-state";

const fixture = vi.hoisted(() => ({
  push: vi.fn(),
  available: true,
  active: null as null | { id: string; botId: string; spaceId: string | null; showReply?: boolean },
  revision: 0,
  listeners: new Set<() => void>(),
  screenState: "idle" as "unsupported" | "idle" | "capturing",
  startUnified: vi.fn(),
  switchUnified: vi.fn(),
  stopUnified: vi.fn(),
  presentCompanionScreen: vi.fn(async () => undefined),
  stopCompanionScreen: vi.fn(async () => undefined),
  stopCompanionScreenAuto: vi.fn(),
  confirmVoice: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: fixture.push }),
}));
vi.mock("./companion-activity", () => ({
  companionAvailable: () => fixture.available,
  activeCompanionIdentity: () => fixture.active,
  companionActivityRevision: () => fixture.revision,
  subscribeCompanionActivity: (listener: () => void) => {
    fixture.listeners.add(listener);
    return () => fixture.listeners.delete(listener);
  },
  companionScreenState: vi.fn(async () => fixture.screenState),
  subscribeCompanionScreenState: () => () => undefined,
  presentCompanionScreen: fixture.presentCompanionScreen,
  stopCompanionScreen: fixture.stopCompanionScreen,
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
    startUnifiedCompanion: fixture.startUnified,
    switchUnifiedCompanionBot: fixture.switchUnified,
    stopUnifiedCompanion: fixture.stopUnified,
    companionStatusDisplay: (status: string) => ({
      label:
        status === "thinking"
          ? "思考中…"
          : status === "disconnected"
            ? "连接已断开 · 重连中"
            : "我一直都在",
      tone: status === "disconnected" ? "error" : status === "thinking" ? "busy" : "active",
    }),
  };
});
vi.mock("./companion-voice-launch", () => ({
  confirmAndLaunchCompanionVoiceCall: fixture.confirmVoice,
}));
vi.mock("./companion-screen-auto", () => ({
  useCompanionScreenAuto: () => ({ phase: "idle" }),
  stopCompanionScreenAuto: fixture.stopCompanionScreenAuto,
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN", t: (s: string) => s }) }));
vi.mock("./native", () => ({
  useResolvedAppearance: () => "light" as const,
  useMobileTokens: () => ({
    foreground: "#26231F",
    mutedForeground: "#6E675E",
  }),
}));
vi.mock("../components/bot-avatar", () => ({
  BotAvatar: ({ identity }: { identity: string }) =>
    createElement("span", { "data-avatar": identity }),
}));
vi.mock("../components/native-symbol", () => ({
  NativeSymbol: ({ ios }: { ios: string }) => createElement("i", { "data-symbol": ios }),
}));
vi.mock("react-native", () => {
  const flatten = (style: unknown): CSSProperties =>
    Object.assign({}, ...[style].flat(Number.POSITIVE_INFINITY).filter(Boolean));
  return {
    StyleSheet: { hairlineWidth: 1 },
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
      accessibilityLabel,
      onPress,
      disabled,
      testID,
    }: {
      children?: ReactNode;
      accessibilityLabel?: string;
      onPress?: () => void;
      disabled?: boolean;
      testID?: string;
    }) =>
      createElement(
        "button",
        {
          type: "button",
          "data-testid": testID,
          "aria-label": accessibilityLabel,
          disabled,
          onClick: onPress,
        },
        children,
      ),
  };
});

import { HomeCompanionCard } from "../components/home-companion-card";

const bots: MobileBot[] = [
  {
    id: "bot-1",
    name: "Sydney",
    color: "#4F7CAC",
    status: "idle",
    unread: false,
    pinned: true,
  } as MobileBot,
  {
    id: "bot-2",
    name: "Claude",
    color: "#8B5CF6",
    status: "idle",
    unread: false,
    pinned: false,
  } as MobileBot,
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  resetCompanionSessionStateForTest();
  fixture.available = true;
  fixture.active = null;
  fixture.revision = 0;
  fixture.screenState = "idle";
  fixture.listeners.clear();
  fixture.startUnified.mockImplementation(
    async (input: {
      botId: string;
      botName: string;
      botColor: string;
      spaceId?: string | null;
      showReply?: boolean;
    }) => {
      const mode = fixture.available ? "live-activity" : "in-app";
      if (fixture.available) {
        fixture.active = {
          id: "act-1",
          botId: input.botId,
          spaceId: input.spaceId ?? null,
          showReply: input.showReply ?? true,
        };
        fixture.revision += 1;
        for (const listener of fixture.listeners) listener();
      }
      setActiveCompanionSessionState({
        id: fixture.available ? "act-1" : "in-app-1",
        botId: input.botId,
        botName: input.botName,
        botColor: input.botColor,
        spaceId: input.spaceId ?? null,
        mode,
        showReply: input.showReply ?? true,
        startedAt: 1,
      });
    },
  );
  fixture.switchUnified.mockImplementation(
    async (input: {
      botId: string;
      botName: string;
      botColor: string;
      spaceId?: string | null;
      showReply?: boolean;
    }) => {
      setActiveCompanionSessionState({
        id: "in-app-2",
        botId: input.botId,
        botName: input.botName,
        botColor: input.botColor,
        spaceId: input.spaceId ?? null,
        mode: fixture.available ? "live-activity" : "in-app",
        showReply: input.showReply ?? true,
        startedAt: 2,
      });
    },
  );
  fixture.stopUnified.mockImplementation(async () => {
    fixture.active = null;
    fixture.revision += 1;
    for (const listener of fixture.listeners) listener();
    setActiveCompanionSessionState(null, { resetRuntime: true });
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

describe("HomeCompanionCard (CMP-03)", () => {
  it("switches bots, starts native companion, toggles screen sharing, and stops companion", async () => {
    const onOpenBot = vi.fn();
    await act(async () =>
      root.render(
        createElement(HomeCompanionCard, {
          bots,
          primaryBot: bots[0],
          spaceId: "space-1",
          cardStyle: {},
          onOpenBot,
        }),
      ),
    );
    expect(container.textContent).toContain("后台陪伴");
    expect(container.textContent).toContain("Sydney");

    // Switch target bot to Claude before starting
    const switchBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="home-hub-companion-switch-bot"]',
    );
    await act(async () => switchBtn?.click());
    expect(container.textContent).toContain("Claude");

    // Start companion
    const toggleBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="home-hub-companion-toggle"]',
    );
    await act(async () => toggleBtn?.click());
    expect(fixture.startUnified).toHaveBeenCalledWith(
      expect.objectContaining({ botId: "bot-2", botName: "Claude", spaceId: "space-1" }),
    );
    expect(container.textContent).toContain("灵动岛陪伴中");

    // Screen companion button visible because screenState === "idle"
    const screenBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="home-hub-companion-screen-toggle"]',
    );
    expect(screenBtn).not.toBeNull();
    await act(async () => screenBtn?.click());
    expect(fixture.presentCompanionScreen).toHaveBeenCalledWith("bot-2", "space-1");

    // Stop companion
    await act(async () => toggleBtn?.click());
    expect(fixture.stopCompanionScreenAuto).toHaveBeenCalledOnce();
    expect(fixture.stopUnified).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("未开启");
  });

  it("supports full in-app companion mode on standard sideload builds, shows live reply/privacy, switches active bot, and hides unsupported screen button", async () => {
    fixture.available = false;
    fixture.screenState = "unsupported";
    const onOpenBot = vi.fn();
    await act(async () =>
      root.render(
        createElement(HomeCompanionCard, {
          bots,
          primaryBot: bots[0],
          spaceId: "space-1",
          cardStyle: {},
          onOpenBot,
        }),
      ),
    );

    // Can start directly in in-app mode even when Live Activity extension is absent
    const toggleBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="home-hub-companion-toggle"]',
    );
    await act(async () => toggleBtn?.click());
    expect(fixture.startUnified).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("后台陪伴中");
    expect(container.querySelector('[data-testid="home-hub-companion-screen-toggle"]')).toBeNull();

    // Publishes live short reply when showReply is enabled
    await act(async () => {
      publishCompanionRuntimeState({
        activityId: "in-app-1",
        botId: "bot-1",
        status: "present",
        detailStatus: "present",
        latestReply: "刚刚整理好今日日程",
      });
    });
    expect(container.textContent).toContain("刚刚整理好今日日程");

    // Hides reply text in privacy mode
    await act(async () => {
      setCompanionPreferencesState({
        preferredBotId: "bot-1",
        showReply: false,
        showFloatingBar: true,
        notifyOnReply: true,
        speakReplies: false,
      });
    });
    expect(container.textContent).toContain("回复内容已隐藏");
    expect(container.textContent).not.toContain("刚刚整理好今日日程");

    // Switching bot works while companion is already active
    const switchBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="home-hub-companion-switch-bot"]',
    );
    await act(async () => switchBtn?.click());
    expect(fixture.switchUnified).toHaveBeenCalledWith(
      expect.objectContaining({ botId: "bot-2", botName: "Claude" }),
    );

    // Opens dedicated /companion console
    const consoleBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="home-hub-companion-console"]',
    );
    await act(async () => consoleBtn?.click());
    expect(fixture.push).toHaveBeenCalledWith("/companion");
  });
});
