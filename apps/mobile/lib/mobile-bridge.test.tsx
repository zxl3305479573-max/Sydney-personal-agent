// @vitest-environment jsdom

import type { MobileAppActionBlock } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());
const openAmapMock = vi.hoisted(() =>
  vi.fn(async () => ({ opened: "amap-app" as const, url: "iosamap://path?dname=Test" })),
);
const routerPushMock = vi.hoisted(() => vi.fn());
const appStateMock = vi.hoisted(() => ({ currentState: "active" }));

vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return appStateMock.currentState;
    },
    addEventListener: () => ({ remove: () => undefined }),
  },
  Platform: { OS: "ios", Version: "18.2" },
  View: (props: { children?: ReactNode; testID?: string }) =>
    createElement("div", { "data-testid": props.testID }, props.children),
  Text: (props: { children?: ReactNode }) => createElement("span", null, props.children),
  Pressable: (props: {
    children?: ReactNode;
    testID?: string;
    disabled?: boolean;
    onPress?: () => void;
  }) =>
    createElement(
      "button",
      {
        type: "button",
        "data-testid": props.testID,
        disabled: props.disabled,
        onClick: () => props.onPress?.(),
      },
      props.children,
    ),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock("./api", () => ({
  loadSessionToken: async () => "token-1",
  selectedSpaceId: () => "space-1",
  rpc: rpcMock,
}));

vi.mock("./amap-navigation", () => ({
  openInAmapNavigation: openAmapMock,
}));

vi.mock("./app-version", () => ({
  getAppVersionInfo: () => ({ release: { version: "1.0.29" }, nativeLabel: "1.0.13" }),
}));

const startCompanionMock = vi.hoisted(() => vi.fn(async () => undefined));
const stopCompanionMock = vi.hoisted(() => vi.fn(async () => undefined));
const peekScreenSnapshotMock = vi.hoisted(() =>
  vi.fn(async () => ({
    state: "capturing" as const,
    text: "微信聊天 · 周末一起吃火锅",
    capturedAt: 1000,
  })),
);

vi.mock("./companion-activity", () => ({
  companionScreenState: async () => "capturing",
  peekCompanionScreenSnapshot: peekScreenSnapshotMock,
  subscribeCompanionScreenState: () => () => undefined,
}));

vi.mock("./companion-session", () => ({
  getActiveCompanionSession: () => null,
  getCachedCompanionPreferences: () => ({
    preferredBotId: null,
    showReply: true,
    showFloatingBar: true,
    notifyOnReply: true,
    speakReplies: false,
  }),
  getCompanionSessionState: () => ({ active: null, runtime: null }),
  startUnifiedCompanion: startCompanionMock,
  stopUnifiedCompanion: stopCompanionMock,
  switchUnifiedCompanionBot: startCompanionMock,
  subscribeCompanionSessionState: () => () => undefined,
}));

vi.mock("./home-weather", () => ({
  getCachedHomeWeather: () => ({
    temperatureC: 23,
    condition: "sunny",
    isDay: true,
    fetchedAt: 1000,
    locationLabel: "上海市 · 黄浦区",
  }),
}));

vi.mock("./map-location", () => ({
  getCachedUserLocation: () => ({
    latitude: 31.2304,
    longitude: 121.4737,
    city: "上海市",
    label: "上海市 · 黄浦区",
    source: "gps",
    updatedAt: 1000,
  }),
  loadSavedMapLocation: async () => null,
  subscribeUserLocation: () => () => undefined,
}));

vi.mock("./map-search", () => ({
  loadRecentMapDestinations: async () => [],
}));

vi.mock("./i18n", () => ({
  useI18n: () => ({ locale: "zh-CN", t: (text: string) => text }),
}));

vi.mock("./native", () => ({
  useMobileTokens: () => ({
    background: "#F3F1EC",
    foreground: "#26231F",
    mutedForeground: "#6E675E",
    destructive: "#C4272D",
  }),
}));

vi.mock("../components/glass-surface", () => ({
  GlassSurface: (props: { children?: ReactNode; testID?: string }) =>
    createElement("div", { "data-testid": props.testID }, props.children),
}));

vi.mock("../components/native-symbol", () => ({
  NativeSymbol: () => null,
}));

import { AppActionCard } from "../components/AppActionCard";
import {
  collectMobileBridgeSnapshot,
  executeMobileAppAction,
  maybeAutoExecuteMobileAppAction,
  resetMobileBridgeForTest,
} from "./mobile-bridge";
import { setNativeDeviceBridgeModuleForTest } from "./native-device-bridge";

describe("mobile bridge & AppActionCard", () => {
  beforeEach(() => {
    resetMobileBridgeForTest();
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ ok: true });
    openAmapMock.mockClear();
    routerPushMock.mockClear();
    appStateMock.currentState = "active";
    setNativeDeviceBridgeModuleForTest({
      isAvailable: () => true,
      getAuthorizationStatuses: () => ({
        calendar: "authorized",
        reminders: "authorized",
        contacts: "authorized",
        clipboard: "authorized",
      }),
      requestPermission: async () => "authorized",
      listCalendarEvents: async () => ({
        authorizationStatus: "authorized",
        events: [
          {
            id: "e-1",
            title: "站会",
            startAt: "2026-11-26T01:00:00Z",
            endAt: "2026-11-26T01:30:00Z",
          },
        ],
      }),
      createCalendarEvent: async () => ({ ok: true, id: "e-new" }),
      listReminders: async () => ({
        authorizationStatus: "authorized",
        items: [{ id: "r-1", title: "买牛奶", completed: false }],
      }),
      createReminder: async () => ({ ok: true, id: "r-new" }),
      listContacts: async () => ({
        authorizationStatus: "authorized",
        totalCount: 1,
        items: [{ id: "c-1", name: "王五", phones: ["13700137000"], emails: [] }],
      }),
      readClipboard: async () => ({ hasText: true, textPreview: "测试剪贴板", updatedAt: 1000 }),
      writeClipboard: async () => ({ ok: true }),
    });
  });

  afterEach(() => {
    setNativeDeviceBridgeModuleForTest(undefined);
    vi.unstubAllGlobals();
  });

  it("collects authorized native iOS snapshots and strips disabled categories", async () => {
    const full = await collectMobileBridgeSnapshot({
      enabled: true,
      location: true,
      weather: true,
      mapAndAmap: true,
      companion: true,
      appNavigation: true,
      calendar: true,
      reminders: true,
      contacts: true,
      clipboard: true,
      financeLedger: true,
      foregroundAutoExecute: true,
    });
    expect(full.calendar?.events[0]?.title).toBe("站会");
    expect(full.reminders?.items[0]?.title).toBe("买牛奶");
    expect(full.contacts?.items[0]?.name).toBe("王五");
    expect(full.clipboard?.textPreview).toBe("测试剪贴板");
    expect(full.phoneScreen).toMatchObject({
      state: "capturing",
      text: "微信聊天 · 周末一起吃火锅",
      capturedAt: 1000,
    });

    const restricted = await collectMobileBridgeSnapshot({
      enabled: true,
      location: true,
      weather: false,
      mapAndAmap: true,
      companion: false,
      appNavigation: false,
      calendar: false,
      reminders: false,
      contacts: false,
      clipboard: false,
      financeLedger: false,
      foregroundAutoExecute: true,
    });
    expect(restricted.calendar).toBeUndefined();
    expect(restricted.reminders).toBeUndefined();
    expect(restricted.contacts).toBeUndefined();
    expect(restricted.clipboard).toBeUndefined();
    expect(restricted.phoneScreen).toBeUndefined();
  });

  it("executes Amap navigation, open_screen, and native writes, and deduplicates foreground auto-execution", async () => {
    const navAction = {
      actionId: "act-nav-1",
      autoExecute: true,
      createdAt: new Date().toISOString(),
      payload: {
        actionKind: "open_amap_navigation" as const,
        destinationName: "东方明珠",
        destinationLatitude: 31.2397,
        destinationLongitude: 121.4998,
        mode: "driving" as const,
        nativeUrlIos: "iosamap://path?dname=东方明珠",
        nativeUrlAndroid: "amapuri://route/plan/?dname=东方明珠",
        webUrl: "https://uri.amap.com/navigation?to=121.4998,31.2397,东方明珠",
      },
    };

    const first = await maybeAutoExecuteMobileAppAction(navAction, {
      router: { push: routerPushMock },
    });
    expect(first?.ok).toBe(true);
    expect(openAmapMock).toHaveBeenCalledTimes(1);

    // Second auto-execute for the same actionId is ignored.
    const second = await maybeAutoExecuteMobileAppAction(navAction, {
      router: { push: routerPushMock },
    });
    expect(second).toBeNull();
    expect(openAmapMock).toHaveBeenCalledTimes(1);

    // Backgrounded app never auto-executes.
    appStateMock.currentState = "background";
    const bg = await maybeAutoExecuteMobileAppAction(
      { ...navAction, actionId: "act-nav-bg" },
      { router: { push: routerPushMock } },
    );
    expect(bg).toBeNull();
    expect(openAmapMock).toHaveBeenCalledTimes(1);

    // Manual execution works for screen navigation and native clipboard write.
    const screenRes = await executeMobileAppAction(
      {
        actionId: "act-screen-1",
        payload: { actionKind: "open_screen", route: "/weather" },
      },
      { router: { push: routerPushMock } },
    );
    expect(screenRes.ok).toBe(true);
    expect(routerPushMock).toHaveBeenCalledWith("/weather");

    const clipRes = await executeMobileAppAction(
      {
        actionId: "act-clip-1",
        payload: { actionKind: "set_clipboard", text: "你好 Sydney" },
      },
      { router: { push: routerPushMock } },
    );
    expect(clipRes.ok).toBe(true);
  });

  it("renders AppActionCard and lets the user manually trigger the action", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    appStateMock.currentState = "background";
    const block: MobileAppActionBlock = {
      kind: "app_action",
      actionId: "act-card-1",
      title: "高德导航 · 外滩",
      subtitle: "驾车 · 中山东一路",
      autoExecute: false,
      createdAt: new Date().toISOString(),
      payload: {
        actionKind: "open_amap_navigation",
        destinationName: "外滩",
        mode: "driving",
        nativeUrlIos: "iosamap://path?dname=外滩",
        nativeUrlAndroid: "amapuri://route/plan/?dname=外滩",
        webUrl: "https://uri.amap.com/search?keyword=外滩",
      },
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<AppActionCard block={block} />);
      });
      expect(container.textContent).toContain("高德导航 · 外滩");
      const button = container.querySelector<HTMLButtonElement>(
        '[data-testid="app-action-card-button"]',
      )!;
      expect(button.textContent).toContain("打开高德导航");
      await act(async () => {
        button.click();
      });
      expect(openAmapMock).toHaveBeenCalledTimes(1);
    } finally {
      act(() => root.unmount());
    }
  });
});
