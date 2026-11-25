import { useSyncExternalStore } from "react";

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type LocationSource = "gps" | "ip" | "manual";

export type UserLocation = GeoPoint & {
  accuracyMeters?: number;
  label?: string;
  city?: string;
  region?: string;
  source: LocationSource;
  updatedAt: number;
};

export type TravelEstimateMode = "driving" | "transit" | "walking" | "riding";

const STORAGE_KEY = "sydney.mobile.mapLastLocation.v1";
const GEOJS_URL = "https://get.geojs.io/v1/ip/geo.json";
const IPWHOIS_URL = "https://ipwho.is/";
const REQUEST_TIMEOUT_MS = 6_000;
const IP_TTL_MS = 15 * 60 * 1000;

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.006693421622965943;

let cachedLocation: UserLocation | null = null;
let cachedIpLocation: UserLocation | null = null;
let inFlightIpFetch: Promise<UserLocation | null> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // Ignore subscriber errors.
    }
  }
}

export function isValidGeoPoint(point: Partial<GeoPoint> | null | undefined): point is GeoPoint {
  if (!point) return false;
  const { latitude, longitude } = point;
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** Rough bounding box check for mainland China where GCJ-02 offset applies. */
export function isInChinaMainland(point: GeoPoint): boolean {
  return (
    point.longitude >= 72.004 &&
    point.longitude <= 137.8347 &&
    point.latitude >= 0.8293 &&
    point.latitude <= 55.8271
  );
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320.0 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

function gcjDelta(point: GeoPoint): GeoPoint {
  const dLat = transformLat(point.longitude - 105.0, point.latitude - 35.0);
  const dLng = transformLng(point.longitude - 105.0, point.latitude - 35.0);
  const radLat = (point.latitude / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  return {
    latitude: (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI),
    longitude: (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI),
  };
}

/** Converts WGS-84 GPS coordinates to GCJ-02 (Amap) coordinates inside mainland China. */
export function wgs84ToGcj02(point: GeoPoint): GeoPoint {
  if (!isInChinaMainland(point)) return { ...point };
  const delta = gcjDelta(point);
  return {
    latitude: point.latitude + delta.latitude,
    longitude: point.longitude + delta.longitude,
  };
}

/** Converts GCJ-02 (Amap) coordinates back to WGS-84 via 2-step iterative refinement (< 0.5m error). */
export function gcj02ToWgs84(point: GeoPoint): GeoPoint {
  if (!isInChinaMainland(point)) return { ...point };
  let wgsLat = point.latitude;
  let wgsLng = point.longitude;
  for (let i = 0; i < 3; i += 1) {
    const gcj = wgs84ToGcj02({ latitude: wgsLat, longitude: wgsLng });
    wgsLat += point.latitude - gcj.latitude;
    wgsLng += point.longitude - gcj.longitude;
  }
  return { latitude: wgsLat, longitude: wgsLng };
}

export function haversineDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const earthRadiusM = 6_371_000;
  const toRad = (deg: number) => (deg * PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLng * sinLng;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(meters: number, locale: string): string {
  const safe = Math.max(0, Number.isFinite(meters) ? meters : 0);
  const chinese = locale.startsWith("zh");
  if (safe < 1000) {
    const rounded = Math.max(10, Math.round(safe / 10) * 10);
    return chinese ? `${rounded} 米` : `${rounded} m`;
  }
  const km = safe / 1000;
  const formatted = km >= 100 ? String(Math.round(km)) : km.toFixed(1).replace(/\.0$/, "");
  return chinese ? `${formatted} 公里` : `${formatted} km`;
}

const MODE_SPEED_KMH: Record<TravelEstimateMode, number> = {
  driving: 32,
  transit: 20,
  riding: 14,
  walking: 4.8,
};

export function estimateTravelMinutes(meters: number, mode: TravelEstimateMode): number {
  const safe = Math.max(0, Number.isFinite(meters) ? meters : 0);
  if (safe < 25) return 1;
  const km = safe / 1000;
  return Math.max(1, Math.round((km / MODE_SPEED_KMH[mode]) * 60));
}

export function formatDuration(minutes: number, locale: string): string {
  const total = Math.max(1, Math.round(Number.isFinite(minutes) ? minutes : 1));
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  if (total < 60) {
    return chinese ? `${total} 分钟` : `${total} min`;
  }
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (chinese) {
    const hrLabel = traditional ? "小時" : "小时";
    return mins > 0 ? `${hours} ${hrLabel} ${mins} 分钟` : `${hours} ${hrLabel}`;
  }
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
}

export function formatCoordsLabel(point: GeoPoint): string {
  return `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`;
}

export function locationSummaryText(location: UserLocation | null, locale: string): string {
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  if (!location) {
    return chinese ? (traditional ? "正在定位…" : "正在定位…") : "Locating…";
  }
  if (location.label?.trim()) return location.label.trim();
  const parts = [location.region?.trim(), location.city?.trim()].filter(Boolean) as string[];
  const unique = [...new Set(parts)];
  if (unique.length > 0) return unique.join(" · ");
  return formatCoordsLabel(location);
}

export function locationSourceLabel(source: LocationSource, locale: string): string {
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  switch (source) {
    case "gps":
      return chinese ? (traditional ? "GPS 精準定位" : "GPS 精准定位") : "GPS";
    case "manual":
      return chinese ? (traditional ? "手動校準" : "手动校准") : "Pinned";
    default:
      return chinese ? (traditional ? "網路大致定位" : "网络大致定位") : "Approx. IP";
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

function parseIpRecord(raw: unknown, nowMs: number): UserLocation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.success === false) return null;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  if (!isValidGeoPoint({ latitude, longitude })) return null;
  const city =
    typeof record.city === "string" && record.city.trim() ? record.city.trim() : undefined;
  const region =
    typeof record.region === "string" && record.region.trim() ? record.region.trim() : undefined;
  const country =
    typeof record.country === "string" && record.country.trim() ? record.country.trim() : undefined;
  const parts = [...new Set([region, city].filter(Boolean) as string[])];
  const label = parts.length > 0 ? parts.join(" · ") : country;
  return {
    latitude,
    longitude,
    city,
    region,
    label,
    source: "ip",
    updatedAt: nowMs,
  };
}

export async function resolveApproxIpLocation(options?: {
  force?: boolean;
  signal?: AbortSignal;
  nowMs?: number;
}): Promise<UserLocation | null> {
  const nowMs = options?.nowMs ?? Date.now();
  if (!options?.force && cachedIpLocation && nowMs - cachedIpLocation.updatedAt < IP_TTL_MS) {
    return cachedIpLocation;
  }
  const run = async (): Promise<UserLocation | null> => {
    for (const url of [GEOJS_URL, IPWHOIS_URL]) {
      try {
        const raw = await fetchJsonWithTimeout(url, options?.signal);
        const parsed = parseIpRecord(raw, nowMs);
        if (parsed) {
          cachedIpLocation = parsed;
          if (!cachedLocation || cachedLocation.source === "ip") {
            setCachedUserLocation(parsed);
          }
          return parsed;
        }
      } catch {
        if (options?.signal?.aborted) return null;
      }
    }
    return null;
  };
  if (options?.signal) return run();
  if (!inFlightIpFetch) {
    inFlightIpFetch = run().finally(() => {
      inFlightIpFetch = null;
    });
  }
  return inFlightIpFetch;
}

export function normalizeStoredLocation(input: unknown): UserLocation | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!isValidGeoPoint({ latitude, longitude })) return null;
  const source: LocationSource =
    raw.source === "gps" || raw.source === "manual" || raw.source === "ip" ? raw.source : "manual";
  const updatedAt =
    typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : Date.now();
  return {
    latitude,
    longitude,
    accuracyMeters:
      typeof raw.accuracyMeters === "number" && Number.isFinite(raw.accuracyMeters)
        ? raw.accuracyMeters
        : undefined,
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : undefined,
    city: typeof raw.city === "string" && raw.city.trim() ? raw.city.trim() : undefined,
    region: typeof raw.region === "string" && raw.region.trim() ? raw.region.trim() : undefined,
    source,
    updatedAt,
  };
}

export async function loadSavedMapLocation(): Promise<UserLocation | null> {
  try {
    const SecureStore = await import("expo-secure-store");
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    const parsed = normalizeStoredLocation(JSON.parse(raw));
    if (parsed && !cachedLocation) {
      setCachedUserLocation(parsed);
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveMapLocation(location: UserLocation): Promise<void> {
  if (!isValidGeoPoint(location)) return;
  setCachedUserLocation(location);
  try {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(location));
  } catch {
    // Keep in-memory state when SecureStore is unavailable.
  }
}

export function getCachedUserLocation(): UserLocation | null {
  return cachedLocation;
}

export function setCachedUserLocation(location: UserLocation | null): void {
  cachedLocation = location ? { ...location } : null;
  emit();
}

export function subscribeUserLocation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCachedUserLocation(): UserLocation | null {
  return useSyncExternalStore(subscribeUserLocation, getCachedUserLocation, getCachedUserLocation);
}

export function resetMapLocationCacheForTest(): void {
  cachedLocation = null;
  cachedIpLocation = null;
  inFlightIpFetch = null;
  emit();
}
