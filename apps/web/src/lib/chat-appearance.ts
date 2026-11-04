import { useEffect, useSyncExternalStore } from "react";
import { z } from "zod";

export type ChatBackground = {
  id: string;
  name: string;
  image: Blob;
  fit: "cover" | "contain";
  opacity: number;
  overlay: number;
};

export type BubbleSide = {
  background: string;
  foreground: string;
  opacity: number;
  radius: number;
  border: string;
};

export type ChatBubbleStyle = {
  id: string;
  name: string;
  user: BubbleSide;
  bot: BubbleSide;
};

export type ChatCombination = {
  id: string;
  name: string;
  backgroundId: string | null;
  bubbleId: string | null;
};

export type ChatAppearance = {
  backgrounds: ChatBackground[];
  bubbles: ChatBubbleStyle[];
  combinations: ChatCombination[];
  backgroundId: string | null;
  bubbleId: string | null;
};

export const EMPTY_CHAT_APPEARANCE: ChatAppearance = {
  backgrounds: [],
  bubbles: [],
  combinations: [],
  backgroundId: null,
  bubbleId: null,
};

const idSchema = z.string().min(1).max(100);
const nameSchema = z.string().max(80);
const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
const bubbleSideSchema = z.object({
  background: colorSchema,
  foreground: colorSchema,
  border: colorSchema,
  opacity: z.number().int().min(20).max(100),
  radius: z.number().int().min(0).max(32),
});
const appearanceSchema = z.object({
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
  bubbles: z
    .array(
      z.object({ id: idSchema, name: nameSchema, user: bubbleSideSchema, bot: bubbleSideSchema }),
    )
    .max(100),
  combinations: z
    .array(
      z.object({
        id: idSchema,
        name: nameSchema,
        backgroundId: idSchema.nullable(),
        bubbleId: idSchema.nullable(),
      }),
    )
    .max(100),
  backgroundId: idSchema.nullable(),
  bubbleId: idSchema.nullable(),
});

export function newBubbleStyle(): ChatBubbleStyle {
  return {
    id: crypto.randomUUID(),
    name: "新气泡样式",
    user: {
      background: "#dbeafe",
      foreground: "#172554",
      opacity: 100,
      radius: 20,
      border: "#93c5fd",
    },
    bot: {
      background: "#f3f4f6",
      foreground: "#1f2937",
      opacity: 100,
      radius: 20,
      border: "#d1d5db",
    },
  };
}

export function normalizeAppearance(value: ChatAppearance): ChatAppearance {
  const backgrounds = value.backgrounds.filter((item) => item.image instanceof Blob);
  const bubbles = value.bubbles;
  const backgroundIds = new Set(backgrounds.map((item) => item.id));
  const bubbleIds = new Set(bubbles.map((item) => item.id));
  return {
    backgrounds,
    bubbles,
    combinations: value.combinations.map((item) => ({
      ...item,
      backgroundId:
        item.backgroundId && backgroundIds.has(item.backgroundId) ? item.backgroundId : null,
      bubbleId: item.bubbleId && bubbleIds.has(item.bubbleId) ? item.bubbleId : null,
    })),
    backgroundId:
      value.backgroundId && backgroundIds.has(value.backgroundId) ? value.backgroundId : null,
    bubbleId: value.bubbleId && bubbleIds.has(value.bubbleId) ? value.bubbleId : null,
  };
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
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => {
        const parsed = appearanceSchema.safeParse(request.result);
        if (request.result === undefined) resolve(EMPTY_CHAT_APPEARANCE);
        else if (parsed.success) resolve(normalizeAppearance(parsed.data));
        else reject(new Error("已保存的聊天外观数据无效"));
      };
      request.onerror = () => reject(request.error);
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
