// @vitest-environment jsdom
import type { CSSProperties, ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobileBot } from "./api";

const fixture = vi.hoisted(() => ({
  available: true,
  active: null as null | { id: string; botId: string; spaceId: string | null },
  revision: 0,
  listeners: new Set<() => void>(),
  screenState: "idle" as "unsupported" | "idle" | "capturing",
  startCompanion: vi.fn(async (botId: string, _name: string, spaceId: string | null) => {
    fixture.active = { id: "act-1", botId, spaceId };
    fixture.revision += 1;
    for (const listener of fixture.listeners) listener();
  }),
  stopCompanion: vi.fn(async () => {
    fixture.active = null;
    fixture.revision += 1;
    for (const listener of fixture.listeners) listener();
  }),
  presentCompanionScreen: vi.fn(async () => undefined),
  stopCompanionScreen: vi.fn(async () => undefined),
  stopCompanionScreenAuto: vi.fn(),
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
  startCompanion: fixture.startCompanion,
  stopCompanion: fixture.stopCompanion,
  presentCompanionScreen: fixture.presentCompanionScreen,
  stopCompanionScreen: fixture.stopCompanionScreen,
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
  fixture.available = true;
  fixture.active = null;
  fixture.revision = 0;
  fixture.screenState = "idle";
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

describe("HomeCompanionCard", () => {
  it("switches bots, starts background companion, toggles screen sharing, and stops companion", async () => {
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

    // Switch target bot to Claude
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
    expect(fixture.startCompanion).toHaveBeenCalledWith(
      "bot-2",
      "Claude",
      "space-1",
      true,
      expect.objectContaining({ color: "#8B5CF6" }),
      expect.any(Function),
      expect.any(Function),
    );
    expect(container.textContent).toContain("后台陪伴中");

    // Trigger screen companion
    const screenBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="home-hub-companion-screen-toggle"]',
    );
    await act(async () => screenBtn?.click());
    expect(fixture.presentCompanionScreen).toHaveBeenCalledWith("bot-2", "space-1");

    // Stop companion
    await act(async () => toggleBtn?.click());
    expect(fixture.stopCompanionScreenAuto).toHaveBeenCalledOnce();
    expect(fixture.stopCompanion).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("未开启");
  });

  it("shows fallback status and opens chat when native companion extension is unavailable", async () => {
    fixture.available = false;
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
    expect(container.textContent).toContain("当前版本未启扩展");
    const toggleBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="home-hub-companion-toggle"]',
    );
    await act(async () => toggleBtn?.click());
    expect(onOpenBot).toHaveBeenCalledWith(bots[0]);
    expect(fixture.startCompanion).not.toHaveBeenCalled();
  });
});
