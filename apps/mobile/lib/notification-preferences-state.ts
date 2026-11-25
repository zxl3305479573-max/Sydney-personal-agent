export interface NotificationPreferences {
  prompted: boolean;
  enabled: boolean;
  messages: boolean;
  needsAttention: boolean;
  completions: boolean;
  sound: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  prompted: false,
  enabled: true,
  messages: true,
  needsAttention: true,
  completions: false,
  sound: false,
};

let cached: NotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES };
let loaded = false;
const listeners = new Set<() => void>();

export function normalizeNotificationPreferences(raw: unknown): NotificationPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  const value = raw as Record<string, unknown>;
  const bool = (key: keyof NotificationPreferences) =>
    typeof value[key] === "boolean"
      ? (value[key] as boolean)
      : DEFAULT_NOTIFICATION_PREFERENCES[key];
  return {
    prompted: bool("prompted"),
    enabled: bool("enabled"),
    messages: bool("messages"),
    needsAttention: bool("needsAttention"),
    completions: bool("completions"),
    sound: bool("sound"),
  };
}

export function getCachedNotificationPreferences(): NotificationPreferences {
  return cached;
}

export function isNotificationPreferencesLoaded(): boolean {
  return loaded;
}

export function setCachedNotificationPreferences(
  next: NotificationPreferences,
  markLoaded = true,
): void {
  cached = next;
  if (markLoaded) loaded = true;
  for (const listener of listeners) listener();
}

export function subscribeNotificationPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetNotificationPreferencesStateForTest(): void {
  cached = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  loaded = false;
  listeners.clear();
}

export function notificationSummaryLabel(prefs: NotificationPreferences, locale: string): string {
  const traditional = locale === "zh-TW";
  const chinese = locale.startsWith("zh");
  if (prefs.enabled) {
    return chinese ? (traditional ? "已開啟" : "已开启") : "On";
  }
  return chinese ? (traditional ? "已關閉" : "已关闭") : "Off";
}
