import { botColors } from "@rakazo/ui-tokens";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ViewStyle } from "react-native";
import { Dimensions, PanResponder, StyleSheet, Text, View } from "react-native";
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
const ORB_SIZE = 52;
const EDGE_MARGIN = 14;

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

function safeWindowSize(): { width: number; height: number } {
  try {
    const win = Dimensions?.get?.("window");
    if (win && Number.isFinite(win.width) && Number.isFinite(win.height)) {
      return { width: win.width, height: win.height };
    }
  } catch {
    // Fallback for lightweight unit test mocks without Dimensions.
  }
  return { width: 390, height: 844 };
}

export function CompanionFloatingBar({
  bottomOffset = 16,
  topInset = 56,
  style,
}: {
  bottomOffset?: number;
  topInset?: number;
  style?: ViewStyle;
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

  const [collapsed, setCollapsed] = useState(false);
  const [orbSide, setOrbSide] = useState<"left" | "right">("right");
  const [verticalOffset, setVerticalOffset] = useState(0);
  const [orbDragOffset, setOrbDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragBaseYRef = useRef(0);
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  const orbSideRef = useRef(orbSide);
  orbSideRef.current = orbSide;
  const verticalOffsetRef = useRef(verticalOffset);
  verticalOffsetRef.current = verticalOffset;
  const bottomOffsetRef = useRef(bottomOffset);
  bottomOffsetRef.current = bottomOffset;
  const topInsetRef = useRef(topInset);
  topInsetRef.current = topInset;

  const clampVerticalOffset = (candidate: number) => {
    const { height } = safeWindowSize();
    const maxLift = Math.max(80, height - bottomOffsetRef.current - topInsetRef.current - 96);
    return Math.min(0, Math.max(-maxLift, candidate));
  };

  useEffect(() => {
    setVerticalOffset((current) => clampVerticalOffset(current));
  }, [bottomOffset, topInset]);

  const panResponder = useMemo(() => {
    if (!PanResponder?.create) return null;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
      onPanResponderGrant: () => {
        dragBaseYRef.current = verticalOffsetRef.current;
        setOrbDragOffset({ x: 0, y: 0 });
      },
      onPanResponderMove: (_event, gesture) => {
        const nextY = clampVerticalOffset(dragBaseYRef.current + gesture.dy);
        if (collapsedRef.current) {
          setOrbDragOffset({ x: gesture.dx, y: nextY - dragBaseYRef.current });
        } else {
          setVerticalOffset(nextY);
        }
      },
      onPanResponderRelease: (_event, gesture) => {
        const nextY = clampVerticalOffset(dragBaseYRef.current + gesture.dy);
        setVerticalOffset(nextY);
        if (collapsedRef.current) {
          const { width } = safeWindowSize();
          const startCenterX =
            orbSideRef.current === "right"
              ? width - EDGE_MARGIN - ORB_SIZE / 2
              : EDGE_MARGIN + ORB_SIZE / 2;
          const endCenterX = startCenterX + gesture.dx;
          setOrbSide(endCenterX < width / 2 ? "left" : "right");
          setOrbDragOffset({ x: 0, y: 0 });
        }
      },
      onPanResponderTerminate: () => {
        setOrbDragOffset({ x: 0, y: 0 });
      },
    });
  }, []);

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
  const surfaceBg = isLight ? "rgba(255, 254, 252, 0.96)" : "rgba(36, 41, 51, 0.96)";
  const borderColor = isLight ? "rgba(38, 35, 31, 0.10)" : "rgba(245, 244, 240, 0.14)";
  const iconBg = isLight ? "#F3F0EA" : "#2E3542";
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

  const panHandlers = panResponder ? panResponder.panHandlers : {};

  if (collapsed) {
    return (
      <View
        testID="companion-floating-bar"
        {...panHandlers}
        style={[
          {
            position: "absolute",
            zIndex: 50,
            bottom: bottomOffset - verticalOffset - orbDragOffset.y,
            ...(orbSide === "right"
              ? { right: Math.max(6, EDGE_MARGIN - orbDragOffset.x) }
              : { left: Math.max(6, EDGE_MARGIN + orbDragOffset.x) }),
          },
          style,
        ]}
      >
        <MotionPressable
          preset="icon"
          testID="companion-floating-orb-expand"
          accessibilityRole="button"
          accessibilityLabel={copy(
            `展开 ${active.botName} 悬浮陪伴条`,
            `展開 ${active.botName} 懸浮陪伴條`,
            `Expand ${active.botName} floating companion`,
          )}
          onPress={() => setCollapsed(false)}
          style={{
            width: ORB_SIZE,
            height: ORB_SIZE,
            borderRadius: ORB_SIZE / 2,
            backgroundColor: surfaceBg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#26231F",
            shadowOpacity: isLight ? 0.14 : 0.36,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 6,
          }}
        >
          <BotAvatar
            color={active.botColor || FALLBACK_COLOR}
            avatarSet={active.botAvatarSet ?? undefined}
            identity={active.botId}
            size={36}
            status={session.runtime.detailStatus === "thinking" ? "running" : "idle"}
            motion="lazy"
          />
          <View
            style={{
              position: "absolute",
              right: 5,
              bottom: 5,
              width: 11,
              height: 11,
              borderRadius: 6,
              backgroundColor: dotColor,
              borderWidth: 2,
              borderColor: isLight ? "#FFFEFC" : "#242933",
            }}
          />
        </MotionPressable>
      </View>
    );
  }

  return (
    <View
      testID="companion-floating-bar"
      {...panHandlers}
      style={[
        {
          position: "absolute",
          left: EDGE_MARGIN,
          right: EDGE_MARGIN,
          bottom: bottomOffset - verticalOffset,
          zIndex: 50,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingVertical: 9,
          paddingHorizontal: 12,
          borderRadius: 22,
          backgroundColor: surfaceBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor,
          shadowColor: "#26231F",
          shadowOpacity: isLight ? 0.12 : 0.34,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
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
        testID="companion-floating-bar-collapse"
        accessibilityRole="button"
        accessibilityLabel={copy("收起为悬浮球", "收合為懸浮球", "Collapse to floating orb")}
        onPress={() => setCollapsed(true)}
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <NativeSymbol ios="minus" android="remove" size={14} color={tokens.mutedForeground} />
      </MotionPressable>

      <MotionPressable
        preset="icon"
        testID="companion-floating-bar-console"
        accessibilityRole="button"
        accessibilityLabel={copy("陪伴设置", "陪伴設定", "Companion settings")}
        onPress={() => router.push("/companion")}
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <NativeSymbol
          ios="slider.horizontal.3"
          android="options-outline"
          size={14}
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
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <NativeSymbol ios="xmark" android="close" size={13} color={tokens.mutedForeground} />
      </MotionPressable>
    </View>
  );
}
