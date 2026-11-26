// @vitest-environment jsdom
import type { CSSProperties, ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeWeatherSnapshot } from "./home-weather";

const fixture = vi.hoisted(() => ({
  weather: null as HomeWeatherSnapshot | null,
  loading: false,
  error: false,
  refreshWeather: vi.fn(async () => undefined),
}));

vi.mock("./home-weather", async () => {
  const actual = await vi.importActual<typeof import("./home-weather")>("./home-weather");
  return {
    ...actual,
    useHomeWeather: () => ({
      weather: fixture.weather,
      clockNow: new Date(2026, 10, 25, 14, 30),
      loading: fixture.loading,
      error: fixture.error,
      refreshWeather: fixture.refreshWeather,
    }),
  };
});
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN", t: (s: string) => s }) }));
vi.mock("./native", () => ({
  native: { secondaryLabel: "#6E675E" },
  useResolvedAppearance: () => "light" as const,
  useMobileTokens: () => ({
    background: "#F3F1EC",
    foreground: "#26231F",
    mutedForeground: "#6E675E",
  }),
}));
vi.mock("./scoped-theme-context", () => ({ useScreenBackground: (fallback: string) => fallback }));
vi.mock("./side-insets", () => ({ useSideInsets: () => ({}) }));
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
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));
vi.mock("react-native", () => {
  const flatten = (style: unknown): CSSProperties =>
    Object.assign({}, ...[style].flat(Number.POSITIVE_INFINITY).filter(Boolean));
  return {
    ActivityIndicator: () => createElement("span", null, "loading"),
    RefreshControl: () => null,
    StyleSheet: { hairlineWidth: 1 },
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
    Text: ({ children, style }: { children?: ReactNode; style?: unknown }) =>
      createElement("span", { style: flatten(style) }, children),
  };
});

import WeatherDetailScreen from "../app/weather";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  fixture.loading = false;
  fixture.error = false;
  fixture.weather = {
    temperatureC: 22,
    condition: "sunny",
    isDay: true,
    fetchedAt: new Date(2026, 10, 25, 14, 30).getTime(),
    locationLabel: "Shanghai",
    apparentTemperatureC: 21,
    humidityPercent: 52,
    windSpeedKmh: 11,
    highC: 24,
    lowC: 15,
    hourly: [
      {
        timeIso: "2026-11-25T14:00",
        hourLabel: "14:00",
        temperatureC: 22,
        condition: "sunny",
        isDay: true,
      },
      {
        timeIso: "2026-11-25T15:00",
        hourLabel: "15:00",
        temperatureC: 21,
        condition: "cloudy",
        isDay: true,
      },
    ],
    daily: [
      { dateIso: "2026-11-25", highC: 24, lowC: 15, condition: "sunny" },
      { dateIso: "2026-11-26", highC: 19, lowC: 12, condition: "rainy" },
    ],
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("WeatherDetailScreen", () => {
  it("renders city, current temperature, metrics, hourly and daily forecasts, and supports refresh", async () => {
    await act(async () => root.render(createElement(WeatherDetailScreen)));
    const text = container.textContent ?? "";
    expect(text).toContain("Shanghai");
    expect(text).toContain("22°");
    expect(text).toContain("天晴");
    expect(text).toContain("最高 24° · 最低 15°");
    expect(text).toContain("21°");
    expect(text).toContain("52%");
    expect(text).toContain("11 km/h");
    expect(text).toContain("逐小时预报");
    expect(text).toContain("未来天气");
    expect(text).toContain("下雨");

    const refreshBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="weather-refresh-button"]',
    );
    await act(async () => refreshBtn?.click());
    expect(fixture.refreshWeather).toHaveBeenCalledWith(true);
  });

  it("shows a retry button when weather data failed to load", async () => {
    fixture.weather = null;
    fixture.error = true;
    await act(async () => root.render(createElement(WeatherDetailScreen)));
    expect(container.textContent).toContain("暂时无法获取天气");
    const retryBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="weather-retry-button"]',
    );
    await act(async () => retryBtn?.click());
    expect(fixture.refreshWeather).toHaveBeenCalledWith(true);
  });
});
