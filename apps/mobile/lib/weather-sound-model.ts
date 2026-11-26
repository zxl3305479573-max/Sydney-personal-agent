import type { WeatherSceneKind } from "./weather-scene";

export type WeatherSoundTrack = "drizzle" | "rain" | "heavy-rain" | "snow" | "breeze" | "night";

export type WeatherSoundGainInput = {
  kind: WeatherSceneKind;
  intensity: number;
  masterVolume: number;
  soundEnabled: boolean;
  sceneEnabled: boolean;
  active: boolean;
  suspended: boolean;
  ducked: boolean;
};

export function resolveWeatherSoundTrack(kind: WeatherSceneKind): WeatherSoundTrack {
  switch (kind) {
    case "drizzle":
      return "drizzle";
    case "rain":
      return "rain";
    case "heavy-rain":
    case "thunderstorm":
      return "heavy-rain";
    case "light-snow":
    case "heavy-snow":
      return "snow";
    case "clear-night":
      return "night";
    case "cloudy":
    case "fog":
    case "clear-day":
      return "breeze";
  }
}

export function weatherSoundDescription(kind: WeatherSceneKind, locale: string): string {
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  switch (kind) {
    case "drizzle":
      return chinese ? (traditional ? "細雨滴落" : "细雨滴落") : "Soft drizzle";
    case "rain":
      return chinese ? (traditional ? "綿綿雨聲" : "绵绵雨声") : "Steady rain";
    case "heavy-rain":
      return chinese ? (traditional ? "傾盆大雨" : "倾盆大雨") : "Heavy downpour";
    case "thunderstorm":
      return chinese ? (traditional ? "暴雨雷鳴" : "暴雨雷鸣") : "Rain & rolling thunder";
    case "light-snow":
      return chinese ? (traditional ? "輕柔飄雪" : "轻柔飘雪") : "Quiet winter hush";
    case "heavy-snow":
      return chinese ? (traditional ? "風雪交加" : "风雪交加") : "Winter snow wind";
    case "cloudy":
      return chinese ? (traditional ? "輕柔微風" : "轻柔微风") : "Gentle breeze";
    case "fog":
      return chinese ? (traditional ? "晨霧微風" : "晨雾微风") : "Soft misty air";
    case "clear-day":
      return chinese ? (traditional ? "暖陽微風" : "暖阳微风") : "Warm sunlit breeze";
    case "clear-night":
      return chinese ? (traditional ? "星夜蟲鳴" : "星夜虫鸣") : "Starlit night breeze";
  }
}

function sceneBaseGain(kind: WeatherSceneKind, intensity: number): number {
  const clampedIntensity = Math.min(1, Math.max(0, Number.isFinite(intensity) ? intensity : 0.5));
  switch (kind) {
    case "drizzle":
      return 0.44 + clampedIntensity * 0.24;
    case "rain":
      return 0.58 + clampedIntensity * 0.28;
    case "heavy-rain":
      return 0.74 + clampedIntensity * 0.24;
    case "thunderstorm":
      return 0.76 + clampedIntensity * 0.24;
    case "light-snow":
    case "heavy-snow":
      return 0.36 + clampedIntensity * 0.34;
    case "fog":
      return 0.32;
    case "cloudy":
      return 0.24;
    case "clear-day":
      return 0.22;
    case "clear-night":
      return 0.36;
  }
}

/** Computes target native AudioPlayer volume [0, 1] using a perceptual curve + scene/intensity balance. */
export function computeWeatherSoundGain(input: WeatherSoundGainInput): number {
  if (!input.sceneEnabled || !input.soundEnabled || !input.active || input.suspended) {
    return 0;
  }
  const master = Math.min(
    1,
    Math.max(0, Number.isFinite(input.masterVolume) ? input.masterVolume : 0),
  );
  if (master <= 0) return 0;
  const perceptual = master ** 1.35;
  const duckFactor = input.ducked ? 0.15 : 1;
  const raw = perceptual * sceneBaseGain(input.kind, input.intensity) * duckFactor;
  return Math.min(1, Math.max(0, Number(raw.toFixed(3))));
}

/** Computes one-shot thunderclap volume synced with thunderstorm lightning strikes. */
export function computeThunderVolume(input: {
  masterVolume: number;
  soundEnabled: boolean;
  sceneEnabled: boolean;
  active: boolean;
  suspended: boolean;
  ducked: boolean;
}): number {
  if (
    !input.sceneEnabled ||
    !input.soundEnabled ||
    !input.active ||
    input.suspended ||
    input.ducked
  ) {
    return 0;
  }
  const master = Math.min(
    1,
    Math.max(0, Number.isFinite(input.masterVolume) ? input.masterVolume : 0),
  );
  if (master <= 0) return 0;
  return Math.min(1, Math.max(0, Number((master ** 1.2 * 0.92).toFixed(3))));
}
