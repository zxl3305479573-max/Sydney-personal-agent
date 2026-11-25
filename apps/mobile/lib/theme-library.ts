import { Directory, File, Paths } from "expo-file-system";
import { Image } from "react-native";
import type { ThemeRepository } from "./theme-manager";
import type { ThemePackV1 } from "./theme-pack";
import {
  isBuiltInTheme,
  parseThemePack,
  THEME_FILE_MAX_BYTES,
  themeImageDimensions,
} from "./theme-pack";
import { themeManager } from "./theme-state";

function directory() {
  return new Directory(Paths.document, "sydney-themes-v1");
}

function fileFor(id: string, extension = "json") {
  if (!/^[a-z][a-z0-9-]{0,47}$/.test(id) || isBuiltInTheme(id))
    throw new Error("Invalid local theme ID");
  return new File(directory(), `${id}.${extension}`);
}

export async function verifyThemeImages(pack: ThemePackV1) {
  for (const uri of Object.values(pack.assets ?? {})) {
    const expected = themeImageDimensions(uri);
    await new Promise<void>((resolve, reject) => {
      Image.getSize(
        uri,
        (width, height) => {
          if (width !== expected.width || height !== expected.height)
            reject(new Error("Background dimensions do not match the image"));
          else resolve();
        },
        () => reject(new Error("The background image could not be decoded")),
      );
    });
  }
}

export const themeRepository: ThemeRepository = {
  async list() {
    const root = directory();
    if (!root.exists) return [];
    const packs: ThemePackV1[] = [];
    for (const entry of root.list()) {
      if (!(entry instanceof File)) continue;
      if (entry.name.endsWith(".bak")) {
        const id = entry.name.slice(0, -4);
        if (/^[a-z][a-z0-9-]{0,47}$/.test(id) && !isBuiltInTheme(id)) {
          const current = fileFor(id);
          if (!current.exists) entry.moveSync(current);
        }
      }
    }
    for (const entry of root.list()) {
      if (
        !(entry instanceof File) ||
        !entry.name.endsWith(".json") ||
        entry.size > THEME_FILE_MAX_BYTES
      )
        continue;
      try {
        const pack = parseThemePack(await entry.text());
        if (entry.name !== `${pack.id}.json`) continue;
        await verifyThemeImages(pack);
        packs.push(pack);
      } catch {}
    }
    return packs;
  },
  async save(input) {
    const pack = parseThemePack(input);
    await verifyThemeImages(pack);
    const root = directory();
    root.create({ intermediates: true, idempotent: true });
    const current = fileFor(pack.id);
    const temporary = fileFor(pack.id, "tmp");
    const backup = fileFor(pack.id, "bak");
    try {
      temporary.write(JSON.stringify(pack));
      if (backup.exists) backup.delete();
      if (current.exists) current.moveSync(backup);
      temporary.moveSync(current);
      if (backup.exists) backup.delete();
    } catch (error) {
      if (!current.exists && backup.exists) backup.moveSync(current);
      throw error;
    } finally {
      if (temporary.exists) temporary.delete();
    }
  },
  async remove(id) {
    const file = fileFor(id);
    if (file.exists) file.delete();
  },
};

export async function loadInstalledThemes() {
  await themeManager.load(themeRepository);
}

export async function pickThemePack(): Promise<ThemePackV1 | null> {
  const DocumentPicker = await import("expo-document-picker");
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "public.json", "public.data"],
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const file = new File(asset.uri);
  try {
    if (!asset.name.endsWith(".sydney-theme.json"))
      throw new Error("Select a .sydney-theme.json file");
    if (file.size > THEME_FILE_MAX_BYTES) throw new Error("Theme file exceeds 10 MiB");
    const pack = parseThemePack(await file.text());
    await verifyThemeImages(pack);
    return pack;
  } finally {
    if (file.uri.startsWith(Paths.cache.uri) && file.exists) file.delete();
  }
}
