import type { SpaceBot } from "@rakazo/contracts";
import { botColors } from "@rakazo/ui-tokens";
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
  startCompanion,
  stopCompanion,
  stopCompanionScreen,
  subscribeCompanionActivity,
  subscribeCompanionScreenState,
} from "../lib/companion-activity";
import { stopCompanionScreenAuto, useCompanionScreenAuto } from "../lib/companion-screen-auto";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
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
  const screenAuto = useCompanionScreenAuto();
  const [screenState, setScreenState] = useState<CompanionScreenState>("unsupported");
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const available = companionAvailable();
  const activeIdentity = available ? activeCompanionIdentity() : null;

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
    () => (activeIdentity ? bots.find((bot) => bot.id === activeIdentity.botId) : undefined),
    [activeIdentity, bots],
  );

  const targetBot = useMemo(() => {
    if (activeBot) return activeBot;
    if (selectedBotId) {
      const explicit = bots.find((bot) => bot.id === selectedBotId);
      if (explicit) return explicit;
    }
    return primaryBot ?? bots[0];
  }, [activeBot, bots, primaryBot, selectedBotId]);

  const isLight = appearance === "light";
  const chipBackground = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const accentColor = isLight ? "#6E675E" : "#B8B3AA";
  const activeBadgeBg = isLight ? "rgba(63, 134, 98, 0.12)" : "rgba(104, 196, 146, 0.18)";
  const activeBadgeInk = isLight ? "#2E6F4E" : "#8ADBA9";
  const isActive = Boolean(activeIdentity);
  const isScreenCapturing = screenState === "capturing" || screenAuto.phase === "active";

  const statusLabel = !available
    ? copy("当前版本未启扩展", "目前版本未啟擴充", "Extension unavailable")
    : isActive
      ? isScreenCapturing
        ? copy("屏幕陪伴中", "螢幕陪伴中", "Screen active")
        : copy("后台陪伴中", "背景陪伴中", "Active")
      : copy("未开启", "未開啟", "Off");

  const subtitle = !available
    ? copy(
        "当前侧载版本未包含灵动岛扩展，仍可点击直达对话。",
        "目前側載版本未包含動態島擴充，仍可點擊直達對話。",
        "Live Activity extension is not bundled in this build.",
      )
    : isActive
      ? isScreenCapturing
        ? copy(
            "正在后台与灵动岛跟随状态，并保持授权屏幕共享。",
            "正在背景與動態島跟隨狀態，並保持授權螢幕共享。",
            "Following in Live Activity with screen sharing active.",
          )
        : copy(
            "我一直都在 · 切换应用后仍会在灵动岛同步回复与状态。",
            "我一直都在 · 切換應用後仍會在動態島同步回覆與狀態。",
            "Always here · syncing replies & status in Live Activity.",
          )
      : targetBot
        ? copy(
            "开启后将在灵动岛与锁屏持续显示伙伴状态与最新短回复。",
            "開啟後將在動態島與鎖屏持續顯示夥伴狀態與最新短回覆。",
            "Show status and short replies in Live Activity while multitasking.",
          )
        : copy(
            "先创建一个伙伴即可开启后台陪伴。",
            "先建立一個夥伴即可開啟背景陪伴。",
            "Create a bot to start background companion.",
          );

  const handleToggleCompanion = async () => {
    if (busy || !targetBot) return;
    if (!available) {
      onOpenBot(targetBot);
      return;
    }
    setBusy(true);
    setErrorText(null);
    try {
      if (isActive) {
        stopCompanionScreenAuto();
        await stopCompanion();
      } else {
        await startCompanion(
          targetBot.id,
          targetBot.name,
          spaceId,
          true,
          { color: targetBot.color || FALLBACK_COLOR, avatarSet: targetBot.avatarSet },
          () => true,
          () => true,
        );
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

  const handleCycleBot = () => {
    if (bots.length < 2 || isActive) return;
    const currentIndex = targetBot ? bots.findIndex((bot) => bot.id === targetBot.id) : -1;
    const nextBot = bots[(currentIndex + 1) % bots.length];
    if (nextBot) {
      setSelectedBotId(nextBot.id);
      setErrorText(null);
    }
  };

  const handleToggleScreen = async () => {
    if (busy || !available || !isActive || !targetBot) return;
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <NativeSymbol ios="sparkles" android="sparkles-outline" size={16} color={accentColor} />
          <Text
            style={{ color: tokens.foreground, fontSize: 15.5, lineHeight: 20, fontWeight: "600" }}
          >
            {copy("后台陪伴", "背景陪伴", "Background Companion")}
          </Text>
        </View>
        <View
          testID="home-hub-companion-status"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: isActive ? activeBadgeBg : chipBackground,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isActive ? "transparent" : chipBorder,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: isActive ? activeBadgeInk : tokens.mutedForeground,
            }}
          />
          <Text
            style={{
              color: isActive ? activeBadgeInk : tokens.mutedForeground,
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
              {targetBot?.name ?? copy("暂无可用伙伴", "暫無可用夥伴", "No bot available")}
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
          style={{ color: isLight ? "#B42318" : "#F97066", fontSize: 12.5, lineHeight: 17 }}
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
            !available
              ? copy("进入对话", "進入對話", "Open chat")
              : isActive
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
            {!available
              ? copy("进入对话", "進入對話", "Open chat")
              : isActive
                ? copy("停止陪伴", "停止陪伴", "Stop companion")
                : copy("开启陪伴", "開啟陪伴", "Start companion")}
          </Text>
        </MotionPressable>

        {available && isActive ? (
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

        {!isActive && bots.length > 1 ? (
          <MotionPressable
            preset="control"
            testID="home-hub-companion-switch-bot"
            accessibilityRole="button"
            accessibilityLabel={copy("切换伙伴", "切換夥伴", "Switch bot")}
            onPress={handleCycleBot}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: chipBackground,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: chipBorder,
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
