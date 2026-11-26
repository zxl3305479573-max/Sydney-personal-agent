import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

import { resetDeviceLocationCacheForTest, setNativeLocationModuleForTest } from "./device-location";
import {
  fetchLiveHomeWeather,
  getWeatherHourlyForDate,
  homeWeatherLabel,
  homeWeatherSymbol,
  isDaytimeHour,
  mapWmoWeatherCondition,
  mapWwoWeatherCondition,
  resetHomeWeatherCacheForTest,
} from "./home-weather";
import { resetMapLocationCacheForTest } from "./map-location";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  resetMapLocationCacheForTest();
  resetDeviceLocationCacheForTest();
  setNativeLocationModuleForTest(null);
  resetHomeWeatherCacheForTest();
});

afterEach(() => {
  setNativeLocationModuleForTest(undefined);
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

  it("prioritizes native phone GPS over network IP geolocation", async () => {
    setNativeLocationModuleForTest({
      isAvailable: () => true,
      authorizationStatus: () => "authorized",
      getCurrentLocation: vi.fn(async () => ({
        latitude: 30.2741,
        longitude: 120.1551,
        accuracyMeters: 15,
        city: "杭州市",
        district: "西湖区",
        region: "浙江省",
        label: "杭州市 · 西湖区",
      })),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        current: {
          time: "2026-11-25T14:00",
          temperature_2m: 20.4,
          apparent_temperature: 19.6,
          relative_humidity_2m: 58,
          wind_speed_10m: 7.2,
          weather_code: 1,
          is_day: 1,
        },
      }),
    });

    const result = await fetchLiveHomeWeather(undefined, new Date(2026, 10, 25, 14, 0));
    expect(result).toMatchObject({
      temperatureC: 20,
      condition: "sunny",
      locationLabel: "杭州市 · 西湖区",
      locationSource: "gps",
    });
    // Must call Open-Meteo directly with phone GPS coords without hitting GeoJS IP endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("latitude=30.2741");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("longitude=120.1551");
  });

  it("parses per-day hourly forecasts and daily metrics across Open-Meteo and wttr.in", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ latitude: "31.2304", longitude: "121.4737", city: "Shanghai" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: {
            time: "2026-11-25T14:00",
            temperature_2m: 22.1,
            apparent_temperature: 21.0,
            relative_humidity_2m: 52,
            wind_speed_10m: 11.2,
            weather_code: 0,
            is_day: 1,
          },
          hourly: {
            time: ["2026-11-25T14:00", "2026-11-25T15:00", "2026-11-26T09:00", "2026-11-26T14:00"],
            temperature_2m: [22.1, 21.2, 15.4, 18.7],
            apparent_temperature: [21.0, 20.1, 14.2, 17.6],
            relative_humidity_2m: [52, 56, 80, 84],
            wind_speed_10m: [11.2, 12.4, 16.2, 19.4],
            weather_code: [0, 2, 61, 63],
            is_day: [1, 1, 1, 1],
          },
          daily: {
            time: ["2026-11-25", "2026-11-26"],
            temperature_2m_max: [24.0, 19.2],
            temperature_2m_min: [15.1, 12.3],
            apparent_temperature_max: [23.1, 17.8],
            wind_speed_10m_max: [14.2, 20.1],
            weather_code: [0, 61],
          },
        }),
      });

    const openMeteo = await fetchLiveHomeWeather(undefined, new Date(2026, 10, 25, 14, 0));
    expect(openMeteo?.daily?.[1]).toMatchObject({
      dateIso: "2026-11-26",
      highC: 19,
      lowC: 12,
      condition: "rainy",
      apparentTemperatureC: 18,
      humidityPercent: 82,
      windSpeedKmh: 20,
    });
    expect(openMeteo ? getWeatherHourlyForDate(openMeteo, "2026-11-26") : []).toEqual([
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
        temperatureC: 19,
        condition: "rainy",
        isDay: true,
        apparentTemperatureC: 18,
        humidityPercent: 84,
        windSpeedKmh: 19,
      },
    ]);

    resetHomeWeatherCacheForTest();
    fetchMock.mockRejectedValueOnce(new Error("geo offline")).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        current_condition: [
          {
            temp_C: "18",
            FeelsLikeC: "17",
            humidity: "60",
            windspeedKmph: "10",
            weatherCode: "113",
          },
        ],
        weather: [
          {
            date: "2026-11-25",
            maxtempC: "20",
            mintempC: "12",
            hourly: [
              {
                time: "900",
                tempC: "16",
                FeelsLikeC: "15",
                humidity: "65",
                windspeedKmph: "9",
                weatherCode: "113",
              },
            ],
          },
          {
            date: "2026-11-26",
            maxtempC: "14",
            mintempC: "8",
            hourly: [
              {
                time: "900",
                tempC: "11",
                FeelsLikeC: "9",
                humidity: "78",
                windspeedKmph: "14",
                weatherCode: "296",
              },
              {
                time: "1500",
                tempC: "13",
                FeelsLikeC: "11",
                humidity: "82",
                windspeedKmph: "21",
                weatherCode: "296",
              },
            ],
          },
        ],
      }),
    });

    const wttr = await fetchLiveHomeWeather(undefined, new Date(2026, 10, 25, 14, 0));
    expect(wttr?.daily?.[1]).toMatchObject({
      dateIso: "2026-11-26",
      highC: 14,
      lowC: 8,
      condition: "rainy",
      apparentTemperatureC: 11,
      humidityPercent: 80,
      windSpeedKmh: 21,
    });
    expect(wttr ? getWeatherHourlyForDate(wttr, "2026-11-26") : []).toHaveLength(2);
  });
});
