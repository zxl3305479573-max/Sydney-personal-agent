import type { BotAvatarSet } from "@rakazo/contracts";
import { requireNativeModule } from "expo-modules-core";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  hasActiveBotNotificationBannerHost,
  presentBotNotificationBanner,
} from "./bot-notification-banner-state";
import { resolveBotNotificationProfile } from "./bot-notification-registry";
import { apiBaseWarning, normalizeApiBase } from "./endpoint";
import { getActiveUiLocale, t } from "./i18n";
import { getCachedNotificationPreferences } from "./notification-preferences-state";
import { serverHeaders } from "./server-headers";

export interface LiveNotificationSettings {
  liveConnection: boolean;
  messages: boolean;
  scheduledTasks: boolean;
  needsAttention: boolean;
}

export const DEFAULT_LIVE_NOTIFICATION_SETTINGS: LiveNotificationSettings = {
  liveConnection: false,
  messages: true,
  scheduledTasks: true,
  needsAttention: true,
};

type NativeNotifications = {
  getSettings(): Promise<LiveNotificationSettings>;
  setSettings(
    settings: LiveNotificationSettings,
    endpoint: string,
    token: string,
    spaceId: string,
    locale: string,
    headers: string,
  ): Promise<void>;
  resume(
    endpoint: string,
    token: string,
    spaceId: string,
    locale: string,
    headers: string,
  ): Promise<void>;
  /** Missing on native builds that predate pending reply invalidation. */
  resumeAfterMute?(
    endpoint: string,
    token: string,
    spaceId: string,
    locale: string,
    headers: string,
    botId: string,
  ): Promise<void>;
  stop(clearSession: boolean): Promise<void>;
  setOpenThread(botId: string | null, threadId: string | null): Promise<void>;
  openSettings(): Promise<void>;
  canPostPromotedNotifications(): Promise<boolean>;
  openPromotedSettings(): Promise<void>;
  /** Missing on native builds that predate the check. */
  hasPromotedSettings?: () => boolean;
};

const nativeNotifications =
  Platform.OS === "android"
    ? requireNativeModule<NativeNotifications>("RakazoNotifications")
    : null;

export type NotificationThreadTarget = { botId?: string; threadId?: string; groupId?: string };

let openThread: NotificationThreadTarget | null = null;
let lastConfirmed: NotificationThreadTarget | null = null;
let hasConfirmed = false;
let pendingReports = 0;
let reportSeq = 0;
let foregroundHandlerConfigured = false;

export function notificationTargetsThread(
  data: Record<string, unknown> | null | undefined,
  target: NotificationThreadTarget | null,
): boolean {
  if (!data || !target) return false;
  const dataThreadId = data.threadId ?? data["rakazo.threadId"];
  if (target.threadId && dataThreadId) return dataThreadId === target.threadId;
  const dataGroupId = data.groupId ?? data["rakazo.groupId"];
  if (target.groupId) return dataGroupId === target.groupId;
  // A bot's own chat, not a group it posted in.
  return Boolean(
    target.botId &&
      !dataGroupId &&
      (data.botId === target.botId || data["rakazo.botId"] === target.botId),
  );
}

function parseNotificationAvatarSet(value: unknown): BotAvatarSet | undefined {
  return value === "organic" || value === "rakazo" || value === "fluid" ? value : undefined;
}

export function configureForegroundNotifications(): void {
  if (foregroundHandlerConfigured) return;
  foregroundHandlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async ({ request }) => {
      const prefs = getCachedNotificationPreferences();
      const data = request.content.data;
      const kind = typeof data?.kind === "string" ? data.kind : undefined;
      if (kind === "test") {
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: prefs.sound,
          shouldSetBadge: false,
        };
      }
      const categoryAllowed =
        kind === "completion"
          ? prefs.completions
          : kind === "help" ||
              kind === "takeover" ||
              kind === "failure" ||
              kind === "approval" ||
              kind === "question" ||
              kind === "attention"
            ? prefs.needsAttention
            : prefs.messages;
      const show = prefs.enabled && categoryAllowed && !notificationTargetsThread(data, openThread);
      if (show && hasActiveBotNotificationBannerHost()) {
        const record =
          data && typeof data === "object" && !Array.isArray(data)
            ? (data as Record<string, unknown>)
            : null;
        const rawBotId = record ? (record.botId ?? record["rakazo.botId"]) : undefined;
        const botId = typeof rawBotId === "string" ? rawBotId.trim() : "";
        if (botId) {
          const rawName = record ? (record.name ?? record["rakazo.name"]) : undefined;
          const rawColor = record ? record.botColor : undefined;
          const rawSpaceId = record ? (record.spaceId ?? record["rakazo.spaceId"]) : undefined;
          const rawThreadId = record ? (record.threadId ?? record["rakazo.threadId"]) : undefined;
          const rawGroupId = record ? (record.groupId ?? record["rakazo.groupId"]) : undefined;
          const rawDeliveryId = record ? record.deliveryId : undefined;
          const title =
            typeof request.content.title === "string" ? request.content.title.trim() : "";
          const body = typeof request.content.body === "string" ? request.content.body.trim() : "";
          const profile = resolveBotNotificationProfile(botId, {
            name:
              typeof rawName === "string" && rawName.trim() ? rawName.trim() : title || undefined,
            color: typeof rawColor === "string" && rawColor.trim() ? rawColor.trim() : undefined,
            avatarSet: parseNotificationAvatarSet(record?.botAvatarSet),
          });
          presentBotNotificationBanner({
            id:
              typeof rawDeliveryId === "string" && rawDeliveryId.trim()
                ? rawDeliveryId.trim()
                : request.identifier || `${botId}:${Date.now()}`,
            notificationId: request.identifier || undefined,
            kind: kind ?? "message",
            botId,
            botName: profile.name || title || "Sydney",
            botColor: profile.color || "#4F7CAC",
            botAvatarSet: profile.avatarSet ?? null,
            body: body || title,
            ...(typeof rawSpaceId === "string" && rawSpaceId.trim()
              ? { spaceId: rawSpaceId.trim() }
              : {}),
            ...(typeof rawThreadId === "string" && rawThreadId.trim()
              ? { threadId: rawThreadId.trim() }
              : {}),
            ...(typeof rawGroupId === "string" && rawGroupId.trim()
              ? { groupId: rawGroupId.trim() }
              : {}),
            createdAt: Date.now(),
          });
          return {
            shouldShowBanner: false,
            shouldShowList: true,
            shouldPlaySound: prefs.sound,
            shouldSetBadge: false,
          };
        }
      }
      return {
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: show && prefs.sound,
        shouldSetBadge: false,
      };
    },
  });
}

export async function getLiveNotificationSettings(): Promise<LiveNotificationSettings> {
  return nativeNotifications?.getSettings() ?? DEFAULT_LIVE_NOTIFICATION_SETTINGS;
}

export async function setLiveNotificationSettings(
  settings: LiveNotificationSettings,
  endpoint: string,
  token: string,
  spaceId: string,
): Promise<void> {
  if (!nativeNotifications) return;
  const parsed = normalizeApiBase(endpoint);
  if (!parsed.ok) throw new Error(parsed.error);
  const endpointWarning = apiBaseWarning(parsed.url);
  if (endpointWarning) throw new Error(endpointWarning);
  if (settings.liveConnection) {
    const existing = await Notifications.getPermissionsAsync();
    const granted = existing.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) throw new Error(t("Android blocked notifications."));
  }
  await nativeNotifications.setSettings(
    settings,
    parsed.url,
    token,
    spaceId,
    getActiveUiLocale(),
    nativeServerHeaders(parsed.url),
  );
}

export async function resumeLiveNotifications(
  endpoint: string,
  token: string,
  spaceId: string,
  mutedBotId?: string,
): Promise<void> {
  if (!nativeNotifications || !token) return;
  const parsed = normalizeApiBase(endpoint);
  if (!parsed.ok || apiBaseWarning(parsed.url)) return;
  const headers = nativeServerHeaders(parsed.url);
  if (mutedBotId && nativeNotifications.resumeAfterMute) {
    await nativeNotifications.resumeAfterMute(
      parsed.url,
      token,
      spaceId,
      getActiveUiLocale(),
      headers,
      mutedBotId,
    );
  } else {
    await nativeNotifications.resume(parsed.url, token, spaceId, getActiveUiLocale(), headers);
  }
}

/** The Android poller calls the server itself, so it needs the server's headers too. */
function nativeServerHeaders(apiBase: string): string {
  const headers = serverHeaders(apiBase);
  return Object.keys(headers).length ? JSON.stringify(headers) : "";
}

export async function stopLiveNotifications(clearSession = false): Promise<void> {
  // Android's native service clears delivered notifications itself.
  if (nativeNotifications) await nativeNotifications.stop(clearSession);
  else if (clearSession) await Notifications.dismissAllNotificationsAsync();
}

export async function setOpenNotificationThread(
  target: NotificationThreadTarget | null,
): Promise<void> {
  // Each native call restarts the Android poller, which re-posts live notifications.
  // The foreground handler reads openThread immediately. Native is skipped only
  // for the last target it accepted when no report is pending, so overlapping
  // changes reach native and a rejection stays eligible for retry.
  openThread = target;
  if (
    pendingReports === 0 &&
    hasConfirmed &&
    lastConfirmed?.botId === target?.botId &&
    lastConfirmed?.threadId === target?.threadId
  ) {
    return;
  }
  const seq = ++reportSeq;
  pendingReports += 1;
  try {
    await nativeNotifications?.setOpenThread(target?.botId ?? null, target?.threadId ?? null);
    if (seq === reportSeq) {
      lastConfirmed = target;
      hasConfirmed = true;
    }
  } catch (error) {
    // An overlapping report may still change native state after this failure.
    hasConfirmed = false;
    throw error;
  } finally {
    pendingReports -= 1;
  }
}

export async function dismissThreadNotifications(target: NotificationThreadTarget): Promise<void> {
  if (!target.botId && !target.threadId && !target.groupId) return;
  const presented = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    presented
      .filter(({ request }) => {
        const data = request.content.data ?? {};
        return notificationTargetsThread(data, target);
      })
      .map(({ request }) => Notifications.dismissNotificationAsync(request.identifier)),
  );
}

/** Brings this device in line after a chat's notifications were turned on or off. */
export async function afterChatNotifyChange(
  endpoint: string,
  token: string,
  spaceId: string,
  change: { botId: string; threadId?: string; notify: boolean },
): Promise<void> {
  // Android also discards replies retained before this bot's own chat was muted.
  await resumeLiveNotifications(
    endpoint,
    token,
    spaceId,
    change.notify ? undefined : change.botId,
  ).catch(() => undefined);
  if (!change.notify && change.threadId) {
    await dismissThreadNotifications({ threadId: change.threadId }).catch(() => undefined);
  }
}

export async function openLiveNotificationSettings(): Promise<void> {
  await nativeNotifications?.openSettings();
}

export async function canPostPromotedNotifications(): Promise<boolean> {
  return nativeNotifications?.canPostPromotedNotifications() ?? true;
}

/**
 * Android's own live update screen arrived in Android 16 and some devices
 * still lack it. Without it, the row would open general notification settings.
 */
export function hasLiveUpdateSettings(): boolean {
  if (!nativeNotifications) return false;
  if (typeof nativeNotifications.hasPromotedSettings === "function") {
    return nativeNotifications.hasPromotedSettings();
  }
  return typeof Platform.Version === "number" && Platform.Version >= 36;
}

export async function openPromotedNotificationSettings(): Promise<void> {
  await nativeNotifications?.openPromotedSettings();
}
