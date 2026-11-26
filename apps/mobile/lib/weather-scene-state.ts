import { useSyncExternalStore } from "react";
import type { WeatherSceneKind } from "./weather-scene";
import { ALL_WEATHER_PREVIEW_SCENES } from "./weather-scene";

export type WeatherScenePreferences = {
  /** Whether the full-app live weather atmosphere overlay is active. */
  enabled: boolean;
  /** Optional manual preview override; null follows real-time GPS/local weather. */
  previewScene: WeatherSceneKind | null;
};

const STORAGE_KEY = "sydney.weatherScene.v1";
const VALID_SCENES = new Set<string>(ALL_WEATHER_PREVIEW_SCENES);

const DEFAULT_PREFERENCES: WeatherScenePreferences = {
  enabled: true,
  previewScene: null,
};

let currentPreferences: WeatherScenePreferences = DEFAULT_PREFERENCES;
let loaded = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function isValidScene(value: unknown): value is WeatherSceneKind {
  return typeof value === "string" && VALID_SCENES.has(value);
}

async function readStored(): Promise<string | null> {
  try {
    const SecureStore = await import("expo-secure-store");
    if (typeof SecureStore.getItemAsync === "function") {
      return await SecureStore.getItemAsync(STORAGE_KEY);
    }
  } catch {
    // Non-native / test environments do not provide SecureStore.
  }
  return null;
}

async function writeStored(value: string): Promise<void> {
  try {
    const SecureStore = await import("expo-secure-store");
    if (typeof SecureStore.setItemAsync === "function") {
      await SecureStore.setItemAsync(STORAGE_KEY, value);
    }
  } catch {
    // Ignore persistence failures on non-native environments.
  }
}

export async function loadWeatherScenePreferences(): Promise<WeatherScenePreferences> {
  if (loaded) return currentPreferences;
  loaded = true;
  const raw = await readStored();
  if (!raw) return currentPreferences;
  try {
    const parsed = JSON.parse(raw) as Partial<WeatherScenePreferences>;
    currentPreferences = {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : true,
      previewScene: isValidScene(parsed.previewScene) ? parsed.previewScene : null,
    };
    notify();
  } catch {
    // Keep defaults on corrupted storage.
  }
  return currentPreferences;
}

export function getWeatherScenePreferences(): WeatherScenePreferences {
  return currentPreferences;
}

export function subscribeWeatherScenePreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function setWeatherSceneEnabled(enabled: boolean): Promise<void> {
  if (currentPreferences.enabled === enabled) return;
  currentPreferences = { ...currentPreferences, enabled };
  notify();
  await writeStored(JSON.stringify(currentPreferences));
}

export async function setWeatherScenePreview(previewScene: WeatherSceneKind | null): Promise<void> {
  const nextScene = previewScene && isValidScene(previewScene) ? previewScene : null;
  if (
    currentPreferences.previewScene === nextScene &&
    (nextScene === null || currentPreferences.enabled)
  ) {
    return;
  }
  currentPreferences = {
    enabled: nextScene ? true : currentPreferences.enabled,
    previewScene: nextScene,
  };
  notify();
  await writeStored(JSON.stringify(currentPreferences));
}

export function useWeatherScenePreferences(): WeatherScenePreferences {
  return useSyncExternalStore(
    subscribeWeatherScenePreferences,
    getWeatherScenePreferences,
    getWeatherScenePreferences,
  );
}

export function resetWeatherScenePreferencesForTest(): void {
  currentPreferences = DEFAULT_PREFERENCES;
  loaded = false;
  notify();
}
