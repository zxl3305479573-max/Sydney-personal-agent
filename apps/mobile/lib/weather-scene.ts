export type WeatherSceneKind =
  | "clear-day"
  | "clear-night"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "heavy-rain"
  | "thunderstorm"
  | "light-snow"
  | "heavy-snow";

export type WeatherSceneTelemetry = {
  condition?: "sunny" | "cloudy" | "rainy" | "snowy";
  isDay?: boolean;
  weatherCode?: number | null;
  wwoCode?: number | null;
  precipitationMm?: number | null;
  snowfallCm?: number | null;
  windSpeedKmh?: number | null;
  cloudCoverPercent?: number | null;
};

export type WeatherSceneConfig = {
  kind: WeatherSceneKind;
  isDay: boolean;
  /** Normalized visual intensity in [0, 1], derived from real weather code + precipitation rate. */
  intensity: number;
  /** Wind-driven slant angle in degrees (-22 to 22) for rain streaks and snow drift. */
  windAngleDeg: number;
  windSpeedKmh: number;
  hasRain: boolean;
  hasSplashes: boolean;
  hasLightning: boolean;
  hasSnow: boolean;
  hasClouds: boolean;
  hasFog: boolean;
  hasSunbeams: boolean;
  hasStars: boolean;
  rainDropCount: number;
  rainSplashCount: number;
  rainLengthRange: readonly [number, number];
  rainWidthRange: readonly [number, number];
  rainDurationMsRange: readonly [number, number];
  lightningIntervalMsRange: readonly [number, number];
  snowFlakeCount: number;
  snowSizeRange: readonly [number, number];
  snowDurationMsRange: readonly [number, number];
  snowSwayPx: number;
  groundFrostOpacity: number;
  cloudCount: number;
  starCount: number;
};

export type RainDropSpec = {
  id: number;
  /** Horizontal start fraction [0, 1]. */
  xRatio: number;
  /** Depth layer 0 (far) to 1 (near). */
  depth: number;
  length: number;
  width: number;
  durationMs: number;
  delayMs: number;
  opacity: number;
};

export type RainSplashSpec = {
  id: number;
  /** Landing horizontal fraction [0.04, 0.96]. */
  xRatio: number;
  /** Slight vertical variance along the landing band (px). */
  bottomJitterPx: number;
  /** Max horizontal ripple radius (px). */
  rippleWidth: number;
  /** Max bounce arc height for splash micro-droplets (px). */
  bounceHeight: number;
  /** Cycle period (ms). */
  cycleMs: number;
  delayMs: number;
  opacity: number;
};

export type SnowFlakeSpec = {
  id: number;
  xRatio: number;
  depth: number;
  size: number;
  durationMs: number;
  delayMs: number;
  swayPx: number;
  driftX: number;
  opacity: number;
};

export type StarSpec = {
  id: number;
  xRatio: number;
  yRatio: number;
  size: number;
  durationMs: number;
  delayMs: number;
  peakOpacity: number;
};

export type CloudWispSpec = {
  id: number;
  yRatio: number;
  widthRatio: number;
  heightPx: number;
  durationMs: number;
  delayMs: number;
  opacity: number;
};

export type LightningBoltGeometry = {
  mainPath: string;
  branchPath: string | null;
  originX: number;
};

const WWO_THUNDER_CODES = new Set([200, 386, 389, 392, 395]);
const WWO_FOG_CODES = new Set([143, 248, 260]);
const WWO_HEAVY_SNOW_CODES = new Set([227, 230, 332, 335, 338, 371, 395]);
const WWO_LIGHT_SNOW_CODES = new Set([179, 323, 326, 329, 368, 374, 377, 392]);
const WWO_HEAVY_RAIN_CODES = new Set([305, 308, 356, 359, 389]);
const WWO_MODERATE_RAIN_CODES = new Set([299, 302, 314, 320, 353, 365, 386]);
const WWO_DRIZZLE_CODES = new Set([176, 182, 185, 263, 266, 281, 284, 293, 296, 311, 317, 362]);

export const ALL_WEATHER_PREVIEW_SCENES: readonly WeatherSceneKind[] = [
  "drizzle",
  "rain",
  "heavy-rain",
  "thunderstorm",
  "light-snow",
  "heavy-snow",
  "cloudy",
  "fog",
  "clear-day",
  "clear-night",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * clamp(t, 0, 1);
}

/** Deterministic PRNG (Mulberry32) so particle layouts never flicker across renders. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Classifies Open-Meteo WMO code + live precipitation/snowfall into a rich scene kind. */
export function classifyWmoWeatherScene(
  code: number,
  options?: {
    isDay?: boolean;
    precipitationMm?: number | null;
    snowfallCm?: number | null;
  },
): WeatherSceneKind {
  const isDay = options?.isDay ?? true;
  const precip =
    typeof options?.precipitationMm === "number" && Number.isFinite(options.precipitationMm)
      ? Math.max(0, options.precipitationMm)
      : null;
  const snow =
    typeof options?.snowfallCm === "number" && Number.isFinite(options.snowfallCm)
      ? Math.max(0, options.snowfallCm)
      : null;

  if (code >= 95 && code <= 99) return "thunderstorm";
  if (code === 73 || code === 75 || code === 86) return "heavy-snow";
  if (code === 71 || code === 77 || code === 85) {
    return snow !== null && snow >= 1.2 ? "heavy-snow" : "light-snow";
  }
  if (code === 65 || code === 67 || code === 82) return "heavy-rain";
  if (code === 63 || code === 66 || code === 81) {
    if (precip !== null && precip >= 7.5) return "heavy-rain";
    if (precip !== null && precip > 0 && precip < 1.5) return "drizzle";
    return "rain";
  }
  if ((code >= 51 && code <= 61) || code === 80) {
    if (precip !== null && precip >= 7.5) return "heavy-rain";
    if (precip !== null && precip >= 2.5) return "rain";
    return "drizzle";
  }
  if (code === 45 || code === 48) return "fog";
  if (code === 2 || code === 3) {
    if (snow !== null && snow >= 0.2) return snow >= 1.2 ? "heavy-snow" : "light-snow";
    if (precip !== null && precip >= 0.2) {
      return precip >= 7.5 ? "heavy-rain" : precip >= 2.5 ? "rain" : "drizzle";
    }
    return "cloudy";
  }
  if (code === 0 || code === 1) {
    return isDay ? "clear-day" : "clear-night";
  }
  return "cloudy";
}

/** Classifies wttr.in WWO code into a rich scene kind. */
export function classifyWwoWeatherScene(
  code: number,
  options?: { isDay?: boolean; precipitationMm?: number | null },
): WeatherSceneKind {
  const isDay = options?.isDay ?? true;
  const precip =
    typeof options?.precipitationMm === "number" && Number.isFinite(options.precipitationMm)
      ? Math.max(0, options.precipitationMm)
      : null;
  if (WWO_THUNDER_CODES.has(code)) return "thunderstorm";
  if (WWO_HEAVY_SNOW_CODES.has(code)) return "heavy-snow";
  if (WWO_LIGHT_SNOW_CODES.has(code)) return "light-snow";
  if (WWO_HEAVY_RAIN_CODES.has(code)) return "heavy-rain";
  if (WWO_MODERATE_RAIN_CODES.has(code)) {
    if (precip !== null && precip >= 7.5) return "heavy-rain";
    return "rain";
  }
  if (WWO_DRIZZLE_CODES.has(code)) {
    if (precip !== null && precip >= 7.5) return "heavy-rain";
    if (precip !== null && precip >= 2.5) return "rain";
    return "drizzle";
  }
  if (WWO_FOG_CODES.has(code)) return "fog";
  if (code === 113) return isDay ? "clear-day" : "clear-night";
  if (code === 116 || code === 119 || code === 122) return "cloudy";
  if (code >= 176) return "rain";
  return "cloudy";
}

/** Resolves the rich WeatherSceneKind from telemetry, falling back gracefully to coarse condition. */
export function resolveWeatherSceneKind(telemetry: WeatherSceneTelemetry | null): WeatherSceneKind {
  if (!telemetry) return "clear-day";
  const isDay = telemetry.isDay ?? true;
  if (typeof telemetry.weatherCode === "number" && Number.isFinite(telemetry.weatherCode)) {
    return classifyWmoWeatherScene(telemetry.weatherCode, {
      isDay,
      precipitationMm: telemetry.precipitationMm,
      snowfallCm: telemetry.snowfallCm,
    });
  }
  if (typeof telemetry.wwoCode === "number" && Number.isFinite(telemetry.wwoCode)) {
    return classifyWwoWeatherScene(telemetry.wwoCode, {
      isDay,
      precipitationMm: telemetry.precipitationMm,
    });
  }
  switch (telemetry.condition) {
    case "rainy":
      if (typeof telemetry.precipitationMm === "number" && telemetry.precipitationMm >= 7.5) {
        return "heavy-rain";
      }
      if (
        typeof telemetry.precipitationMm === "number" &&
        telemetry.precipitationMm > 0 &&
        telemetry.precipitationMm < 2.5
      ) {
        return "drizzle";
      }
      return "rain";
    case "snowy":
      return typeof telemetry.snowfallCm === "number" && telemetry.snowfallCm >= 1.2
        ? "heavy-snow"
        : "light-snow";
    case "cloudy":
      return "cloudy";
    case "sunny":
    default:
      return isDay ? "clear-day" : "clear-night";
  }
}

function resolveIntensity(
  kind: WeatherSceneKind,
  telemetry?: WeatherSceneTelemetry | null,
): number {
  const precip =
    typeof telemetry?.precipitationMm === "number" && Number.isFinite(telemetry.precipitationMm)
      ? Math.max(0, telemetry.precipitationMm)
      : null;
  const snow =
    typeof telemetry?.snowfallCm === "number" && Number.isFinite(telemetry.snowfallCm)
      ? Math.max(0, telemetry.snowfallCm)
      : null;
  const cloud =
    typeof telemetry?.cloudCoverPercent === "number" && Number.isFinite(telemetry.cloudCoverPercent)
      ? clamp(telemetry.cloudCoverPercent / 100, 0.25, 1)
      : null;

  switch (kind) {
    case "drizzle":
      return precip !== null ? clamp(0.22 + (precip / 2.5) * 0.2, 0.22, 0.42) : 0.3;
    case "rain":
      return precip !== null ? clamp(0.48 + ((precip - 2.0) / 5.5) * 0.24, 0.48, 0.74) : 0.6;
    case "heavy-rain":
      return precip !== null ? clamp(0.8 + ((precip - 7.5) / 12) * 0.2, 0.8, 1) : 0.9;
    case "thunderstorm":
      return precip !== null ? clamp(0.85 + (precip / 20) * 0.15, 0.85, 1) : 0.95;
    case "light-snow":
      return snow !== null ? clamp(0.3 + (snow / 1.2) * 0.25, 0.28, 0.55) : 0.4;
    case "heavy-snow":
      return snow !== null ? clamp(0.75 + ((snow - 1.2) / 4) * 0.25, 0.75, 1) : 0.88;
    case "fog":
      return 0.75;
    case "cloudy":
      return cloud ?? 0.55;
    case "clear-night":
      return 0.65;
    case "clear-day":
      return 0.5;
  }
}

/** Builds complete physical rendering parameters for any scene & live telemetry. */
export function buildWeatherSceneConfig(
  kind: WeatherSceneKind,
  telemetry?: WeatherSceneTelemetry | null,
): WeatherSceneConfig {
  const isDay =
    kind === "clear-day" ? true : kind === "clear-night" ? false : (telemetry?.isDay ?? true);
  const intensity = resolveIntensity(kind, telemetry);
  const windSpeedKmh =
    typeof telemetry?.windSpeedKmh === "number" && Number.isFinite(telemetry.windSpeedKmh)
      ? Math.max(0, telemetry.windSpeedKmh)
      : kind === "thunderstorm"
        ? 30
        : kind === "heavy-rain" || kind === "heavy-snow"
          ? 20
          : 10;

  const hasRain =
    kind === "drizzle" || kind === "rain" || kind === "heavy-rain" || kind === "thunderstorm";
  const hasSnow = kind === "light-snow" || kind === "heavy-snow";
  const hasLightning = kind === "thunderstorm";
  const hasFog = kind === "fog";
  const hasClouds = kind === "cloudy" || kind === "heavy-rain" || kind === "thunderstorm";
  const hasSunbeams = kind === "clear-day";
  const hasStars = kind === "clear-night";

  // Realistic slant angle proportional to wind speed (subtle in calm weather, dramatic in storms).
  const windFactor = clamp(windSpeedKmh / 42, 0, 1);
  const baseAngle = hasRain ? lerp(4, 21, windFactor) : hasSnow ? lerp(3, 14, windFactor) : 0;

  const rainDropCount = hasRain ? Math.round(lerp(12, 42, intensity)) : 0;
  const rainSplashCount = hasRain ? Math.round(lerp(6, 16, intensity)) : 0;
  const rainLengthRange: readonly [number, number] = hasRain
    ? [Math.round(lerp(11, 28, intensity)), Math.round(lerp(20, 48, intensity))]
    : [0, 0];
  const rainWidthRange: readonly [number, number] = hasRain
    ? [Number(lerp(1.0, 1.8, intensity).toFixed(2)), Number(lerp(1.4, 2.5, intensity).toFixed(2))]
    : [0, 0];
  const rainDurationMsRange: readonly [number, number] = hasRain
    ? [Math.round(lerp(960, 380, intensity)), Math.round(lerp(1420, 600, intensity))]
    : [0, 0];

  const snowFlakeCount = hasSnow ? Math.round(lerp(16, 36, intensity)) : 0;
  const snowSizeRange: readonly [number, number] = hasSnow
    ? [Number(lerp(3, 4.5, intensity).toFixed(1)), Number(lerp(7, 11, intensity).toFixed(1))]
    : [0, 0];
  const snowDurationMsRange: readonly [number, number] = hasSnow
    ? [Math.round(lerp(7200, 4400, intensity)), Math.round(lerp(11500, 7600, intensity))]
    : [0, 0];
  const snowSwayPx = hasSnow ? Math.round(lerp(16, 30, intensity)) : 0;
  const groundFrostOpacity = hasSnow ? Number(lerp(0.14, 0.34, intensity).toFixed(2)) : 0;

  return {
    kind,
    isDay,
    intensity,
    windAngleDeg: Number(baseAngle.toFixed(1)),
    windSpeedKmh,
    hasRain,
    hasSplashes: hasRain,
    hasLightning,
    hasSnow,
    hasClouds,
    hasFog,
    hasSunbeams,
    hasStars,
    rainDropCount,
    rainSplashCount,
    rainLengthRange,
    rainWidthRange,
    rainDurationMsRange,
    lightningIntervalMsRange: hasLightning ? [4_200, 8_800] : [0, 0],
    snowFlakeCount,
    snowSizeRange,
    snowDurationMsRange,
    snowSwayPx,
    groundFrostOpacity,
    cloudCount: hasClouds ? (kind === "cloudy" ? 4 : 3) : 0,
    starCount: hasStars ? 22 : 0,
  };
}

export function createRainParticles(config: WeatherSceneConfig): RainDropSpec[] {
  if (!config.hasRain || config.rainDropCount <= 0) return [];
  const rand = mulberry32(101 + config.rainDropCount * 37);
  const [minLen, maxLen] = config.rainLengthRange;
  const [minWidth, maxWidth] = config.rainWidthRange;
  const [minDur, maxDur] = config.rainDurationMsRange;
  const list: RainDropSpec[] = [];
  for (let i = 0; i < config.rainDropCount; i += 1) {
    const depth = rand();
    // Spread across slightly wider horizontal span so wind-slanted rain covers both screen edges.
    const band = (i + rand() * 0.85) / config.rainDropCount;
    const xRatio = -0.1 + band * 1.2;
    const length = lerp(minLen, maxLen, depth * 0.75 + rand() * 0.25);
    const width = lerp(minWidth, maxWidth, depth);
    // Closer drops fall slightly faster (parallax depth).
    const durationMs = Math.round(lerp(maxDur, minDur, depth * 0.7 + rand() * 0.3));
    const delayMs = Math.round(rand() * durationMs);
    const opacity = Number(lerp(0.22, 0.62, depth * 0.7 + config.intensity * 0.3).toFixed(2));
    list.push({
      id: i,
      xRatio,
      depth,
      length: Number(length.toFixed(1)),
      width: Number(width.toFixed(2)),
      durationMs,
      delayMs,
      opacity,
    });
  }
  return list;
}

export function createRainSplashes(config: WeatherSceneConfig): RainSplashSpec[] {
  if (!config.hasSplashes || config.rainSplashCount <= 0) return [];
  const rand = mulberry32(409 + config.rainSplashCount * 53);
  const list: RainSplashSpec[] = [];
  for (let i = 0; i < config.rainSplashCount; i += 1) {
    const slot = (i + 0.15 + rand() * 0.7) / config.rainSplashCount;
    const xRatio = clamp(0.04 + slot * 0.92, 0.04, 0.96);
    const bottomJitterPx = Math.round(rand() * 14);
    const rippleWidth = Math.round(lerp(16, 30, config.intensity * 0.65 + rand() * 0.35));
    const bounceHeight = Math.round(lerp(8, 18, config.intensity * 0.6 + rand() * 0.4));
    const cycleMs = Math.round(lerp(1350, 740, config.intensity) + rand() * 480);
    const delayMs = Math.round(rand() * cycleMs);
    const opacity = Number(lerp(0.34, 0.72, config.intensity * 0.6 + rand() * 0.4).toFixed(2));
    list.push({
      id: i,
      xRatio,
      bottomJitterPx,
      rippleWidth,
      bounceHeight,
      cycleMs,
      delayMs,
      opacity,
    });
  }
  return list;
}

export function createSnowParticles(config: WeatherSceneConfig): SnowFlakeSpec[] {
  if (!config.hasSnow || config.snowFlakeCount <= 0) return [];
  const rand = mulberry32(733 + config.snowFlakeCount * 29);
  const [minSize, maxSize] = config.snowSizeRange;
  const [minDur, maxDur] = config.snowDurationMsRange;
  const windDrift = config.windAngleDeg * 4.5;
  const list: SnowFlakeSpec[] = [];
  for (let i = 0; i < config.snowFlakeCount; i += 1) {
    const depth = rand();
    const xRatio = (i + rand() * 0.85) / config.snowFlakeCount;
    const size = Number(lerp(minSize, maxSize, depth).toFixed(1));
    const durationMs = Math.round(lerp(maxDur, minDur, depth * 0.65 + rand() * 0.35));
    const delayMs = Math.round(rand() * durationMs);
    const swayPx = Math.round(config.snowSwayPx * (0.55 + (1 - depth) * 0.6));
    const driftX = Math.round(windDrift * (0.6 + depth * 0.7));
    const opacity = Number(lerp(0.32, 0.86, depth * 0.75 + rand() * 0.25).toFixed(2));
    list.push({
      id: i,
      xRatio,
      depth,
      size,
      durationMs,
      delayMs,
      swayPx,
      driftX,
      opacity,
    });
  }
  return list;
}

export function createStarParticles(config: WeatherSceneConfig): StarSpec[] {
  if (!config.hasStars || config.starCount <= 0) return [];
  const rand = mulberry32(911);
  const list: StarSpec[] = [];
  for (let i = 0; i < config.starCount; i += 1) {
    list.push({
      id: i,
      xRatio: 0.04 + rand() * 0.92,
      yRatio: 0.03 + rand() * 0.42,
      size: Number((1.6 + rand() * 2.2).toFixed(1)),
      durationMs: Math.round(2400 + rand() * 3200),
      delayMs: Math.round(rand() * 3000),
      peakOpacity: Number((0.35 + rand() * 0.5).toFixed(2)),
    });
  }
  return list;
}

export function createCloudWisps(config: WeatherSceneConfig): CloudWispSpec[] {
  if (!config.hasClouds && !config.hasFog) return [];
  const count = config.hasFog ? 4 : config.cloudCount;
  const rand = mulberry32(config.hasFog ? 547 : 317);
  const list: CloudWispSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    list.push({
      id: i,
      yRatio: config.hasFog ? 0.08 + i * 0.22 : 0.04 + i * 0.1,
      widthRatio: Number((0.68 + rand() * 0.44).toFixed(2)),
      heightPx: Math.round(config.hasFog ? 96 + rand() * 64 : 62 + rand() * 44),
      durationMs: Math.round((config.hasFog ? 26_000 : 20_000) + rand() * 14_000),
      delayMs: Math.round(rand() * 12_000),
      opacity: Number((config.hasFog ? 0.24 + rand() * 0.14 : 0.14 + rand() * 0.1).toFixed(2)),
    });
  }
  return list;
}

/** Generates a realistic jagged SVG lightning bolt path with an optional fork branch. */
export function generateLightningBolt(
  width: number,
  height: number,
  seed: number,
): LightningBoltGeometry {
  const rand = mulberry32(seed);
  const originX = width * (0.16 + rand() * 0.68);
  const boltHeight = height * (0.34 + rand() * 0.24);
  const segments = 7;
  let x = originX;
  let y = 0;
  const points: Array<[number, number]> = [[x, y]];
  let branchOrigin: [number, number] | null = null;

  for (let i = 1; i <= segments; i += 1) {
    const stepY = boltHeight / segments;
    y += stepY * (0.85 + rand() * 0.3);
    x += (rand() - 0.5) * Math.min(72, width * 0.17);
    x = clamp(x, 18, width - 18);
    points.push([x, y]);
    if (i === 3) branchOrigin = [x, y];
  }

  const mainPath = points
    .map(([px, py], idx) => `${idx === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`)
    .join(" ");

  let branchPath: string | null = null;
  if (branchOrigin) {
    const dir = rand() > 0.5 ? 1 : -1;
    let [bx, by] = branchOrigin;
    const branchPts: Array<[number, number]> = [[bx, by]];
    for (let j = 1; j <= 3; j += 1) {
      bx = clamp(bx + dir * (14 + rand() * 22), 14, width - 14);
      by += 24 + rand() * 26;
      branchPts.push([bx, by]);
    }
    branchPath = branchPts
      .map(([px, py], idx) => `${idx === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`)
      .join(" ");
  }

  return { mainPath, branchPath, originX };
}

export function weatherSceneLabel(kind: WeatherSceneKind, locale: string): string {
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  switch (kind) {
    case "clear-day":
      return chinese ? "晴天" : "Clear";
    case "clear-night":
      return chinese ? "星夜" : "Starry";
    case "cloudy":
      return chinese ? (traditional ? "多雲" : "多云") : "Cloudy";
    case "fog":
      return chinese ? (traditional ? "薄霧" : "薄雾") : "Fog";
    case "drizzle":
      return chinese ? "小雨" : "Drizzle";
    case "rain":
      return chinese ? "中雨" : "Rain";
    case "heavy-rain":
      return chinese ? "大雨" : "Heavy rain";
    case "thunderstorm":
      return chinese ? (traditional ? "雷陣雨" : "雷阵雨") : "Storm";
    case "light-snow":
      return chinese ? "小雪" : "Light snow";
    case "heavy-snow":
      return chinese ? "大雪" : "Heavy snow";
  }
}

export function weatherSceneSymbol(kind: WeatherSceneKind): {
  ios: string;
  android:
    | "sunny-outline"
    | "moon-outline"
    | "cloudy-outline"
    | "rainy-outline"
    | "thunderstorm-outline"
    | "snow-outline";
} {
  switch (kind) {
    case "clear-day":
      return { ios: "sun.max", android: "sunny-outline" };
    case "clear-night":
      return { ios: "moon.stars", android: "moon-outline" };
    case "cloudy":
      return { ios: "cloud", android: "cloudy-outline" };
    case "fog":
      return { ios: "cloud.fog", android: "cloudy-outline" };
    case "drizzle":
      return { ios: "cloud.drizzle", android: "rainy-outline" };
    case "rain":
      return { ios: "cloud.rain", android: "rainy-outline" };
    case "heavy-rain":
      return { ios: "cloud.heavyrain", android: "rainy-outline" };
    case "thunderstorm":
      return { ios: "cloud.bolt.rain", android: "thunderstorm-outline" };
    case "light-snow":
    case "heavy-snow":
      return { ios: "cloud.snow", android: "snow-outline" };
  }
}
