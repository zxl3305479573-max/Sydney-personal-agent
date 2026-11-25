import { Linking, Platform } from "react-native";
import type { GeoPoint, TravelEstimateMode } from "./map-location";
import { isValidGeoPoint, wgs84ToGcj02 } from "./map-location";

export type TravelMode = TravelEstimateMode;

export type MapPlace = {
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
};

export type AmapNavigationInput = {
  origin?: MapPlace | null;
  destination: MapPlace;
  mode: TravelMode;
  platform?: "ios" | "android" | "web";
  appName?: string;
};

export type AmapNavigationUrls = {
  nativeUrl: string | null;
  webUrl: string;
};

export type AmapLaunchOutcome =
  | { opened: "amap-app"; url: string }
  | { opened: "amap-web"; url: string }
  | { opened: "failed"; url: string; error: string };

const NATIVE_MODE_CODE: Record<TravelMode, string> = {
  driving: "0",
  transit: "1",
  walking: "2",
  riding: "3",
};

const WEB_MODE_CODE: Record<TravelMode, string> = {
  driving: "car",
  transit: "bus",
  walking: "walk",
  riding: "ride",
};

function toGcjCoords(place: MapPlace | null | undefined): GeoPoint | null {
  if (!place || !isValidGeoPoint({ latitude: place.latitude, longitude: place.longitude })) {
    return null;
  }
  return wgs84ToGcj02({ latitude: place.latitude!, longitude: place.longitude! });
}

function fmtCoord(value: number): string {
  return value.toFixed(6);
}

function cleanName(name: string | undefined, fallback: string): string {
  const trimmed = name?.trim() ?? "";
  return trimmed || fallback;
}

/**
 * Builds official Amap (高德地图) deep links and universal web navigation fallback URLs.
 * Input coordinates are WGS-84 and automatically transformed to GCJ-02 (`dev=0`, `coordinate=gaode`).
 */
export function buildAmapNavigationUrls(input: AmapNavigationInput): AmapNavigationUrls {
  const platform =
    input.platform ??
    (Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web");
  const appName = input.appName?.trim() || "Sydney";
  const destName = cleanName(input.destination.name, "目的地");
  const originName = cleanName(input.origin?.name, "我的位置");
  const originGcj = toGcjCoords(input.origin);
  const destGcj = toGcjCoords(input.destination);
  const nativeMode = NATIVE_MODE_CODE[input.mode];
  const webMode = WEB_MODE_CODE[input.mode];

  let nativeUrl: string | null = null;
  if (platform === "ios" || platform === "android") {
    const params = new URLSearchParams();
    params.set("sourceApplication", appName);
    if (originGcj) {
      params.set("slat", fmtCoord(originGcj.latitude));
      params.set("slon", fmtCoord(originGcj.longitude));
      params.set("sname", originName);
    }
    if (destGcj) {
      params.set("dlat", fmtCoord(destGcj.latitude));
      params.set("dlon", fmtCoord(destGcj.longitude));
    }
    params.set("dname", destName);
    params.set("dev", "0");
    params.set("t", nativeMode);

    nativeUrl =
      platform === "ios"
        ? `iosamap://path?${params.toString()}`
        : `amapuri://route/plan/?${params.toString()}`;
  }

  let webUrl: string;
  if (destGcj) {
    const webParams = new URLSearchParams();
    if (originGcj) {
      webParams.set(
        "from",
        `${fmtCoord(originGcj.longitude)},${fmtCoord(originGcj.latitude)},${originName}`,
      );
    }
    webParams.set("to", `${fmtCoord(destGcj.longitude)},${fmtCoord(destGcj.latitude)},${destName}`);
    webParams.set("mode", webMode);
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
        `${fmtCoord(originGcj.longitude)},${fmtCoord(originGcj.latitude)}`,
      );
    }
    searchParams.set("src", appName);
    searchParams.set("callnative", "1");
    webUrl = `https://uri.amap.com/search?${searchParams.toString()}`;
  }

  return { nativeUrl, webUrl };
}

/**
 * Attempts to launch the installed Amap app directly via URL scheme (`iosamap://` / `amapuri://`),
 * falling back to Amap's official web URI (`uri.amap.com`) when Amap is not installed.
 */
export async function openInAmapNavigation(
  input: AmapNavigationInput,
  deps?: { openURL?: (url: string) => Promise<unknown> },
): Promise<AmapLaunchOutcome> {
  const openURL = deps?.openURL ?? ((url: string) => Linking.openURL(url));
  const { nativeUrl, webUrl } = buildAmapNavigationUrls(input);

  if (nativeUrl) {
    try {
      await openURL(nativeUrl);
      return { opened: "amap-app", url: nativeUrl };
    } catch {
      // Amap app not installed or scheme launch refused — fall through to official web URI.
    }
  }

  try {
    await openURL(webUrl);
    return { opened: "amap-web", url: webUrl };
  } catch (error) {
    return {
      opened: "failed",
      url: webUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function travelModeLabel(mode: TravelMode, locale: string): string {
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  switch (mode) {
    case "driving":
      return chinese ? (traditional ? "駕車" : "驾车") : "Drive";
    case "transit":
      return chinese ? (traditional ? "大眾運輸" : "公交") : "Transit";
    case "walking":
      return chinese ? "步行" : "Walk";
    case "riding":
      return chinese ? (traditional ? "騎行" : "骑行") : "Cycle";
  }
}
