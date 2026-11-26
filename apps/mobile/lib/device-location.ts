import type { UserLocation } from "./map-location";
import { isValidGeoPoint, saveMapLocation } from "./map-location";

export type NativeLocationStatus =
  | "authorized"
  | "denied"
  | "restricted"
  | "notDetermined"
  | "unavailable";

export type NativeLocationPayload = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  timestampMs?: number;
  label?: string;
  city?: string;
  district?: string;
  region?: string;
};

type SydneyLocationNativeModule = {
  isAvailable(): boolean;
  authorizationStatus(): string;
  getCurrentLocation(
    requestPermission: boolean,
    timeoutMs: number | null,
  ): Promise<NativeLocationPayload | null>;
};

export type DeviceGpsResult =
  | { status: "ok"; location: UserLocation }
  | { status: "denied" }
  | { status: "unavailable" }
  | { status: "timeout" };

const GPS_CACHE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_GPS_TIMEOUT_MS = 12_000;

let cachedGps: UserLocation | null = null;
let inFlightPromptRequest: Promise<DeviceGpsResult> | null = null;
let inFlightSilentRequest: Promise<DeviceGpsResult> | null = null;
let nativeOverride: SydneyLocationNativeModule | null | undefined;

function nativeModule(): SydneyLocationNativeModule | null {
  if (nativeOverride !== undefined) return nativeOverride;
  const expoGlobal = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo;
  const fromGlobal = expoGlobal?.modules?.SydneyLocation as SydneyLocationNativeModule | undefined;
  if (fromGlobal && typeof fromGlobal.getCurrentLocation === "function") {
    return fromGlobal;
  }
  return null;
}

export function isNativeLocationAvailable(): boolean {
  const mod = nativeModule();
  if (!mod) return false;
  try {
    return Boolean(mod.isAvailable());
  } catch {
    return false;
  }
}

export function getNativeLocationStatus(): NativeLocationStatus {
  const mod = nativeModule();
  if (!mod) return "unavailable";
  try {
    if (!mod.isAvailable()) return "unavailable";
    const status = mod.authorizationStatus();
    if (
      status === "authorized" ||
      status === "denied" ||
      status === "restricted" ||
      status === "notDetermined"
    ) {
      return status;
    }
    return "notDetermined";
  } catch {
    return "unavailable";
  }
}

function normalizeNativeLocation(
  raw: NativeLocationPayload | null | undefined,
  nowMs: number,
): UserLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!isValidGeoPoint({ latitude, longitude })) return null;
  const accuracy = Number(raw.accuracyMeters);
  const city = typeof raw.city === "string" && raw.city.trim() ? raw.city.trim() : undefined;
  const district =
    typeof raw.district === "string" && raw.district.trim() ? raw.district.trim() : undefined;
  const region =
    typeof raw.region === "string" && raw.region.trim() ? raw.region.trim() : undefined;
  const explicitLabel =
    typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : undefined;
  const fallbackParts = [...new Set([city, district].filter(Boolean) as string[])];
  const label = explicitLabel ?? (fallbackParts.length > 0 ? fallbackParts.join(" · ") : region);
  return {
    latitude,
    longitude,
    accuracyMeters: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : undefined,
    city,
    region,
    label,
    source: "gps",
    updatedAt: nowMs,
  };
}

/**
 * Fetches a real device GPS fix via native iOS CoreLocation (+ Apple CLGeocoder Chinese place name),
 * deduplicating concurrent callers and updating the shared map/weather location cache.
 */
export async function requestDeviceGpsLocation(options?: {
  requestPermission?: boolean;
  force?: boolean;
  timeoutMs?: number;
  nowMs?: number;
}): Promise<DeviceGpsResult> {
  const mod = nativeModule();
  if (!mod || !isNativeLocationAvailable()) {
    return { status: "unavailable" };
  }
  const nowMs = options?.nowMs ?? Date.now();
  const force = Boolean(options?.force);
  const requestPermission = options?.requestPermission ?? true;

  if (!force && cachedGps && nowMs - cachedGps.updatedAt < GPS_CACHE_TTL_MS) {
    return { status: "ok", location: cachedGps };
  }

  const run = async (): Promise<DeviceGpsResult> => {
    try {
      const raw = await mod.getCurrentLocation(
        requestPermission,
        options?.timeoutMs ?? DEFAULT_GPS_TIMEOUT_MS,
      );
      const parsed = normalizeNativeLocation(raw, Date.now());
      if (!parsed) {
        const currentStatus = getNativeLocationStatus();
        if (currentStatus === "denied" || currentStatus === "restricted") {
          return { status: "denied" };
        }
        return { status: "timeout" };
      }
      cachedGps = parsed;
      await saveMapLocation(parsed);
      return { status: "ok", location: parsed };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("location_denied") || getNativeLocationStatus() === "denied") {
        return { status: "denied" };
      }
      return { status: "timeout" };
    }
  };

  if (requestPermission) {
    if (!inFlightPromptRequest) {
      inFlightPromptRequest = run().finally(() => {
        inFlightPromptRequest = null;
      });
    }
    return inFlightPromptRequest;
  }

  if (inFlightPromptRequest) return inFlightPromptRequest;
  if (!inFlightSilentRequest) {
    inFlightSilentRequest = run().finally(() => {
      inFlightSilentRequest = null;
    });
  }
  return inFlightSilentRequest;
}

export function setNativeLocationModuleForTest(
  mock: SydneyLocationNativeModule | null | undefined,
): void {
  nativeOverride = mock;
  cachedGps = null;
  inFlightPromptRequest = null;
  inFlightSilentRequest = null;
}

export function resetDeviceLocationCacheForTest(): void {
  cachedGps = null;
  inFlightPromptRequest = null;
  inFlightSilentRequest = null;
}
