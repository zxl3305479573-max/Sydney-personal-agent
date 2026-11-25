import type { SpaceBot } from "@rakazo/contracts";
import { accountDisplay, isRunWorking } from "@rakazo/core";
import { botColors } from "@rakazo/ui-tokens";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { readableGutters } from "../lib/adaptive-layout";
import type { MobileBot, MobileMe } from "../lib/api";
import type { CardGradientTone } from "../lib/card-gradient";
import { cardGradient } from "../lib/card-gradient";
import {
  aggregateConversationStatus,
  conversationStatusLabel,
  isConversationActiveStatus,
} from "../lib/conversation-status";
import { useI18n } from "../lib/i18n";
import type { InboxGroup } from "../lib/inbox-spaces";
import { native, useMobileTokens, useResolvedAppearance } from "../lib/native";
import { previewSnippet } from "../lib/preview";
import { useBottomSafeAreaClaimed } from "../lib/side-insets";
import { BotAvatar } from "./bot-avatar";
import { HomeCompanionCard } from "./home-companion-card";
import { NativeSymbol } from "./native-symbol";

const FALLBACK_COLOR = botColors[3];
const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const DEFAULT_BAR_WEIGHTS = [0.42, 0.58, 0.86, 0.68, 0.52, 0.34, 0.62] as const;
const RHYTHM_HEIGHTS = [10, 16, 12, 22, 15, 20, 13, 18, 11, 17] as const;

const STARLIGHT_DOTS = [
  { top: 14, right: 26, size: 3, color: "rgba(255, 244, 214, 0.58)" },
  { top: 28, right: 72, size: 2, color: "rgba(246, 244, 239, 0.34)" },
  { top: 18, right: 124, size: 2.5, color: "rgba(246, 244, 239, 0.26)" },
  { bottom: 22, right: 44, size: 2, color: "rgba(255, 244, 214, 0.42)" },
  { bottom: 16, left: 68, size: 2.5, color: "rgba(246, 244, 239, 0.24)" },
  { top: 12, left: 22, size: 2, color: "rgba(246, 244, 239, 0.3)" },
] as const;

const CHAMPAGNE_FLECKS = [
  { top: 18, right: 24, size: 4, opacity: 0.32 },
  { top: 34, right: 48, size: 3, opacity: 0.24 },
  { top: 22, right: 74, size: 2.5, opacity: 0.2 },
  { top: 48, right: 28, size: 3, opacity: 0.22 },
  { top: 44, right: 64, size: 2, opacity: 0.18 },
] as const;

export type HomeHubProps = {
  me: (Pick<MobileMe, "userId" | "spaceId" | "name"> & { email?: MobileMe["email"] }) | null;
  spaceName?: string | null;
  bots: readonly (MobileBot | SpaceBot)[];
  groups: readonly InboxGroup[];
  activeRunsCount?: number;
  projectCount?: number | null;
  githubConnected?: boolean;
  githubLogin?: string | null;
  githubRepoCount?: number | null;
  githubRecentCounts?: readonly number[] | null;
  connectedAppsCount?: number | null;
  refreshing?: boolean;
  lastSyncedAt?: Date | null;
  now?: Date;
  error?: string | null;
  onRefresh?: () => void;
  onOpenBot?: (bot: MobileBot | SpaceBot) => void;
  onCreateBot?: () => void;
};

function padTwo(value: number): string {
  return String(value).padStart(2, "0");
}

function formatClockTime(date: Date): string {
  return `${padTwo(date.getHours())}:${padTwo(date.getMinutes())}`;
}

function formatIsoDate(value: string | undefined, fallback: Date): string {
  const parsed = value ? new Date(value) : fallback;
  const target = Number.isNaN(parsed.getTime()) ? fallback : parsed;
  return `${target.getFullYear()}-${padTwo(target.getMonth() + 1)}-${padTwo(target.getDate())}`;
}

function formatHeaderDate(date: Date, locale: string): string {
  if (locale.startsWith("zh")) {
    const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    return `${date.getMonth() + 1}月${date.getDate()}日 · ${weekdays[date.getDay()] ?? ""}`;
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
}

function buildGreeting(
  date: Date,
  locale: string,
  me: (Pick<MobileMe, "name"> & { email?: MobileMe["email"] }) | null,
  fallbackYou: string,
): string {
  const hour = date.getHours();
  const chinese = locale.startsWith("zh");
  const salutation =
    hour >= 5 && hour < 12
      ? chinese
        ? "早上好"
        : "Good morning"
      : hour >= 12 && hour < 18
        ? chinese
          ? "下午好"
          : "Good afternoon"
        : chinese
          ? "晚上好"
          : "Good evening";
  const explicitName = me?.name?.trim();
  const emailHandle = me?.email?.split("@")[0]?.trim();
  const display =
    explicitName || emailHandle || (me ? accountDisplay(me, fallbackYou).label.trim() : "");
  if (!display) return salutation;
  return chinese ? `${salutation}，${display}` : `${salutation}, ${display}`;
}

function pickSpotlightBot(
  bots: readonly (MobileBot | SpaceBot)[],
): (MobileBot | SpaceBot) | undefined {
  if (bots.length === 0) return undefined;
  const pinnedWithPreview = bots.find((bot) => bot.pinned && Boolean(bot.preview?.trim()));
  if (pinnedWithPreview) return pinnedWithPreview;
  const pinned = bots.find((bot) => bot.pinned);
  if (pinned) return pinned;
  const active = bots.find((bot) => isConversationActiveStatus(bot.status));
  if (active) return active;
  const unread = bots.find((bot) => bot.unread);
  if (unread) return unread;
  return [...bots].sort((left, right) => {
    const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : 0;
    const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : 0;
    return (
      (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
    );
  })[0];
}

export function HomeHub({
  me,
  spaceName,
  bots,
  groups,
  activeRunsCount,
  projectCount = null,
  githubConnected = false,
  githubLogin = null,
  githubRepoCount = null,
  githubRecentCounts = null,
  connectedAppsCount = null,
  refreshing = false,
  lastSyncedAt = null,
  now,
  error = null,
  onRefresh,
  onOpenBot,
  onCreateBot,
}: HomeHubProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const bottomClaimed = useBottomSafeAreaClaimed();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const { locale, t } = useI18n();
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const copy = (zhHans: string, zhHant: string, en: string) =>
    chinese ? (traditional ? zhHant : zhHans) : en;

  const currentDate = now ?? new Date();
  const syncClock = formatClockTime(lastSyncedAt ?? currentDate);
  const gutters = readableGutters(windowWidth, { left: insets.left, right: insets.right });

  const activeChatsCount = useMemo(
    () =>
      bots.filter((bot) => isConversationActiveStatus(bot.status)).length +
      groups.filter((group) =>
        isConversationActiveStatus(
          group.status ?? aggregateConversationStatus((group.members ?? []).map((m) => m.status)),
        ),
      ).length,
    [bots, groups],
  );
  const resolvedActiveRuns = Math.max(activeRunsCount ?? 0, activeChatsCount);
  const unreadCount = useMemo(
    () => bots.filter((bot) => bot.unread).length + groups.filter((group) => group.unread).length,
    [bots, groups],
  );

  const spotlightBot = useMemo(() => pickSpotlightBot(bots), [bots]);
  const primaryBot = useMemo(
    () => bots.find((bot) => isConversationActiveStatus(bot.status)) ?? spotlightBot ?? bots[0],
    [bots, spotlightBot],
  );

  const openBotThread = (bot: MobileBot | SpaceBot) => {
    if (onOpenBot) {
      onOpenBot(bot);
      return;
    }
    router.push({ pathname: "/thread", params: { botId: bot.id, name: bot.name } });
  };

  const triggerCreateBot = () => {
    if (onCreateBot) {
      onCreateBot();
      return;
    }
    router.push("/chats");
  };

  const openComputer = () => {
    if (primaryBot) {
      router.push({
        pathname: "/computer",
        params: { botId: primaryBot.id, name: primaryBot.name },
      });
      return;
    }
    router.push("/chats");
  };

  const openRoutines = () => {
    if (primaryBot) {
      router.push({
        pathname: "/routines",
        params: { botId: primaryBot.id, name: primaryBot.name },
      });
      return;
    }
    router.push("/routines");
  };

  const openAppearance = () => {
    router.push(Platform.OS === "ios" ? "/ui-mode" : "/chat-appearance");
  };

  const isLight = appearance === "light";
  const softAccentInk = isLight ? "#6E675E" : "#B8B3AA";
  const chipBackground = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const barMutedFill = isLight ? "#C5BFB5" : "#4E5563";
  const barActiveFill = isLight ? "#8C857A" : "#9BA3B2";
  const rhythmFill = isLight ? "#CFA895" : "#C99A84";

  const cardSurfaceStyle = {
    backgroundColor: isLight ? "#FFFEFC" : "#242933",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)",
    shadowColor: "#26231F",
    shadowOpacity: isLight ? 0.032 : 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  } as const;
  const cardSurface = (tone: CardGradientTone) => ({
    ...cardSurfaceStyle,
    experimental_backgroundImage: cardGradient(isLight, tone),
  });

  const syncLabel = refreshing
    ? copy("同步中…", "同步中…", "syncing…")
    : resolvedActiveRuns > 0
      ? copy(
          `${resolvedActiveRuns} 运行中 · ${syncClock}`,
          `${resolvedActiveRuns} 運行中 · ${syncClock}`,
          `${resolvedActiveRuns} active · ${syncClock}`,
        )
      : `sync · ${syncClock}`;

  const greetingText = buildGreeting(currentDate, locale, me, t("You"));
  const resolvedSpaceName = spaceName?.trim() || copy("个人空间", "個人空間", t("Personal"));

  const spotlightStatusLabel = spotlightBot ? conversationStatusLabel(spotlightBot.status, t) : "";
  const spotlightPreview = spotlightBot
    ? previewSnippet(spotlightBot.preview, 96) ||
      (isRunWorking(spotlightBot.status)
        ? copy(
            `${spotlightBot.name} 正在后台处理你的任务…`,
            `${spotlightBot.name} 正在後台處理你的任務…`,
            `${spotlightBot.name} is working on your task…`,
          )
        : spotlightStatusLabel
          ? `${spotlightBot.name} · ${spotlightStatusLabel}`
          : copy(
              `与 ${spotlightBot.name} 继续对话，随时交办新任务。`,
              `與 ${spotlightBot.name} 繼續對話，隨時交辦新任務。`,
              `Continue your conversation with ${spotlightBot.name}.`,
            ))
    : copy(
        "还没有智能伙伴，点击创建你的第一位专属助手。",
        "還沒有智能夥伴，點擊創建你的第一位專屬助手。",
        "No companions yet — tap to create your first personal assistant.",
      );

  const spotlightMeta = spotlightBot
    ? `${
        spotlightStatusLabel ||
        (spotlightBot.pinned
          ? copy("置顶", "置頂", "Pinned")
          : spotlightBot.unread
            ? copy("未读", "未讀", "Unread")
            : copy("最近动态", "最近動態", "Recent"))
      } · ${spotlightBot.name} · ${formatIsoDate(spotlightBot.updatedAt, currentDate)} ›`
    : copy("点击开始 · 新建伙伴 ›", "點擊開始 · 新建夥伴 ›", "Get started · New companion ›");

  const barWeights = useMemo(() => {
    if (!githubRecentCounts || githubRecentCounts.length === 0) return DEFAULT_BAR_WEIGHTS;
    const slice = githubRecentCounts.slice(-7);
    const max = Math.max(1, ...slice);
    return WEEKDAY_INITIALS.map((_, index) => {
      const count = slice[index] ?? 0;
      return count > 0 ? Math.max(0.28, Math.min(1, count / max)) : 0.2;
    });
  }, [githubRecentCounts]);

  return (
    <ScrollView
      testID="home-hub-scroll"
      style={{ flex: 1, backgroundColor: tokens.background }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      indicatorStyle={appearance === "dark" ? "white" : "black"}
      contentContainerStyle={{
        paddingTop: Math.max(insets.top, 16) + 10,
        paddingBottom: bottomClaimed ? 28 : Math.max(insets.bottom, 16) + 24,
        paddingLeft: 20 + gutters.left,
        paddingRight: 20 + gutters.right,
        gap: 14,
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={native.secondaryLabel}
            colors={[tokens.mutedForeground]}
            progressBackgroundColor={tokens.muted}
          />
        ) : undefined
      }
    >
      {/* Header Row 1: Date + Sync Pill + Search + Settings */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            minWidth: 0,
            color: tokens.mutedForeground,
            fontSize: 15,
            lineHeight: 20,
          }}
        >
          {formatHeaderDate(currentDate, locale)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            testID="home-hub-sync-pill"
            accessibilityRole="button"
            accessibilityLabel={syncLabel}
            onPress={onRefresh}
            style={({ pressed }) => ({
              backgroundColor: tokens.card,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: tokens.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              numberOfLines={1}
              style={{
                color: tokens.foreground,
                fontSize: 12.5,
                lineHeight: 16,
                fontVariant: ["tabular-nums"],
              }}
            >
              {syncLabel}
            </Text>
          </Pressable>
          <Pressable
            testID="home-hub-search-button"
            accessibilityRole="button"
            accessibilityLabel={t("Search")}
            onPress={() => router.push("/search")}
            hitSlop={4}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: tokens.card,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: tokens.border,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <NativeSymbol
              ios="magnifyingglass"
              android="search"
              size={16}
              color={tokens.foreground}
            />
          </Pressable>
          <Pressable
            testID="home-hub-settings-button"
            accessibilityRole="button"
            accessibilityLabel={t("Settings")}
            onPress={() => router.push("/settings-home")}
            hitSlop={4}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: tokens.card,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: tokens.border,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <NativeSymbol
              ios="gearshape"
              android="settings-outline"
              size={17}
              color={tokens.foreground}
            />
          </Pressable>
        </View>
      </View>

      {/* Header Row 2: Time-based Serif Greeting */}
      <Text
        accessibilityRole="header"
        style={{
          color: tokens.foreground,
          fontSize: 30,
          lineHeight: 36,
          fontWeight: "700",
          marginTop: -2,
          marginBottom: 2,
        }}
      >
        {greetingText}
      </Text>

      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: tokens.mutedForeground, fontSize: 13.5, lineHeight: 18 }}
        >
          {error}
        </Text>
      ) : null}

      {/* Pinned / Latest Spotlight Dark Atmospheric Banner */}
      <Pressable
        testID="home-hub-spotlight"
        accessibilityRole="button"
        accessibilityLabel={`${spotlightPreview} ${spotlightMeta}`}
        onPress={() => (spotlightBot ? openBotThread(spotlightBot) : triggerCreateBot())}
        style={({ pressed }) => ({
          borderRadius: 22,
          backgroundColor: isLight ? "#364556" : "#2B3646",
          experimental_backgroundImage: cardGradient(isLight, "spotlight"),
          padding: 16,
          overflow: "hidden",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: "rgba(250, 248, 244, 0.18)",
          opacity: pressed ? 0.88 : 1,
        })}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -20,
            right: 44,
            width: 120,
            height: 68,
            borderRadius: 60,
            backgroundColor: "rgba(196, 214, 238, 0.18)",
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 28,
            backgroundColor: "rgba(26, 35, 46, 0.18)",
          }}
        />
        {STARLIGHT_DOTS.map((dot, index) => (
          <View
            key={index}
            pointerEvents="none"
            style={{
              position: "absolute",
              ...("top" in dot ? { top: dot.top } : {}),
              ...("bottom" in dot ? { bottom: dot.bottom } : {}),
              ...("left" in dot ? { left: dot.left } : {}),
              ...("right" in dot ? { right: dot.right } : {}),
              width: dot.size,
              height: dot.size,
              borderRadius: dot.size / 2,
              backgroundColor: dot.color,
            }}
          />
        ))}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View pointerEvents="none">
            {spotlightBot ? (
              <BotAvatar
                color={spotlightBot.color || FALLBACK_COLOR}
                avatarSet={spotlightBot.avatarSet}
                identity={spotlightBot.id}
                size={44}
                status={spotlightBot.status}
                muted={spotlightBot.notifyOnFinish === false}
                unread={spotlightBot.unread}
                motion="lazy"
              />
            ) : (
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: "rgba(246, 244, 239, 0.14)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <NativeSymbol ios="sparkles" android="sparkles-outline" size={20} color="#F6F4EF" />
              </View>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <Text
              numberOfLines={2}
              style={{
                color: "#F6F4EF",
                fontSize: 15,
                lineHeight: 22,
              }}
            >
              {spotlightPreview}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: "rgba(246, 244, 239, 0.68)",
                fontSize: 12.5,
                lineHeight: 16,
                fontVariant: ["tabular-nums"],
              }}
            >
              {spotlightMeta}
            </Text>
          </View>
        </View>
      </Pressable>

      {/* Background Companion Control Card */}
      <HomeCompanionCard
        bots={bots}
        primaryBot={primaryBot}
        spaceId={me?.spaceId ?? null}
        cardStyle={cardSurface("lavender")}
        onOpenBot={openBotThread}
      />

      {/* Full-Width Card 1: Chats & Companions Hub */}
      <View style={[cardSurface("champagne"), { padding: 20, overflow: "hidden" }]}>
        {CHAMPAGNE_FLECKS.map((fleck, index) => (
          <View
            key={index}
            pointerEvents="none"
            style={{
              position: "absolute",
              top: fleck.top,
              right: fleck.right,
              width: fleck.size,
              height: fleck.size,
              borderRadius: fleck.size / 2,
              backgroundColor: "#C5A367",
              opacity: fleck.opacity,
            }}
          />
        ))}
        <Pressable
          testID="home-hub-chats-card"
          accessibilityRole="button"
          accessibilityLabel={copy("聊天与伙伴", "聊天與夥伴", "Chats & Companions")}
          onPress={() => router.push("/chats")}
          style={({ pressed }) => ({
            gap: 4,
            opacity: pressed ? 0.72 : 1,
          })}
        >
          <Text style={{ color: tokens.mutedForeground, fontSize: 14, lineHeight: 18 }}>
            {copy("聊天与伙伴", "聊天與夥伴", "Chats & Companions")}
          </Text>
          <Text
            style={{
              color: tokens.foreground,
              fontSize: 32,
              lineHeight: 38,
              fontWeight: "700",
              marginTop: 2,
              fontVariant: ["tabular-nums"],
            }}
          >
            {chinese
              ? `${bots.length} ${traditional ? "位夥伴" : "位伙伴"}`
              : bots.length === 1
                ? "1 Companion"
                : `${bots.length} Companions`}
          </Text>
          <Text
            style={{
              color: tokens.mutedForeground,
              fontSize: 14,
              lineHeight: 20,
              marginTop: 2,
            }}
          >
            {chinese
              ? `${groups.length} ${traditional ? "個群聊" : "个群聊"} · ${
                  unreadCount > 0
                    ? `${unreadCount} ${traditional ? "條未讀消息" : "条未读消息"}`
                    : traditional
                      ? "隨時發起自然語言任務"
                      : "随时发起自然语言任务"
                }`
              : `${groups.length} ${groups.length === 1 ? "group" : "groups"} · ${
                  unreadCount > 0
                    ? `${unreadCount} unread messages`
                    : "Ready for natural-language tasks"
                }`}
          </Text>
        </Pressable>

        <View
          style={{
            marginTop: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy("打开聊天列表", "打開聊天列表", "Open chats")}
            onPress={() => router.push("/chats")}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              flex: 1,
              minWidth: 0,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {bots.length > 0 ? (
              <View
                pointerEvents="none"
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                {bots.slice(0, 4).map((bot) => (
                  <BotAvatar
                    key={bot.id}
                    color={bot.color || FALLBACK_COLOR}
                    avatarSet={bot.avatarSet}
                    identity={bot.id}
                    size={28}
                    status={bot.status}
                    muted={bot.notifyOnFinish === false}
                    unread={bot.unread}
                    motion="lazy"
                  />
                ))}
                {bots.length > 4 ? (
                  <Text
                    style={{
                      color: tokens.mutedForeground,
                      fontSize: 12.5,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    +{bots.length - 4}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={{ color: tokens.mutedForeground, fontSize: 13 }}>
                {copy("点击进入收件箱 ›", "點擊進入收件箱 ›", "Open inbox ›")}
              </Text>
            )}
          </Pressable>

          <Pressable
            testID="home-hub-create-bot"
            accessibilityRole="button"
            accessibilityLabel={copy("新建伙伴", "新建夥伴", "New companion")}
            onPress={triggerCreateBot}
            style={({ pressed }) => ({
              backgroundColor: chipBackground,
              borderRadius: 999,
              paddingHorizontal: 13,
              paddingVertical: 6,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: chipBorder,
              opacity: pressed ? 0.68 : 1,
            })}
          >
            <Text style={{ color: tokens.foreground, fontSize: 13, fontWeight: "600" }}>
              {copy("+ 新建", "+ 新建", "+ New")}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Full-Width Card 2: Workspaces & Cloud Computer Status */}
      <View style={[cardSurface("slate"), { padding: 20, overflow: "hidden" }]}>
        <Pressable
          testID="home-hub-workspaces-header"
          accessibilityRole="button"
          accessibilityLabel={copy(
            `项目与执行台，${resolvedActiveRuns} 个运行中`,
            `項目與執行台，${resolvedActiveRuns} 個運行中`,
            `Workspaces & Execution, ${resolvedActiveRuns} active runs`,
          )}
          onPress={() => router.push("/projects")}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            opacity: pressed ? 0.72 : 1,
          })}
        >
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text
              style={{
                color: tokens.foreground,
                fontSize: 20,
                lineHeight: 26,
                fontWeight: "600",
              }}
            >
              {copy("项目与执行台", "項目與執行台", "Workspaces & Execution")}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: tokens.mutedForeground,
                fontSize: 13.5,
                lineHeight: 18,
              }}
            >
              {copy(
                `当前空间 · ${resolvedSpaceName}`,
                `當前空間 · ${resolvedSpaceName}`,
                `Current space · ${resolvedSpaceName}`,
              )}
            </Text>
          </View>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              borderWidth: 2.5,
              borderColor: softAccentInk,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: tokens.foreground,
                fontSize: 18,
                fontWeight: "600",
                fontVariant: ["tabular-nums"],
              }}
            >
              {resolvedActiveRuns}
            </Text>
          </View>
        </Pressable>

        <View style={{ marginTop: 18, flexDirection: "row", alignItems: "stretch", gap: 16 }}>
          <Pressable
            testID="home-hub-projects-split"
            accessibilityRole="button"
            accessibilityLabel={copy("项目工作区", "項目工作區", "Projects")}
            onPress={() => router.push("/projects")}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              opacity: pressed ? 0.68 : 1,
            })}
          >
            <View
              style={{
                width: 2,
                alignSelf: "stretch",
                minHeight: 34,
                borderRadius: 2,
                backgroundColor: softAccentInk,
              }}
            />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text
                numberOfLines={1}
                style={{ color: tokens.foreground, fontSize: 14, fontWeight: "600" }}
              >
                {copy("项目工作区", "項目工作區", "Projects")}
              </Text>
              <Text
                numberOfLines={1}
                style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 16 }}
              >
                {copy("多目录隔离会话", "多目錄隔離會話", "Isolated folders")}
              </Text>
            </View>
            <Text
              style={{
                color: tokens.foreground,
                fontSize: 20,
                fontWeight: "600",
                fontVariant: ["tabular-nums"],
              }}
            >
              {projectCount !== null ? projectCount : "—"}
            </Text>
          </Pressable>

          <Pressable
            testID="home-hub-computer-split"
            accessibilityRole="button"
            accessibilityLabel={copy("云电脑画面", "雲電腦畫面", "Computer")}
            onPress={openComputer}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              opacity: pressed ? 0.68 : 1,
            })}
          >
            <View
              style={{
                width: 2,
                alignSelf: "stretch",
                minHeight: 34,
                borderRadius: 2,
                backgroundColor: softAccentInk,
              }}
            />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text
                numberOfLines={1}
                style={{ color: tokens.foreground, fontSize: 14, fontWeight: "600" }}
              >
                {copy("云电脑画面", "雲電腦畫面", "Computer")}
              </Text>
              <Text
                numberOfLines={1}
                style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 16 }}
              >
                {copy("远程桌面与接管", "遠程桌面與接管", "Live desktop")}
              </Text>
            </View>
            <Text
              style={{
                color: tokens.foreground,
                fontSize: resolvedActiveRuns > 0 ? 20 : 15,
                fontWeight: "600",
                fontVariant: ["tabular-nums"],
              }}
            >
              {resolvedActiveRuns > 0
                ? resolvedActiveRuns
                : bots.length > 0
                  ? copy("就绪", "就緒", "Ready")
                  : "—"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 2-Column Bento Feature Grid */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {/* Tile 1: GitHub */}
        <Pressable
          testID="home-hub-github-tile"
          accessibilityRole="button"
          accessibilityLabel="GitHub"
          onPress={() => router.push("/github")}
          style={({ pressed }) => [
            cardSurface("sage"),
            {
              flexBasis: "47%",
              flexGrow: 1,
              minWidth: 148,
              minHeight: 170,
              padding: 18,
              overflow: "hidden",
              justifyContent: "space-between",
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 6,
              }}
            >
              <Text style={{ color: tokens.foreground, fontSize: 16, fontWeight: "600" }}>
                GitHub
              </Text>
              <Text
                numberOfLines={1}
                style={{ color: tokens.mutedForeground, fontSize: 12, flexShrink: 1 }}
              >
                {githubConnected && githubLogin ? `@${githubLogin}` : copy("仓库", "倉庫", "Repos")}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                gap: 5,
                marginTop: 8,
              }}
            >
              <Text
                style={{
                  color: tokens.foreground,
                  fontSize: githubRepoCount !== null ? 30 : 22,
                  lineHeight: githubRepoCount !== null ? 34 : 28,
                  fontWeight: "700",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {githubRepoCount !== null
                  ? githubRepoCount
                  : githubConnected
                    ? copy("已连接", "已連接", "Connected")
                    : copy("未连接", "未連接", "Connect")}
              </Text>
              {githubRepoCount !== null ? (
                <Text style={{ color: tokens.mutedForeground, fontSize: 12.5 }}>
                  {copy("仓库", "倉庫", "repos")}
                </Text>
              ) : null}
            </View>
          </View>

          <View
            pointerEvents="none"
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 5,
              marginTop: 14,
            }}
          >
            {WEEKDAY_INITIALS.map((dayInitial, index) => {
              const weight = barWeights[index] ?? 0.3;
              const barHeight = Math.round(10 + weight * 24);
              const emphasized = index === 2 || weight >= 0.65;
              return (
                <View key={index} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                  <View
                    style={{
                      width: "100%",
                      maxWidth: 16,
                      height: barHeight,
                      borderRadius: 5,
                      backgroundColor: emphasized ? barActiveFill : barMutedFill,
                      opacity: emphasized ? 0.85 : 0.55,
                    }}
                  />
                  <Text
                    style={{
                      color: tokens.mutedForeground,
                      fontSize: 10,
                      lineHeight: 12,
                    }}
                  >
                    {dayInitial}
                  </Text>
                </View>
              );
            })}
          </View>
        </Pressable>

        {/* Tile 2: Connect Apps */}
        <Pressable
          testID="home-hub-integrations-tile"
          accessibilityRole="button"
          accessibilityLabel={copy("连接应用", "連接應用", "Connect Apps")}
          onPress={() => router.push("/integrations")}
          style={({ pressed }) => [
            cardSurface("rose"),
            {
              flexBasis: "47%",
              flexGrow: 1,
              minWidth: 148,
              minHeight: 170,
              padding: 18,
              overflow: "hidden",
              justifyContent: "space-between",
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 6,
              }}
            >
              <Text style={{ color: tokens.foreground, fontSize: 16, fontWeight: "600" }}>
                {copy("连接应用", "連接應用", "Connect Apps")}
              </Text>
              <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                {copy("MCP & 插件", "MCP & 插件", "MCP")}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                gap: 5,
                marginTop: 8,
              }}
            >
              <Text
                style={{
                  color: tokens.foreground,
                  fontSize: connectedAppsCount !== null ? 30 : 22,
                  lineHeight: connectedAppsCount !== null ? 34 : 28,
                  fontWeight: "700",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {connectedAppsCount !== null
                  ? connectedAppsCount
                  : copy("应用中心", "應用中心", "Catalog")}
              </Text>
              {connectedAppsCount !== null ? (
                <Text style={{ color: tokens.mutedForeground, fontSize: 12.5 }}>
                  {copy("已连接", "已連接", "linked")}
                </Text>
              ) : null}
            </View>
          </View>

          <View pointerEvents="none" style={{ gap: 8, marginTop: 14 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                gap: 4,
                height: 24,
              }}
            >
              {RHYTHM_HEIGHTS.map((height, index) => (
                <View
                  key={index}
                  style={{
                    flex: 1,
                    height,
                    borderRadius: 2,
                    backgroundColor: rhythmFill,
                    opacity: index % 3 === 0 ? 0.68 : 0.34,
                  }}
                />
              ))}
            </View>
            <Text
              numberOfLines={1}
              style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 16 }}
            >
              {copy("管理外部工具与连接器", "管理外部工具與連接器", "Tools & connectors")}
            </Text>
          </View>
        </Pressable>

        {/* Tile 3: Routines & Skills */}
        <View
          style={[
            cardSurface("lavender"),
            {
              flexBasis: "47%",
              flexGrow: 1,
              minWidth: 148,
              minHeight: 168,
              padding: 18,
              overflow: "hidden",
              justifyContent: "space-between",
            },
          ]}
        >
          <Pressable
            testID="home-hub-routines-tile"
            accessibilityRole="button"
            accessibilityLabel={copy("例行与技能", "例行與技能", "Routines & Skills")}
            onPress={openRoutines}
            style={({ pressed }) => ({
              gap: 6,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 6,
              }}
            >
              <Text style={{ color: tokens.foreground, fontSize: 16, fontWeight: "600" }}>
                {copy("例行与技能", "例行與技能", "Routines & Skills")}
              </Text>
              <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                {copy("自动", "自動", "Auto")}
              </Text>
            </View>
            <Text
              style={{
                color: tokens.foreground,
                fontSize: 22,
                lineHeight: 28,
                fontWeight: "700",
                marginTop: 2,
              }}
            >
              {copy("例行任务", "例行任務", "Routines")}
            </Text>
            <Text
              numberOfLines={2}
              style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 17 }}
            >
              {copy(
                "定时唤醒伙伴自动执行工作流",
                "定時喚醒夥伴自動執行工作流",
                "Scheduled agent workflows",
              )}
            </Text>
          </Pressable>

          <Pressable
            testID="home-hub-skills-chip"
            accessibilityRole="button"
            accessibilityLabel={copy("技能库", "技能庫", "Skills")}
            onPress={() => router.push("/skills")}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              marginTop: 12,
              backgroundColor: chipBackground,
              borderRadius: 999,
              paddingHorizontal: 11,
              paddingVertical: 5,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: chipBorder,
              opacity: pressed ? 0.68 : 1,
            })}
          >
            <Text style={{ color: tokens.foreground, fontSize: 12.5, fontWeight: "600" }}>
              {copy("技能库 ›", "技能庫 ›", "Skills ›")}
            </Text>
          </Pressable>
        </View>

        {/* Tile 4: Artifacts & Theme Packs */}
        <View
          style={[
            cardSurface("pearl"),
            {
              flexBasis: "47%",
              flexGrow: 1,
              minWidth: 148,
              minHeight: 168,
              padding: 18,
              overflow: "hidden",
              justifyContent: "space-between",
            },
          ]}
        >
          <Pressable
            testID="home-hub-artifacts-tile"
            accessibilityRole="button"
            accessibilityLabel={copy("文件与换肤", "文件與換膚", "Files & Themes")}
            onPress={() => router.push("/artifacts")}
            style={({ pressed }) => ({
              gap: 6,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 6,
              }}
            >
              <Text style={{ color: tokens.foreground, fontSize: 16, fontWeight: "600" }}>
                {copy("文件与换肤", "文件與換膚", "Files & Themes")}
              </Text>
              <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                {copy("产物", "產物", "Files")}
              </Text>
            </View>
            <Text
              style={{
                color: tokens.foreground,
                fontSize: 22,
                lineHeight: 28,
                fontWeight: "700",
                marginTop: 2,
              }}
            >
              {copy("生成文件", "生成文件", "Artifacts")}
            </Text>
            <Text
              numberOfLines={2}
              style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 17 }}
            >
              {copy(
                "浏览伙伴生成的文档与代码产物",
                "瀏覽夥伴生成的文檔與代碼產物",
                "Browse generated files & media",
              )}
            </Text>
          </Pressable>

          <Pressable
            testID="home-hub-appearance-chip"
            accessibilityRole="button"
            accessibilityLabel={copy("外观与换肤", "外觀與換膚", "Themes & Appearance")}
            onPress={openAppearance}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              marginTop: 12,
              backgroundColor: chipBackground,
              borderRadius: 999,
              paddingHorizontal: 11,
              paddingVertical: 5,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: chipBorder,
              opacity: pressed ? 0.68 : 1,
            })}
          >
            <Text style={{ color: tokens.foreground, fontSize: 12.5, fontWeight: "600" }}>
              {copy("外观与换肤 ›", "外觀與換膚 ›", "Themes ›")}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
