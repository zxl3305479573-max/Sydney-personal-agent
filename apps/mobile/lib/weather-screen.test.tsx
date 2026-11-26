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
    accessibilityState,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    testID?: string;
    accessibilityLabel?: string;
    accessibilityState?: { selected?: boolean };
  }) =>
    createElement(
      "button",
      {
        type: "button",
        "data-testid": testID,
        "aria-label": accessibilityLabel,
        "aria-selected": accessibilityState?.selected ? "true" : "false",
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
import { resetWeatherScenePreferencesForTest } from "./weather-scene-state";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  resetWeatherScenePreferencesForTest();
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
        apparentTemperatureC: 21,
        humidityPercent: 52,
        windSpeedKmh: 11,
      },
      {
        timeIso: "2026-11-25T15:00",
        hourLabel: "15:00",
        temperatureC: 21,
        condition: "cloudy",
        isDay: true,
        apparentTemperatureC: 20,
        humidityPercent: 58,
        windSpeedKmh: 13,
      },
    ],
    hourlyByDate: {
      "2026-11-25": [
        {
          timeIso: "2026-11-25T14:00",
          hourLabel: "14:00",
          temperatureC: 22,
          condition: "sunny",
          isDay: true,
          apparentTemperatureC: 21,
          humidityPercent: 52,
          windSpeedKmh: 11,
        },
        {
          timeIso: "2026-11-25T15:00",
          hourLabel: "15:00",
          temperatureC: 21,
          condition: "cloudy",
          isDay: true,
          apparentTemperatureC: 20,
          humidityPercent: 58,
          windSpeedKmh: 13,
        },
      ],
      "2026-11-26": [
        {
          timeIso: "2026-11-26T09:00",
          hourLabel: "09:00",
          temperatureC: 15,
          condition: "rainy",
          isDay: true,
          apparentTemperatureC: 14,
          humidityPercent: 80,
          windSpeedKmh: 16,
        },
        {
          timeIso: "2026-11-26T14:00",
          hourLabel: "14:00",
          temperatureC: 18,
          condition: "cloudy",
          isDay: true,
          apparentTemperatureC: 17,
          humidityPercent: 76,
          windSpeedKmh: 14,
        },
      ],
    },
    daily: [
      {
        dateIso: "2026-11-25",
        highC: 24,
        lowC: 15,
        condition: "sunny",
        apparentTemperatureC: 23,
        humidityPercent: 55,
        windSpeedKmh: 12,
      },
      {
        dateIso: "2026-11-26",
        highC: 19,
        lowC: 12,
        condition: "rainy",
        apparentTemperatureC: 17,
        humidityPercent: 82,
        windSpeedKmh: 19,
      },
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

  it("switches hero, metrics, and hourly forecast when tapping a future day and returns to today", async () => {
    await act(async () => root.render(createElement(WeatherDetailScreen)));

    const todayBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="weather-daily-2026-11-25"]',
    );
    const tomorrowBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="weather-daily-2026-11-26"]',
    );
    expect(todayBtn?.getAttribute("aria-selected")).toBe("true");
    expect(tomorrowBtn?.getAttribute("aria-selected")).toBe("false");

    // Tap tomorrow in 「未来天气」
    await act(async () => tomorrowBtn?.click());

    expect(todayBtn?.getAttribute("aria-selected")).toBe("false");
    expect(tomorrowBtn?.getAttribute("aria-selected")).toBe("true");

    const hero = container.querySelector('[data-testid="weather-hero-card"]');
    const metrics = container.querySelector('[data-testid="weather-metrics-row"]');
    const hourlyCard = container.querySelector('[data-testid="weather-hourly-card"]');

    expect(hero?.textContent).toContain("周四 · 11月26日");
    expect(hero?.textContent).toContain("19° / 12°");
    expect(hero?.textContent).toContain("下雨");
    expect(hero?.textContent).toContain("最高 19° · 最低 12°");
    expect(hero?.querySelector('[data-symbol="cloud.rain"]')).not.toBeNull();

    expect(metrics?.textContent).toContain("17°");
    expect(metrics?.textContent).toContain("82%");
    expect(metrics?.textContent).toContain("19 km/h");

    expect(hourlyCard?.textContent).toContain("周四 · 逐小时预报");
    expect(hourlyCard?.textContent).toContain("09:00");
    expect(hourlyCard?.textContent).toContain("14:00");
    expect(hourlyCard?.textContent).not.toContain("现在");

    // Tap a specific hour on tomorrow to inspect that hour's exact weather
    const tomorrow14Btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="weather-hourly-2026-11-26T14:00"]',
    );
    await act(async () => tomorrow14Btn?.click());
    expect(hero?.textContent).toContain("周四 · 11月26日 14:00");
    expect(hero?.textContent).toContain("18°");
    expect(hero?.textContent).toContain("阴天");
    expect(metrics?.textContent).toContain("76%");
    expect(metrics?.textContent).toContain("14 km/h");

    // Tap the same hour again to return to tomorrow's full-day summary
    await act(async () => tomorrow14Btn?.click());
    expect(hero?.textContent).toContain("19° / 12°");
    expect(hero?.textContent).toContain("下雨");

    // Tap 「回到今天」 to return to live today weather
    const backTodayBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="weather-back-today-button"]',
    );
    await act(async () => backTodayBtn?.click());
    expect(container.querySelector('[data-testid="weather-selected-time-banner"]')).toBeNull();
    expect(hero?.textContent).toContain("22°");
    expect(hero?.textContent).toContain("天晴");
    expect(metrics?.textContent).toContain("52%");
    expect(hourlyCard?.textContent).toContain("现在");
    expect(todayBtn?.getAttribute("aria-selected")).toBe("true");
  });

  it("switches to a selected hour on today and returns to live weather on reset", async () => {
    await act(async () => root.render(createElement(WeatherDetailScreen)));

    const hour15Btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="weather-hourly-2026-11-25T15:00"]',
    );
    await act(async () => hour15Btn?.click());

    const hero = container.querySelector('[data-testid="weather-hero-card"]');
    const metrics = container.querySelector('[data-testid="weather-metrics-row"]');
    expect(hero?.textContent).toContain("今天 · 15:00");
    expect(hero?.textContent).toContain("21°");
    expect(hero?.textContent).toContain("阴天");
    expect(metrics?.textContent).toContain("58%");
    expect(metrics?.textContent).toContain("13 km/h");

    const backNowBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="weather-back-today-button"]',
    );
    await act(async () => backNowBtn?.click());
    expect(hero?.textContent).toContain("22°");
    expect(hero?.textContent).toContain("天晴");
    expect(metrics?.textContent).toContain("52%");
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

  it("lets users toggle app-wide weather effects and switch live/preview scenes", async () => {
    await act(async () => root.render(createElement(WeatherDetailScreen)));
    const card = container.querySelector('[data-testid="weather-atmosphere-card"]');
    expect(card?.textContent).toContain("全应用动态天气场景");
    expect(card?.textContent).toContain("跟随实时天气 · 晴天");

    const stormBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="weather-scene-thunderstorm"]',
    );
    await act(async () => stormBtn?.click());
    expect(card?.textContent).toContain("预览中 · 雷阵雨");

    const liveBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="weather-scene-live"]',
    );
    await act(async () => liveBtn?.click());
    expect(card?.textContent).toContain("跟随实时天气 · 晴天");

    const toggleBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="weather-atmosphere-toggle"]',
    );
    await act(async () => toggleBtn?.click());
    expect(toggleBtn?.textContent).toBe("已关闭");
  });

  it("lets users toggle weather ambient sound and adjust volume in the weather screen", async () => {
    await act(async () => root.render(createElement(WeatherDetailScreen)));
    const soundSection = container.querySelector('[data-testid="weather-sound-section"]');
    const soundToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="weather-sound-toggle"]',
    );
    const volUp = container.querySelector<HTMLButtonElement>('[data-testid="weather-sound-up"]');
    const volDown = container.querySelector<HTMLButtonElement>(
      '[data-testid="weather-sound-down"]',
    );

    expect(soundSection?.textContent).toContain("天气环境音效");
    expect(soundSection?.textContent).toContain("50%");
    expect(soundToggle?.textContent).toBe("已开启");

    await act(async () => volUp?.click());
    expect(soundSection?.textContent).toContain("60%");

    await act(async () => volDown?.click());
    expect(soundSection?.textContent).toContain("50%");

    // Switching preview to thunderstorm updates ambient sound description live.
    const stormBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="weather-scene-thunderstorm"]',
    );
    await act(async () => stormBtn?.click());
    expect(soundSection?.textContent).toContain("暴雨雷鸣");

    // Muting toggles to 已关闭 and zeroes visual bar percentage.
    await act(async () => soundToggle?.click());
    expect(soundToggle?.textContent).toBe("已关闭");
    expect(soundSection?.textContent).toContain("0%");
  });

  it("drops past hours before clockNow and aligns hero status with live scene", async () => {
    const base = fixture.weather;
    if (!base) throw new Error("expected base weather fixture");
    fixture.weather = {
      ...base,
      temperatureC: 17,
      condition: "cloudy",
      scene: "cloudy",
      isDay: true,
      hourly: [
        {
          timeIso: "2026-11-25T00:00",
          hourLabel: "00:00",
          temperatureC: 11,
          condition: "cloudy",
          isDay: false,
        },
        {
          timeIso: "2026-11-25T09:00",
          hourLabel: "09:00",
          temperatureC: 14,
          condition: "cloudy",
          isDay: true,
        },
        {
          timeIso: "2026-11-25T15:00",
          hourLabel: "15:00",
          temperatureC: 17,
          condition: "cloudy",
          isDay: true,
        },
        {
          timeIso: "2026-11-25T18:00",
          hourLabel: "18:00",
          temperatureC: 15,
          condition: "cloudy",
          isDay: false,
        },
      ],
      hourlyByDate: undefined,
    };
    await act(async () => root.render(createElement(WeatherDetailScreen)));
    const hero = container.querySelector('[data-testid="weather-hero-card"]');
    const hourlyCard = container.querySelector('[data-testid="weather-hourly-card"]');
    expect(hero?.textContent).toContain("多云");
    expect(hourlyCard?.textContent).toContain("现在");
    expect(hourlyCard?.textContent).toContain("15:00");
    expect(hourlyCard?.textContent).toContain("18:00");
    expect(hourlyCard?.textContent).not.toContain("00:00");
    expect(hourlyCard?.textContent).not.toContain("09:00");
  });
});
