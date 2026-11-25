import { botColors } from "@rakazo/ui-tokens";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useCallSession } from "../lib/call-session";
import {
  companionStatusDisplay,
  stopUnifiedCompanion,
  useCompanionSession,
} from "../lib/companion-session";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { previewSnippet } from "../lib/preview";
import { BotAvatar } from "./bot-avatar";
import { MotionPressable } from "./motion-pressable";
import { NativeSymbol } from "./native-symbol";

const FALLBACK_COLOR = botColors[3];
const HIDDEN_ROUTES = new Set(["/sign-in", "/server", "/paywall", "/companion", "/image"]);

export function shouldShowCompanionFloatingBar(input: {
  activeBotId: string | null;
  showFloatingBar: boolean;
  callActive: boolean;
  pathname: string;
  routeBotId?: string | string[];
}): boolean {
  if (!input.activeBotId || !input.showFloatingBar || input.callActive) return false;
  if (HIDDEN_ROUTES.has(input.pathname)) return false;
  const currentBot = Array.isArray(input.routeBotId) ? input.routeBotId[0] : input.routeBotId;
  if (input.pathname === "/thread" && currentBot === input.activeBotId) return false;
  return true;
}

export function CompanionFloatingBar({
  style,
}: {
  style?: { marginTop?: number; marginBottom?: number; marginHorizontal?: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ botId?: string | string[] }>();
  const session = useCompanionSession();
  const call = useCallSession();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const { locale } = useI18n();
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const copy = (zhHans: string, zhHant: string, en: string) =>
    chinese ? (traditional ? zhHant : zhHans) : en;

  const active = session.active;
  if (
    !shouldShowCompanionFloatingBar({
      activeBotId: active?.botId ?? null,
      showFloatingBar: session.preferences.showFloatingBar,
      callActive: Boolean(call),
      pathname,
      routeBotId: params.botId,
    }) ||
    !active
  ) {
    return null;
  }

  const isLight = appearance === "light";
  const surfaceBg = isLight ? "#FFFEFC" : "#242933";
  const borderColor = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const iconBg = isLight ? "#F8F6F2" : "#2A303B";
  const statusInfo = companionStatusDisplay(session.runtime.detailStatus, locale);
  const dotColor =
    statusInfo.tone === "error"
      ? isLight
        ? "#B42318"
        : "#F97066"
      : statusInfo.tone === "busy"
        ? isLight
          ? "#C27803"
          : "#F5C469"
        : statusInfo.tone === "voice"
          ? isLight
            ? "#245A8D"
            : "#8EC5FC"
          : isLight
            ? "#2E6F4E"
            : "#8ADBA9";

  const replyText =
    active.showReply && session.runtime.latestReply
      ? previewSnippet(session.runtime.latestReply, 60)
      : !active.showReply
        ? copy("回复内容已隐藏", "回覆內容已隱藏", "Replies hidden")
        : statusInfo.label;

  return (
    <View
      testID="companion-floating-bar"
      style={[
        {
          marginHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: 9,
          paddingHorizontal: 12,
          borderRadius: 20,
          backgroundColor: surfaceBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor,
          shadowColor: "#26231F",
          shadowOpacity: isLight ? 0.06 : 0.24,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        },
        style,
      ]}
    >
      <MotionPressable
        preset="row"
        testID="companion-floating-bar-open-chat"
        accessibilityRole="button"
        accessibilityLabel={copy(
          `打开 ${active.botName} 对话`,
          `開啟 ${active.botName} 對話`,
          `Open ${active.botName} chat`,
        )}
        onPress={() =>
          router.push({
            pathname: "/thread",
            params: {
              botId: active.botId,
              name: active.botName,
              ...(active.spaceId ? { spaceId: active.spaceId } : {}),
            },
          })
        }
        style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <BotAvatar
          color={active.botColor || FALLBACK_COLOR}
          avatarSet={active.botAvatarSet ?? undefined}
          identity={active.botId}
          size={30}
          status={session.runtime.detailStatus === "thinking" ? "running" : "idle"}
          motion="lazy"
        />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: dotColor,
              }}
            />
            <Text
              numberOfLines={1}
              style={{
                color: tokens.foreground,
                fontSize: 13.5,
                lineHeight: 17,
                fontWeight: "600",
                flexShrink: 1,
              }}
            >
              {active.botName}
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: dotColor, fontSize: 11.5, lineHeight: 15, fontWeight: "600" }}
            >
              {statusInfo.label}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 16 }}
          >
            {replyText}
          </Text>
        </View>
      </MotionPressable>

      <MotionPressable
        preset="icon"
        testID="companion-floating-bar-console"
        accessibilityRole="button"
        accessibilityLabel={copy("陪伴设置", "陪伴設定", "Companion settings")}
        onPress={() => router.push("/companion")}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <NativeSymbol
          ios="slider.horizontal.3"
          android="options-outline"
          size={15}
          color={tokens.foreground}
        />
      </MotionPressable>

      <MotionPressable
        preset="icon"
        testID="companion-floating-bar-stop"
        accessibilityRole="button"
        accessibilityLabel={copy("停止陪伴", "停止陪伴", "Stop companion")}
        onPress={() => void stopUnifiedCompanion()}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <NativeSymbol ios="xmark" android="close" size={14} color={tokens.mutedForeground} />
      </MotionPressable>
    </View>
  );
}
