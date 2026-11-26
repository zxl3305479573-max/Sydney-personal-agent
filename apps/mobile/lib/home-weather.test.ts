import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

import {
  fetchLiveHomeWeather,
  homeWeatherLabel,
  homeWeatherSymbol,
  isDaytimeHour,
  mapWmoWeatherCondition,
  mapWwoWeatherCondition,
  resetHomeWeatherCacheForTest,
} from "./home-weather";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  resetHomeWeatherCacheForTest();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("home weather mapping & live fetch", () => {
  it("maps WMO codes to sunny, cloudy, rainy, and snowy only", () => {
    expect(mapWmoWeatherCondition(0)).toBe("sunny");
    expect(mapWmoWeatherCondition(1)).toBe("sunny");
    expect(mapWmoWeatherCondition(2)).toBe("cloudy");
    expect(mapWmoWeatherCondition(3)).toBe("cloudy");
    expect(mapWmoWeatherCondition(45)).toBe("cloudy");
    expect(mapWmoWeatherCondition(61)).toBe("rainy");
    expect(mapWmoWeatherCondition(80)).toBe("rainy");
    expect(mapWmoWeatherCondition(95)).toBe("rainy");
    expect(mapWmoWeatherCondition(71)).toBe("snowy");
    expect(mapWmoWeatherCondition(86)).toBe("snowy");
  });

  it("maps wttr.in WWO codes to sunny, cloudy, rainy, and snowy", () => {
    expect(mapWwoWeatherCondition(113)).toBe("sunny");
    expect(mapWwoWeatherCondition(116)).toBe("cloudy");
    expect(mapWwoWeatherCondition(122)).toBe("cloudy");
    expect(mapWwoWeatherCondition(296)).toBe("rainy");
    expect(mapWwoWeatherCondition(332)).toBe("snowy");
  });

  it("returns localized labels and day/night adaptive icons", () => {
    expect(homeWeatherLabel("sunny", "zh-CN")).toBe("天晴");
    expect(homeWeatherLabel("cloudy", "zh-CN")).toBe("阴天");
    expect(homeWeatherLabel("cloudy", "zh-TW")).toBe("陰天");
    expect(homeWeatherLabel("rainy", "zh-CN")).toBe("下雨");
    expect(homeWeatherLabel("snowy", "zh-CN")).toBe("下雪");
    expect(homeWeatherLabel("rainy", "en")).toBe("Rain");

    expect(isDaytimeHour(new Date(2026, 10, 25, 10, 0))).toBe(true);
    expect(isDaytimeHour(new Date(2026, 10, 25, 20, 0))).toBe(false);
    expect(homeWeatherSymbol("sunny", true).ios).toBe("sun.max");
    expect(homeWeatherSymbol("sunny", false).ios).toBe("moon.stars");
    expect(homeWeatherSymbol("cloudy", true).ios).toBe("cloud");
    expect(homeWeatherSymbol("cloudy", false).ios).toBe("cloud.moon");
    expect(homeWeatherSymbol("rainy", true).ios).toBe("cloud.rain");
    expect(homeWeatherSymbol("snowy", false).ios).toBe("cloud.snow");
  });

  it("fetches realtime weather from GeoJS + Open-Meteo and caches coordinates", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ latitude: "31.2304", longitude: "121.4737", city: "Shanghai" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: {
            time: "2026-11-25T21:00",
            temperature_2m: 18.6,
            apparent_temperature: 17.4,
            relative_humidity_2m: 64,
            wind_speed_10m: 9.8,
            weather_code: 0,
            is_day: 0,
          },
          hourly: {
            time: ["2026-11-25T21:00", "2026-11-25T22:00"],
            temperature_2m: [18.6, 17.9],
            weather_code: [0, 2],
            is_day: [0, 0],
          },
          daily: {
            time: ["2026-11-25", "2026-11-26"],
            temperature_2m_max: [22.1, 19.4],
            temperature_2m_min: [13.2, 11.8],
            weather_code: [0, 61],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: { temperature_2m: 17.2, weather_code: 63, is_day: 0 },
        }),
      });

    const first = await fetchLiveHomeWeather(undefined, new Date(2026, 10, 25, 21, 0));
    expect(first).toMatchObject({
      temperatureC: 19,
      condition: "sunny",
      isDay: false,
      locationLabel: "Shanghai",
      apparentTemperatureC: 17,
      humidityPercent: 64,
      windSpeedKmh: 10,
      highC: 22,
      lowC: 13,
    });
    expect(first?.hourly).toHaveLength(2);
    expect(first?.daily).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Second call within 30 minutes reuses cached coordinates and only calls Open-Meteo.
    const second = await fetchLiveHomeWeather(undefined, new Date(2026, 10, 25, 21, 15));
    expect(second).toMatchObject({ temperatureC: 17, condition: "rainy", isDay: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falls back to wttr.in when Open-Meteo fails and returns null if all providers fail", async () => {
    fetchMock.mockRejectedValueOnce(new Error("geo offline")).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        current_condition: [{ temp_C: "-2", weatherCode: "332" }],
      }),
    });

    const fallback = await fetchLiveHomeWeather(undefined, new Date(2026, 10, 25, 9, 0));
    expect(fallback).toMatchObject({ temperatureC: -2, condition: "snowy", isDay: true });

    resetHomeWeatherCacheForTest();
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(fetchLiveHomeWeather(undefined, new Date(2026, 10, 25, 9, 0))).resolves.toBeNull();
  });
});
