// @vitest-environment jsdom
import type { CSSProperties, ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  pathname: "/",
  params: {} as { botId?: string; groupId?: string },
  push: vi.fn(),
  closeSettingsSheet: vi.fn(),
  setNotificationHandler: vi.fn(),
  dismissNotificationAsync: vi.fn(async () => undefined),
}));

vi.mock("expo-modules-core", () => ({ requireNativeModule: vi.fn() }));
vi.mock("expo-notifications", () => ({
  setNotificationHandler: fixture.setNotificationHandler,
  dismissNotificationAsync: fixture.dismissNotificationAsync,
  getPresentedNotificationsAsync: vi.fn(async () => []),
  dismissAllNotificationsAsync: vi.fn(async () => undefined),
}));
vi.mock("expo-secure-store", () => ({}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: fixture.push }),
  usePathname: () => fixture.pathname,
  useGlobalSearchParams: () => fixture.params,
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("./i18n", () => ({
  useI18n: () => ({ locale: "zh-CN", t: (s: string) => s }),
  getActiveUiLocale: () => "zh-CN",
  t: (s: string) => s,
}));
vi.mock("./native", () => ({
  useResolvedAppearance: () => "light" as const,
  useMobileTokens: () => ({
    background: "#F3F1EC",
    foreground: "#26231F",
    mutedForeground: "#6E675E",
  }),
}));
vi.mock("./settings-sheet", () => ({
  closeSettingsSheet: fixture.closeSettingsSheet,
}));
vi.mock("../components/bot-avatar", () => ({
  BotAvatar: ({
    color,
    identity,
    avatarSet,
    size,
  }: {
    color: string;
    identity?: string;
    avatarSet?: string;
    size?: number;
  }) =>
    createElement("div", {
      "data-testid": "mock-bot-avatar",
      "data-bot-id": identity,
      "data-bot-color": color,
      "data-bot-avatar-set": avatarSet ?? "",
      "data-size": String(size ?? 0),
    }),
}));
vi.mock("../components/native-symbol", () => ({
  NativeSymbol: ({ ios }: { ios: string }) => createElement("i", { "data-symbol": ios }),
}));
vi.mock("../components/motion-pressable", () => ({
  MotionPressable: ({
    children,
    onPress,
    testID,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    testID?: string;
    accessibilityLabel?: string;
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
}));
vi.mock("react-native", () => {
  const flatten = (style: unknown): CSSProperties =>
    Object.assign({}, ...[style].flat(Number.POSITIVE_INFINITY).filter(Boolean));
  return {
    Platform: { OS: "ios" },
    StyleSheet: { hairlineWidth: 1 },
    PanResponder: { create: () => ({ panHandlers: {} }) },
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
  };
});

import { BotNotificationBanner } from "../components/bot-notification-banner";
import { resetBotNotificationBannerStateForTest } from "./bot-notification-banner-state";
import {
  clearBotNotificationProfiles,
  registerBotNotificationProfiles,
} from "./bot-notification-registry";
import { configureForegroundNotifications, setOpenNotificationThread } from "./live-notifications";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  resetNotificationPreferencesStateForTest,
  setCachedNotificationPreferences,
} from "./notification-preferences-state";

const CUSTOM_BOT_PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

let container: HTMLDivElement;
let root: Root;
let foregroundHandler: Parameters<typeof fixture.setNotificationHandler>[0] | undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  fixture.pathname = "/";
  fixture.params = {};
  clearBotNotificationProfiles();
  resetBotNotificationBannerStateForTest();
  resetNotificationPreferencesStateForTest();
  configureForegroundNotifications();
  foregroundHandler ??= fixture.setNotificationHandler.mock.calls[0]?.[0];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("BotNotificationBanner & foreground bot avatar handoff", () => {
  it("renders each bot's own avatar instead of the app logo when foreground notifications arrive and opens that chat on tap", async () => {
    setCachedNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, sound: true }, true);
    await setOpenNotificationThread({ botId: "bot-currently-open" });
    registerBotNotificationProfiles([
      { id: "bot-alpha", name: "阿尔法", color: CUSTOM_BOT_PHOTO, avatarSet: "organic" },
      { id: "bot-beta", name: "贝塔管家", color: "#D96B43", avatarSet: "rakazo" },
    ]);

    await act(async () => root.render(createElement(BotNotificationBanner)));
    expect(container.querySelector('[data-testid="bot-notification-banner"]')).toBeNull();

    // First bot notification (custom photo avatar) arrives while user is on another screen
    let behavior: unknown;
    await act(async () => {
      behavior = await foregroundHandler?.handleNotification({
        request: {
          identifier: "notif-alpha-1",
          content: {
            title: "阿尔法",
            body: "已经整理好今天的日程啦",
            data: {
              kind: "message",
              botId: "bot-alpha",
              spaceId: "space-1",
              deliveryId: "deliv-1",
            },
          },
        },
      } as never);
    });

    // Suppresses default OS App-logo banner while keeping Notification Center list + sound
    expect(behavior).toEqual({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });

    const avatarAlpha = container.querySelector('[data-testid="mock-bot-avatar"]');
    expect(avatarAlpha?.getAttribute("data-bot-id")).toBe("bot-alpha");
    expect(avatarAlpha?.getAttribute("data-bot-color")).toBe(CUSTOM_BOT_PHOTO);
    expect(
      container.querySelector('[data-testid="bot-notification-banner-surface"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("阿尔法");
    expect(container.textContent).toContain("现在");
    expect(container.textContent).toContain("已经整理好今天的日程啦");

    // Second bot notification (different bot & color + attention badge) replaces banner with its own avatar
    await act(async () => {
      await foregroundHandler?.handleNotification({
        request: {
          identifier: "notif-beta-1",
          content: {
            title: "贝塔管家",
            body: "需要确认重启服务",
            data: {
              kind: "attention",
              botId: "bot-beta",
              spaceId: "space-1",
              deliveryId: "deliv-2",
            },
          },
        },
      } as never);
    });

    const avatarBeta = container.querySelector('[data-testid="mock-bot-avatar"]');
    expect(avatarBeta?.getAttribute("data-bot-id")).toBe("bot-beta");
    expect(avatarBeta?.getAttribute("data-bot-color")).toBe("#D96B43");
    expect(avatarBeta?.getAttribute("data-bot-avatar-set")).toBe("rakazo");
    expect(container.textContent).toContain("贝塔管家");
    expect(container.textContent).toContain("需要确认");

    // Tapping the banner navigates directly to that bot's chat and dismisses the banner
    const openBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="bot-notification-banner-open"]',
    );
    await act(async () => openBtn?.click());
    expect(fixture.closeSettingsSheet).toHaveBeenCalledOnce();
    expect(fixture.push).toHaveBeenCalledWith(
      {
        pathname: "/thread",
        params: { botId: "bot-beta", spaceId: "space-1", name: "贝塔管家" },
      },
      expect.objectContaining({ dangerouslySingular: expect.any(Function) }),
    );
    expect(container.querySelector('[data-testid="bot-notification-banner"]')).toBeNull();
  });

  it("dismisses automatically when user navigates into the bot's thread and leaves non-bot test alerts to OS banner", async () => {
    await setOpenNotificationThread(null);
    registerBotNotificationProfiles([{ id: "bot-alpha", name: "阿尔法", color: "#4F7CAC" }]);

    await act(async () => root.render(createElement(BotNotificationBanner)));

    // System test notification (no botId) keeps OS banner enabled
    let testBehavior: unknown;
    await act(async () => {
      testBehavior = await foregroundHandler?.handleNotification({
        request: {
          identifier: "test-1",
          content: { title: "Sydney 测试通知", body: "ok", data: { kind: "test" } },
        },
      } as never);
    });
    expect(testBehavior).toMatchObject({ shouldShowBanner: true, shouldShowList: true });
    expect(container.querySelector('[data-testid="bot-notification-banner"]')).toBeNull();

    // Show bot banner, then navigate into that bot's thread -> auto-dismisses
    await act(async () => {
      await foregroundHandler?.handleNotification({
        request: {
          identifier: "notif-alpha-2",
          content: {
            title: "阿尔法",
            body: "快来看看",
            data: { kind: "message", botId: "bot-alpha", deliveryId: "deliv-3" },
          },
        },
      } as never);
    });
    expect(container.querySelector('[data-testid="bot-notification-banner"]')).not.toBeNull();

    fixture.pathname = "/thread";
    fixture.params = { botId: "bot-alpha" };
    await act(async () => root.render(createElement(BotNotificationBanner)));
    expect(container.querySelector('[data-testid="bot-notification-banner"]')).toBeNull();
  });
});
