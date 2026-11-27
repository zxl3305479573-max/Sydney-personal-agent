import { useEffect, useSyncExternalStore } from "react";
import type { ResolvedScopedTheme } from "./theme-pack";

export const APP_BACKGROUND_PALETTES = {
  porcelain: { light: "#F4EFE7", dark: "#211E1B" },
  mint: { light: "#EAF3ED", dark: "#17251E" },
  lavender: { light: "#F0ECF6", dark: "#231E2D" },
  ocean: { light: "#E9F1F7", dark: "#182430" },
} as const;

export type AppBackground = {
  palette: keyof typeof APP_BACKGROUND_PALETTES | null;
  imageUri: string | null;
  fit: "cover" | "contain";
  opacity: number;
  overlayOpacity: number;
};

export const DEFAULT_APP_BACKGROUND: AppBackground = {
  palette: null,
  imageUri: null,
  fit: "cover",
  opacity: 1,
  overlayOpacity: 0.35,
};

const STORAGE_KEY = "sydney.app-background.v1";
const FILE_PREFIX = "sydney-app-background-";
let current = DEFAULT_APP_BACKGROUND;
let loading: Promise<void> | undefined;
let writes: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

function normalize(value: unknown): AppBackground {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const percent = (candidate: unknown, fallback: number, maximum = 1) =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.max(0, Math.min(maximum, candidate))
      : fallback;
  return {
    palette:
      typeof record.palette === "string" && Object.hasOwn(APP_BACKGROUND_PALETTES, record.palette)
        ? (record.palette as AppBackground["palette"])
        : null,
    imageUri:
      typeof record.imageUri === "string" && record.imageUri.startsWith("file://")
        ? record.imageUri
        : null,
    fit: record.fit === "contain" ? "contain" : "cover",
    opacity: percent(record.opacity, 1),
    overlayOpacity: percent(record.overlayOpacity, 0.35, 0.8),
  };
}

function publish(next: AppBackground) {
  current = next;
  for (const listener of listeners) listener();
}

export function getAppBackground(): AppBackground {
  return current;
}

export function subscribeAppBackground(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadAppBackground(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const storage = await import("expo-secure-store");
      const stored = await storage.getItemAsync(STORAGE_KEY);
      const next = normalize(stored ? JSON.parse(stored) : undefined);
      if (next.imageUri) {
        const { File } = await import("expo-file-system");
        if (!new File(next.imageUri).exists) next.imageUri = null;
      }
      publish(next);
    })().catch(() => undefined);
  }
  await loading;
}

export function updateAppBackground(patch: Partial<AppBackground>): Promise<void> {
  const pending = writes
    .catch(() => undefined)
    .then(async () => {
      await loadAppBackground();
      const next = normalize({ ...current, ...patch });
      const storage = await import("expo-secure-store");
      await storage.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      const previousUri = current.imageUri;
      publish(next);
      if (previousUri && previousUri !== next.imageUri) {
        try {
          const { File, Paths } = await import("expo-file-system");
          const prefix = new File(Paths.document, FILE_PREFIX).uri;
          const previous = new File(previousUri);
          if (previousUri.startsWith(prefix) && previous.exists) previous.delete();
        } catch {}
      }
    });
  writes = pending;
  return pending;
}

export async function chooseAppBackground(): Promise<void> {
  const picker = await import("expo-image-picker");
  const result = await picker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    quality: 0.85,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return;
  const { File, Paths } = await import("expo-file-system");
  const destination = new File(
    Paths.document,
    `${FILE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  try {
    await new File(asset.uri).copy(destination);
    await updateAppBackground({ imageUri: destination.uri });
  } catch (error) {
    if (destination.exists) destination.delete();
    throw error;
  }
}

export function useAppBackground(): AppBackground {
  useEffect(() => {
    void loadAppBackground();
  }, []);
  return useSyncExternalStore(
    subscribeAppBackground,
    getAppBackground,
    () => DEFAULT_APP_BACKGROUND,
  );
}

export function applyAppBackground(
  theme: ResolvedScopedTheme,
  background: AppBackground,
): ResolvedScopedTheme {
  const color = background.palette
    ? APP_BACKGROUND_PALETTES[background.palette][theme.appearance]
    : undefined;
  return {
    ...theme,
    ...(color
      ? { tokens: { ...theme.tokens, background: color }, pageBackgroundColor: color }
      : {}),
    background: background.imageUri
      ? {
          uri: background.imageUri,
          fit: background.fit,
          opacity: background.opacity,
          overlayOpacity: background.overlayOpacity,
        }
      : theme.background,
  };
}
