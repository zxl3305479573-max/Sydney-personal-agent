import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getCachedNotificationPreferences,
  isNotificationPreferencesLoaded,
  type NotificationPreferences,
  normalizeNotificationPreferences,
  resetNotificationPreferencesStateForTest,
  setCachedNotificationPreferences,
  subscribeNotificationPreferences,
} from "./notification-preferences-state";
import { registerPushToken } from "./push";

export {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getCachedNotificationPreferences,
  isNotificationPreferencesLoaded,
  type NotificationPreferences,
  subscribeNotificationPreferences,
};

const STORAGE_KEY = "sydney.mobile.notifications.v1";

export type SystemNotificationPermission = "granted" | "denied" | "undetermined";

let writeChain: Promise<void> = Promise.resolve();

export function isSideloadBuild(): boolean {
  return Constants.expoConfig?.extra?.sydneySideload === true;
}

export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  let next: NotificationPreferences;
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    next = raw
      ? normalizeNotificationPreferences(JSON.parse(raw))
      : { ...DEFAULT_NOTIFICATION_PREFERENCES };
  } catch {
    next = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  setCachedNotificationPreferences(next, true);
  return next;
}

export async function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const next: NotificationPreferences = { ...getCachedNotificationPreferences(), ...patch };
  setCachedNotificationPreferences(next, true);
  const payload = JSON.stringify(next);
  writeChain = writeChain
    .catch(() => undefined)
    .then(async () => {
      await SecureStore.setItemAsync(STORAGE_KEY, payload);
    })
    .catch(() => undefined);
  await writeChain;
  return next;
}

export function resetNotificationPreferencesCacheForTest(): void {
  resetNotificationPreferencesStateForTest();
  writeChain = Promise.resolve();
}

export async function requestSystemNotificationPermission(): Promise<"granted" | "denied"> {
  try {
    const result = await Notifications.requestPermissionsAsync();
    return result.granted ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export async function getSystemNotificationPermissionStatus(): Promise<SystemNotificationPermission> {
  try {
    const result = await Notifications.getPermissionsAsync();
    if (result.granted) return "granted";
    if (result.status === "denied" || result.canAskAgain === false) return "denied";
    return "undetermined";
  } catch {
    return "undetermined";
  }
}

export async function enableNotificationsWithPrompt(): Promise<{
  granted: boolean;
  preferences: NotificationPreferences;
}> {
  const status = await requestSystemNotificationPermission();
  const granted = status === "granted";
  const preferences = await updateNotificationPreferences({
    prompted: true,
    enabled: granted,
  });
  if (granted && !isSideloadBuild()) {
    void registerPushToken().catch(() => undefined);
  }
  return { granted, preferences };
}

export async function sendTestLocalNotification(locale: string): Promise<"sent" | "denied"> {
  const status = await requestSystemNotificationPermission();
  if (status !== "granted") return "denied";
  const traditional = locale === "zh-TW";
  const chinese = locale.startsWith("zh");
  const title = chinese
    ? traditional
      ? "Sydney 測試通知"
      : "Sydney 测试通知"
    : "Sydney test notification";
  const body = chinese
    ? traditional
      ? "通知權限已啟用，收到新回覆或任務提醒時會在此提示。"
      : "通知权限已开启，收到新回复或任务提醒时会在此提示。"
    : "Notifications are enabled. New replies and task alerts will appear here.";
  const prefs = getCachedNotificationPreferences();
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: prefs.sound ? "default" : false,
      data: { kind: "test" },
    },
    trigger: null,
  });
  return "sent";
}

export function notificationSummaryLabel(
  prefs: NotificationPreferences,
  locale: string,
): string {
  const traditional = locale === "zh-TW";
  const chinese = locale.startsWith("zh");
  if (prefs.enabled) {
    return chinese ? (traditional ? "已開啟" : "已开启") : "On";
  }
  return chinese ? (traditional ? "已關閉" : "已关闭") : "Off";
}

export function supportsLocalNotificationSettings(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}
