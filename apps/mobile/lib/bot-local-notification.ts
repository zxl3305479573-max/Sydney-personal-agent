import type { BotAvatarSet } from "@rakazo/contracts";
import { botColors } from "@rakazo/ui-tokens";
import { Platform } from "react-native";
import { resolveBotNotificationProfile } from "./bot-notification-registry";
import { companionAvatar } from "./companion-avatar";
import { companionPresentation } from "./companion-presentation";
import { getActiveCompanionSession } from "./companion-session-state";

const FALLBACK_COLOR = botColors[3];

export type BotLocalNotificationInput = {
  kind: "message" | "attention";
  botId: string;
  botName: string;
  botColor?: string;
  botAvatarSet?: BotAvatarSet | null;
  spaceId?: string | null;
  threadId?: string;
  groupId?: string;
  title?: string;
  body: string;
  deliveryId: string;
  playSound: boolean;
};

type NativeBotNotificationModule = {
  supportsBotNotifications?: () => boolean;
  scheduleBotNotification?: (
    identifier: string,
    botId: string,
    botName: string,
    title: string,
    body: string,
    avatar: string | null,
    playSound: boolean,
    userInfo: Record<string, string>,
  ) => Promise<void>;
};

let nativeOverride: NativeBotNotificationModule | null | undefined;

function getNativeModule(): NativeBotNotificationModule | null {
  if (nativeOverride !== undefined) return nativeOverride;
  if (Platform.OS !== "ios") return null;
  const host = globalThis as {
    expo?: { modules?: { SydneyCompanion?: NativeBotNotificationModule } };
  };
  return host.expo?.modules?.SydneyCompanion ?? null;
}

export function setNativeBotNotificationModuleForTest(
  module: NativeBotNotificationModule | null | undefined,
): void {
  nativeOverride = module;
}

export function supportsNativeBotNotifications(): boolean {
  const mod = getNativeModule();
  if (!mod || typeof mod.scheduleBotNotification !== "function") return false;
  if (typeof mod.supportsBotNotifications === "function") {
    return Boolean(mod.supportsBotNotifications());
  }
  return true;
}

export async function deliverBotLocalNotification(input: BotLocalNotificationInput): Promise<void> {
  const companion = getActiveCompanionSession();
  const companionMatch = companion?.botId === input.botId ? companion : null;
  const profile = resolveBotNotificationProfile(input.botId, {
    name: input.botName || companionMatch?.botName,
    color: input.botColor || companionMatch?.botColor,
    avatarSet: input.botAvatarSet !== undefined ? input.botAvatarSet : companionMatch?.botAvatarSet,
  });

  const resolvedName = profile.name || input.botName || "Sydney";
  const resolvedColor = profile.color || FALLBACK_COLOR;
  const resolvedAvatarSet = profile.avatarSet ?? null;

  const bounded = companionPresentation({
    botName: resolvedName,
    status: "present",
    latestReply: input.body,
    showReply: true,
  });
  const title = input.title?.trim() || bounded.title;
  const body = bounded.reply ?? input.body;

  const data: Record<string, string> = {
    kind: input.kind === "attention" ? "attention" : "message",
    botId: input.botId,
    name: resolvedName,
    deliveryId: input.deliveryId,
    ...(input.spaceId ? { spaceId: input.spaceId } : {}),
    ...(input.threadId ? { threadId: input.threadId } : {}),
    ...(input.groupId ? { groupId: input.groupId } : {}),
    ...(resolvedColor ? { botColor: resolvedColor } : {}),
    ...(resolvedAvatarSet ? { botAvatarSet: resolvedAvatarSet } : {}),
  };

  if (supportsNativeBotNotifications()) {
    const mod = getNativeModule();
    if (mod?.scheduleBotNotification) {
      const encodedAvatar = companionAvatar({
        botId: input.botId,
        color: resolvedColor,
        avatarSet: resolvedAvatarSet,
      });
      try {
        await mod.scheduleBotNotification(
          input.deliveryId,
          input.botId,
          resolvedName,
          title,
          body,
          encodedAvatar,
          input.playSound,
          data,
        );
        return;
      } catch {
        // Fall through to expo-notifications if native scheduling fails.
      }
    }
  }

  const Notifications = await import("expo-notifications");
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: input.playSound ? "default" : false,
      data,
    },
    trigger: null,
  });
}
