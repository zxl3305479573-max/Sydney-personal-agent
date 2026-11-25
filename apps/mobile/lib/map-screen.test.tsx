// @vitest-environment jsdom
import type { CSSProperties, ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapCanvasEvent } from "../components/map-canvas";
import {
  buildMapCanvasHtml,
  isAllowedMapCanvasUrl,
  MAP_CANVAS_BASE_URL,
  parseMapCanvasMessage,
} from "../components/map-canvas";

const mocks = vi.hoisted(() => ({
  onCanvasEvent: undefined as undefined | ((event: MapCanvasEvent) => void),
  openInAmap: vi.fn(async () => ({ opened: "amap-app" as const, url: "iosamap://path?t=2" })),
  searchPlaces: vi.fn(async () => [
    {
      id: "poi-1",
      name: "首都国际机场",
      address: "北京市顺义区",
      latitude: 40.0799,
      longitude: 116.6031,
    },
  ]),
  reverseGeocode: vi.fn(async () => "北京市 · 东城区"),
  fetchRoute: vi.fn(async () => ({
    distanceMeters: 26_500,
    durationMinutes: 38,
    points: [
      { latitude: 39.9042, longitude: 116.4074 },
      { latitude: 40.0799, longitude: 116.6031 },
    ],
    estimated: false,
  })),
  resolveIp: vi.fn(async () => ({
    latitude: 39.9042,
    longitude: 116.4074,
    city: "北京市",
    label: "北京市",
    source: "ip" as const,
    updatedAt: 1,
  })),
  loadSaved: vi.fn(async () => null),
  saveLocation: vi.fn(async () => undefined),
  loadRecent: vi.fn(async () => []),
  rememberDest: vi.fn(async () => []),
}));

vi.mock("react-native-webview", () => ({
  WebView: () => null,
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN", t: (s: string) => s }) }));
vi.mock("./native", () => ({
  useResolvedAppearance: () => "light" as const,
  useMobileTokens: () => ({
    background: "#F3F1EC",
    foreground: "#26231F",
    mutedForeground: "#6E675E",
  }),
}));
vi.mock("./scoped-theme-context", () => ({
  useScreenBackground: (fallback: string) => fallback,
}));
vi.mock("./amap-navigation", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    openInAmapNavigation: mocks.openInAmap,
  };
});
vi.mock("./map-location", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getCachedUserLocation: () => null,
    loadSavedMapLocation: mocks.loadSaved,
    saveMapLocation: mocks.saveLocation,
    resolveApproxIpLocation: mocks.resolveIp,
  };
});
vi.mock("./map-search", () => ({
  searchMapPlaces: mocks.searchPlaces,
  reverseGeocodeLocation: mocks.reverseGeocode,
  fetchMapRoutePreview: mocks.fetchRoute,
  loadRecentMapDestinations: mocks.loadRecent,
  rememberMapDestination: mocks.rememberDest,
}));
vi.mock("../components/glass-title", () => ({
  glassHeaderOptions: () => ({}),
}));
vi.mock("../components/native-symbol", () => ({
  NativeSymbol: ({ ios }: { ios: string }) => createElement("i", { "data-symbol": ios }),
}));
vi.mock("../components/map-canvas", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const { forwardRef, useImperativeHandle } = await import("react");
  return {
    ...actual,
    MapCanvas: forwardRef(function MockMapCanvas(
      props: { onEvent: (e: MapCanvasEvent) => void; tileProvider: string },
      ref,
    ) {
      mocks.onCanvasEvent = props.onEvent;
      useImperativeHandle(ref, () => ({
        centerOn: vi.fn(),
        zoomBy: vi.fn(),
        fitRoute: vi.fn(),
        requestGpsLocation: vi.fn(),
      }));
      return createElement("div", {
        "data-testid": "map-canvas-mock",
        "data-provider": props.tileProvider,
      });
    }),
  };
});
vi.mock("react-native", () => {
  const flatten = (style: unknown): CSSProperties =>
    Object.assign({}, ...[style].flat(Number.POSITIVE_INFINITY).filter(Boolean));
  return {
    StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
    Alert: { alert: vi.fn() },
    Keyboard: { dismiss: vi.fn() },
    ActivityIndicator: () => createElement("span", { "data-spinner": "1" }),
    ScrollView: ({ children, style }: { children?: ReactNode; style?: unknown }) =>
      createElement("div", { style: flatten(style) }, children),
    View: ({
      children,
      style,
      testID,
    }: {
      children?: ReactNode;
      style?: unknown;
      testID?: string;
    }) => createElement("div", { "data-testid": testID, style: flatten(style) }, children),
    Text: ({
      children,
      style,
      testID,
    }: {
      children?: ReactNode;
      style?: unknown;
      testID?: string;
    }) => createElement("span", { "data-testid": testID, style: flatten(style) }, children),
    TextInput: ({
      value,
      onChangeText,
      onFocus,
      testID,
    }: {
      value?: string;
      onChangeText?: (text: string) => void;
      onFocus?: () => void;
      testID?: string;
    }) =>
      createElement("input", {
        "data-testid": testID,
        value: value ?? "",
        onFocus,
        onChange: (e: { target: { value: string } }) => onChangeText?.(e.target.value),
      }),
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

import MapScreen from "../app/map";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.onCanvasEvent = undefined;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("MapCanvas protocol & MapScreen navigation (MAP-03)", () => {
  it("validates MapCanvas allowed URLs, postMessage payloads, and zero external CDN scripts", () => {
    expect(isAllowedMapCanvasUrl("about:blank")).toBe(true);
    expect(isAllowedMapCanvasUrl(MAP_CANVAS_BASE_URL)).toBe(true);
    expect(isAllowedMapCanvasUrl("https://evil.example/phish")).toBe(false);

    expect(parseMapCanvasMessage(JSON.stringify({ type: "ready" }))).toEqual({ type: "ready" });
    expect(
      parseMapCanvasMessage(JSON.stringify({ type: "tap", latitude: 39.9, longitude: 116.4 })),
    ).toEqual({ type: "tap", latitude: 39.9, longitude: 116.4 });
    expect(
      parseMapCanvasMessage(JSON.stringify({ type: "tap", latitude: 999, longitude: 116.4 })),
    ).toBeNull();
    expect(parseMapCanvasMessage("{not-json")).toBeNull();

    const html = buildMapCanvasHtml({ dark: false, tileProvider: "amap" });
    expect(html).not.toContain("unpkg.com");
    expect(html).not.toContain("jsdelivr");
    expect(html).toContain("is.autonavi.com");
    expect(html).toContain("tile.openstreetmap.org");
  });

  it("displays current location, calibrates origin, selects destination, switches mode, and launches Amap navigation", async () => {
    await act(async () => root.render(createElement(MapScreen)));
    expect(container.textContent).toContain("我的位置：北京市");
    expect(container.textContent).toContain("网络大致定位");

    // Calibrate current location by tapping map in calibrate mode
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="map-calibrate-button"]')?.click(),
    );
    expect(container.querySelector('[data-testid="map-calibrate-banner"]')).not.toBeNull();
    await act(async () =>
      mocks.onCanvasEvent?.({ type: "tap", latitude: 39.9087, longitude: 116.3975 }),
    );
    expect(container.textContent).toContain("手动校准");
    expect(mocks.saveLocation).toHaveBeenCalledWith(
      expect.objectContaining({ source: "manual", latitude: 39.9087, longitude: 116.3975 }),
    );

    // Search destination and select first result
    const input = container.querySelector<HTMLInputElement>('[data-testid="map-search-input"]')!;
    await act(async () => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "首都机场");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="map-search-submit"]')?.click(),
    );
    expect(mocks.searchPlaces).toHaveBeenCalledWith(
      "首都机场",
      expect.anything(),
      expect.anything(),
    );

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="map-search-result-poi-1"]')
        ?.click(),
    );
    expect(container.textContent).toContain("首都国际机场");
    expect(container.textContent).toContain("26.5 公里");

    // Switch mode to walking and launch Amap navigation
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="map-mode-walking"]')?.click(),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="map-open-amap-button"]')?.click(),
    );
    expect(mocks.openInAmap).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "walking",
        destination: expect.objectContaining({
          name: "首都国际机场",
          latitude: 40.0799,
          longitude: 116.6031,
        }),
      }),
    );
    expect(container.textContent).toContain("已跳转至高德地图");
  });
});
