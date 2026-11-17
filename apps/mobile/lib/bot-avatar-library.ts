import { BOT_AVATAR_VALUE_MAX_LENGTH, isBotAvatarValue } from "@rakazo/contracts";
import { newClientId } from "@rakazo/core";
import { Directory, File, Paths } from "expo-file-system";

export type SavedBotAvatar = {
  id: string;
  dataUrl: string;
  createdAt: number;
};

const MAX_AVATARS = 40;
const ID_PATTERN = /^avatar-[a-zA-Z0-9-]+$/;

function directory() {
  return new Directory(Paths.document, "sydney-bot-avatars");
}

function validAvatar(value: unknown): value is SavedBotAvatar {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SavedBotAvatar>;
  return typeof record.id === "string" &&
    ID_PATTERN.test(record.id) &&
    typeof record.createdAt === "number" &&
    Number.isFinite(record.createdAt) &&
    typeof record.dataUrl === "string" &&
    record.dataUrl.startsWith("data:image/") &&
    record.dataUrl.length <= BOT_AVATAR_VALUE_MAX_LENGTH &&
    isBotAvatarValue(record.dataUrl);
}

export async function loadBotAvatarLibrary(): Promise<SavedBotAvatar[]> {
  const root = directory();
  if (!root.exists) return [];
  const avatars: SavedBotAvatar[] = [];
  for (const entry of root.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith(".json")) continue;
    if (entry.size > BOT_AVATAR_VALUE_MAX_LENGTH + 1024) continue;
    const text = await entry.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    if (validAvatar(parsed) && entry.name === `${parsed.id}.json`) avatars.push(parsed);
  }
  return avatars.sort((left, right) => right.createdAt - left.createdAt);
}

export async function saveBotAvatar(dataUrl: string): Promise<SavedBotAvatar> {
  const existing = await loadBotAvatarLibrary();
  if (existing.length >= MAX_AVATARS) throw new Error("Avatar library is full");
  const avatar = { id: `avatar-${newClientId()}`, dataUrl, createdAt: Date.now() };
  if (!validAvatar(avatar)) throw new Error("Invalid avatar");
  const root = directory();
  root.create({ intermediates: true, idempotent: true });
  const file = new File(root, `${avatar.id}.json`);
  const temporary = new File(root, `${avatar.id}.tmp`);
  temporary.create();
  try {
    temporary.write(JSON.stringify(avatar));
    temporary.moveSync(file);
  } catch (error) {
    if (temporary.exists) temporary.delete();
    throw error;
  }
  return avatar;
}

export function removeBotAvatar(id: string): void {
  if (!ID_PATTERN.test(id)) throw new Error("Invalid avatar");
  const file = new File(directory(), `${id}.json`);
  if (file.exists) file.delete();
}
