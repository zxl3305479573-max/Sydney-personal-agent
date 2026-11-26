import type { HomeWeatherSnapshot } from "./home-weather";
import type { WeatherSceneConfig, WeatherSceneKind } from "./weather-scene";
import { buildWeatherSceneConfig, resolveWeatherSceneKind } from "./weather-scene";

const HIDDEN_ROUTES = new Set(["/image"]);
const SUBTLE_READING_ROUTES = new Set([
  "/thread",
  "/group-thread",
  "/computer",
  "/bot-settings",
  "/bot-profile",
  "/artifacts",
]);

/** Reduces effect opacity slightly on dense reading screens so chat & code remain crisp. */
export function weatherOverlayOpacityScale(pathname: string): number {
  if (HIDDEN_ROUTES.has(pathname)) return 0;
  if (pathname === "/weather") return 1;
  if (pathname.startsWith("/projects/") && pathname.endsWith("/chat")) return 0.65;
  if (SUBTLE_READING_ROUTES.has(pathname)) return 0.68;
  return 0.88;
}

export function resolveActiveWeatherScene(input: {
  enabled: boolean;
  previewScene: WeatherSceneKind | null;
  weather: HomeWeatherSnapshot | null;
  pathname: string;
}): {
  visible: boolean;
  opacityScale: number;
  config: WeatherSceneConfig | null;
  isPreview: boolean;
} {
  if (!input.enabled) {
    return { visible: false, opacityScale: 0, config: null, isPreview: false };
  }
  const opacityScale = weatherOverlayOpacityScale(input.pathname);
  if (opacityScale <= 0) {
    return { visible: false, opacityScale: 0, config: null, isPreview: false };
  }
  if (input.previewScene) {
    return {
      visible: true,
      opacityScale,
      config: buildWeatherSceneConfig(input.previewScene, null),
      isPreview: true,
    };
  }
  if (!input.weather) {
    return { visible: false, opacityScale: 0, config: null, isPreview: false };
  }
  const kind = input.weather.scene ?? resolveWeatherSceneKind(input.weather);
  return {
    visible: true,
    opacityScale,
    config: buildWeatherSceneConfig(kind, input.weather),
    isPreview: false,
  };
}
