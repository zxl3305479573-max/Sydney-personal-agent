// @vitest-environment jsdom
import type { CSSProperties, ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  publishCompanionRuntimeState,
  resetCompanionSessionStateForTest,
  setActiveCompanionSessionState,
  setCompanionPreferencesState,
} from "./companion-session-state";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/projects",
  params: {} as { botId?: string },
  call: null as null | { botId: string },
  stopUnified: vi.fn(async () => {
    setActiveCompanionSessionState(null, { resetRuntime: true });
  }),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: state.push }),
  usePathname: () => state.pathname,
  useGlobalSearchParams: () => state.params,
}));
vi.mock("./call-session", () => ({
  useCallSession: () => state.call,
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
    stopUnifiedCompanion: state.stopUnified,
    companionStatusDisplay: (status: string) => ({
      label: status === "thinking" ? "思考中…" : "我一直都在",
      tone: status === "thinking" ? "busy" : "active",
    }),
  };
});
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN", t: (s: string) => s }) }));
vi.mock("./native", () => ({
  useResolvedAppearance: () => "light" as const,
  useMobileTokens: () => ({ foreground: "#26231F", mutedForeground: "#6E675E" }),
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
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    PanResponder: { create: () => ({ panHandlers: {} }) },
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
      testID,
    }: {
      children?: ReactNode;
      accessibilityLabel?: string;
      onPress?: () => void;
      testID?: string;
    }) =>
      createElement(
        "button",
        {
          type: "button",
          "data-testid": testID,
          "aria-label": accessibilityLabel,
          onClick: onPress,
        },
        children,
      ),
  };
});

import {
  CompanionFloatingBar,
  shouldShowCompanionFloatingBar,
} from "../components/companion-floating-bar";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  resetCompanionSessionStateForTest();
  state.pathname = "/projects";
  state.params = {};
  state.call = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("CompanionFloatingBar (CMP-03)", () => {
  it("evaluates route, active call, and preference visibility gates accurately", () => {
    expect(
      shouldShowCompanionFloatingBar({
        activeBotId: "bot-1",
        showFloatingBar: true,
        callActive: false,
        pathname: "/map",
      }),
    ).toBe(true);
    expect(
      shouldShowCompanionFloatingBar({
        activeBotId: "bot-1",
        showFloatingBar: true,
        callActive: false,
        pathname: "/thread",
        routeBotId: "bot-1",
      }),
    ).toBe(false);
    expect(
      shouldShowCompanionFloatingBar({
        activeBotId: "bot-1",
        showFloatingBar: true,
        callActive: false,
        pathname: "/thread",
        routeBotId: "bot-2",
      }),
    ).toBe(true);
    expect(
      shouldShowCompanionFloatingBar({
        activeBotId: "bot-1",
        showFloatingBar: true,
        callActive: true,
        pathname: "/projects",
      }),
    ).toBe(false);
    expect(
      shouldShowCompanionFloatingBar({
        activeBotId: "bot-1",
        showFloatingBar: false,
        callActive: false,
        pathname: "/projects",
      }),
    ).toBe(false);
    expect(
      shouldShowCompanionFloatingBar({
        activeBotId: "bot-1",
        showFloatingBar: true,
        callActive: false,
        pathname: "/companion",
      }),
    ).toBe(false);
    expect(
      shouldShowCompanionFloatingBar({
        activeBotId: "bot-1",
        showFloatingBar: true,
        callActive: false,
        pathname: "/companion-capture",
      }),
    ).toBe(false);
  });

  it("renders across screens, opens chat/console, respects privacy, and stops companion", async () => {
    setActiveCompanionSessionState({
      id: "in-app-1",
      botId: "bot-1",
      botName: "Sydney",
      botColor: "#4F7CAC",
      spaceId: "space-1",
      mode: "in-app",
      showReply: true,
      startedAt: 1,
    });
    publishCompanionRuntimeState({
      activityId: "in-app-1",
      botId: "bot-1",
      status: "present",
      detailStatus: "present",
      latestReply: "任务已完成",
    });

    await act(async () => root.render(createElement(CompanionFloatingBar, { bottomOffset: 84 })));
    const floatingBar = container.querySelector<HTMLDivElement>(
      '[data-testid="companion-floating-bar"]',
    );
    expect(floatingBar).not.toBeNull();
    expect(floatingBar?.style.position).toBe("absolute");
    expect(
      container.querySelector('[data-testid="companion-floating-bar-surface"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Sydney");
    expect(container.textContent).toContain("任务已完成");

    // Collapsing switches into a compact floating orb and tapping expands back.
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="companion-floating-bar-collapse"]')
        ?.click(),
    );
    expect(
      container.querySelector('[data-testid="companion-floating-orb-surface"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="companion-floating-orb-expand"]')).not.toBeNull();
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="companion-floating-orb-expand"]')
        ?.click(),
    );
    expect(
      container.querySelector('[data-testid="companion-floating-bar-open-chat"]'),
    ).not.toBeNull();

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="companion-floating-bar-open-chat"]')
        ?.click(),
    );
    expect(state.push).toHaveBeenCalledWith({
      pathname: "/thread",
      params: { botId: "bot-1", name: "Sydney", spaceId: "space-1" },
    });

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="companion-floating-bar-capture"]')
        ?.click(),
    );
    expect(state.push).toHaveBeenCalledWith({
      pathname: "/companion-capture",
      params: { botId: "bot-1", source: "clipboard", spaceId: "space-1" },
    });

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="companion-floating-bar-console"]')
        ?.click(),
    );
    expect(state.push).toHaveBeenCalledWith("/companion");

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

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="companion-floating-bar-stop"]')
        ?.click(),
    );
    expect(state.stopUnified).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-testid="companion-floating-bar"]')).toBeNull();
  });
});
