import { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import { useI18n } from "./i18n";
import {
  enableNotificationsWithPrompt,
  getCachedNotificationPreferences,
  isNotificationPreferencesLoaded,
  updateNotificationPreferences,
} from "./notification-preferences";

const EXCLUDED_ROUTES = new Set(["/sign-in", "/server", "/paywall"]);

function promptCopy(locale: string) {
  if (locale === "zh-TW") {
    return {
      title: "開啟消息通知",
      message: "及時接收小夥伴的新回覆、任務審批與提醒。您隨時可在「設定 → 消息通知」中調整。",
      later: "暫不開啟",
      enable: "開啟通知",
    };
  }
  if (locale.startsWith("zh")) {
    return {
      title: "开启消息通知",
      message: "及时接收小伙伴的新回复、任务审批与提醒。您随时可在「设置 → 消息通知」中调整。",
      later: "暂不开启",
      enable: "开启通知",
    };
  }
  return {
    title: "Enable notifications?",
    message:
      "Get alerts for new replies, approvals, and task updates. You can change this anytime in Settings → Notifications.",
    later: "Not now",
    enable: "Enable",
  };
}

/**
 * Prompts the user once on their first visit to the main app surface after splash hides.
 * Never calls system permission APIs until the user taps Enable.
 */
export function useFirstLaunchNotificationPrompt(ready: boolean, pathname: string): void {
  const { locale } = useI18n();
  const promptedInSession = useRef(false);

  useEffect(() => {
    if (!ready || promptedInSession.current) return;
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    if (EXCLUDED_ROUTES.has(pathname)) return;
    if (!isNotificationPreferencesLoaded()) return;
    if (getCachedNotificationPreferences().prompted) return;

    promptedInSession.current = true;
    const copy = promptCopy(locale);
    Alert.alert(copy.title, copy.message, [
      {
        text: copy.later,
        style: "cancel",
        onPress: () => {
          void updateNotificationPreferences({ prompted: true, enabled: false });
        },
      },
      {
        text: copy.enable,
        onPress: () => {
          void enableNotificationsWithPrompt();
        },
      },
    ]);
  }, [ready, pathname, locale]);
}
