import type { MapPlace, TravelMode } from "./amap-navigation";
import type { GeoPoint } from "./map-location";
import {
  estimateTravelMinutes,
  gcj02ToWgs84,
  haversineDistanceMeters,
  isValidGeoPoint,
  wgs84ToGcj02,
} from "./map-location";

export type MapSearchResult = {
  id: string;
  name: string;
  address: string;
  latitude: number; // WGS-84
  longitude: number; // WGS-84
};

export type MapRoutePreview = {
  distanceMeters: number;
  durationMinutes: number;
  points: GeoPoint[]; // WGS-84
  estimated: boolean;
};

const RECENT_STORAGE_KEY = "sydney.mobile.mapRecentDestinations.v1";
const MAX_RECENT = 8;
const REQUEST_TIMEOUT_MS = 6_000;

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
      headers: {
        Accept: "application/json",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function configuredAmapKey(): string {
  const key =
    typeof process !== "undefined" && typeof process.env.EXPO_PUBLIC_AMAP_WEB_KEY === "string"
      ? process.env.EXPO_PUBLIC_AMAP_WEB_KEY.trim()
      : "";
  return key;
}

async function searchAmapPlaces(
  query: string,
  amapKey: string,
  near?: GeoPoint | null,
  signal?: AbortSignal,
): Promise<MapSearchResult[]> {
  const params = new URLSearchParams({
    key: amapKey,
    keywords: query,
    offset: "6",
    extensions: "base",
  });
  if (near && isValidGeoPoint(near)) {
    const gcj = wgs84ToGcj02(near);
    params.set("location", `${gcj.longitude.toFixed(6)},${gcj.latitude.toFixed(6)}`);
  }
  const raw = await fetchJsonWithTimeout(
    `https://restapi.amap.com/v3/place/text?${params.toString()}`,
    signal,
  );
  if (!raw || typeof raw !== "object") return [];
  const pois = (raw as { pois?: unknown[] }).pois;
  if (!Array.isArray(pois)) return [];
  const results: MapSearchResult[] = [];
  for (const item of pois) {
    if (!item || typeof item !== "object") continue;
    const poi = item as Record<string, unknown>;
    const locStr = typeof poi.location === "string" ? poi.location : "";
    const [lngStr, latStr] = locStr.split(",");
    const gcjLng = Number(lngStr);
    const gcjLat = Number(latStr);
    if (!isValidGeoPoint({ latitude: gcjLat, longitude: gcjLng })) continue;
    const wgs = gcj02ToWgs84({ latitude: gcjLat, longitude: gcjLng });
    const name = typeof poi.name === "string" ? poi.name.trim() : "";
    if (!name) continue;
    const addressParts = [poi.cityname, poi.adname, poi.address]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .map((part) => part.trim());
    results.push({
      id: typeof poi.id === "string" && poi.id ? poi.id : `${wgs.latitude},${wgs.longitude}`,
      name,
      address: [...new Set(addressParts)].join(" "),
      latitude: wgs.latitude,
      longitude: wgs.longitude,
    });
  }
  return results;
}

async function searchNominatimPlaces(
  query: string,
  near?: GeoPoint | null,
  signal?: AbortSignal,
): Promise<MapSearchResult[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    q: query,
    limit: "6",
    "accept-language": "zh-CN",
  });
  if (near && isValidGeoPoint(near)) {
    const delta = 0.45;
    const left = Math.max(-180, near.longitude - delta).toFixed(4);
    const right = Math.min(180, near.longitude + delta).toFixed(4);
    const top = Math.min(90, near.latitude + delta).toFixed(4);
    const bottom = Math.max(-90, near.latitude - delta).toFixed(4);
    params.set("viewbox", `${left},${top},${right},${bottom}`);
  }
  const raw = await fetchJsonWithTimeout(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    signal,
  );
  if (!Array.isArray(raw)) return [];
  const results: MapSearchResult[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const latitude = Number(row.lat);
    const longitude = Number(row.lon);
    if (!isValidGeoPoint({ latitude, longitude })) continue;
    const displayName = typeof row.display_name === "string" ? row.display_name.trim() : "";
    const explicitName = typeof row.name === "string" ? row.name.trim() : "";
    const name = explicitName || displayName.split(",")[0]?.trim() || query;
    results.push({
      id: String(row.place_id ?? `${latitude},${longitude}`),
      name,
      address: displayName,
      latitude,
      longitude,
    });
  }
  return results;
}

export async function searchMapPlaces(
  query: string,
  near?: GeoPoint | null,
  signal?: AbortSignal,
): Promise<MapSearchResult[]> {
  const clean = query.trim();
  if (!clean) return [];
  const amapKey = configuredAmapKey();
  if (amapKey) {
    try {
      const amapResults = await searchAmapPlaces(clean, amapKey, near, signal);
      if (amapResults.length > 0) return amapResults;
    } catch {
      if (signal?.aborted) return [];
    }
  }
  try {
    return await searchNominatimPlaces(clean, near, signal);
  } catch {
    return [];
  }
}

export async function reverseGeocodeLocation(
  point: GeoPoint,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!isValidGeoPoint(point)) return null;
  const amapKey = configuredAmapKey();
  if (amapKey) {
    try {
      const gcj = wgs84ToGcj02(point);
      const params = new URLSearchParams({
        key: amapKey,
        location: `${gcj.longitude.toFixed(6)},${gcj.latitude.toFixed(6)}`,
      });
      const raw = await fetchJsonWithTimeout(
        `https://restapi.amap.com/v3/geocode/regeo?${params.toString()}`,
        signal,
      );
      const formatted = (raw as { regeocode?: { formatted_address?: unknown } })?.regeocode
        ?.formatted_address;
      if (typeof formatted === "string" && formatted.trim()) return formatted.trim();
    } catch {
      if (signal?.aborted) return null;
    }
  }
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: point.latitude.toFixed(6),
      lon: point.longitude.toFixed(6),
      zoom: "16",
      "accept-language": "zh-CN",
    });
    const raw = await fetchJsonWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      signal,
    );
    if (!raw || typeof raw !== "object") return null;
    const record = raw as {
      name?: unknown;
      display_name?: unknown;
      address?: Record<string, unknown>;
    };
    const addr = record.address;
    if (addr) {
      const parts = [
        addr.city ?? addr.town ?? addr.county ?? addr.state,
        addr.suburb ?? addr.city_district ?? addr.district,
        addr.road ?? addr.neighbourhood ?? record.name,
      ]
        .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
        .map((part) => part.trim());
      const unique = [...new Set(parts)];
      if (unique.length > 0) return unique.join(" · ");
    }
    if (typeof record.display_name === "string" && record.display_name.trim()) {
      return record.display_name
        .split(",")
        .slice(0, 3)
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" · ");
    }
  } catch {
    // Graceful fallback to coordinates on UI side.
  }
  return null;
}

const OSRM_PROFILE: Partial<Record<TravelMode, string>> = {
  driving: "driving",
  walking: "foot",
  riding: "cycling",
};

export async function fetchMapRoutePreview(
  origin: GeoPoint,
  destination: GeoPoint,
  mode: TravelMode,
  signal?: AbortSignal,
): Promise<MapRoutePreview> {
  const straightMeters = haversineDistanceMeters(origin, destination);
  const fallback: MapRoutePreview = {
    distanceMeters: straightMeters,
    durationMinutes: estimateTravelMinutes(straightMeters, mode),
    points: [origin, destination],
    estimated: true,
  };
  const profile = OSRM_PROFILE[mode];
  if (!profile) return fallback;
  try {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${origin.longitude.toFixed(6)},${origin.latitude.toFixed(6)};${destination.longitude.toFixed(6)},${destination.latitude.toFixed(6)}?overview=simplified&geometries=geojson`;
    const raw = await fetchJsonWithTimeout(url, signal, 5_000);
    const route = (raw as { routes?: unknown[] })?.routes?.[0] as
      | {
          distance?: unknown;
          duration?: unknown;
          geometry?: { coordinates?: unknown[] };
        }
      | undefined;
    if (!route) return fallback;
    const distanceMeters = Number(route.distance);
    const durationSec = Number(route.duration);
    const coords = route.geometry?.coordinates;
    if (
      !Number.isFinite(distanceMeters) ||
      !Number.isFinite(durationSec) ||
      !Array.isArray(coords)
    ) {
      return fallback;
    }
    const points: GeoPoint[] = [];
    for (const pair of coords) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const longitude = Number(pair[0]);
      const latitude = Number(pair[1]);
      if (isValidGeoPoint({ latitude, longitude })) {
        points.push({ latitude, longitude });
      }
    }
    if (points.length < 2) return fallback;
    return {
      distanceMeters,
      durationMinutes: Math.max(1, Math.round(durationSec / 60)),
      points,
      estimated: false,
    };
  } catch {
    return fallback;
  }
}

export async function loadRecentMapDestinations(): Promise<MapPlace[]> {
  try {
    const SecureStore = await import("expo-secure-store");
    const raw = await SecureStore.getItemAsync(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const list: MapPlace[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!name) continue;
      const latitude = typeof row.latitude === "number" ? row.latitude : undefined;
      const longitude = typeof row.longitude === "number" ? row.longitude : undefined;
      const hasCoords = isValidGeoPoint({ latitude, longitude });
      list.push({
        name,
        address:
          typeof row.address === "string" && row.address.trim() ? row.address.trim() : undefined,
        ...(hasCoords ? { latitude, longitude } : {}),
      });
    }
    return list.slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export async function rememberMapDestination(place: MapPlace): Promise<MapPlace[]> {
  const name = place.name.trim();
  if (!name) return loadRecentMapDestinations();
  const existing = await loadRecentMapDestinations();
  const normalized: MapPlace = {
    name,
    address: place.address?.trim() || undefined,
    ...(isValidGeoPoint({ latitude: place.latitude, longitude: place.longitude })
      ? { latitude: place.latitude, longitude: place.longitude }
      : {}),
  };
  const deduped = existing.filter((item) => item.name.toLowerCase() !== name.toLowerCase());
  const next = [normalized, ...deduped].slice(0, MAX_RECENT);
  try {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.setItemAsync(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures.
  }
  return next;
}
