import type { BotAvatarSet } from "@rakazo/contracts";

export type BotNotificationBannerItem = {
  id: string;
  notificationId?: string;
  kind: string;
  botId: string;
  botName: string;
  botColor: string;
  botAvatarSet?: BotAvatarSet | null;
  body: string;
  spaceId?: string;
  threadId?: string;
  groupId?: string;
  createdAt: number;
};

const DEDUPE_WINDOW_MS = 3_000;

let activeBanner: BotNotificationBannerItem | null = null;
let hostCount = 0;
let lastDeliveredId: string | null = null;
let lastDeliveredAt = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Keep other subscribers healthy.
    }
  }
}

export function registerBotNotificationBannerHost(): () => void {
  hostCount += 1;
  return () => {
    hostCount = Math.max(0, hostCount - 1);
  };
}

export function hasActiveBotNotificationBannerHost(): boolean {
  return hostCount > 0;
}

export function presentBotNotificationBanner(item: BotNotificationBannerItem): void {
  const now = item.createdAt || Date.now();
  if (item.id && item.id === lastDeliveredId && now - lastDeliveredAt < DEDUPE_WINDOW_MS) {
    return;
  }
  lastDeliveredId = item.id;
  lastDeliveredAt = now;
  activeBanner = item;
  emit();
}

export function dismissBotNotificationBanner(id?: string): void {
  if (!activeBanner) return;
  if (id && activeBanner.id !== id) return;
  activeBanner = null;
  emit();
}

export function getActiveBotNotificationBanner(): BotNotificationBannerItem | null {
  return activeBanner;
}

export function subscribeBotNotificationBanner(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetBotNotificationBannerStateForTest(): void {
  activeBanner = null;
  hostCount = 0;
  lastDeliveredId = null;
  lastDeliveredAt = 0;
  listeners.clear();
}
