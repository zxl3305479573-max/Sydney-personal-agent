import { File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import { useEffect, useSyncExternalStore } from "react";

export type MobileBubbleStyle = {
  userBackground: string;
  userForeground: string;
  botBackground: string;
  botForeground: string;
  radius: number;
  opacity: number;
};

export type MobileChatAppearance = {
  backgroundUri: string | null;
  backgroundFit: "cover" | "contain";
  backgroundOpacity: number;
  overlayOpacity: number;
  bubble: MobileBubbleStyle | null;
};

const STORAGE_KEY = "rakazo.chatAppearance.mobile";
const BACKGROUND_FILE = new File(Paths.document, "sydney-chat-background");
const DEFAULT_APPEARANCE: MobileChatAppearance = {
  backgroundUri: null,
  backgroundFit: "cover",
  backgroundOpacity: 1,
  overlayOpacity: 0.25,
  bubble: null,
};
let appearance = DEFAULT_APPEARANCE;
let loaded = false;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function validColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function normalize(value: unknown): MobileChatAppearance {
  if (!value || typeof value !== "object") return DEFAULT_APPEARANCE;
  const record = value as Record<string, unknown>;
  const bubble = record.bubble;
  const validBubble =
    bubble &&
    typeof bubble === "object" &&
    validColor((bubble as Record<string, unknown>).userBackground) &&
    validColor((bubble as Record<string, unknown>).userForeground) &&
    validColor((bubble as Record<string, unknown>).botBackground) &&
    validColor((bubble as Record<string, unknown>).botForeground);
  return {
    backgroundUri: typeof record.backgroundUri === "string" ? record.backgroundUri : null,
    backgroundFit: record.backgroundFit === "contain" ? "contain" : "cover",
    backgroundOpacity:
      typeof record.backgroundOpacity === "number"
        ? Math.min(1, Math.max(0, record.backgroundOpacity))
        : 1,
    overlayOpacity:
      typeof record.overlayOpacity === "number"
        ? Math.min(0.8, Math.max(0, record.overlayOpacity))
        : 0.25,
    bubble: validBubble
      ? {
          userBackground: (bubble as Record<string, unknown>).userBackground as string,
          userForeground: (bubble as Record<string, unknown>).userForeground as string,
          botBackground: (bubble as Record<string, unknown>).botBackground as string,
          botForeground: (bubble as Record<string, unknown>).botForeground as string,
          radius:
            typeof (bubble as Record<string, unknown>).radius === "number" &&
            Number.isFinite((bubble as Record<string, unknown>).radius)
              ? Math.min(40, Math.max(0, (bubble as Record<string, number>).radius!))
              : 20,
          opacity:
            typeof (bubble as Record<string, unknown>).opacity === "number" &&
            Number.isFinite((bubble as Record<string, unknown>).opacity)
              ? Math.min(1, Math.max(0, (bubble as Record<string, number>).opacity!))
              : 1,
        }
      : null,
  };
}

export function getMobileChatAppearance(): MobileChatAppearance {
  return appearance;
}

export async function loadMobileChatAppearance(): Promise<MobileChatAppearance> {
  if (!loading) {
    loading = SecureStore.getItemAsync(STORAGE_KEY)
      .then((value) => {
        appearance = normalize(value ? JSON.parse(value) : undefined);
        if (appearance.backgroundUri && !new File(appearance.backgroundUri).exists) {
          appearance = { ...appearance, backgroundUri: null };
        }
        loaded = true;
        notify();
      })
      .catch(() => {
        loaded = true;
        appearance = DEFAULT_APPEARANCE;
      });
  }
  await loading;
  return appearance;
}

export async function saveMobileChatAppearance(next: MobileChatAppearance): Promise<void> {
  const normalized = normalize(next);
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(normalized));
  appearance = normalized;
  loaded = true;
  notify();
}

export async function chooseMobileChatBackground(): Promise<MobileChatAppearance | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    quality: 1,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const source = new File(asset.uri);
  await source.copy(BACKGROUND_FILE, { overwrite: true });
  const next = { ...appearance, backgroundUri: BACKGROUND_FILE.uri };
  await saveMobileChatAppearance(next);
  return next;
}

export async function clearMobileChatBackground(): Promise<void> {
  if (BACKGROUND_FILE.exists) BACKGROUND_FILE.delete();
  await saveMobileChatAppearance({ ...appearance, backgroundUri: null });
}

export function subscribeMobileChatAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMobileChatAppearance(): MobileChatAppearance {
  useEffect(() => {
    if (!loaded) void loadMobileChatAppearance();
  }, []);
  return useSyncExternalStore(
    subscribeMobileChatAppearance,
    getMobileChatAppearance,
    () => DEFAULT_APPEARANCE,
  );
}

export function mobileBubbleSurfaceStyle(
  current: MobileChatAppearance,
  role: "user" | "bot",
  fallback: { backgroundColor: string },
) {
  const bubble = current.bubble;
  if (!bubble) {
    return { backgroundColor: fallback.backgroundColor, borderRadius: 20 };
  }
  const color = role === "user" ? bubble.userBackground : bubble.botBackground;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return {
    backgroundColor: `rgba(${red}, ${green}, ${blue}, ${bubble.opacity})`,
    borderRadius: bubble.radius,
  };
}

export const MOBILE_BUBBLE_PRESETS: Array<{
  name: string;
  value: MobileBubbleStyle;
}> = [
  {
    name: "默认",
    value: {
      userBackground: "#dbeafe",
      userForeground: "#172554",
      botBackground: "#f3f4f6",
      botForeground: "#1f2937",
      radius: 20,
      opacity: 1,
    },
  },
  {
    name: "薄荷",
    value: {
      userBackground: "#bbf7d0",
      userForeground: "#14532d",
      botBackground: "#ecfdf5",
      botForeground: "#064e3b",
      radius: 20,
      opacity: 1,
    },
  },
  {
    name: "紫夜",
    value: {
      userBackground: "#ddd6fe",
      userForeground: "#2e1065",
      botBackground: "#ede9fe",
      botForeground: "#312e81",
      radius: 16,
      opacity: 1,
    },
  },
];
