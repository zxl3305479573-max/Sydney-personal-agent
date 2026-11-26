import type { BotAvatarSet } from "@rakazo/contracts";

export type BotNotificationProfile = {
  botId: string;
  name?: string;
  color?: string;
  avatarSet?: BotAvatarSet | null;
};

export type BotProfileLike = {
  id: string;
  name?: string | null;
  color?: string | null;
  avatarSet?: BotAvatarSet | null;
};

const profiles = new Map<string, BotNotificationProfile>();

export function registerBotNotificationProfiles(bots: ReadonlyArray<BotProfileLike>): void {
  for (const bot of bots) {
    const botId = bot.id?.trim();
    if (!botId) continue;
    const prev = profiles.get(botId);
    const name = bot.name?.trim() || prev?.name;
    const color = bot.color?.trim() || prev?.color;
    const avatarSet = bot.avatarSet !== undefined ? bot.avatarSet : prev?.avatarSet;
    profiles.set(botId, {
      botId,
      ...(name ? { name } : {}),
      ...(color ? { color } : {}),
      ...(avatarSet !== undefined ? { avatarSet } : {}),
    });
  }
}

export function getBotNotificationProfile(botId: string): BotNotificationProfile | null {
  const key = botId.trim();
  if (!key) return null;
  return profiles.get(key) ?? null;
}

export function resolveBotNotificationProfile(
  botId: string,
  fallback?: Partial<Omit<BotNotificationProfile, "botId">>,
): BotNotificationProfile {
  const key = botId.trim();
  const stored = key ? profiles.get(key) : undefined;
  const name = fallback?.name?.trim() || stored?.name;
  const color = fallback?.color?.trim() || stored?.color;
  const avatarSet =
    fallback?.avatarSet !== undefined && fallback.avatarSet !== null
      ? fallback.avatarSet
      : stored?.avatarSet;
  return {
    botId: key,
    ...(name ? { name } : {}),
    ...(color ? { color } : {}),
    ...(avatarSet !== undefined ? { avatarSet } : {}),
  };
}

export function clearBotNotificationProfiles(): void {
  profiles.clear();
}
