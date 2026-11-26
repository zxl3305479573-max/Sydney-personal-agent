import { botColors } from "@rakazo/ui-tokens";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  dismissBotNotificationBanner,
  getActiveBotNotificationBanner,
  registerBotNotificationBannerHost,
  subscribeBotNotificationBanner,
} from "../lib/bot-notification-banner-state";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { notificationOpenTarget, threadRouteId } from "../lib/notification-open";
import { previewSnippet } from "../lib/preview";
import { closeSettingsSheet } from "../lib/settings-sheet";
import { BotAvatar } from "./bot-avatar";
import { GlassSurface } from "./glass-surface";
import { MotionPressable } from "./motion-pressable";
import { NativeSymbol } from "./native-symbol";

const AUTO_DISMISS_MS = 4_800;
const FALLBACK_COLOR = botColors[3];
const ATTENTION_KINDS = new Set([
  "attention",
  "help",
  "takeover",
  "failure",
  "approval",
  "question",
]);

function paramFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function BotNotificationBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{
    botId?: string | string[];
    groupId?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const { locale } = useI18n();
  const item = useSyncExternalStore(
    subscribeBotNotificationBanner,
    getActiveBotNotificationBanner,
    getActiveBotNotificationBanner,
  );
  const itemIdRef = useRef<string | null>(null);
  itemIdRef.current = item?.id ?? null;

  useEffect(() => registerBotNotificationBannerHost(), []);

  useEffect(() => {
    if (!item) return;
    const timer = setTimeout(() => {
      dismissBotNotificationBanner(item.id);
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const routeBotId = paramFirst(params.botId);
    const routeGroupId = paramFirst(params.groupId);
    const matchesGroup = Boolean(
      item.groupId && pathname === "/group-thread" && routeGroupId === item.groupId,
    );
    const matchesDirect = Boolean(
      !item.groupId && pathname === "/thread" && routeBotId === item.botId,
    );
    if (matchesGroup || matchesDirect) {
      dismissBotNotificationBanner(item.id);
    }
  }, [item, pathname, params.botId, params.groupId]);

  const panResponder = useMemo(() => {
    if (!PanResponder?.create) return null;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gesture.dy < -8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy < -16 && itemIdRef.current) {
          dismissBotNotificationBanner(itemIdRef.current);
        }
      },
    });
  }, []);

  if (!item) return null;

  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const copy = (zhHans: string, zhHant: string, en: string) =>
    chinese ? (traditional ? zhHant : zhHans) : en;

  const isLight = appearance === "light";
  const isAttention = ATTENTION_KINDS.has(item.kind);
  const fallbackSurfaceBg = isLight ? "rgba(255, 255, 255, 0.88)" : "rgba(30, 34, 42, 0.86)";
  const fallbackBorderColor = isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.18)";
  const closeBg = isLight ? "rgba(60, 60, 67, 0.08)" : "rgba(255, 255, 255, 0.13)";
  const attentionTint = isLight ? "#C96A00" : "#FF9F0A";

  const statusTag = isAttention
    ? copy("需要确认", "需要確認", "Needs input")
    : copy("现在", "現在", "now");

  const handleOpen = () => {
    const current = item;
    dismissBotNotificationBanner(current.id);
    if (current.notificationId) {
      void import("expo-notifications")
        .then((Notifications) => Notifications.dismissNotificationAsync(current.notificationId!))
        .catch(() => undefined);
    }
    const target = notificationOpenTarget({
      botId: current.botId,
      name: current.botName,
      ...(current.spaceId ? { spaceId: current.spaceId } : {}),
      ...(current.threadId ? { threadId: current.threadId } : {}),
      ...(current.groupId ? { groupId: current.groupId } : {}),
    });
    if (!target) return;
    closeSettingsSheet();
    router.push(target, { dangerouslySingular: threadRouteId });
  };

  const panHandlers = panResponder ? panResponder.panHandlers : {};

  return (
    <View
      testID="bot-notification-banner"
      pointerEvents="box-none"
      {...panHandlers}
      style={{
        position: "absolute",
        top: Math.max(insets.top, 10) + 4,
        left: 12,
        right: 12,
        zIndex: 90,
      }}
    >
      <GlassSurface
        nativeOverlay
        shape="roundedRectangle"
        cornerRadius={26}
        testID="bot-notification-banner-surface"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
        }}
        fallbackStyle={{
          borderRadius: 26,
          backgroundColor: fallbackSurfaceBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: fallbackBorderColor,
          shadowColor: "#000000",
          shadowOpacity: isLight ? 0.14 : 0.42,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }}
      >
        <MotionPressable
          preset="row"
          testID="bot-notification-banner-open"
          accessibilityRole="button"
          accessibilityLabel={`${item.botName}: ${item.body}`}
          onPress={handleOpen}
          style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 }}
        >
          <View testID="bot-notification-banner-avatar" style={{ position: "relative" }}>
            <BotAvatar
              color={item.botColor || FALLBACK_COLOR}
              avatarSet={item.botAvatarSet ?? undefined}
              identity={item.botId}
              size={40}
              motion="lazy"
            />
            {isAttention ? (
              <View
                style={{
                  position: "absolute",
                  right: -1,
                  bottom: -1,
                  width: 11,
                  height: 11,
                  borderRadius: 6,
                  backgroundColor: attentionTint,
                  borderWidth: 1.5,
                  borderColor: isLight ? "rgba(255, 255, 255, 0.9)" : "rgba(28, 32, 40, 0.9)",
                }}
              />
            ) : null}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: tokens.foreground,
                  fontSize: 15,
                  lineHeight: 20,
                  fontWeight: "600",
                  flexShrink: 1,
                }}
              >
                {item.botName}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  color: isAttention ? attentionTint : tokens.mutedForeground,
                  fontSize: 12,
                  lineHeight: 16,
                  fontWeight: isAttention ? "600" : "400",
                }}
              >
                {statusTag}
              </Text>
            </View>
            <Text
              numberOfLines={2}
              style={{
                color: tokens.foreground,
                opacity: 0.9,
                fontSize: 14.5,
                lineHeight: 19,
              }}
            >
              {previewSnippet(item.body, 120)}
            </Text>
          </View>
        </MotionPressable>

        <MotionPressable
          preset="icon"
          testID="bot-notification-banner-dismiss"
          accessibilityRole="button"
          accessibilityLabel={copy("关闭通知", "關閉通知", "Dismiss notification")}
          onPress={() => dismissBotNotificationBanner(item.id)}
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: closeBg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <NativeSymbol ios="xmark" android="close" size={11} color={tokens.mutedForeground} />
        </MotionPressable>
      </GlassSurface>
    </View>
  );
}
