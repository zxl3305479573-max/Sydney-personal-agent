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

export type WeatherSvgStopTone = {
  /** Strictly opaque 6-digit hex (#RRGGBB); react-native-svg strips alpha from stopColor. */
  color: string;
  /** Explicit stopOpacity in [0, 1]. 0 omits rendering that gradient entirely. */
  opacity: number;
};

export type WeatherAtmosphereWashSpec = {
  topWash: WeatherSvgStopTone;
  /** Fraction of screen height (0..1) that the top sky rim covers. */
  topWashHeightRatio: number;
  /** Thin landing-line mist right above the tab bar / bottom edge (only for rain). */
  bottomMist: WeatherSvgStopTone;
  sunCore: WeatherSvgStopTone;
  sunMid: WeatherSvgStopTone;
  frostBottom: WeatherSvgStopTone;
};

const ZERO_STOP: WeatherSvgStopTone = { color: "#000000", opacity: 0 };

/**
 * Resolves SVG gradient stops with explicit hex `color` + numeric `opacity`.
 * `react-native-svg` masks stopColor with `color & 0x00ffffff` and applies only `stopOpacity`,
 * so passing `rgba(0, 0, 0, 0)` with `stopOpacity="1"` would render solid opaque black.
 */
export function resolveWeatherAtmosphereWash(
  config: WeatherSceneConfig,
  isLight: boolean,
): WeatherAtmosphereWashSpec {
  const topWashHeightRatio = 0.16;

  if (isLight) {
    const topWash: WeatherSvgStopTone =
      config.kind === "thunderstorm"
        ? { color: "#2D3F5A", opacity: 0.16 }
        : config.kind === "heavy-rain"
          ? { color: "#3E5470", opacity: 0.12 }
          : config.kind === "rain"
            ? { color: "#587292", opacity: 0.08 }
            : config.kind === "drizzle"
              ? { color: "#6882A0", opacity: 0.06 }
              : config.hasSnow
                ? { color: "#A2BEDE", opacity: 0.09 }
                : config.hasFog
                  ? { color: "#9AA6B4", opacity: 0.09 }
                  : config.hasStars
                    ? { color: "#2E3C64", opacity: 0.12 }
                    : ZERO_STOP;

    return {
      topWash,
      topWashHeightRatio,
      bottomMist: config.hasRain ? { color: "#5C80A8", opacity: 0.06 } : ZERO_STOP,
      sunCore: config.hasSunbeams ? { color: "#FFF4D2", opacity: 0.18 } : ZERO_STOP,
      sunMid: config.hasSunbeams ? { color: "#FFE8B6", opacity: 0.06 } : ZERO_STOP,
      frostBottom:
        config.hasSnow && config.groundFrostOpacity > 0
          ? { color: "#D6E5F6", opacity: Number((config.groundFrostOpacity * 0.6).toFixed(2)) }
          : ZERO_STOP,
    };
  }

  const topWash: WeatherSvgStopTone =
    config.kind === "thunderstorm"
      ? { color: "#16243E", opacity: 0.2 }
      : config.kind === "heavy-rain"
        ? { color: "#1C2E4A", opacity: 0.15 }
        : config.kind === "rain"
          ? { color: "#243A58", opacity: 0.1 }
          : config.kind === "drizzle"
            ? { color: "#284060", opacity: 0.08 }
            : config.hasSnow
              ? { color: "#8FB2DA", opacity: 0.08 }
              : config.hasFog
                ? { color: "#9EB0C4", opacity: 0.09 }
                : config.hasStars
                  ? { color: "#1B2A52", opacity: 0.15 }
                  : ZERO_STOP;

  return {
    topWash,
    topWashHeightRatio,
    bottomMist: config.hasRain ? { color: "#6A9CD2", opacity: 0.08 } : ZERO_STOP,
    sunCore: config.hasSunbeams ? { color: "#FFE8B6", opacity: 0.12 } : ZERO_STOP,
    sunMid: config.hasSunbeams ? { color: "#FFE0A2", opacity: 0.04 } : ZERO_STOP,
    frostBottom:
      config.hasSnow && config.groundFrostOpacity > 0
        ? { color: "#CEE4FC", opacity: Number((config.groundFrostOpacity * 0.48).toFixed(2)) }
        : ZERO_STOP,
  };
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
