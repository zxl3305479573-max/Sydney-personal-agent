import {
  BOT_AVATAR_VALUE_MAX_LENGTH,
  isBotAvatarValue,
  parseBotAvatarValue,
} from "@rakazo/contracts";
import { DEFAULT_BOT_AVATAR_DATA_URI } from "./default-bot-avatar";

export function companionAvatar(input: {
  botId: string;
  color: string;
  avatarSet?: string | null;
}): string | null {
  const trimmed = input.color.trim();
  const parsed = parseBotAvatarValue(trimmed);
  if (parsed.kind === "image") {
    return trimmed.length <= BOT_AVATAR_VALUE_MAX_LENGTH && isBotAvatarValue(trimmed)
      ? `r|${trimmed}`
      : null;
  }
  if (trimmed.startsWith("data:") || /^https?:\/\//i.test(trimmed)) {
    return null;
  }
  // All non-photo bots (legacy hex colors / shapes / empty) use the bundled 大肥鱼 default avatar.
  return `r|${DEFAULT_BOT_AVATAR_DATA_URI}`;
}
