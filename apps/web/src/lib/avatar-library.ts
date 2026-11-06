import { useEffect, useSyncExternalStore } from "react";

export interface BuiltInAvatar {
  id: string;
  name: string;
  src: string;
}

export interface SavedAvatar {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: number;
}

export const BUILT_IN_AVATARS: readonly BuiltInAvatar[] = [
  { id: "lilac-dragon", name: "紫晶", src: "/avatar-library/lilac-dragon.webp" },
  { id: "orange-flower", name: "橙花", src: "/avatar-library/orange-flower.webp" },
  { id: "blue-maid", name: "蓝羽", src: "/avatar-library/blue-maid.webp" },
];

const DATABASE_NAME = "sydney-avatar-library";
const STORE_NAME = "avatars";
const listeners = new Set<() => void>();
let savedAvatars: SavedAvatar[] = [];
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
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开头像库"));
    request.onblocked = () => reject(new Error("头像库被其他页面占用"));
  });
}

async function readSavedAvatars(): Promise<SavedAvatar[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        const records = Array.isArray(request.result) ? request.result : [];
        resolve(
          records.filter((item): item is SavedAvatar =>
            Boolean(
              item &&
                typeof item.id === "string" &&
                typeof item.name === "string" &&
                typeof item.dataUrl === "string" &&
                typeof item.createdAt === "number",
            ),
          ),
        );
      };
      request.onerror = () => reject(request.error ?? new Error("无法读取头像库"));
    });
  } finally {
    database.close();
  }
}

export function loadAvatarLibrary(): Promise<void> {
  if (!loadPromise) {
    loadPromise = readSavedAvatars()
      .then((value) => {
        savedAvatars = value.sort((left, right) => right.createdAt - left.createdAt);
        notify();
      })
      .catch(() => {
        savedAvatars = [];
      });
  }
  return loadPromise;
}

export function getSavedAvatars(): readonly SavedAvatar[] {
  return savedAvatars;
}

export function subscribeAvatarLibrary(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAvatarLibrary(): readonly SavedAvatar[] {
  useEffect(() => {
    void loadAvatarLibrary();
  }, []);
  return useSyncExternalStore(subscribeAvatarLibrary, getSavedAvatars, () => []);
}

export async function saveAvatarToLibrary(
  dataUrl: string,
  name = "我的头像",
): Promise<SavedAvatar> {
  await loadAvatarLibrary();
  const avatar: SavedAvatar = {
    id: `avatar-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    name: `${name} ${savedAvatars.length + 1}`,
    dataUrl,
    createdAt: Date.now(),
  };
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(avatar);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("无法保存头像"));
      transaction.onabort = () => reject(transaction.error ?? new Error("无法保存头像"));
    });
  } finally {
    database.close();
  }
  savedAvatars = [avatar, ...savedAvatars];
  notify();
  return avatar;
}

export async function removeAvatarFromLibrary(id: string): Promise<void> {
  await loadAvatarLibrary();
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("无法删除头像"));
      transaction.onabort = () => reject(transaction.error ?? new Error("无法删除头像"));
    });
  } finally {
    database.close();
  }
  savedAvatars = savedAvatars.filter((avatar) => avatar.id !== id);
  notify();
}

export async function avatarSourceToDataUrl(source: string): Promise<string> {
  if (source.startsWith("data:image/")) return source;
  const builtIn = BUILT_IN_AVATARS.some((avatar) => avatar.src === source);
  if (!builtIn) throw new Error("头像素材不可用");
  const response = await fetch(source);
  if (!response.ok) throw new Error("无法读取头像素材");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("无法读取头像素材"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("无法读取头像素材"));
    reader.readAsDataURL(blob);
  });
}
