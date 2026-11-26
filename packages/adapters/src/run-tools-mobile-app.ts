import { randomUUID } from "node:crypto";
import type { ConnectorTool } from "@rakazo/adapter-kit";
import type {
  MobileAppActionBlock,
  MobileAppActionPayload,
  MobileAppActionRecord,
  MobileAppScreenRoute,
  MobileBridgePermissionKey,
} from "@rakazo/contracts";
import {
  isMobilePermissionEnabled,
  MobileAppScreenRouteSchema,
  MobileTravelModeSchema,
} from "@rakazo/contracts";
import { enqueueUserMobileBridgeAction, getUserMobileBridge, recordAuditEvent } from "@rakazo/db";
import type { RunContext } from "./run-context.js";
import { publishMessage } from "./run-messages.js";
import type { ToolCall, ToolHandlers } from "./run-tool-gate.js";

const REQUEST_TIMEOUT_MS = 6_000;
const EARTH_RADIUS_M = 6_371_000;
const GCJ_A = 6_378_245.0;
const GCJ_EE = 0.006693421622965943;

export type GeoPoint = { latitude: number; longitude: number };
export type MobileTravelMode = "driving" | "transit" | "walking" | "riding";

export type MobilePlaceResult = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

export type MobileRouteResult = {
  mode: MobileTravelMode;
  distanceMeters: number;
  durationMinutes: number;
  estimated: boolean;
  source: "osrm" | "haversine";
};

function isValidCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function outOfChina(lat: number, lng: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret +=
    ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret +=
    ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
  return ret;
}

export function wgs84ToGcj02(point: GeoPoint): GeoPoint {
  if (outOfChina(point.latitude, point.longitude)) return point;
  let dLat = transformLat(point.longitude - 105.0, point.latitude - 35.0);
  let dLng = transformLng(point.longitude - 105.0, point.latitude - 35.0);
  const radLat = (point.latitude / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - GCJ_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180.0) / ((GCJ_A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { latitude: point.latitude + dLat, longitude: point.longitude + dLng };
}

export function gcj02ToWgs84(point: GeoPoint): GeoPoint {
  if (outOfChina(point.latitude, point.longitude)) return point;
  const shifted = wgs84ToGcj02(point);
  return {
    latitude: point.latitude * 2 - shifted.latitude,
    longitude: point.longitude * 2 - shifted.longitude,
  };
}

export function haversineDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const NATIVE_MODE_CODE: Record<MobileTravelMode, string> = {
  driving: "0",
  transit: "1",
  walking: "2",
  riding: "3",
};

const WEB_MODE_CODE: Record<MobileTravelMode, string> = {
  driving: "car",
  transit: "bus",
  walking: "walk",
  riding: "ride",
};

export function buildServerAmapNavigationUrls(input: {
  origin?: { name?: string; latitude?: number; longitude?: number } | null;
  destination: { name: string; latitude?: number; longitude?: number };
  mode: MobileTravelMode;
}): { nativeUrlIos: string; nativeUrlAndroid: string; webUrl: string } {
  const appName = "Sydney";
  const destName = input.destination.name.trim() || "目的地";
  const originName = input.origin?.name?.trim() || "我的位置";
  const originGcj =
    input.origin && isValidCoord(input.origin.latitude, input.origin.longitude)
      ? wgs84ToGcj02({ latitude: input.origin.latitude!, longitude: input.origin.longitude! })
      : null;
  const destGcj = isValidCoord(input.destination.latitude, input.destination.longitude)
    ? wgs84ToGcj02({
        latitude: input.destination.latitude!,
        longitude: input.destination.longitude!,
      })
    : null;
  const nativeParams = new URLSearchParams();
  nativeParams.set("sourceApplication", appName);
  if (originGcj) {
    nativeParams.set("slat", originGcj.latitude.toFixed(6));
    nativeParams.set("slon", originGcj.longitude.toFixed(6));
    nativeParams.set("sname", originName);
  }
  if (destGcj) {
    nativeParams.set("dlat", destGcj.latitude.toFixed(6));
    nativeParams.set("dlon", destGcj.longitude.toFixed(6));
  }
  nativeParams.set("dname", destName);
  nativeParams.set("dev", "0");
  nativeParams.set("t", NATIVE_MODE_CODE[input.mode]);

  const nativeUrlIos = `iosamap://path?${nativeParams.toString()}`;
  const nativeUrlAndroid = `amapuri://route/plan/?${nativeParams.toString()}`;

  let webUrl: string;
  if (destGcj) {
    const webParams = new URLSearchParams();
    if (originGcj) {
      webParams.set(
        "from",
        `${originGcj.longitude.toFixed(6)},${originGcj.latitude.toFixed(6)},${originName}`,
      );
    }
    webParams.set(
      "to",
      `${destGcj.longitude.toFixed(6)},${destGcj.latitude.toFixed(6)},${destName}`,
    );
    webParams.set("mode", WEB_MODE_CODE[input.mode]);
    webParams.set("src", appName);
    webParams.set("coordinate", "gaode");
    webParams.set("callnative", "1");
    webUrl = `https://uri.amap.com/navigation?${webParams.toString()}`;
  } else {
    const searchParams = new URLSearchParams();
    searchParams.set("keyword", destName);
    if (originGcj) {
      searchParams.set(
        "center",
        `${originGcj.longitude.toFixed(6)},${originGcj.latitude.toFixed(6)}`,
      );
    }
    searchParams.set("src", appName);
    searchParams.set("callnative", "1");
    webUrl = `https://uri.amap.com/search?${searchParams.toString()}`;
  }

  return { nativeUrlIos, nativeUrlAndroid, webUrl };
}

async function fetchJson(
  url: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) throw new Error("aborted");
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "User-Agent": "Sydney-Personal-Agent/1.0",
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

export async function searchMobileMapPlaces(
  query: string,
  options?: {
    near?: GeoPoint | null;
    limit?: number;
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    amapKey?: string;
  },
): Promise<{ provider: "amap" | "nominatim"; results: MobilePlaceResult[] }> {
  const trimmed = query.trim();
  if (!trimmed) return { provider: "nominatim", results: [] };
  const limit = Math.min(10, Math.max(1, options?.limit ?? 6));
  const fetchImpl = options?.fetchImpl ?? fetch;
  const amapKey = (options?.amapKey ?? process.env.AMAP_WEB_KEY ?? "").trim();

  if (amapKey) {
    try {
      const params = new URLSearchParams({
        key: amapKey,
        keywords: trimmed,
        offset: String(limit),
        extensions: "base",
      });
      if (options?.near && isValidCoord(options.near.latitude, options.near.longitude)) {
        const gcj = wgs84ToGcj02(options.near);
        params.set("location", `${gcj.longitude.toFixed(6)},${gcj.latitude.toFixed(6)}`);
      }
      const raw = await fetchJson(
        `https://restapi.amap.com/v3/place/text?${params.toString()}`,
        options?.signal,
        fetchImpl,
      );
      const pois =
        raw && typeof raw === "object" && Array.isArray((raw as { pois?: unknown[] }).pois)
          ? (raw as { pois: unknown[] }).pois
          : [];
      const results: MobilePlaceResult[] = [];
      for (const item of pois) {
        if (!item || typeof item !== "object") continue;
        const poi = item as Record<string, unknown>;
        const [lngStr, latStr] = (typeof poi.location === "string" ? poi.location : "").split(",");
        const gcjLng = Number(lngStr);
        const gcjLat = Number(latStr);
        if (!isValidCoord(gcjLat, gcjLng)) continue;
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
      if (results.length > 0) return { provider: "amap", results };
    } catch {
      // Fall through to Nominatim when Amap REST fails or is unconfigured.
    }
  }

  const params = new URLSearchParams({
    format: "jsonv2",
    q: trimmed,
    limit: String(limit),
    "accept-language": "zh-CN",
  });
  if (options?.near && isValidCoord(options.near.latitude, options.near.longitude)) {
    const delta = 0.45;
    const left = Math.max(-180, options.near.longitude - delta).toFixed(4);
    const right = Math.min(180, options.near.longitude + delta).toFixed(4);
    const top = Math.min(90, options.near.latitude + delta).toFixed(4);
    const bottom = Math.max(-90, options.near.latitude - delta).toFixed(4);
    params.set("viewbox", `${left},${top},${right},${bottom}`);
  }
  const raw = await fetchJson(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    options?.signal,
    fetchImpl,
  );
  const rows = Array.isArray(raw) ? raw : [];
  const results: MobilePlaceResult[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const latitude = Number(row.lat);
    const longitude = Number(row.lon);
    if (!isValidCoord(latitude, longitude)) continue;
    const displayName = typeof row.display_name === "string" ? row.display_name.trim() : "";
    const explicitName = typeof row.name === "string" ? row.name.trim() : "";
    const name = explicitName || displayName.split(",")[0]?.trim() || trimmed;
    results.push({
      id: String(row.place_id ?? `${latitude},${longitude}`),
      name,
      address: displayName,
      latitude,
      longitude,
    });
  }
  return { provider: "nominatim", results };
}

function estimateTravelMinutes(distanceMeters: number, mode: MobileTravelMode): number {
  const speedKmh = mode === "driving" ? 36 : mode === "transit" ? 24 : mode === "riding" ? 15 : 4.8;
  return Math.max(1, Math.round((distanceMeters / 1000 / speedKmh) * 60));
}

export async function fetchMobileRoutePreview(
  origin: GeoPoint,
  destination: GeoPoint,
  mode: MobileTravelMode,
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<MobileRouteResult> {
  const straight = Math.round(haversineDistanceMeters(origin, destination));
  const osrmProfile = mode === "walking" ? "foot" : mode === "riding" ? "bicycle" : "driving";
  try {
    const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${origin.longitude.toFixed(6)},${origin.latitude.toFixed(6)};${destination.longitude.toFixed(6)},${destination.latitude.toFixed(6)}?overview=false`;
    const raw = await fetchJson(url, options?.signal, options?.fetchImpl);
    const route =
      raw && typeof raw === "object" && Array.isArray((raw as { routes?: unknown[] }).routes)
        ? ((raw as { routes: unknown[] }).routes[0] as Record<string, unknown> | undefined)
        : undefined;
    const dist = typeof route?.distance === "number" ? Math.round(route.distance) : null;
    const durSec = typeof route?.duration === "number" ? route.duration : null;
    if (dist !== null && durSec !== null && dist > 0) {
      const durationMinutes =
        mode === "transit"
          ? Math.max(1, Math.round((durSec / 60) * 1.45))
          : Math.max(1, Math.round(durSec / 60));
      return {
        mode,
        distanceMeters: dist,
        durationMinutes,
        estimated: mode === "transit",
        source: "osrm",
      };
    }
  } catch {
    // Fall back to Haversine estimate.
  }
  const roadMeters = Math.round(straight * 1.25);
  return {
    mode,
    distanceMeters: roadMeters,
    durationMinutes: estimateTravelMinutes(roadMeters, mode),
    estimated: true,
    source: "haversine",
  };
}

function mapWmoWeather(code: number): "sunny" | "cloudy" | "rainy" | "snowy" {
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

export async function fetchLiveWeatherByCoords(
  point: GeoPoint,
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch },
) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${point.latitude.toFixed(4)}&longitude=${point.longitude.toFixed(4)}` +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5";
  const raw = (await fetchJson(url, options?.signal, options?.fetchImpl)) as Record<
    string,
    unknown
  >;
  const current = (raw.current ?? {}) as Record<string, unknown>;
  const daily = (raw.daily ?? {}) as Record<string, unknown>;
  const times = Array.isArray(daily.time) ? (daily.time as string[]) : [];
  const highs = Array.isArray(daily.temperature_2m_max)
    ? (daily.temperature_2m_max as number[])
    : [];
  const lows = Array.isArray(daily.temperature_2m_min)
    ? (daily.temperature_2m_min as number[])
    : [];
  const codes = Array.isArray(daily.weather_code) ? (daily.weather_code as number[]) : [];
  return {
    temperatureC: typeof current.temperature_2m === "number" ? current.temperature_2m : null,
    apparentTemperatureC:
      typeof current.apparent_temperature === "number" ? current.apparent_temperature : null,
    humidityPercent:
      typeof current.relative_humidity_2m === "number" ? current.relative_humidity_2m : null,
    windSpeedKmh: typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : null,
    condition:
      typeof current.weather_code === "number" ? mapWmoWeather(current.weather_code) : "cloudy",
    isDay: current.is_day === 1,
    highC: typeof highs[0] === "number" ? highs[0] : null,
    lowC: typeof lows[0] === "number" ? lows[0] : null,
    daily: times.slice(0, 5).map((dateIso, i) => ({
      dateIso,
      highC: highs[i] ?? null,
      lowC: lows[i] ?? null,
      condition: typeof codes[i] === "number" ? mapWmoWeather(codes[i]!) : "cloudy",
    })),
    fetchedAt: Date.now(),
    source: "open-meteo-live" as const,
  };
}

function ownerOnlyError(): { error: string } {
  return {
    error:
      "Mobile app capabilities are only available in conversations started by the account owner.",
  };
}

function permissionDisabledError(permissionName: string): { error: string } {
  return {
    error: `Mobile app permission "${permissionName}" is currently disabled. Ask the user to enable it in Settings -> Bot App Permissions.`,
  };
}

async function requireAuthorizedBridge(
  ctx: RunContext,
  requiredPermission?: MobileBridgePermissionKey,
) {
  if (!ctx.source.ownerStartedRun) return { error: ownerOnlyError().error } as const;
  const bridge = await getUserMobileBridge(ctx.deps.prisma, ctx.run.userId);
  if (!bridge.permissions.enabled) {
    return { error: permissionDisabledError("enabled").error } as const;
  }
  if (requiredPermission && !isMobilePermissionEnabled(bridge.permissions, requiredPermission)) {
    return { error: permissionDisabledError(requiredPermission).error } as const;
  }
  return { bridge } as const;
}

async function emitMobileAppAction(
  ctx: RunContext,
  input: {
    title: string;
    subtitle?: string;
    autoExecute: boolean;
    payload: MobileAppActionPayload;
  },
): Promise<MobileAppActionRecord> {
  const actionId = `act_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const createdAt = new Date().toISOString();
  const record: MobileAppActionRecord = {
    actionId,
    title: input.title,
    ...(input.subtitle ? { subtitle: input.subtitle } : {}),
    autoExecute: input.autoExecute,
    createdAt,
    botId: ctx.bot.id,
    threadId: ctx.run.threadId,
    payload: input.payload,
  };
  await enqueueUserMobileBridgeAction(ctx.deps.prisma, ctx.run.userId, record);
  const block: MobileAppActionBlock = {
    kind: "app_action",
    actionId,
    title: input.title,
    ...(input.subtitle ? { subtitle: input.subtitle } : {}),
    autoExecute: input.autoExecute,
    createdAt,
    payload: input.payload,
  };
  await publishMessage(ctx.deps, ctx.run, "bot", [block]);
  await recordAuditEvent({
    action: `mobile_app.${input.payload.actionKind}`,
    actor: { type: "bot", id: ctx.bot.id, label: ctx.bot.name },
    spaceId: ctx.run.spaceId,
    runId: ctx.runId,
    threadId: ctx.run.threadId,
    target: { type: "mobile_app_action", id: actionId, label: input.title },
    metadata: {
      actionKind: input.payload.actionKind,
      autoExecute: input.autoExecute,
    },
  });
  return record;
}

export const mobileAppBuiltinTools: ConnectorTool[] = [
  {
    name: "app_get_context",
    description:
      "Read an overview of the user's authorized mobile app context: active permissions, phone location, weather summary, background companion status, notification status, and native iOS data availability (calendar, reminders, contacts, clipboard).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "app_get_location",
    description:
      "Get the user's current phone location (GPS, manually pinned map location, or IP fallback), human-readable city/district label, and recent map destinations.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "app_get_weather",
    description:
      "Get live weather and forecast for the user's current phone location (or specified latitude/longitude). Uses the synced phone snapshot or fetches live weather when stale or custom coordinates are given.",
    inputSchema: {
      type: "object",
      properties: {
        latitude: { type: "number", description: "Optional WGS-84 latitude." },
        longitude: { type: "number", description: "Optional WGS-84 longitude." },
        forceLive: {
          type: "boolean",
          description: "If true, fetch fresh live weather from Open-Meteo.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "app_map_search",
    description:
      "Search places, POIs, restaurants, or addresses using Amap (高德) / OpenStreetMap, automatically biased near the user's phone location.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Place name, keyword, or address to search." },
        limit: { type: "number", description: "Maximum number of results (1-10, default 6)." },
        nearLatitude: { type: "number", description: "Optional search center latitude (WGS-84)." },
        nearLongitude: {
          type: "number",
          description: "Optional search center longitude (WGS-84).",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "app_map_route",
    description:
      "Estimate distance and travel time between the user's current location (or custom origin) and a destination for driving, transit, walking, or riding.",
    inputSchema: {
      type: "object",
      properties: {
        destinationName: { type: "string", description: "Destination place name." },
        destinationLatitude: { type: "number", description: "Destination latitude (WGS-84)." },
        destinationLongitude: { type: "number", description: "Destination longitude (WGS-84)." },
        originLatitude: {
          type: "number",
          description: "Optional origin latitude (defaults to user's synced phone location).",
        },
        originLongitude: {
          type: "number",
          description: "Optional origin longitude (defaults to user's synced phone location).",
        },
        mode: {
          type: "string",
          enum: ["driving", "transit", "walking", "riding"],
          description: "Travel mode (default driving).",
        },
      },
      required: ["destinationName"],
      additionalProperties: false,
    },
  },
  {
    name: "app_open_amap_navigation",
    description:
      "Launch Amap (高德地图) turn-by-turn navigation on the user's phone and post a one-tap Amap navigation card in chat. When the app is in the foreground and auto-execute is enabled, Amap launches immediately.",
    inputSchema: {
      type: "object",
      properties: {
        destinationName: { type: "string", description: "Destination name shown in Amap." },
        destinationAddress: { type: "string", description: "Optional destination address." },
        destinationLatitude: { type: "number", description: "Optional WGS-84 latitude." },
        destinationLongitude: { type: "number", description: "Optional WGS-84 longitude." },
        originName: { type: "string", description: "Optional origin label." },
        originLatitude: { type: "number", description: "Optional origin WGS-84 latitude." },
        originLongitude: { type: "number", description: "Optional origin WGS-84 longitude." },
        mode: {
          type: "string",
          enum: ["driving", "transit", "walking", "riding"],
          description: "Travel mode (default driving).",
        },
      },
      required: ["destinationName"],
      additionalProperties: false,
    },
  },
  {
    name: "app_open_screen",
    description:
      "Navigate the user's mobile app to a built-in screen (/map, /weather, /companion, /computer, /(settings)/notifications, /(settings)/bot-permissions) and post a one-tap card in chat.",
    inputSchema: {
      type: "object",
      properties: {
        route: {
          type: "string",
          enum: [
            "/map",
            "/weather",
            "/companion",
            "/computer",
            "/(settings)/notifications",
            "/(settings)/bot-permissions",
          ],
          description: "Target screen route in the mobile app.",
        },
        title: { type: "string", description: "Optional short title for the card." },
        botId: { type: "string", description: "Optional botId when opening /computer." },
        botName: { type: "string", description: "Optional bot name when opening /computer." },
      },
      required: ["route"],
      additionalProperties: false,
    },
  },
  {
    name: "app_control_companion",
    description:
      "Start, stop, or switch the mobile app's background companion / Dynamic Island session to a bot.",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["start", "stop", "switch"],
          description: "Companion operation to perform on the phone.",
        },
        botId: { type: "string", description: "Target botId (defaults to current bot)." },
        botName: {
          type: "string",
          description: "Target bot display name (defaults to current bot).",
        },
      },
      required: ["operation"],
      additionalProperties: false,
    },
  },
  {
    name: "app_get_calendar",
    description:
      "Read upcoming and recent events synced from the user's iPhone Calendar (EventKit).",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional keyword filter across title/location/notes.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "app_create_calendar_event",
    description:
      "Create a new calendar event in the user's iPhone Calendar (EventKit) and post a confirmation action card.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Event title." },
        startAt: { type: "string", description: "ISO-8601 start date-time." },
        endAt: { type: "string", description: "ISO-8601 end date-time." },
        allDay: { type: "boolean", description: "Whether this is an all-day event." },
        location: { type: "string", description: "Optional event location." },
        notes: { type: "string", description: "Optional notes." },
      },
      required: ["title", "startAt", "endAt"],
      additionalProperties: false,
    },
  },
  {
    name: "app_get_reminders",
    description: "Read reminders synced from the user's iPhone Reminders (EventKit).",
    inputSchema: {
      type: "object",
      properties: {
        includeCompleted: {
          type: "boolean",
          description: "Include completed reminders (default false).",
        },
        query: { type: "string", description: "Optional keyword filter." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "app_create_reminder",
    description:
      "Create a new reminder in the user's iPhone Reminders (EventKit) and post a confirmation action card.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Reminder title." },
        dueAt: { type: "string", description: "Optional ISO-8601 due date-time." },
        notes: { type: "string", description: "Optional notes." },
        priority: {
          type: "number",
          description: "Optional priority (0=none, 1=high, 5=medium, 9=low).",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "app_search_contacts",
    description:
      "Search contacts synced from the user's iPhone Contacts by name, phone number, email, or company.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Keyword to match against name, phone, email, or organization (omit to list top matches).",
        },
        limit: { type: "number", description: "Maximum contacts to return (1-30, default 15)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "app_get_clipboard",
    description: "Read the latest text synced from the user's iPhone clipboard (if enabled).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "app_set_clipboard",
    description:
      "Copy text to the user's iPhone clipboard on foreground and post a one-tap copy card in chat.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to place onto the user's clipboard." },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
];

async function handleGetContext(ctx: RunContext, call: ToolCall) {
  const checked = await requireAuthorizedBridge(ctx);
  if ("error" in checked) return call.finish(checked);
  const { bridge } = checked;
  return call.finish({
    updatedAt: bridge.updatedAt,
    permissions: bridge.permissions,
    device: bridge.snapshot.device ?? null,
    location: bridge.snapshot.location ?? null,
    weather: bridge.snapshot.weather ?? null,
    companion: bridge.snapshot.companion ?? null,
    notifications: bridge.snapshot.notifications ?? null,
    nativeData: {
      calendar: bridge.snapshot.calendar
        ? {
            authorizationStatus: bridge.snapshot.calendar.authorizationStatus,
            eventCount: bridge.snapshot.calendar.events.length,
            syncedAt: bridge.snapshot.calendar.syncedAt,
          }
        : null,
      reminders: bridge.snapshot.reminders
        ? {
            authorizationStatus: bridge.snapshot.reminders.authorizationStatus,
            itemCount: bridge.snapshot.reminders.items.length,
            syncedAt: bridge.snapshot.reminders.syncedAt,
          }
        : null,
      contacts: bridge.snapshot.contacts
        ? {
            authorizationStatus: bridge.snapshot.contacts.authorizationStatus,
            totalCount: bridge.snapshot.contacts.totalCount,
            syncedCount: bridge.snapshot.contacts.items.length,
            syncedAt: bridge.snapshot.contacts.syncedAt,
          }
        : null,
      clipboard: bridge.snapshot.clipboard
        ? {
            hasText: bridge.snapshot.clipboard.hasText,
            length: bridge.snapshot.clipboard.textPreview?.length ?? 0,
            updatedAt: bridge.snapshot.clipboard.updatedAt,
          }
        : null,
    },
  });
}

async function handleGetLocation(ctx: RunContext, call: ToolCall) {
  const checked = await requireAuthorizedBridge(ctx, "location");
  if ("error" in checked) return call.finish(checked);
  const location = checked.bridge.snapshot.location;
  if (!location) {
    return call.finish({
      available: false,
      message:
        "No phone location has been synced yet. Ask the user to open Sydney on their phone so GPS/map location can sync.",
    });
  }
  return call.finish({ available: true, ...location });
}

async function handleGetWeather(ctx: RunContext, call: ToolCall) {
  const checked = await requireAuthorizedBridge(ctx, "weather");
  if ("error" in checked) return call.finish(checked);
  const lat = typeof call.args.latitude === "number" ? call.args.latitude : undefined;
  const lng = typeof call.args.longitude === "number" ? call.args.longitude : undefined;
  const forceLive = Boolean(call.args.forceLive);
  const syncedWeather = checked.bridge.snapshot.weather;
  const syncedLocation = checked.bridge.snapshot.location;
  const hasCustomCoords = isValidCoord(lat, lng);

  if (!hasCustomCoords && !forceLive && syncedWeather) {
    const ageMs = Date.now() - syncedWeather.fetchedAt;
    if (ageMs <= 30 * 60 * 1000) {
      return call.finish({ source: "mobile-snapshot", ...syncedWeather });
    }
  }

  const targetCoords = hasCustomCoords
    ? { latitude: lat!, longitude: lng! }
    : syncedLocation
      ? { latitude: syncedLocation.latitude, longitude: syncedLocation.longitude }
      : null;

  if (!targetCoords) {
    if (syncedWeather) return call.finish({ source: "mobile-snapshot", ...syncedWeather });
    return call.finish({
      available: false,
      message:
        "No weather snapshot or coordinates are available yet. Provide coordinates or open the phone app to sync location.",
    });
  }

  try {
    const live = await fetchLiveWeatherByCoords(targetCoords, { signal: ctx.context.signal });
    return call.finish({
      ...live,
      locationLabel: hasCustomCoords
        ? null
        : (syncedLocation?.label ?? syncedWeather?.locationLabel ?? null),
      coordinates: targetCoords,
    });
  } catch {
    if (syncedWeather) return call.finish({ source: "mobile-snapshot-fallback", ...syncedWeather });
    return call.finish({ error: "Could not fetch live weather right now." });
  }
}

async function handleMapSearch(ctx: RunContext, call: ToolCall) {
  const checked = await requireAuthorizedBridge(ctx, "mapAndAmap");
  if ("error" in checked) return call.finish(checked);
  const query = typeof call.args.query === "string" ? call.args.query.trim() : "";
  if (!query) return call.finish({ error: "query is required." });
  const nearLat = typeof call.args.nearLatitude === "number" ? call.args.nearLatitude : undefined;
  const nearLng = typeof call.args.nearLongitude === "number" ? call.args.nearLongitude : undefined;
  const syncedLoc = checked.bridge.snapshot.location;
  const near = isValidCoord(nearLat, nearLng)
    ? { latitude: nearLat!, longitude: nearLng! }
    : syncedLoc
      ? { latitude: syncedLoc.latitude, longitude: syncedLoc.longitude }
      : null;
  const limit = typeof call.args.limit === "number" ? call.args.limit : 6;
  try {
    const found = await searchMobileMapPlaces(query, {
      near,
      limit,
      signal: ctx.context.signal,
    });
    return call.finish({
      provider: found.provider,
      near: near ? { ...near, label: syncedLoc?.label ?? null } : null,
      results: found.results.map((item) => ({
        ...item,
        ...(near ? { distanceMeters: Math.round(haversineDistanceMeters(near, item)) } : {}),
      })),
    });
  } catch (error) {
    return call.finish({
      error: `Map place search failed: ${error instanceof Error ? error.message : "unknown error"}`,
    });
  }
}

async function handleMapRoute(ctx: RunContext, call: ToolCall) {
  const checked = await requireAuthorizedBridge(ctx, "mapAndAmap");
  if ("error" in checked) return call.finish(checked);
  const destinationName =
    typeof call.args.destinationName === "string" ? call.args.destinationName.trim() : "";
  if (!destinationName) return call.finish({ error: "destinationName is required." });
  const parsedMode = MobileTravelModeSchema.safeParse(call.args.mode ?? "driving");
  const mode: MobileTravelMode = parsedMode.success ? parsedMode.data : "driving";

  const syncedLoc = checked.bridge.snapshot.location;
  const originLat =
    typeof call.args.originLatitude === "number" ? call.args.originLatitude : syncedLoc?.latitude;
  const originLng =
    typeof call.args.originLongitude === "number"
      ? call.args.originLongitude
      : syncedLoc?.longitude;
  if (!isValidCoord(originLat, originLng)) {
    return call.finish({
      error:
        "Origin coordinates are unavailable. Ask the user to sync their phone location or pass originLatitude/originLongitude.",
    });
  }
  const origin: GeoPoint = { latitude: originLat!, longitude: originLng! };

  let destLat =
    typeof call.args.destinationLatitude === "number" ? call.args.destinationLatitude : undefined;
  let destLng =
    typeof call.args.destinationLongitude === "number" ? call.args.destinationLongitude : undefined;
  let resolvedAddress = "";
  if (!isValidCoord(destLat, destLng)) {
    const searched = await searchMobileMapPlaces(destinationName, {
      near: origin,
      limit: 1,
      signal: ctx.context.signal,
    }).catch(() => ({ provider: "nominatim" as const, results: [] }));
    const top = searched.results[0];
    if (!top) {
      return call.finish({
        error: `Could not locate "${destinationName}". Try passing explicit coordinates or a more specific address.`,
      });
    }
    destLat = top.latitude;
    destLng = top.longitude;
    resolvedAddress = top.address;
  }

  const destination: GeoPoint = { latitude: destLat!, longitude: destLng! };
  const route = await fetchMobileRoutePreview(origin, destination, mode, {
    signal: ctx.context.signal,
  });
  const urls = buildServerAmapNavigationUrls({
    origin: { name: syncedLoc?.label ?? "我的位置", ...origin },
    destination: { name: destinationName, ...destination },
    mode,
  });
  return call.finish({
    origin: { ...origin, label: syncedLoc?.label ?? "我的位置" },
    destination: { name: destinationName, address: resolvedAddress || undefined, ...destination },
    ...route,
    amapWebUrl: urls.webUrl,
  });
}

async function handleOpenAmapNavigation(ctx: RunContext, call: ToolCall) {
  const checked = await requireAuthorizedBridge(ctx, "mapAndAmap");
  if ("error" in checked) return call.finish(checked);
  const destinationName =
    typeof call.args.destinationName === "string" ? call.args.destinationName.trim() : "";
  if (!destinationName) return call.finish({ error: "destinationName is required." });
  const parsedMode = MobileTravelModeSchema.safeParse(call.args.mode ?? "driving");
  const mode: MobileTravelMode = parsedMode.success ? parsedMode.data : "driving";
  const syncedLoc = checked.bridge.snapshot.location;

  const originLat =
    typeof call.args.originLatitude === "number" ? call.args.originLatitude : syncedLoc?.latitude;
  const originLng =
    typeof call.args.originLongitude === "number"
      ? call.args.originLongitude
      : syncedLoc?.longitude;
  const originName =
    typeof call.args.originName === "string" && call.args.originName.trim()
      ? call.args.originName.trim()
      : (syncedLoc?.label ?? "我的位置");

  let destLat =
    typeof call.args.destinationLatitude === "number" ? call.args.destinationLatitude : undefined;
  let destLng =
    typeof call.args.destinationLongitude === "number" ? call.args.destinationLongitude : undefined;
  let destinationAddress =
    typeof call.args.destinationAddress === "string" ? call.args.destinationAddress.trim() : "";

  if (!isValidCoord(destLat, destLng)) {
    const searched = await searchMobileMapPlaces(destinationName, {
      near: isValidCoord(originLat, originLng)
        ? { latitude: originLat!, longitude: originLng! }
        : null,
      limit: 1,
      signal: ctx.context.signal,
    }).catch(() => ({ provider: "nominatim" as const, results: [] }));
    const top = searched.results[0];
    if (top) {
      destLat = top.latitude;
      destLng = top.longitude;
      if (!destinationAddress) destinationAddress = top.address;
    }
  }

  const urls = buildServerAmapNavigationUrls({
    origin: isValidCoord(originLat, originLng)
      ? { name: originName, latitude: originLat!, longitude: originLng! }
      : null,
    destination: {
      name: destinationName,
      ...(isValidCoord(destLat, destLng) ? { latitude: destLat!, longitude: destLng! } : {}),
    },
    mode,
  });

  const modeZh =
    mode === "driving"
      ? "驾车"
      : mode === "transit"
        ? "公交"
        : mode === "walking"
          ? "步行"
          : "骑行";
  const record = await emitMobileAppAction(ctx, {
    title: `高德导航 · ${destinationName}`,
    subtitle: destinationAddress ? `${modeZh} · ${destinationAddress}` : `${modeZh}导航`,
    autoExecute: checked.bridge.permissions.foregroundAutoExecute,
    payload: {
      actionKind: "open_amap_navigation",
      destinationName,
      ...(destinationAddress ? { destinationAddress } : {}),
      ...(isValidCoord(destLat, destLng)
        ? { destinationLatitude: destLat!, destinationLongitude: destLng! }
        : {}),
      originName,
      ...(isValidCoord(originLat, originLng)
        ? { originLatitude: originLat!, originLongitude: originLng! }
        : {}),
      mode,
      ...urls,
    },
  });

  return call.finish({
    dispatched: true,
    actionId: record.actionId,
    autoExecute: record.autoExecute,
    destinationName,
    destinationAddress: destinationAddress || undefined,
    mode,
    webUrl: urls.webUrl,
  });
}

const SCREEN_TITLES: Record<MobileAppScreenRoute, string> = {
  "/map": "打开地图与导航",
  "/weather": "打开天气详情",
  "/companion": "打开后台陪伴",
  "/computer": "打开云电脑",
  "/(settings)/notifications": "打开通知设置",
  "/(settings)/bot-permissions": "打开 Bot 应用权限",
};

async function handleOpenScreen(ctx: RunContext, call: ToolCall) {
  const checked = await requireAuthorizedBridge(ctx, "appNavigation");
  if ("error" in checked) return call.finish(checked);
  const parsedRoute = MobileAppScreenRouteSchema.safeParse(call.args.route);
  if (!parsedRoute.success) {
    return call.finish({
      error: `Invalid route. Allowed routes: ${MobileAppScreenRouteSchema.options.join(", ")}`,
    });
  }
  const route = parsedRoute.data;
  const botId =
    typeof call.args.botId === "string" && call.args.botId.trim()
      ? call.args.botId.trim()
      : route === "/computer"
        ? ctx.bot.id
        : undefined;
  const botName =
    typeof call.args.botName === "string" && call.args.botName.trim()
      ? call.args.botName.trim()
      : route === "/computer"
        ? ctx.bot.name
        : undefined;
  const title =
    typeof call.args.title === "string" && call.args.title.trim()
      ? call.args.title.trim()
      : SCREEN_TITLES[route];

  const record = await emitMobileAppAction(ctx, {
    title,
    subtitle: botName ? `${route} · ${botName}` : route,
    autoExecute: checked.bridge.permissions.foregroundAutoExecute,
    payload: {
      actionKind: "open_screen",
      route,
      ...(botId ? { botId } : {}),
      ...(botName ? { botName } : {}),
    },
  });
  return call.finish({
    dispatched: true,
    actionId: record.actionId,
    route,
    autoExecute: record.autoExecute,
  });
}

async function handleControlCompanion(ctx: RunContext, call: ToolCall) {
  const checked = await requireAuthorizedBridge(ctx, "companion");
  if ("error" in checked) return call.finish(checked);
  const op = call.args.operation;
  if (op !== "start" && op !== "stop" && op !== "switch") {
    return call.finish({ error: 'operation must be "start", "stop", or "switch".' });
  }
  const botId =
    typeof call.args.botId === "string" && call.args.botId.trim()
      ? call.args.botId.trim()
      : ctx.bot.id;
  const botName =
    typeof call.args.botName === "string" && call.args.botName.trim()
      ? call.args.botName.trim()
      : ctx.bot.name;
  const title =
    op === "stop"
      ? "关闭后台陪伴"
      : op === "switch"
        ? `切换后台陪伴 · ${botName}`
        : `开启后台陪伴 · ${botName}`;
  const record = await emitMobileAppAction(ctx, {
    title,
    subtitle: op === "stop" ? "结束当前灵动岛与悬浮陪伴" : "同步启用灵动岛／悬浮陪伴",
    autoExecute: checked.bridge.permissions.foregroundAutoExecute,
    payload: {
      actionKind: "control_companion",
      operation: op,
      ...(op !== "stop" ? { botId, botName } : {}),
    },
  });
  return call.finish({
    dispatched: true,
    actionId: record.actionId,
    operation: op,
    currentCompanion: checked.bridge.snapshot.companion ?? null,
    autoExecute: record.autoExecute,
  });
}

async function handleGetCalendar(ctx: RunContext, call: ToolCall) {
  const checked = await requireAuthorizedBridge(ctx, "calendar");
  if ("error" in checked) return call.finish(checked);
  const calendar = checked.bridge.snapshot.calendar;
  if (!calendar) {
    return call.finish({
      available: false,
      message:
        "No iOS Calendar snapshot synced yet. Ask the user to grant Calendar access in Settings -> Bot App Permissions.",
    });
  }
  const query = typeof call.args.query === "string" ? call.args.query.trim().toLowerCase() : "";
  const events = query
    ? calendar.events.filter((ev) =>
        `${ev.title} ${ev.location ?? ""} ${ev.notes ?? ""} ${ev.calendarTitle ?? ""}`
          .toLowerCase()
          .includes(query),
      )
    : calendar.events;
  return call.finish({
    available: true,
    authorizationStatus: calendar.authorizationStatus,
    syncedAt: calendar.syncedAt,
    count: events.length,
    events,
  });
}

async function handleCreateCalendarEvent(ctx: RunContext, call: ToolCall) {
  const checked = await requireAuthorizedBridge(ctx, "calendar");
  if ("error" in checked) return call.finish(checked);
  const title = typeof call.args.title === "string" ? call.args.title.trim() : "";
  const startAt = typeof call.args.startAt === "string" ? call.args.startAt.trim() : "";
  const endAt = typeof call.args.endAt === "string" ? call.args.endAt.trim() : "";
  if (
    !title ||
    !startAt ||
    !endAt ||
    Number.isNaN(Date.parse(startAt)) ||
    Number.isNaN(Date.parse(endAt))
  ) {
    return call.finish({ error: "title and valid ISO-8601 startAt/endAt are required." });
  }
  const location = typeof call.args.location === "string" ? call.args.location.trim() : undefined;
  const notes = typeof call.args.notes === "string" ? call.args.notes.trim() : undefined;
  const allDay = typeof call.args.allDay === "boolean" ? call.args.allDay : undefined;
  const record = await emitMobileAppAction(ctx, {
    title: `写入手机日历 · ${title}`,
    subtitle: location ? `${startAt} · ${location}` : startAt,
    autoExecute: checked.bridge.permissions.foregroundAutoExecute,
    payload: {
      actionKind: "create_calendar_event",
      title,
      startAt,
      endAt,
      ...(allDay !== undefined ? { allDay } : {}),
      ...(location ? { location } : {}),
      ...(notes ? { notes } : {}),
    },
  });
  return call.finish({
    dispatched: true,
    actionId: record.actionId,
    autoExecute: record.autoExecute,
  });
}

async function handleGetReminders(ctx: RunContext, call: ToolCall) {
  const checked = await requireAuthorizedBridge(ctx, "reminders");
  if ("error" in checked) return call.finish(checked);
  const reminders = checked.bridge.snapshot.reminders;
  if (!reminders) {
    return call.finish({
      available: false,
      message:
        "No iOS Reminders snapshot synced yet. Ask the user to grant Reminders access in Settings -> Bot App Permissions.",
    });
  }
  const includeCompleted = Boolean(call.args.includeCompleted);
  const query = typeof call.args.query === "string" ? call.args.query.trim().toLowerCase() : "";
  const items = reminders.items.filter((item) => {
    if (!includeCompleted && item.completed) return false;
    if (!query) return true;
    return `${item.title} ${item.notes ?? ""} ${item.listTitle ?? ""}`
      .toLowerCase()
      .includes(query);
  });
  return call.finish({
    available: true,
    authorizationStatus: reminders.authorizationStatus,
    syncedAt: reminders.syncedAt,
    count: items.length,
    items,
  });
}

async function handleCreateReminder(ctx: RunContext, call: ToolCall) {
  const checked = await requireAuthorizedBridge(ctx, "reminders");
  if ("error" in checked) return call.finish(checked);
  const title = typeof call.args.title === "string" ? call.args.title.trim() : "";
  if (!title) return call.finish({ error: "title is required." });
  const dueAt =
    typeof call.args.dueAt === "string" &&
    call.args.dueAt.trim() &&
    !Number.isNaN(Date.parse(call.args.dueAt))
      ? call.args.dueAt.trim()
      : undefined;
  const notes = typeof call.args.notes === "string" ? call.args.notes.trim() : undefined;
  const priority =
    typeof call.args.priority === "number" && Number.isInteger(call.args.priority)
      ? Math.min(9, Math.max(0, call.args.priority))
      : undefined;
  const record = await emitMobileAppAction(ctx, {
    title: `新建提醒事项 · ${title}`,
    subtitle: dueAt ? `截止 ${dueAt}` : "写入 iPhone 提醒事项",
    autoExecute: checked.bridge.permissions.foregroundAutoExecute,
    payload: {
      actionKind: "create_reminder",
      title,
      ...(dueAt ? { dueAt } : {}),
      ...(notes ? { notes } : {}),
      ...(priority !== undefined ? { priority } : {}),
    },
  });
  return call.finish({
    dispatched: true,
    actionId: record.actionId,
    autoExecute: record.autoExecute,
  });
}

async function handleSearchContacts(ctx: RunContext, call: ToolCall) {
  const checked = await requireAuthorizedBridge(ctx, "contacts");
  if ("error" in checked) return call.finish(checked);
  const contacts = checked.bridge.snapshot.contacts;
  if (!contacts) {
    return call.finish({
      available: false,
      message:
        "No iOS Contacts snapshot synced yet. Ask the user to grant Contacts access in Settings -> Bot App Permissions.",
    });
  }
  const query = typeof call.args.query === "string" ? call.args.query.trim().toLowerCase() : "";
  const limit =
    typeof call.args.limit === "number"
      ? Math.min(30, Math.max(1, Math.round(call.args.limit)))
      : 15;
  const matched = query
    ? contacts.items.filter((item) =>
        `${item.name} ${item.organization ?? ""} ${item.phones.join(" ")} ${item.emails.join(" ")}`
          .toLowerCase()
          .includes(query),
      )
    : contacts.items;
  return call.finish({
    available: true,
    authorizationStatus: contacts.authorizationStatus,
    totalCount: contacts.totalCount,
    syncedAt: contacts.syncedAt,
    results: matched.slice(0, limit),
  });
}

async function handleGetClipboard(ctx: RunContext, call: ToolCall) {
  const checked = await requireAuthorizedBridge(ctx, "clipboard");
  if ("error" in checked) return call.finish(checked);
  const clipboard = checked.bridge.snapshot.clipboard;
  if (!clipboard) {
    return call.finish({
      available: false,
      message: "No clipboard snapshot synced yet.",
    });
  }
  return call.finish({ available: true, ...clipboard });
}

async function handleSetClipboard(ctx: RunContext, call: ToolCall) {
  const checked = await requireAuthorizedBridge(ctx, "clipboard");
  if ("error" in checked) return call.finish(checked);
  const text = typeof call.args.text === "string" ? call.args.text : "";
  if (!text.trim()) return call.finish({ error: "text is required." });
  const clipped = text.slice(0, 4000);
  const record = await emitMobileAppAction(ctx, {
    title: "写入手机剪贴板",
    subtitle: clipped.length > 48 ? `${clipped.slice(0, 48)}…` : clipped,
    autoExecute: checked.bridge.permissions.foregroundAutoExecute,
    payload: {
      actionKind: "set_clipboard",
      text: clipped,
    },
  });
  return call.finish({
    dispatched: true,
    actionId: record.actionId,
    autoExecute: record.autoExecute,
  });
}

export const mobileAppTools: ToolHandlers = {
  app_get_context: handleGetContext,
  app_get_location: handleGetLocation,
  app_get_weather: handleGetWeather,
  app_map_search: handleMapSearch,
  app_map_route: handleMapRoute,
  app_open_amap_navigation: handleOpenAmapNavigation,
  app_open_screen: handleOpenScreen,
  app_control_companion: handleControlCompanion,
  app_get_calendar: handleGetCalendar,
  app_create_calendar_event: handleCreateCalendarEvent,
  app_get_reminders: handleGetReminders,
  app_create_reminder: handleCreateReminder,
  app_search_contacts: handleSearchContacts,
  app_get_clipboard: handleGetClipboard,
  app_set_clipboard: handleSetClipboard,
};
