import type Ionicons from "@react-native-vector-icons/ionicons";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { isNativeLocationAvailable, requestDeviceGpsLocation } from "./device-location";
import type { LocationSource } from "./map-location";
import {
  getCachedUserLocation,
  haversineDistanceMeters,
  loadSavedMapLocation,
  subscribeUserLocation,
} from "./map-location";
import type { WeatherSceneKind } from "./weather-scene";
import { classifyWmoWeatherScene, classifyWwoWeatherScene } from "./weather-scene";

export type HomeWeatherCondition = "sunny" | "cloudy" | "rainy" | "snowy";

export type HomeWeatherHourlyItem = {
  timeIso: string;
  hourLabel: string;
  temperatureC: number;
  condition: HomeWeatherCondition;
  isDay: boolean;
  apparentTemperatureC?: number | null;
  humidityPercent?: number | null;
  windSpeedKmh?: number | null;
};

export type HomeWeatherDailyItem = {
  dateIso: string;
  highC: number;
  lowC: number;
  condition: HomeWeatherCondition;
  apparentTemperatureC?: number | null;
  humidityPercent?: number | null;
  windSpeedKmh?: number | null;
};

export type HomeWeatherSnapshot = {
  temperatureC: number;
  condition: HomeWeatherCondition;
  isDay: boolean;
  fetchedAt: number;
  currentTimeIso?: string | null;
  weatherCode?: number | null;
  scene?: WeatherSceneKind;
  precipitationMm?: number | null;
  snowfallCm?: number | null;
  cloudCoverPercent?: number | null;
  locationLabel?: string | null;
  locationSource?: LocationSource;
  apparentTemperatureC?: number | null;
  humidityPercent?: number | null;
  windSpeedKmh?: number | null;
  highC?: number | null;
  lowC?: number | null;
  hourly?: HomeWeatherHourlyItem[];
  hourlyByDate?: Record<string, HomeWeatherHourlyItem[]>;
  daily?: HomeWeatherDailyItem[];
};

export type HomeWeatherSymbol = {
  ios: string;
  android: ComponentProps<typeof Ionicons>["name"];
};

const WEATHER_POLL_INTERVAL_MS = 15 * 60 * 1000;
const WEATHER_STALE_MS = 5 * 60 * 1000;
const COORDS_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const CLOCK_TICK_MS = 60 * 1000;
const CLOCK_BOUNDARY_CUSHION_MS = 25;

/** Milliseconds until the next exact wall-clock minute boundary (HH:MM:00). */
export function nextMinuteDelayMs(now: Date): number {
  const msIntoMinute = now.getSeconds() * 1000 + now.getMilliseconds();
  return Math.max(50, CLOCK_TICK_MS - msIntoMinute + CLOCK_BOUNDARY_CUSHION_MS);
}

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
  source: LocationSource;
  fetchedAt: number;
} | null = null;
let inFlightFetch: Promise<HomeWeatherSnapshot | null> | null = null;
const weatherListeners = new Set<() => void>();

function notifyWeatherListeners(): void {
  for (const listener of weatherListeners) listener();
}

export function subscribeHomeWeather(listener: () => void): () => void {
  weatherListeners.add(listener);
  return () => {
    weatherListeners.delete(listener);
  };
}

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

function finiteNonNegative(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function extractHourLabel(timeIso: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(timeIso);
  if (match) return `${match[1]}:00`;
  return timeIso.slice(-5) || timeIso;
}

function extractDateIso(timeIso: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(timeIso);
  return match?.[1] ?? null;
}

function averageFinite(values: Array<number | null | undefined>): number | null {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      sum += value;
      count += 1;
    }
  }
  return count > 0 ? Math.round(sum / count) : null;
}

function maxFinite(values: Array<number | null | undefined>): number | null {
  let best: number | null = null;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      best = best === null ? value : Math.max(best, value);
    }
  }
  return best;
}

function representativeDaytimeApparent(slots: HomeWeatherHourlyItem[]): number | null {
  const daytime = slots.filter((slot) => slot.isDay);
  const pool = daytime.length > 0 ? daytime : slots;
  return maxFinite(pool.map((slot) => slot.apparentTemperatureC));
}

export function getWeatherHourlyForDate(
  weather: HomeWeatherSnapshot,
  dateIso: string | null,
): HomeWeatherHourlyItem[] {
  if (!dateIso) return weather.hourly ?? [];
  const grouped = weather.hourlyByDate?.[dateIso];
  if (grouped && grouped.length > 0) return grouped;
  return (weather.hourly ?? []).filter((slot) => slot.timeIso.startsWith(dateIso));
}

function formatLocalHourPrefix(date: Date): string {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}T${padTwo(date.getHours())}`;
}

function resolveEffectiveHourPrefix(weather: HomeWeatherSnapshot, clockNow: Date): string {
  const iso = weather.currentTimeIso;
  if (typeof iso === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(?::(\d{2}))?/.exec(iso);
    if (match) {
      const base = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5] ?? "0"),
      );
      if (!Number.isNaN(base.getTime())) {
        const elapsedMs = Math.max(0, clockNow.getTime() - weather.fetchedAt);
        return formatLocalHourPrefix(new Date(base.getTime() + elapsedMs));
      }
    }
  }
  return formatLocalHourPrefix(clockNow);
}

/**
 * Aligns today's hourly forecast strip with the current wall clock:
 * - index 0 ("现在") is always synced with the live current snapshot;
 * - subsequent slots are strictly future hours (> current hour) across today & tomorrow.
 */
export function alignTodayHourlyForecast(
  weather: HomeWeatherSnapshot,
  clockNow: Date,
): HomeWeatherHourlyItem[] {
  const deduped = new Map<string, HomeWeatherHourlyItem>();
  for (const slot of weather.hourly ?? []) {
    deduped.set(slot.timeIso, slot);
  }
  if (weather.hourlyByDate) {
    for (const daySlots of Object.values(weather.hourlyByDate)) {
      for (const slot of daySlots) {
        if (!deduped.has(slot.timeIso)) {
          deduped.set(slot.timeIso, slot);
        }
      }
    }
  }
  if (deduped.size === 0) return [];

  const sorted = [...deduped.values()].sort((a, b) => a.timeIso.localeCompare(b.timeIso));
  const nowHourPrefix = resolveEffectiveHourPrefix(weather, clockNow);
  const currentSlot: HomeWeatherHourlyItem = {
    timeIso: `${nowHourPrefix}:00`,
    hourLabel: `${nowHourPrefix.slice(11, 13)}:00`,
    temperatureC: weather.temperatureC,
    condition: weather.condition,
    isDay: weather.isDay,
    apparentTemperatureC: weather.apparentTemperatureC ?? null,
    humidityPercent: weather.humidityPercent ?? null,
    windSpeedKmh: weather.windSpeedKmh ?? null,
  };
  const upcoming = sorted.filter((slot) => slot.timeIso.slice(0, 13) > nowHourPrefix).slice(0, 11);

  return [currentSlot, ...upcoming];
}

function sceneToHomeCondition(scene: WeatherSceneKind): HomeWeatherCondition {
  switch (scene) {
    case "clear-day":
    case "clear-night":
      return "sunny";
    case "cloudy":
    case "fog":
      return "cloudy";
    case "drizzle":
    case "rain":
    case "heavy-rain":
    case "thunderstorm":
      return "rainy";
    case "light-snow":
    case "heavy-snow":
      return "snowy";
  }
}

function summarizeDayCondition(
  slots: HomeWeatherHourlyItem[],
  fallback: HomeWeatherCondition,
  options?: { isToday?: boolean; nowHourPrefix?: string; currentCondition?: HomeWeatherCondition },
): HomeWeatherCondition {
  if (slots.length === 0) return options?.currentCondition ?? fallback;
  const nowPrefix = options?.isToday ? options.nowHourPrefix : undefined;
  const relevant = nowPrefix
    ? slots.filter((slot) => slot.timeIso.slice(0, 13) >= nowPrefix)
    : slots.filter((slot) => slot.isDay);
  const pool = relevant.length > 0 ? relevant : slots;
  if (pool.some((slot) => slot.condition === "snowy") || options?.currentCondition === "snowy") {
    return "snowy";
  }
  if (pool.some((slot) => slot.condition === "rainy") || options?.currentCondition === "rainy") {
    return "rainy";
  }
  if (options?.isToday && options.currentCondition) {
    return options.currentCondition;
  }
  const cloudyCount = pool.filter((slot) => slot.condition === "cloudy").length;
  const sunnyCount = pool.filter((slot) => slot.condition === "sunny").length;
  if (cloudyCount === 0 && sunnyCount === 0) return fallback;
  return cloudyCount >= sunnyCount ? "cloudy" : "sunny";
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

type ResolvedWeatherCoords = {
  latitude: number;
  longitude: number;
  locationLabel: string | null;
  source: LocationSource;
};

async function resolveWeatherCoords(
  nowMs: number,
  options?: { force?: boolean; signal?: AbortSignal },
): Promise<ResolvedWeatherCoords | null> {
  const force = Boolean(options?.force);

  // Priority 1: Native device GPS (CoreLocation + CLGeocoder) for accurate weather regardless of VPN/carrier IP.
  if (isNativeLocationAvailable()) {
    const gps = await requestDeviceGpsLocation({ requestPermission: true, force, nowMs });
    if (gps.status === "ok") {
      const label = gps.location.label ?? gps.location.city ?? gps.location.region ?? null;
      cachedCoords = {
        latitude: gps.location.latitude,
        longitude: gps.location.longitude,
        locationLabel: label,
        source: "gps",
        fetchedAt: nowMs,
      };
      return {
        latitude: gps.location.latitude,
        longitude: gps.location.longitude,
        locationLabel: label,
        source: "gps",
      };
    }
  }

  // Priority 2: Previously obtained device GPS or user-calibrated map pin (more accurate than network IP).
  const existing = getCachedUserLocation() ?? (await loadSavedMapLocation());
  if (existing && (existing.source === "gps" || existing.source === "manual")) {
    const label = existing.label ?? existing.city ?? existing.region ?? null;
    cachedCoords = {
      latitude: existing.latitude,
      longitude: existing.longitude,
      locationLabel: label,
      source: existing.source,
      fetchedAt: nowMs,
    };
    return {
      latitude: existing.latitude,
      longitude: existing.longitude,
      locationLabel: label,
      source: existing.source,
    };
  }

  if (!force && cachedCoords && nowMs - cachedCoords.fetchedAt < COORDS_TTL_MS) {
    return {
      latitude: cachedCoords.latitude,
      longitude: cachedCoords.longitude,
      locationLabel: cachedCoords.locationLabel,
      source: cachedCoords.source,
    };
  }

  // Priority 3: Network IP approximate fallback when native GPS is unavailable or denied.
  const raw = await fetchJsonWithTimeout(GEO_URL, options?.signal);
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const city = typeof record.city === "string" ? record.city.trim() : "";
  const region = typeof record.region === "string" ? record.region.trim() : "";
  const locationLabel = city || region || null;
  cachedCoords = { latitude, longitude, locationLabel, source: "ip", fetchedAt: nowMs };
  return { latitude, longitude, locationLabel, source: "ip" };
}

function parseOpenMeteoHourly(
  hourlyRaw: unknown,
  currentTimeIso: string | undefined,
  now: Date,
  liveCurrent: {
    temperatureC: number;
    condition: HomeWeatherCondition;
    isDay: boolean;
    apparentTemperatureC: number | null;
    humidityPercent: number | null;
    windSpeedKmh: number | null;
  },
): {
  hourly: HomeWeatherHourlyItem[];
  hourlyByDate: Record<string, HomeWeatherHourlyItem[]>;
} {
  if (!hourlyRaw || typeof hourlyRaw !== "object") return { hourly: [], hourlyByDate: {} };
  const hourly = hourlyRaw as Record<string, unknown>;
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const temps = Array.isArray(hourly.temperature_2m) ? hourly.temperature_2m : [];
  const apparents = Array.isArray(hourly.apparent_temperature) ? hourly.apparent_temperature : [];
  const humidities = Array.isArray(hourly.relative_humidity_2m) ? hourly.relative_humidity_2m : [];
  const winds = Array.isArray(hourly.wind_speed_10m) ? hourly.wind_speed_10m : [];
  const codes = Array.isArray(hourly.weather_code) ? hourly.weather_code : [];
  const days = Array.isArray(hourly.is_day) ? hourly.is_day : [];

  const currentHourPrefix =
    typeof currentTimeIso === "string" && currentTimeIso.length >= 13
      ? currentTimeIso.slice(0, 13)
      : formatLocalHourPrefix(now);

  const allItems: HomeWeatherHourlyItem[] = [];
  const hourlyByDate: Record<string, HomeWeatherHourlyItem[]> = {};

  for (let i = 0; i < times.length; i += 1) {
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
    const item: HomeWeatherHourlyItem = {
      timeIso,
      hourLabel: extractHourLabel(timeIso),
      temperatureC: temp,
      condition: mapWmoWeatherCondition(code),
      isDay,
      apparentTemperatureC: finiteRounded(apparents[i]),
      humidityPercent: finiteRounded(humidities[i]),
      windSpeedKmh: finiteRounded(winds[i]),
    };
    allItems.push(item);
    const dateIso = extractDateIso(timeIso);
    if (dateIso) {
      const bucket = hourlyByDate[dateIso] ?? [];
      bucket.push(item);
      hourlyByDate[dateIso] = bucket;
    }
  }

  if (allItems.length === 0) {
    return { hourly: [], hourlyByDate };
  }

  const liveSlot: HomeWeatherHourlyItem = {
    timeIso: `${currentHourPrefix}:00`,
    hourLabel: `${currentHourPrefix.slice(11, 13)}:00`,
    temperatureC: liveCurrent.temperatureC,
    condition: liveCurrent.condition,
    isDay: liveCurrent.isDay,
    apparentTemperatureC: liveCurrent.apparentTemperatureC,
    humidityPercent: liveCurrent.humidityPercent,
    windSpeedKmh: liveCurrent.windSpeedKmh,
  };
  const upcoming = allItems
    .filter((entry) => entry.timeIso.slice(0, 13) > currentHourPrefix)
    .slice(0, 11);

  return {
    hourly: [liveSlot, ...upcoming],
    hourlyByDate,
  };
}

function parseOpenMeteoDaily(
  dailyRaw: unknown,
  hourlyByDate: Record<string, HomeWeatherHourlyItem[]>,
): HomeWeatherDailyItem[] {
  if (!dailyRaw || typeof dailyRaw !== "object") return [];
  const daily = dailyRaw as Record<string, unknown>;
  const times = Array.isArray(daily.time) ? daily.time : [];
  const highs = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
  const lows = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
  const codes = Array.isArray(daily.weather_code) ? daily.weather_code : [];
  const apparentMaxs = Array.isArray(daily.apparent_temperature_max)
    ? daily.apparent_temperature_max
    : [];
  const windMaxs = Array.isArray(daily.wind_speed_10m_max) ? daily.wind_speed_10m_max : [];

  const items: HomeWeatherDailyItem[] = [];
  for (let i = 0; i < times.length && items.length < 7; i += 1) {
    const dateIso = times[i];
    const highC = finiteRounded(highs[i]);
    const lowC = finiteRounded(lows[i]);
    const code = Number(codes[i]);
    if (typeof dateIso !== "string" || highC === null || lowC === null || !Number.isFinite(code)) {
      continue;
    }
    const dayHours = hourlyByDate[dateIso] ?? [];
    items.push({
      dateIso,
      highC,
      lowC,
      condition: mapWmoWeatherCondition(code),
      apparentTemperatureC:
        finiteRounded(apparentMaxs[i]) ?? representativeDaytimeApparent(dayHours),
      humidityPercent: averageFinite(dayHours.map((slot) => slot.humidityPercent)),
      windSpeedKmh:
        finiteRounded(windMaxs[i]) ?? maxFinite(dayHours.map((slot) => slot.windSpeedKmh)),
    });
  }
  return items;
}

async function fetchFromOpenMeteo(
  coords: ResolvedWeatherCoords,
  now: Date,
  signal?: AbortSignal,
): Promise<HomeWeatherSnapshot | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
    coords.latitude.toFixed(4),
  )}&longitude=${encodeURIComponent(
    coords.longitude.toFixed(4),
  )}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day,precipitation,rain,showers,snowfall,cloud_cover&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,wind_speed_10m_max&forecast_days=7&timezone=auto`;
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
  const rainRate = finiteNonNegative(current.rain);
  const showersRate = finiteNonNegative(current.showers);
  const rawPrecip = finiteNonNegative(current.precipitation);
  const precipitationMm =
    rawPrecip ??
    (rainRate !== null || showersRate !== null ? (rainRate ?? 0) + (showersRate ?? 0) : null);
  const snowfallCm = finiteNonNegative(current.snowfall);
  const cloudCoverPercent = finiteRounded(current.cloud_cover);
  const scene = classifyWmoWeatherScene(code, { isDay, precipitationMm, snowfallCm });
  const condition = sceneToHomeCondition(scene);
  const apparentTemperatureC = finiteRounded(current.apparent_temperature);
  const humidityPercent = finiteRounded(current.relative_humidity_2m);
  const windSpeedKmh = finiteRounded(current.wind_speed_10m);
  const currentTimeIso = typeof current.time === "string" ? current.time : null;
  const { hourly, hourlyByDate } = parseOpenMeteoHourly(
    body.hourly,
    currentTimeIso ?? undefined,
    now,
    {
      temperatureC: temp,
      condition,
      isDay,
      apparentTemperatureC,
      humidityPercent,
      windSpeedKmh,
    },
  );
  const daily = parseOpenMeteoDaily(body.daily, hourlyByDate);
  return {
    temperatureC: temp,
    condition,
    isDay,
    fetchedAt: now.getTime(),
    currentTimeIso,
    weatherCode: code,
    scene,
    precipitationMm,
    snowfallCm,
    cloudCoverPercent,
    locationLabel: coords.locationLabel,
    locationSource: coords.source,
    apparentTemperatureC,
    humidityPercent,
    windSpeedKmh,
    highC: daily[0]?.highC ?? null,
    lowC: daily[0]?.lowC ?? null,
    hourly,
    hourlyByDate,
    daily,
  };
}

function parseWttrLocation(raw: Record<string, unknown>): string | null {
  const areas = Array.isArray(raw.nearest_area) ? raw.nearest_area : [];
  const first = areas[0] as Record<string, unknown> | undefined;
  const areaNames = first && Array.isArray(first.areaName) ? first.areaName : [];
  const entry = areaNames[0] as Record<string, unknown> | undefined;
  const areaValue = typeof entry?.value === "string" ? entry.value.trim() : "";
  const regions = first && Array.isArray(first.region) ? first.region : [];
  const regionEntry = regions[0] as Record<string, unknown> | undefined;
  const regionValue = typeof regionEntry?.value === "string" ? regionEntry.value.trim() : "";
  if (areaValue && !/shih$/i.test(areaValue)) return areaValue;
  return regionValue || areaValue || null;
}

async function fetchFromWttr(
  coords: ResolvedWeatherCoords | null,
  now: Date,
  signal?: AbortSignal,
): Promise<HomeWeatherSnapshot | null> {
  const url = coords
    ? `https://wttr.in/${encodeURIComponent(
        `${coords.latitude.toFixed(4)},${coords.longitude.toFixed(4)}`,
      )}?format=j1`
    : WTTR_URL;
  const raw = await fetchJsonWithTimeout(url, signal);
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const list = Array.isArray(body.current_condition) ? body.current_condition : [];
  const first = list[0];
  if (!first || typeof first !== "object") return null;
  const record = first as Record<string, unknown>;
  const temp = finiteRounded(record.temp_C);
  const code = Number(record.weatherCode);
  if (temp === null || !Number.isFinite(code)) return null;

  const wttrIsDay = isDaytimeHour(now);
  const wttrPrecip = finiteNonNegative(record.precipMM);
  const wttrCloud = finiteRounded(record.cloudcover);
  const wttrScene = classifyWwoWeatherScene(code, {
    isDay: wttrIsDay,
    precipitationMm: wttrPrecip,
  });
  const wttrCondition = sceneToHomeCondition(wttrScene);
  const apparentTemperatureC = finiteRounded(record.FeelsLikeC);
  const humidityPercent = finiteRounded(record.humidity);
  const windSpeedKmh = finiteRounded(record.windspeedKmph);
  const nowHourPrefix = formatLocalHourPrefix(now);

  const daysRaw = Array.isArray(body.weather) ? body.weather : [];
  const daily: HomeWeatherDailyItem[] = [];
  const allSlots: HomeWeatherHourlyItem[] = [];
  const hourlyByDate: Record<string, HomeWeatherHourlyItem[]> = {};

  for (let dayIdx = 0; dayIdx < daysRaw.length; dayIdx += 1) {
    const item = daysRaw[dayIdx];
    if (!item || typeof item !== "object") continue;
    const day = item as Record<string, unknown>;
    const dateIso = typeof day.date === "string" ? day.date : "";
    const highC = finiteRounded(day.maxtempC);
    const lowC = finiteRounded(day.mintempC);
    const dayHours = Array.isArray(day.hourly) ? day.hourly : [];
    const midday = dayHours[Math.floor(dayHours.length / 2)] as Record<string, unknown> | undefined;
    const dayCode = Number(midday?.weatherCode ?? code);
    const daySlots: HomeWeatherHourlyItem[] = [];
    for (const slotRaw of dayHours) {
      if (!slotRaw || typeof slotRaw !== "object") continue;
      const slot = slotRaw as Record<string, unknown>;
      const slotTemp = finiteRounded(slot.tempC);
      const slotCode = Number(slot.weatherCode);
      const rawTime = Number(slot.time ?? 0);
      const hour = Math.max(0, Math.min(23, Math.floor(rawTime / 100)));
      if (slotTemp === null || !Number.isFinite(slotCode)) continue;
      const parsedSlot: HomeWeatherHourlyItem = {
        timeIso: `${dateIso}T${padTwo(hour)}:00`,
        hourLabel: `${padTwo(hour)}:00`,
        temperatureC: slotTemp,
        condition: mapWwoWeatherCondition(slotCode),
        isDay: hour >= 6 && hour < 18,
        apparentTemperatureC: finiteRounded(slot.FeelsLikeC),
        humidityPercent: finiteRounded(slot.humidity),
        windSpeedKmh: finiteRounded(slot.windspeedKmph),
      };
      daySlots.push(parsedSlot);
      allSlots.push(parsedSlot);
    }
    if (dateIso && daySlots.length > 0) {
      hourlyByDate[dateIso] = daySlots;
    }
    if (dateIso && highC !== null && lowC !== null) {
      const fallbackDayCond = mapWwoWeatherCondition(Number.isFinite(dayCode) ? dayCode : code);
      daily.push({
        dateIso,
        highC,
        lowC,
        condition: summarizeDayCondition(daySlots, fallbackDayCond, {
          isToday: dayIdx === 0,
          nowHourPrefix,
          currentCondition: wttrCondition,
        }),
        apparentTemperatureC:
          finiteRounded(midday?.FeelsLikeC) ?? representativeDaytimeApparent(daySlots),
        humidityPercent: averageFinite(daySlots.map((slot) => slot.humidityPercent)),
        windSpeedKmh: maxFinite(daySlots.map((slot) => slot.windSpeedKmh)),
      });
    }
  }

  const hourly: HomeWeatherHourlyItem[] =
    allSlots.length > 0
      ? [
          {
            timeIso: `${nowHourPrefix}:00`,
            hourLabel: `${nowHourPrefix.slice(11, 13)}:00`,
            temperatureC: temp,
            condition: wttrCondition,
            isDay: wttrIsDay,
            apparentTemperatureC,
            humidityPercent,
            windSpeedKmh,
          },
          ...allSlots.filter((slot) => slot.timeIso.slice(0, 13) > nowHourPrefix).slice(0, 11),
        ]
      : [];

  return {
    temperatureC: temp,
    condition: wttrCondition,
    isDay: wttrIsDay,
    fetchedAt: now.getTime(),
    currentTimeIso: `${nowHourPrefix}:00`,
    weatherCode: null,
    scene: wttrScene,
    precipitationMm: wttrPrecip,
    snowfallCm: null,
    cloudCoverPercent: wttrCloud,
    locationLabel: coords?.locationLabel ?? parseWttrLocation(body),
    locationSource: coords?.source ?? "ip",
    apparentTemperatureC,
    humidityPercent,
    windSpeedKmh,
    highC: daily[0]?.highC ?? null,
    lowC: daily[0]?.lowC ?? null,
    hourly,
    hourlyByDate,
    daily,
  };
}

export async function fetchLiveHomeWeather(
  signal?: AbortSignal,
  now: Date = new Date(),
  force = false,
): Promise<HomeWeatherSnapshot | null> {
  let coords: ResolvedWeatherCoords | null = null;
  try {
    coords = await resolveWeatherCoords(now.getTime(), { force, signal });
  } catch {
    if (signal?.aborted) return null;
  }
  if (coords) {
    try {
      const primary = await fetchFromOpenMeteo(coords, now, signal);
      if (primary) {
        cachedWeather = primary;
        notifyWeatherListeners();
        return primary;
      }
    } catch {
      if (signal?.aborted) return null;
    }
  }
  try {
    const fallback = await fetchFromWttr(coords, now, signal);
    if (fallback) {
      cachedWeather = fallback;
      notifyWeatherListeners();
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
  notifyWeatherListeners();
}

/**
 * Keeps live weather and local clock in sync on the HomeHub & Weather Detail screens:
 * - prioritizes native phone GPS (CoreLocation) and user-calibrated map pins over network IP;
 * - refreshes immediately when stale (> 5m), when device location updates meaningfully, every 15m
 *   while active, on foreground resume, and on manual refresh;
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
        inFlightFetch = fetchLiveHomeWeather(undefined, new Date(), force).finally(() => {
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
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const syncAndSchedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      const current = new Date();
      setClockNow(current);
      timer = setTimeout(() => {
        if (!cancelled) syncAndSchedule();
      }, nextMinuteDelayMs(current));
    };
    syncAndSchedule();
    const appSub = AppState.addEventListener("change", (next) => {
      if (next === "active" && !cancelled) {
        syncAndSchedule();
      }
    });
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      appSub.remove();
    };
  }, [fixedNow]);

  useEffect(() => {
    if (!enabled) return;
    void refreshWeather(false);
    const unsubscribeWeather = subscribeHomeWeather(() => {
      if (mountedRef.current && cachedWeather) {
        setWeather(cachedWeather);
        setError(false);
      }
    });
    const unsubscribeLocation = subscribeUserLocation(() => {
      const nextLoc = getCachedUserLocation();
      if (!nextLoc || (nextLoc.source !== "gps" && nextLoc.source !== "manual")) return;
      const movedFar =
        !cachedCoords ||
        cachedCoords.source === "ip" ||
        haversineDistanceMeters(
          { latitude: cachedCoords.latitude, longitude: cachedCoords.longitude },
          { latitude: nextLoc.latitude, longitude: nextLoc.longitude },
        ) > 1_000;
      if (movedFar) {
        cachedCoords = null;
        void refreshWeather(true);
      }
    });
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
      unsubscribeWeather();
      unsubscribeLocation();
      clearInterval(poll);
      appSub.remove();
    };
  }, [enabled, fixedNow, refreshWeather]);

  const effectiveWeather =
    weather && !fixedNow
      ? (() => {
          const nextIsDay =
            Date.now() - weather.fetchedAt > 2 * 60 * 1000
              ? isDaytimeHour(clockNow)
              : weather.isDay;
          const nextScene =
            weather.scene === "clear-day" && !nextIsDay
              ? "clear-night"
              : weather.scene === "clear-night" && nextIsDay
                ? "clear-day"
                : weather.scene;
          return {
            ...weather,
            isDay: nextIsDay,
            scene: nextScene,
          };
        })()
      : weather;

  return { weather: effectiveWeather, clockNow, loading, error, refreshWeather };
}
