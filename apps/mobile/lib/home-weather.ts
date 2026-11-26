import type Ionicons from "@react-native-vector-icons/ionicons";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

export type HomeWeatherCondition = "sunny" | "cloudy" | "rainy" | "snowy";

export type HomeWeatherHourlyItem = {
  timeIso: string;
  hourLabel: string;
  temperatureC: number;
  condition: HomeWeatherCondition;
  isDay: boolean;
};

export type HomeWeatherDailyItem = {
  dateIso: string;
  highC: number;
  lowC: number;
  condition: HomeWeatherCondition;
};

export type HomeWeatherSnapshot = {
  temperatureC: number;
  condition: HomeWeatherCondition;
  isDay: boolean;
  fetchedAt: number;
  locationLabel?: string | null;
  apparentTemperatureC?: number | null;
  humidityPercent?: number | null;
  windSpeedKmh?: number | null;
  highC?: number | null;
  lowC?: number | null;
  hourly?: HomeWeatherHourlyItem[];
  daily?: HomeWeatherDailyItem[];
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
let cachedCoords: {
  latitude: number;
  longitude: number;
  locationLabel: string | null;
  fetchedAt: number;
} | null = null;
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

function padTwo(value: number): string {
  return String(value).padStart(2, "0");
}

function finiteRounded(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function extractHourLabel(timeIso: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(timeIso);
  if (match) return `${match[1]}:00`;
  return timeIso.slice(-5) || timeIso;
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
): Promise<{ latitude: number; longitude: number; locationLabel: string | null } | null> {
  if (cachedCoords && nowMs - cachedCoords.fetchedAt < COORDS_TTL_MS) {
    return {
      latitude: cachedCoords.latitude,
      longitude: cachedCoords.longitude,
      locationLabel: cachedCoords.locationLabel,
    };
  }
  const raw = await fetchJsonWithTimeout(GEO_URL, signal);
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const city = typeof record.city === "string" ? record.city.trim() : "";
  const region = typeof record.region === "string" ? record.region.trim() : "";
  const locationLabel = city || region || null;
  cachedCoords = { latitude, longitude, locationLabel, fetchedAt: nowMs };
  return { latitude, longitude, locationLabel };
}

function parseOpenMeteoHourly(
  hourlyRaw: unknown,
  currentTimeIso: string | undefined,
  now: Date,
): HomeWeatherHourlyItem[] {
  if (!hourlyRaw || typeof hourlyRaw !== "object") return [];
  const hourly = hourlyRaw as Record<string, unknown>;
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const temps = Array.isArray(hourly.temperature_2m) ? hourly.temperature_2m : [];
  const codes = Array.isArray(hourly.weather_code) ? hourly.weather_code : [];
  const days = Array.isArray(hourly.is_day) ? hourly.is_day : [];

  const currentHourPrefix =
    typeof currentTimeIso === "string" && currentTimeIso.length >= 13
      ? currentTimeIso.slice(0, 13)
      : `${now.getFullYear()}-${padTwo(now.getMonth() + 1)}-${padTwo(now.getDate())}T${padTwo(now.getHours())}`;

  let startIndex = times.findIndex(
    (entry) => typeof entry === "string" && entry.slice(0, 13) >= currentHourPrefix,
  );
  if (startIndex < 0) startIndex = 0;

  const items: HomeWeatherHourlyItem[] = [];
  for (let i = startIndex; i < times.length && items.length < 12; i += 1) {
    const timeIso = times[i];
    const temp = finiteRounded(temps[i]);
    const code = Number(codes[i]);
    if (typeof timeIso !== "string" || temp === null || !Number.isFinite(code)) continue;
    const isDayVal = days[i];
    const hourNum = Number(extractHourLabel(timeIso).slice(0, 2));
    const isDay =
      isDayVal === 1 || isDayVal === 0
        ? isDayVal === 1
        : Number.isFinite(hourNum)
          ? hourNum >= 6 && hourNum < 18
          : isDaytimeHour(now);
    items.push({
      timeIso,
      hourLabel: extractHourLabel(timeIso),
      temperatureC: temp,
      condition: mapWmoWeatherCondition(code),
      isDay,
    });
  }
  return items;
}

function parseOpenMeteoDaily(dailyRaw: unknown): HomeWeatherDailyItem[] {
  if (!dailyRaw || typeof dailyRaw !== "object") return [];
  const daily = dailyRaw as Record<string, unknown>;
  const times = Array.isArray(daily.time) ? daily.time : [];
  const highs = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
  const lows = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
  const codes = Array.isArray(daily.weather_code) ? daily.weather_code : [];

  const items: HomeWeatherDailyItem[] = [];
  for (let i = 0; i < times.length && items.length < 7; i += 1) {
    const dateIso = times[i];
    const highC = finiteRounded(highs[i]);
    const lowC = finiteRounded(lows[i]);
    const code = Number(codes[i]);
    if (typeof dateIso !== "string" || highC === null || lowC === null || !Number.isFinite(code)) {
      continue;
    }
    items.push({
      dateIso,
      highC,
      lowC,
      condition: mapWmoWeatherCondition(code),
    });
  }
  return items;
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
  )}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day&hourly=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`;
  const raw = await fetchJsonWithTimeout(url, signal);
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const current = body.current as Record<string, unknown> | undefined;
  if (!current || typeof current !== "object") return null;
  const temp = finiteRounded(current.temperature_2m);
  const code = Number(current.weather_code);
  if (temp === null || !Number.isFinite(code)) return null;
  const isDay =
    current.is_day === 1 || current.is_day === 0 ? current.is_day === 1 : isDaytimeHour(now);
  const hourly = parseOpenMeteoHourly(
    body.hourly,
    typeof current.time === "string" ? current.time : undefined,
    now,
  );
  const daily = parseOpenMeteoDaily(body.daily);
  return {
    temperatureC: temp,
    condition: mapWmoWeatherCondition(code),
    isDay,
    fetchedAt: now.getTime(),
    locationLabel: coords.locationLabel,
    apparentTemperatureC: finiteRounded(current.apparent_temperature),
    humidityPercent: finiteRounded(current.relative_humidity_2m),
    windSpeedKmh: finiteRounded(current.wind_speed_10m),
    highC: daily[0]?.highC ?? null,
    lowC: daily[0]?.lowC ?? null,
    hourly,
    daily,
  };
}

function parseWttrLocation(raw: Record<string, unknown>): string | null {
  const areas = Array.isArray(raw.nearest_area) ? raw.nearest_area : [];
  const first = areas[0] as Record<string, unknown> | undefined;
  const areaNames = first && Array.isArray(first.areaName) ? first.areaName : [];
  const entry = areaNames[0] as Record<string, unknown> | undefined;
  return typeof entry?.value === "string" && entry.value.trim() ? entry.value.trim() : null;
}

async function fetchFromWttr(now: Date, signal?: AbortSignal): Promise<HomeWeatherSnapshot | null> {
  const raw = await fetchJsonWithTimeout(WTTR_URL, signal);
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const list = Array.isArray(body.current_condition) ? body.current_condition : [];
  const first = list[0];
  if (!first || typeof first !== "object") return null;
  const record = first as Record<string, unknown>;
  const temp = finiteRounded(record.temp_C);
  const code = Number(record.weatherCode);
  if (temp === null || !Number.isFinite(code)) return null;

  const daysRaw = Array.isArray(body.weather) ? body.weather : [];
  const daily: HomeWeatherDailyItem[] = [];
  const hourly: HomeWeatherHourlyItem[] = [];

  for (const item of daysRaw) {
    if (!item || typeof item !== "object") continue;
    const day = item as Record<string, unknown>;
    const dateIso = typeof day.date === "string" ? day.date : "";
    const highC = finiteRounded(day.maxtempC);
    const lowC = finiteRounded(day.mintempC);
    const dayHours = Array.isArray(day.hourly) ? day.hourly : [];
    const midday = dayHours[Math.floor(dayHours.length / 2)] as Record<string, unknown> | undefined;
    const dayCode = Number(midday?.weatherCode ?? code);
    if (dateIso && highC !== null && lowC !== null) {
      daily.push({
        dateIso,
        highC,
        lowC,
        condition: mapWwoWeatherCondition(Number.isFinite(dayCode) ? dayCode : code),
      });
    }
    if (hourly.length < 12) {
      for (const slotRaw of dayHours) {
        if (hourly.length >= 12 || !slotRaw || typeof slotRaw !== "object") break;
        const slot = slotRaw as Record<string, unknown>;
        const slotTemp = finiteRounded(slot.tempC);
        const slotCode = Number(slot.weatherCode);
        const rawTime = Number(slot.time ?? 0);
        const hour = Math.max(0, Math.min(23, Math.floor(rawTime / 100)));
        if (slotTemp === null || !Number.isFinite(slotCode)) continue;
        hourly.push({
          timeIso: `${dateIso}T${padTwo(hour)}:00`,
          hourLabel: `${padTwo(hour)}:00`,
          temperatureC: slotTemp,
          condition: mapWwoWeatherCondition(slotCode),
          isDay: hour >= 6 && hour < 18,
        });
      }
    }
  }

  return {
    temperatureC: temp,
    condition: mapWwoWeatherCondition(code),
    isDay: isDaytimeHour(now),
    fetchedAt: now.getTime(),
    locationLabel: parseWttrLocation(body),
    apparentTemperatureC: finiteRounded(record.FeelsLikeC),
    humidityPercent: finiteRounded(record.humidity),
    windSpeedKmh: finiteRounded(record.windspeedKmph),
    highC: daily[0]?.highC ?? null,
    lowC: daily[0]?.lowC ?? null,
    hourly,
    daily,
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

export function getCachedHomeWeather(): HomeWeatherSnapshot | null {
  return cachedWeather;
}

export function resetHomeWeatherCacheForTest(): void {
  cachedWeather = null;
  cachedCoords = null;
  inFlightFetch = null;
}

/**
 * Keeps live weather and local clock in sync on the HomeHub & Weather Detail screens:
 * - refreshes immediately when stale (> 5m), every 15m while active, on foreground resume, and on manual refresh;
 * - updates day/night indicator every minute so icons shift smoothly as time changes.
 */
export function useHomeWeather(options?: { enabled?: boolean; fixedNow?: Date }): {
  weather: HomeWeatherSnapshot | null;
  clockNow: Date;
  loading: boolean;
  error: boolean;
  refreshWeather: (force?: boolean) => Promise<void>;
} {
  const enabled = options?.enabled ?? true;
  const fixedNow = options?.fixedNow;
  const [weather, setWeather] = useState<HomeWeatherSnapshot | null>(() =>
    enabled ? cachedWeather : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [clockNow, setClockNow] = useState<Date>(() => fixedNow ?? new Date());
  const mountedRef = useRef(true);

  const refreshWeather = useCallback(
    async (force = false) => {
      if (!enabled) return;
      const nowMs = Date.now();
      if (!force && cachedWeather && nowMs - cachedWeather.fetchedAt < WEATHER_STALE_MS) {
        if (mountedRef.current) {
          setWeather(cachedWeather);
          setError(false);
        }
        return;
      }
      if (mountedRef.current) setLoading(true);
      if (!inFlightFetch) {
        inFlightFetch = fetchLiveHomeWeather(undefined, new Date()).finally(() => {
          inFlightFetch = null;
        });
      }
      const next = await inFlightFetch;
      if (mountedRef.current) {
        setLoading(false);
        if (next) {
          setWeather(next);
          setError(false);
        } else if (!cachedWeather) {
          setError(true);
        }
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
          isDay:
            Date.now() - weather.fetchedAt > 2 * 60 * 1000
              ? isDaytimeHour(clockNow)
              : weather.isDay,
        }
      : weather;

  return { weather: effectiveWeather, clockNow, loading, error, refreshWeather };
}
