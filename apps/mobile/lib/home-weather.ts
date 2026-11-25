import type Ionicons from "@react-native-vector-icons/ionicons";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

export type HomeWeatherCondition = "sunny" | "cloudy" | "rainy" | "snowy";

export type HomeWeatherSnapshot = {
  temperatureC: number;
  condition: HomeWeatherCondition;
  isDay: boolean;
  fetchedAt: number;
};

export type HomeWeatherSymbol = {
  ios: string;
  android: ComponentProps<typeof Ionicons>["name"];
};

const WEATHER_POLL_INTERVAL_MS = 15 * 60 * 1000;
const WEATHER_STALE_MS = 5 * 60 * 1000;
const COORDS_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 6_000;
const CLOCK_TICK_MS = 60 * 1000;

const GEO_URL = "https://get.geojs.io/v1/ip/geo.json";
const WTTR_URL = "https://wttr.in/?format=j1";

const WWO_SNOW_CODES = new Set([
  179, 227, 230, 323, 326, 329, 332, 335, 338, 368, 371, 374, 377, 392, 395,
]);
const WWO_CLOUDY_CODES = new Set([116, 119, 122, 143, 248, 260]);

let cachedWeather: HomeWeatherSnapshot | null = null;
let cachedCoords: { latitude: number; longitude: number; fetchedAt: number } | null = null;
let inFlightFetch: Promise<HomeWeatherSnapshot | null> | null = null;

export function isDaytimeHour(date: Date): boolean {
  const hour = date.getHours();
  return hour >= 6 && hour < 18;
}

/** Maps Open-Meteo WMO weather codes to the 4 user-facing states. */
export function mapWmoWeatherCondition(code: number): HomeWeatherCondition {
  if (code === 0 || code === 1) return "sunny";
  if (code === 2 || code === 3 || code === 45 || code === 48) return "cloudy";
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) {
    return "snowy";
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) {
    return "rainy";
  }
  return "cloudy";
}

/** Maps wttr.in WWO weather codes to the 4 user-facing states. */
export function mapWwoWeatherCondition(code: number): HomeWeatherCondition {
  if (code === 113) return "sunny";
  if (WWO_CLOUDY_CODES.has(code)) return "cloudy";
  if (WWO_SNOW_CODES.has(code)) return "snowy";
  if (code >= 176) return "rainy";
  return "cloudy";
}

export function homeWeatherLabel(condition: HomeWeatherCondition, locale: string): string {
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  switch (condition) {
    case "sunny":
      return chinese ? "天晴" : "Sunny";
    case "cloudy":
      return chinese ? (traditional ? "陰天" : "阴天") : "Cloudy";
    case "rainy":
      return chinese ? "下雨" : "Rain";
    case "snowy":
      return chinese ? "下雪" : "Snow";
  }
}

export function homeWeatherSymbol(
  condition: HomeWeatherCondition,
  isDay: boolean,
): HomeWeatherSymbol {
  switch (condition) {
    case "sunny":
      return isDay
        ? { ios: "sun.max", android: "sunny-outline" }
        : { ios: "moon.stars", android: "moon-outline" };
    case "cloudy":
      return isDay
        ? { ios: "cloud", android: "cloudy-outline" }
        : { ios: "cloud.moon", android: "cloudy-night-outline" };
    case "rainy":
      return { ios: "cloud.rain", android: "rainy-outline" };
    case "snowy":
      return { ios: "cloud.snow", android: "snow-outline" };
  }
}

async function fetchJsonWithTimeout(
  url: string,
  signal?: AbortSignal,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) throw new Error("aborted");
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function resolveApproxCoords(
  nowMs: number,
  signal?: AbortSignal,
): Promise<{ latitude: number; longitude: number } | null> {
  if (cachedCoords && nowMs - cachedCoords.fetchedAt < COORDS_TTL_MS) {
    return { latitude: cachedCoords.latitude, longitude: cachedCoords.longitude };
  }
  const raw = await fetchJsonWithTimeout(GEO_URL, signal);
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  cachedCoords = { latitude, longitude, fetchedAt: nowMs };
  return { latitude, longitude };
}

async function fetchFromOpenMeteo(
  now: Date,
  signal?: AbortSignal,
): Promise<HomeWeatherSnapshot | null> {
  const coords = await resolveApproxCoords(now.getTime(), signal);
  if (!coords) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
    coords.latitude.toFixed(4),
  )}&longitude=${encodeURIComponent(
    coords.longitude.toFixed(4),
  )}&current=temperature_2m,weather_code,is_day&timezone=auto`;
  const raw = await fetchJsonWithTimeout(url, signal);
  if (!raw || typeof raw !== "object") return null;
  const current = (raw as { current?: Record<string, unknown> }).current;
  if (!current || typeof current !== "object") return null;
  const temp = Number(current.temperature_2m);
  const code = Number(current.weather_code);
  if (!Number.isFinite(temp) || !Number.isFinite(code)) return null;
  const isDay =
    current.is_day === 1 || current.is_day === 0 ? current.is_day === 1 : isDaytimeHour(now);
  return {
    temperatureC: Math.round(temp),
    condition: mapWmoWeatherCondition(code),
    isDay,
    fetchedAt: now.getTime(),
  };
}

async function fetchFromWttr(now: Date, signal?: AbortSignal): Promise<HomeWeatherSnapshot | null> {
  const raw = await fetchJsonWithTimeout(WTTR_URL, signal);
  if (!raw || typeof raw !== "object") return null;
  const list = (raw as { current_condition?: unknown[] }).current_condition;
  const first = Array.isArray(list) ? list[0] : undefined;
  if (!first || typeof first !== "object") return null;
  const record = first as Record<string, unknown>;
  const temp = Number(record.temp_C);
  const code = Number(record.weatherCode);
  if (!Number.isFinite(temp) || !Number.isFinite(code)) return null;
  return {
    temperatureC: Math.round(temp),
    condition: mapWwoWeatherCondition(code),
    isDay: isDaytimeHour(now),
    fetchedAt: now.getTime(),
  };
}

export async function fetchLiveHomeWeather(
  signal?: AbortSignal,
  now: Date = new Date(),
): Promise<HomeWeatherSnapshot | null> {
  try {
    const primary = await fetchFromOpenMeteo(now, signal);
    if (primary) {
      cachedWeather = primary;
      return primary;
    }
  } catch {
    if (signal?.aborted) return null;
  }
  try {
    const fallback = await fetchFromWttr(now, signal);
    if (fallback) {
      cachedWeather = fallback;
      return fallback;
    }
  } catch {
    // Ignore transient network errors; keep previous cached value if any.
  }
  return null;
}

export function resetHomeWeatherCacheForTest(): void {
  cachedWeather = null;
  cachedCoords = null;
  inFlightFetch = null;
}

/**
 * Keeps live weather and local clock in sync on the HomeHub:
 * - refreshes immediately when stale (> 5m), every 15m while active, on foreground resume, and on manual refresh;
 * - updates day/night indicator every minute so icons shift smoothly as time changes.
 */
export function useHomeWeather(options?: { enabled?: boolean; fixedNow?: Date }): {
  weather: HomeWeatherSnapshot | null;
  clockNow: Date;
  refreshWeather: (force?: boolean) => Promise<void>;
} {
  const enabled = options?.enabled ?? true;
  const fixedNow = options?.fixedNow;
  const [weather, setWeather] = useState<HomeWeatherSnapshot | null>(() =>
    enabled ? cachedWeather : null,
  );
  const [clockNow, setClockNow] = useState<Date>(() => fixedNow ?? new Date());
  const mountedRef = useRef(true);

  const refreshWeather = useCallback(
    async (force = false) => {
      if (!enabled) return;
      const nowMs = Date.now();
      if (!force && cachedWeather && nowMs - cachedWeather.fetchedAt < WEATHER_STALE_MS) {
        if (mountedRef.current) setWeather(cachedWeather);
        return;
      }
      if (!inFlightFetch) {
        inFlightFetch = fetchLiveHomeWeather(undefined, new Date()).finally(() => {
          inFlightFetch = null;
        });
      }
      const next = await inFlightFetch;
      if (mountedRef.current && next) {
        setWeather(next);
      }
    },
    [enabled],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (fixedNow) {
      setClockNow(fixedNow);
      return;
    }
    const timer = setInterval(() => {
      setClockNow(new Date());
    }, CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [fixedNow]);

  useEffect(() => {
    if (!enabled) return;
    void refreshWeather(false);
    const poll = setInterval(() => {
      if (AppState.currentState === "active") {
        void refreshWeather(true);
      }
    }, WEATHER_POLL_INTERVAL_MS);
    const appSub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        if (!fixedNow) setClockNow(new Date());
        void refreshWeather(false);
      }
    });
    return () => {
      clearInterval(poll);
      appSub.remove();
    };
  }, [enabled, fixedNow, refreshWeather]);

  const effectiveWeather =
    weather && !fixedNow
      ? {
          ...weather,
          // Keep day/night icon aligned with local time if the snapshot predates a day/night crossing.
          isDay:
            Date.now() - weather.fetchedAt > 2 * 60 * 1000
              ? isDaytimeHour(clockNow)
              : weather.isDay,
        }
      : weather;

  return { weather: effectiveWeather, clockNow, refreshWeather };
}
