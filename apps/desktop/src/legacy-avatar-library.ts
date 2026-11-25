import type { BrowserWindow, Session } from "electron";
import { readLegacyStorage } from "./legacy-sidebar-density.js";

const readAvatars = String.raw`async (userId) => {
  if (localStorage.getItem("rakazo.signedInUser") !== userId) return null;
  if (!(await indexedDB.databases()).some((database) => database.name === "sydney-avatar-library"))
    return [];
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("sydney-avatar-library", 1);
    open.onupgradeneeded = () => open.transaction?.abort();
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction("avatars", "readonly");
      const cursor = transaction.objectStore("avatars").openCursor();
      const records = [];
      let size = 0;
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        const { id, name, dataUrl, createdAt } = entry.value ?? {};
        if (
          typeof id === "string" &&
          id.length > 0 &&
          id.length <= 100 &&
          typeof name === "string" &&
          name.length <= 256 &&
          typeof createdAt === "number" &&
          Number.isFinite(createdAt) &&
          typeof dataUrl === "string" &&
          dataUrl.length <= 4_000_000 &&
          /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)
        ) {
          size += dataUrl.length;
          if (size > 24_000_000 || records.length >= 1000) {
            transaction.abort();
            return;
          }
          records.push({ id, name, dataUrl, createdAt });
        }
        entry.continue();
      };
      transaction.oncomplete = () => {
        database.close();
        resolve(records);
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
}`;

const importAvatars = `async (origin, userId, records) => {
  const marker = "sydney.migration.avatarLibrary.v1." + userId;
  const matches = () =>
    location.origin === origin && localStorage.getItem("rakazo.signedInUser") === userId;
  if (!matches() || localStorage.getItem(marker) !== null) return false;
  if (records.length === 0) return false;
  const imported = await new Promise((resolve, reject) => {
    const open = indexedDB.open("sydney-avatar-library", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("avatars", { keyPath: "id" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction("avatars", "readwrite");
      const store = transaction.objectStore("avatars");
      let added = 0;
      for (const record of records) {
        const existing = store.getKey(record.id);
        existing.onsuccess = () => {
          if (!matches()) {
            transaction.abort();
            return;
          }
          if (existing.result === undefined) {
            store.add(record);
            added++;
          }
        };
      }
      transaction.oncomplete = () => {
        database.close();
        resolve(added);
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
  if (matches()) localStorage.setItem(marker, "1");
  return imported > 0;
}`;

const readAppearance = `async (userId) => {
  if (localStorage.getItem("rakazo.signedInUser") !== userId) return null;
  if (!(await indexedDB.databases()).some((item) => item.name === "sydney-chat-appearance"))
    return null;
  const value = await new Promise((resolve, reject) => {
    const open = indexedDB.open("sydney-chat-appearance", 1);
    open.onupgradeneeded = () => open.transaction.abort();
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction("settings");
      const read = transaction.objectStore("settings").get("appearance");
      transaction.oncomplete = () => { database.close(); resolve(read.result); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  });
  if (!value || !Array.isArray(value.backgrounds) || value.backgrounds.length > 100) return null;
  const { mode, userTextColor, botTextColor, backgroundId, surfaceOpacity, bubble } = value;
  const id = (item) => typeof item === "string" && item.length > 0 && item.length <= 100;
  const color = (item) => typeof item === "string" && /^#[0-9a-f]{6}$/i.test(item);
  const integer = (item, max) => Number.isInteger(item) && item >= 0 && item <= max;
  const number = (item, max) => typeof item === "number" && item >= 0 && item <= max;
  if ((mode !== undefined && mode !== "simple" && mode !== "custom") ||
    (userTextColor != null && !color(userTextColor)) ||
    (botTextColor != null && !color(botTextColor)) ||
    (backgroundId !== null && !id(backgroundId)) ||
    (surfaceOpacity !== undefined && !integer(surfaceOpacity, 100)) ||
    (bubble != null && (!color(bubble.userBackground) || !color(bubble.userForeground) ||
      !color(bubble.botBackground) || !color(bubble.botForeground) ||
      !number(bubble.radius, 40) || !number(bubble.opacity, 1)))) return null;
  const backgrounds = [];
  let total = 0;
  for (const item of value.backgrounds) {
    if (!item || !id(item.id) || typeof item.name !== "string" || item.name.length > 80 ||
      (item.fit !== "cover" && item.fit !== "contain") ||
      !integer(item.opacity, 100) || !integer(item.overlay, 80) || !(item.image instanceof Blob) ||
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(item.image.type)) return null;
    total += item.image.size;
    if (total > 8_000_000) return null;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(item.image);
    });
    backgrounds.push({ id: item.id, name: item.name, fit: item.fit, opacity: item.opacity,
      overlay: item.overlay, dataUrl });
  }
  return { mode, userTextColor, botTextColor, backgroundId, surfaceOpacity, bubble, backgrounds };
}`;

const importAppearance = `async (origin, userId, value) => {
  const matches = () => location.origin === origin &&
    localStorage.getItem("rakazo.signedInUser") === userId;
  const marker = "sydney.migration.chatAppearance.v1." + userId;
  if (!matches() || localStorage.getItem(marker) !== null) return false;
  const backgrounds = value.backgrounds.map(({ dataUrl, ...background }) => {
    const separator = dataUrl.indexOf(",");
    const mime = dataUrl.slice(5, separator - 7);
    const bytes = Uint8Array.from(atob(dataUrl.slice(separator + 1)), (character) => character.charCodeAt(0));
    return { ...background, image: new Blob([bytes], { type: mime }) };
  });
  const imported = await new Promise((resolve, reject) => {
    const open = indexedDB.open("sydney-chat-appearance", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("settings");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction("settings", "readwrite");
      const store = transaction.objectStore("settings");
      const existing = store.get("appearance");
      let added = false;
      existing.onsuccess = () => {
        if (!matches()) { transaction.abort(); return; }
        if (existing.result === undefined) {
          store.add({ ...value, backgrounds }, "appearance");
          added = true;
          return;
        }
        const current = existing.result;
        if (!Array.isArray(current?.backgrounds)) return;
        const ids = new Set(current.backgrounds.map((background) => background?.id));
        const missing = backgrounds.filter((background) => !ids.has(background.id))
          .slice(0, Math.max(0, 100 - current.backgrounds.length));
        if (missing.length === 0) return;
        store.put({ ...current, backgrounds: [...current.backgrounds, ...missing] }, "appearance");
        added = true;
      };
      transaction.oncomplete = () => { database.close(); resolve(added); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  });
  if (matches()) localStorage.setItem(marker, "1");
  return imported;
}`;

export async function migrateLegacyAppearance(
  source: Session,
  remoteOrigin: string,
  target: BrowserWindow,
  uiOrigin: string,
  userId: string,
): Promise<boolean> {
  const value = await readLegacyStorage(
    source,
    remoteOrigin,
    `(${readAppearance})(${JSON.stringify(userId)})`,
  );
  if (!value || target.isDestroyed()) return false;
  return target.webContents.executeJavaScript(
    `(${importAppearance})(${JSON.stringify(uiOrigin)}, ${JSON.stringify(userId)}, ${JSON.stringify(value)})`,
  );
}

export async function migrateLegacyAvatars(
  source: Session,
  remoteOrigin: string,
  target: BrowserWindow,
  uiOrigin: string,
  userId: string,
): Promise<boolean> {
  const marker = `sydney.migration.avatarLibrary.v1.${userId}`;
  if (
    await target.webContents.executeJavaScript(
      `localStorage.getItem(${JSON.stringify(marker)}) !== null`,
    )
  )
    return false;
  const records = await readLegacyStorage(
    source,
    remoteOrigin,
    `(${readAvatars})(${JSON.stringify(userId)})`,
  );
  if (!Array.isArray(records) || records.length === 0 || target.isDestroyed()) return false;
  return target.webContents.executeJavaScript(
    `(${importAvatars})(${JSON.stringify(uiOrigin)}, ${JSON.stringify(userId)}, ${JSON.stringify(records)})`,
  );
}
