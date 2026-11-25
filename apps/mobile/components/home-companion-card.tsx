import type { SpaceBot } from "@rakazo/contracts";
import { botColors } from "@rakazo/ui-tokens";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import type { MobileBot } from "../lib/api";
import type { CompanionScreenState } from "../lib/companion-activity";
import {
  activeCompanionIdentity,
  companionActivityRevision,
  companionAvailable,
  companionScreenState,
  presentCompanionScreen,
  stopCompanionScreen,
  subscribeCompanionActivity,
  subscribeCompanionScreenState,
} from "../lib/companion-activity";
import { stopCompanionScreenAuto, useCompanionScreenAuto } from "../lib/companion-screen-auto";
import {
  companionStatusDisplay,
  startUnifiedCompanion,
  stopUnifiedCompanion,
  switchUnifiedCompanionBot,
  useCompanionSession,
} from "../lib/companion-session";
import { confirmAndLaunchCompanionVoiceCall } from "../lib/companion-voice-launch";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { previewSnippet } from "../lib/preview";
import { BotAvatar } from "./bot-avatar";
import { MotionPressable } from "./motion-pressable";
import { NativeSymbol } from "./native-symbol";

const FALLBACK_COLOR = botColors[3];

export type HomeCompanionCardProps = {
  bots: readonly (MobileBot | SpaceBot)[];
  primaryBot?: MobileBot | SpaceBot;
  spaceId: string | null;
  cardStyle: ViewStyle;
  onOpenBot: (bot: MobileBot | SpaceBot) => void;
};

export function HomeCompanionCard({
  bots,
  primaryBot,
  spaceId,
  cardStyle,
  onOpenBot,
}: HomeCompanionCardProps) {
  const router = useRouter();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const { locale } = useI18n();
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const copy = (zhHans: string, zhHant: string, en: string) =>
    chinese ? (traditional ? zhHant : zhHans) : en;

  useSyncExternalStore(
    subscribeCompanionActivity,
    companionActivityRevision,
    companionActivityRevision,
  );
  const session = useCompanionSession();
  const screenAuto = useCompanionScreenAuto();
  const [screenState, setScreenState] = useState<CompanionScreenState>("unsupported");
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const available = companionAvailable();
  const nativeIdentity = available ? activeCompanionIdentity() : null;
  const activeSession = session.active;
  const activeBotId = activeSession?.botId ?? nativeIdentity?.botId ?? null;
  const activeMode = activeSession?.mode ?? (nativeIdentity ? "live-activity" : null);
  const effectiveShowReply =
    activeSession?.showReply ?? nativeIdentity?.showReply ?? session.preferences.showReply;

  useEffect(() => {
    if (!available) {
      setScreenState("unsupported");
      return;
    }
    let mounted = true;
    const off = subscribeCompanionScreenState((state) => {
      if (mounted) setScreenState(state);
    });
    void companionScreenState()
      .then((state) => {
        if (mounted) setScreenState(state);
      })
      .catch(() => {
        if (mounted) setScreenState("unsupported");
      });
    return () => {
      mounted = false;
      off();
    };
  }, [available]);

  const activeBot = useMemo(
    () => (activeBotId ? bots.find((bot) => bot.id === activeBotId) : undefined),
    [activeBotId, bots],
  );

  const targetBot = useMemo(() => {
    if (activeBot) return activeBot;
    if (selectedBotId) {
      const explicit = bots.find((bot) => bot.id === selectedBotId);
      if (explicit) return explicit;
    }
    if (session.preferences.preferredBotId) {
      const preferred = bots.find((bot) => bot.id === session.preferences.preferredBotId);
      if (preferred) return preferred;
    }
    return primaryBot ?? bots[0];
  }, [activeBot, bots, primaryBot, selectedBotId, session.preferences.preferredBotId]);

  const isLight = appearance === "light";
  const chipBackground = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const accentColor = isLight ? "#6E675E" : "#B8B3AA";
  const activeBadgeBg = isLight ? "rgba(63, 134, 98, 0.12)" : "rgba(104, 196, 146, 0.18)";
  const activeBadgeInk = isLight ? "#2E6F4E" : "#8ADBA9";
  const busyBadgeBg = isLight ? "rgba(194, 120, 3, 0.12)" : "rgba(245, 179, 66, 0.18)";
  const busyBadgeInk = isLight ? "#9A5B02" : "#F5C469";
  const errorBadgeBg = isLight ? "rgba(180, 35, 24, 0.10)" : "rgba(249, 112, 102, 0.16)";
  const errorBadgeInk = isLight ? "#B42318" : "#F97066";
  const voiceBadgeBg = isLight ? "rgba(44, 110, 173, 0.12)" : "rgba(116, 176, 238, 0.18)";
  const voiceBadgeInk = isLight ? "#245A8D" : "#8EC5FC";

  const isActive = Boolean(activeBotId);
  const isScreenCapturing = screenState === "capturing" || screenAuto.phase === "active";
  const canShowScreenButton = available && isActive && screenState !== "unsupported";

  const runtimeDisplay = companionStatusDisplay(session.runtime.detailStatus, locale);
  const badgeColors = !isActive
    ? { bg: chipBackground, ink: tokens.mutedForeground, border: chipBorder }
    : runtimeDisplay.tone === "error"
      ? { bg: errorBadgeBg, ink: errorBadgeInk, border: "transparent" }
      : runtimeDisplay.tone === "busy"
        ? { bg: busyBadgeBg, ink: busyBadgeInk, border: "transparent" }
        : runtimeDisplay.tone === "voice"
          ? { bg: voiceBadgeBg, ink: voiceBadgeInk, border: "transparent" }
          : { bg: activeBadgeBg, ink: activeBadgeInk, border: "transparent" };

  const statusLabel = !isActive
    ? copy("未开启", "未開啟", "Off")
    : session.runtime.detailStatus === "disconnected"
      ? copy("重连中", "重連中", "Reconnecting")
      : isScreenCapturing
        ? copy("屏幕陪伴中", "螢幕陪伴中", "Screen active")
        : activeMode === "live-activity"
          ? copy("灵动岛陪伴中", "動態島陪伴中", "Live Activity")
          : copy("后台陪伴中", "背景陪伴中", "Active");

  const replySnippet =
    isActive && effectiveShowReply && session.runtime.latestReply
      ? previewSnippet(session.runtime.latestReply, 76)
      : "";

  const subtitle = isActive
    ? replySnippet
      ? `${runtimeDisplay.label} · ${replySnippet}`
      : !effectiveShowReply
        ? `${runtimeDisplay.label} · ${copy("回复内容已隐藏", "回覆內容已隱藏", "Reply preview hidden")}`
        : isScreenCapturing
          ? copy(
              "正在后台与灵动岛跟随状态，并保持授权屏幕共享。",
              "正在背景與動態島跟隨狀態，並保持授權螢幕共享。",
              "Following in Live Activity with screen sharing active.",
            )
          : activeMode === "live-activity"
            ? `${runtimeDisplay.label} · ${copy(
                "切换应用后仍会在灵动岛同步回复与状态。",
                "切換應用後仍會在動態島同步回覆與狀態。",
                "Syncing replies & status in Live Activity.",
              )}`
            : `${runtimeDisplay.label} · ${copy(
                "应用内跨页陪伴与本地提醒已开启（灵动岛需实验构建）。",
                "應用內跨頁陪伴與本機提醒已開啟（動態島需實驗建置）。",
                "In-app companion & local alerts active (Live Activity requires experimental build).",
              )}`
    : targetBot
      ? available
        ? copy(
            "开启后将在灵动岛与锁屏持续显示伙伴状态与最新短回复。",
            "開啟後將在動態島與鎖屏持續顯示夥伴狀態與最新短回覆。",
            "Show status and short replies in Live Activity while multitasking.",
          )
        : copy(
            "开启后将在应用内跨页跟随伙伴状态、展示悬浮胶囊并发送新回复提醒。",
            "開啟後將在應用內跨頁跟隨夥伴狀態、顯示懸浮膠囊並發送新回覆提醒。",
            "Follow bot status across screens with floating pill and local reply alerts.",
          )
      : copy(
          "先创建一个伙伴即可开启后台陪伴。",
          "先建立一個夥伴即可開啟背景陪伴。",
          "Create a bot to start background companion.",
        );

  const handleToggleCompanion = async () => {
    if (busy || !targetBot) return;
    setBusy(true);
    setErrorText(null);
    try {
      if (isActive) {
        stopCompanionScreenAuto();
        await stopUnifiedCompanion();
      } else {
        await startUnifiedCompanion({
          botId: targetBot.id,
          botName: targetBot.name,
          botColor: targetBot.color || FALLBACK_COLOR,
          botAvatarSet: targetBot.avatarSet,
          spaceId,
          showReply: session.preferences.showReply,
        });
      }
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : copy("操作失败，请重试。", "操作失敗，請重試。", "Action failed. Try again."),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCycleBot = async () => {
    if (busy || bots.length < 2) return;
    const currentIndex = targetBot ? bots.findIndex((bot) => bot.id === targetBot.id) : -1;
    const nextBot = bots[(currentIndex + 1) % bots.length];
    if (!nextBot) return;
    setSelectedBotId(nextBot.id);
    setErrorText(null);
    if (!isActive) return;
    setBusy(true);
    try {
      await switchUnifiedCompanionBot({
        botId: nextBot.id,
        botName: nextBot.name,
        botColor: nextBot.color || FALLBACK_COLOR,
        botAvatarSet: nextBot.avatarSet,
        spaceId,
        showReply: session.preferences.showReply,
      });
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : copy("切换伙伴失败，请重试。", "切換夥伴失敗，請重試。", "Could not switch bot."),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleToggleScreen = async () => {
    if (busy || !canShowScreenButton || !targetBot) return;
    setBusy(true);
    setErrorText(null);
    try {
      if (isScreenCapturing) {
        stopCompanionScreenAuto();
        await stopCompanionScreen();
      } else {
        await presentCompanionScreen(targetBot.id, spaceId);
      }
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : copy("屏幕陪伴切换失败。", "螢幕陪伴切換失敗。", "Could not toggle screen companion."),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleVoiceCall = () => {
    if (!targetBot) return;
    confirmAndLaunchCompanionVoiceCall(
      {
        botId: targetBot.id,
        botName: targetBot.name,
        botColor: targetBot.color || FALLBACK_COLOR,
        botAvatarSet: targetBot.avatarSet,
      },
      {
        locale,
        onOpenVoiceSettings: () => router.push("/voice"),
        onError: (message) => setErrorText(message),
      },
    );
  };

  return (
    <View testID="home-hub-companion-card" style={[cardStyle, { padding: 18, gap: 14 }]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <MotionPressable
          preset="inline"
          testID="home-hub-companion-console"
          accessibilityRole="button"
          accessibilityLabel={copy(
            "打开后台陪伴设置",
            "開啟背景陪伴設定",
            "Open companion console",
          )}
          onPress={() => router.push("/companion")}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}
        >
          <NativeSymbol ios="sparkles" android="sparkles-outline" size={16} color={accentColor} />
          <Text
            style={{ color: tokens.foreground, fontSize: 15.5, lineHeight: 20, fontWeight: "600" }}
          >
            {copy("后台陪伴", "背景陪伴", "Background Companion")}
          </Text>
          <NativeSymbol
            ios="chevron.right"
            android="chevron-forward"
            size={12}
            color={tokens.mutedForeground}
          />
        </MotionPressable>
        <View
          testID="home-hub-companion-status"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: badgeColors.bg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: badgeColors.border,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: badgeColors.ink,
            }}
          />
          <Text
            style={{
              color: badgeColors.ink,
              fontSize: 12,
              lineHeight: 15,
              fontWeight: "600",
            }}
          >
            {statusLabel}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <MotionPressable
          preset="card"
          accessibilityRole="button"
          accessibilityLabel={
            targetBot
              ? copy(
                  `打开 ${targetBot.name} 对话`,
                  `開啟 ${targetBot.name} 對話`,
                  `Open ${targetBot.name}`,
                )
              : copy("后台陪伴", "背景陪伴", "Background Companion")
          }
          disabled={!targetBot}
          onPress={() => targetBot && onOpenBot(targetBot)}
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          {targetBot ? (
            <BotAvatar
              color={targetBot.color || FALLBACK_COLOR}
              avatarSet={targetBot.avatarSet}
              identity={targetBot.id}
              size={40}
              status={targetBot.status}
              unread={targetBot.unread}
              motion="lazy"
            />
          ) : (
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: chipBackground,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <NativeSymbol
                ios="person.crop.circle"
                android="person-circle-outline"
                size={20}
                color={tokens.mutedForeground}
              />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text
              numberOfLines={1}
              style={{ color: tokens.foreground, fontSize: 15, lineHeight: 20, fontWeight: "600" }}
            >
              {targetBot?.name ??
                activeSession?.botName ??
                copy("暂无可用伙伴", "暫無可用夥伴", "No bot available")}
            </Text>
            <Text
              numberOfLines={2}
              style={{ color: tokens.mutedForeground, fontSize: 12.5, lineHeight: 17 }}
            >
              {subtitle}
            </Text>
          </View>
        </MotionPressable>
      </View>

      {errorText ? (
        <Text
          accessibilityRole="alert"
          style={{ color: errorBadgeInk, fontSize: 12.5, lineHeight: 17 }}
        >
          {errorText}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <MotionPressable
          preset="control"
          testID="home-hub-companion-toggle"
          accessibilityRole="button"
          accessibilityLabel={
            isActive
              ? copy("停止陪伴", "停止陪伴", "Stop companion")
              : copy("开启陪伴", "開啟陪伴", "Start companion")
          }
          disabled={busy || !targetBot}
          onPress={() => void handleToggleCompanion()}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 999,
            backgroundColor: isActive ? chipBackground : isLight ? "#2E2B27" : "#E7E4DD",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isActive ? chipBorder : "transparent",
            opacity: busy || !targetBot ? 0.45 : 1,
          }}
        >
          <Text
            style={{
              color: isActive ? tokens.foreground : isLight ? "#FAF8F4" : "#15171C",
              fontSize: 13.5,
              lineHeight: 18,
              fontWeight: "600",
            }}
          >
            {isActive
              ? copy("停止陪伴", "停止陪伴", "Stop companion")
              : copy("开启陪伴", "開啟陪伴", "Start companion")}
          </Text>
        </MotionPressable>

        {isActive && targetBot ? (
          <MotionPressable
            preset="control"
            testID="home-hub-companion-voice"
            accessibilityRole="button"
            accessibilityLabel={copy("语音通话", "語音通話", "Voice call")}
            disabled={busy}
            onPress={handleVoiceCall}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 12,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: chipBackground,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: chipBorder,
              opacity: busy ? 0.45 : 1,
            }}
          >
            <NativeSymbol
              ios="waveform"
              android="mic-outline"
              size={13}
              color={tokens.foreground}
            />
            <Text
              style={{ color: tokens.foreground, fontSize: 13, lineHeight: 18, fontWeight: "500" }}
            >
              {copy("语音通话", "語音通話", "Voice")}
            </Text>
          </MotionPressable>
        ) : null}

        {canShowScreenButton ? (
          <MotionPressable
            preset="control"
            testID="home-hub-companion-screen-toggle"
            accessibilityRole="button"
            accessibilityLabel={
              isScreenCapturing
                ? copy("停止屏幕共享", "停止螢幕共享", "Stop screen sharing")
                : copy("开启屏幕陪伴", "開啟螢幕陪伴", "Share screen")
            }
            disabled={busy}
            onPress={() => void handleToggleScreen()}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: chipBackground,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: chipBorder,
              opacity: busy ? 0.45 : 1,
            }}
          >
            <Text
              style={{ color: tokens.foreground, fontSize: 13, lineHeight: 18, fontWeight: "500" }}
            >
              {isScreenCapturing
                ? copy("停止屏幕共享", "停止螢幕共享", "Stop screen")
                : copy("屏幕陪伴", "螢幕陪伴", "Share screen")}
            </Text>
          </MotionPressable>
        ) : null}

        {bots.length > 1 ? (
          <MotionPressable
            preset="control"
            testID="home-hub-companion-switch-bot"
            accessibilityRole="button"
            accessibilityLabel={copy("切换伙伴", "切換夥伴", "Switch bot")}
            disabled={busy}
            onPress={() => void handleCycleBot()}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: chipBackground,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: chipBorder,
              opacity: busy ? 0.45 : 1,
            }}
          >
            <Text
              style={{
                color: tokens.mutedForeground,
                fontSize: 13,
                lineHeight: 18,
                fontWeight: "500",
              }}
            >
              {copy("切换伙伴", "切換夥伴", "Switch bot")}
            </Text>
          </MotionPressable>
        ) : null}
      </View>
    </View>
  );
}
