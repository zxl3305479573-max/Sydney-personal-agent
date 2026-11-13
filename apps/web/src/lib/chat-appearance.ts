import { useEffect, useState, useSyncExternalStore } from "react";
import { z } from "zod";

export type ChatBackground = {
  id: string;
  name: string;
  image: Blob;
  fit: "cover" | "contain";
  opacity: number;
  overlay: number;
};

export type ChatBubbleStyle = {
  userBackground: string;
  userForeground: string;
  botBackground: string;
  botForeground: string;
  radius: number;
  opacity: number;
};

export const CHAT_BUBBLE_PRESETS: Array<{ name: string; value: ChatBubbleStyle }> = [
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

export function chatBubbleTextShadow(foreground: string, background: string, opacity: number) {
  const luminance = (color: string) => {
    const channels = [1, 3, 5].map((index) => {
      const value = Number.parseInt(color.slice(index, index + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  const text = luminance(foreground);
  const surface = luminance(background);
  const contrast = (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05);
  if (opacity === 1 && contrast >= 4.5) return "none";
  const outline = text > 0.18 ? "#000" : "#fff";
  return `-1px -1px 1px ${outline}, 1px -1px 1px ${outline}, -1px 1px 1px ${outline}, 1px 1px 1px ${outline}`;
}

export type ChatAppearance = {
  mode?: "simple" | "custom";
  userTextColor?: string | null;
  botTextColor?: string | null;
  backgrounds: ChatBackground[];
  backgroundId: string | null;
  chatBackgrounds?: Record<string, string>;
  surfaceOpacity?: number;
  bubble?: ChatBubbleStyle | null;
};

export const EMPTY_CHAT_APPEARANCE: ChatAppearance = {
  backgrounds: [],
  backgroundId: null,
  bubble: { ...CHAT_BUBBLE_PRESETS[0]!.value },
};

export const DEFAULT_TEXT_COLOR_PICKER_VALUE = "#000000";
export const DEFAULT_SURFACE_OPACITY = 80;

const idSchema = z.string().min(1).max(100);
const nameSchema = z.string().max(80);
const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
const appearanceSchema = z.object({
  mode: z.enum(["simple", "custom"]).optional(),
  userTextColor: colorSchema.nullable().optional(),
  botTextColor: colorSchema.nullable().optional(),
  bubble: z
    .object({
      userBackground: colorSchema,
      userForeground: colorSchema,
      botBackground: colorSchema,
      botForeground: colorSchema,
      radius: z.number().min(0).max(40),
      opacity: z.number().min(0).max(1),
    })
    .nullable()
    .optional(),
  backgrounds: z
    .array(
      z.object({
        id: idSchema,
        name: nameSchema,
        image: z.instanceof(Blob),
        fit: z.enum(["cover", "contain"]),
        opacity: z.number().int().min(0).max(100),
        overlay: z.number().int().min(0).max(80),
      }),
    )
    .max(100),
  backgroundId: idSchema.nullable(),
  chatBackgrounds: z.record(z.string().min(1).max(500), idSchema).optional(),
  surfaceOpacity: z.number().int().min(0).max(100).optional(),
});

export function useAppearanceImage(image: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image || typeof URL.createObjectURL !== "function") {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(image);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [image]);
  return url;
}

export function normalizeAppearance(value: ChatAppearance): ChatAppearance {
  const backgrounds = value.backgrounds.filter((item) => item.image instanceof Blob);
  const backgroundIds = new Set(backgrounds.map((item) => item.id));
  const surfaceOpacity =
    typeof value.surfaceOpacity === "number" && Number.isFinite(value.surfaceOpacity)
      ? Math.min(100, Math.max(0, Math.round(value.surfaceOpacity)))
      : DEFAULT_SURFACE_OPACITY;
  return {
    mode: value.mode,
    userTextColor: value.userTextColor,
    botTextColor: value.botTextColor,
    bubble: value.bubble === undefined ? { ...CHAT_BUBBLE_PRESETS[0]!.value } : value.bubble,
    backgrounds,
    backgroundId:
      value.backgroundId && backgroundIds.has(value.backgroundId) ? value.backgroundId : null,
    ...(value.chatBackgrounds
      ? {
          chatBackgrounds: Object.fromEntries(
            Object.entries(value.chatBackgrounds).filter(([, id]) => backgroundIds.has(id)),
          ),
        }
      : {}),
    surfaceOpacity,
  };
}

export function chatBackgroundKey(userId: string, kind: "bot" | "group", id: string): string {
  return JSON.stringify([userId, kind, id]);
}

const DB_NAME = "sydney-chat-appearance";
const STORE_NAME = "settings";
const RECORD_KEY = "appearance";
const listeners = new Set<() => void>();
let saved = EMPTY_CHAT_APPEARANCE;
let current = saved;
let loadPromise: Promise<void> | undefined;

function notify() {
  for (const listener of listeners) listener();
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("浏览器本地存储不可用"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地存储"));
    request.onblocked = () => reject(new Error("本地存储被其他页面占用"));
  });
}

async function readSaved(): Promise<ChatAppearance> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(RECORD_KEY);
      let result = EMPTY_CHAT_APPEARANCE;
      let invalid = false;
      request.onsuccess = () => {
        const parsed = appearanceSchema.safeParse(request.result);
        if (request.result === undefined) return;
        if (!parsed.success) {
          invalid = true;
          transaction.abort();
          return;
        }
        result = normalizeAppearance(parsed.data);
        if (
          Object.hasOwn(request.result, "bubbles") ||
          Object.hasOwn(request.result, "bubbleId") ||
          Object.hasOwn(request.result, "combinations")
        ) {
          store.put(result, RECORD_KEY);
        }
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () =>
        reject(
          invalid
            ? new Error("已保存的聊天外观数据无效")
            : (transaction.error ?? new Error("无法清理聊天外观")),
        );
      transaction.onerror = () => reject(transaction.error ?? new Error("无法清理聊天外观"));
    });
  } finally {
    database.close();
  }
}

export function loadChatAppearance(): Promise<void> {
  if (!loadPromise) {
    loadPromise = readSaved()
      .then((value) => {
        saved = value;
        current = value;
        notify();
      })
      .catch((error: unknown) => {
        loadPromise = undefined;
        throw error;
      });
  }
  return loadPromise;
}

export async function saveChatAppearance(value: ChatAppearance): Promise<void> {
  const normalized = normalizeAppearance(appearanceSchema.parse(value));
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(normalized, RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error("无法保存聊天外观"));
      transaction.onerror = () => reject(transaction.error ?? new Error("无法保存聊天外观"));
    });
    saved = normalized;
    current = normalized;
    notify();
  } finally {
    database.close();
  }
}

export function previewChatAppearance(value: ChatAppearance) {
  current = normalizeAppearance(value);
  notify();
}

export function cancelChatAppearancePreview() {
  current = saved;
  notify();
}

export function getSavedChatAppearance(): ChatAppearance {
  return saved;
}

export function useChatAppearance(): ChatAppearance {
  useEffect(() => {
    void loadChatAppearance().catch(() => undefined);
  }, []);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => EMPTY_CHAT_APPEARANCE,
  );
}

export async function validateBackgroundImage(file: File): Promise<void> {
  if (file.size === 0 || file.size > 5 * 1024 * 1024) throw new Error("请选择不超过 5 MB 的图片");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png =
    file.type === "image/png" &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const jpeg =
    file.type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    file.type === "image/webp" &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!png && !jpeg && !webp) throw new Error("仅支持 PNG、JPEG 或 WebP 图片");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth * image.naturalHeight > 40_000_000) {
      throw new Error("图片尺寸过大");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "图片尺寸过大") throw error;
    throw new Error("图片无法解码，请选择有效的图片文件");
  } finally {
    URL.revokeObjectURL(url);
  }
}
