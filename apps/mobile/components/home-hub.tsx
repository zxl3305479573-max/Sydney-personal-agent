import type { SpaceBot } from "@rakazo/contracts";
import { accountDisplay, isRunWorking } from "@rakazo/core";
import { botColors } from "@rakazo/ui-tokens";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import {
  Platform,
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
import { promptForAvailableUpdate, useClientUpdateState } from "../lib/client-update";
import { conversationStatusLabel, isConversationActiveStatus } from "../lib/conversation-status";
import type { HomeWeatherSnapshot } from "../lib/home-weather";
import {
  homeWeatherLabel,
  homeWeatherSymbol,
  isDaytimeHour,
  useHomeWeather,
} from "../lib/home-weather";
import { useI18n } from "../lib/i18n";
import type { InboxGroup } from "../lib/inbox-spaces";
import { native, useMobileTokens, useResolvedAppearance } from "../lib/native";
import { refreshPersonalFinance } from "../lib/personal-finance";
import { previewSnippet } from "../lib/preview";
import { useBottomSafeAreaClaimed } from "../lib/side-insets";
import { sydneyReleaseFromManifest } from "../lib/sydney-release";
import { registerTabScrollToTop } from "../lib/tab-scroll-to-top";
import { BotAvatar } from "./bot-avatar";
import { HomeCompanionCard } from "./home-companion-card";
import { HomeFinanceCard } from "./home-finance-card";
import { HomeMapCard } from "./home-map-card";
import { MotionPressable } from "./motion-pressable";
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
  weather?: HomeWeatherSnapshot | null;
  error?: string | null;
  onRefresh?: () => void;
  onOpenBot?: (bot: MobileBot | SpaceBot) => void;
  onCreateBot?: () => void;
};

function padTwo(value: number): string {
  return String(value).padStart(2, "0");
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
  bots,
  githubConnected = false,
  githubLogin = null,
  githubRepoCount = null,
  githubRecentCounts = null,
  connectedAppsCount = null,
  refreshing = false,
  now,
  weather,
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

  const {
    weather: liveWeather,
    clockNow,
    refreshWeather,
  } = useHomeWeather({ enabled: weather === undefined, fixedNow: now });
  const currentDate = now ?? clockNow;
  const resolvedWeather = weather !== undefined ? weather : liveWeather;
  const weatherLabel = resolvedWeather ? homeWeatherLabel(resolvedWeather.condition, locale) : null;
  const weatherSymbol = resolvedWeather
    ? homeWeatherSymbol(resolvedWeather.condition, now ? isDaytimeHour(now) : resolvedWeather.isDay)
    : null;
  const handleRefresh = onRefresh
    ? () => {
        onRefresh();
        if (weather === undefined) void refreshWeather(true);
        void refreshPersonalFinance();
      }
    : undefined;
  const gutters = readableGutters(windowWidth, { left: insets.left, right: insets.right });

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
  const barMutedFill = isLight ? "#C9C3B9" : "#4E5563";
  const barActiveFill = isLight ? "#7A7368" : "#A6ACB8";
  const rhythmFill = isLight ? "#8C857A" : "#9BA3B2";

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

  const {
    update: availableUpdate,
    downloaded: updateDownloaded,
    downloading: updateDownloading,
    progress: updateProgress = 0,
  } = useClientUpdateState();
  const availableRelease = availableUpdate
    ? sydneyReleaseFromManifest(availableUpdate.manifest)
    : null;
  const updatePercent = Math.round(Math.max(0, Math.min(1, updateProgress)) * 100);
  const showUpdatePill = Boolean(availableUpdate || updateDownloading);
  const updatePillLabel = updateDownloading
    ? updatePercent > 0 && updatePercent < 100
      ? copy(`更新中 ${updatePercent}%`, `更新中 ${updatePercent}%`, `Updating ${updatePercent}%`)
      : copy("更新中…", "更新中…", "Updating…")
    : updateDownloaded
      ? copy("重启更新", "重啟更新", "Restart")
      : copy("可以更新", "可以更新", "Update");
  const updatePillA11yLabel = availableRelease
    ? updateDownloaded
      ? copy(
          `版本 ${availableRelease.version} 已下载，点击重启更新`,
          `版本 ${availableRelease.version} 已下載，點擊重啟更新`,
          `Version ${availableRelease.version} ready, tap to restart`,
        )
      : copy(
          `有新版本 ${availableRelease.version} 可以更新`,
          `有新版本 ${availableRelease.version} 可以更新`,
          `Version ${availableRelease.version} available to update`,
        )
    : updatePillLabel;
  const handleOpenUpdate = () => {
    if (!availableUpdate || updateDownloading) return;
    promptForAvailableUpdate(
      { id: availableUpdate.updateId, release: availableRelease },
      updateDownloaded,
    );
  };

  const greetingText = buildGreeting(currentDate, locale, me, t("You"));

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

  const scrollRef = useRef<ScrollView>(null);
  useEffect(
    () =>
      registerTabScrollToTop("/", () => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }),
    [],
  );

  return (
    <ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      testID="home-hub-scroll"
      style={{ flex: 1, backgroundColor: tokens.background }}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingTop: Math.max(insets.top, 16) + 8,
        paddingBottom: bottomClaimed ? 28 : Math.max(insets.bottom, 16) + 24,
        paddingLeft: 20 + gutters.left,
        paddingRight: 20 + gutters.right,
        gap: 14,
      }}
      refreshControl={
        handleRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            progressViewOffset={Platform.OS === "android" ? insets.top : 0}
            tintColor={native.secondaryLabel}
            colors={[tokens.mutedForeground]}
            progressBackgroundColor={tokens.muted}
          />
        ) : undefined
      }
    >
      {/* Header Row 1: Date + Optional Update Pill + Search + Settings */}
      <View
        style={{
          minHeight: 36,
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
          {showUpdatePill ? (
            <MotionPressable
              preset="control"
              testID="home-hub-update-pill"
              accessibilityRole="button"
              accessibilityLabel={updatePillA11yLabel}
              disabled={updateDownloading}
              onPress={handleOpenUpdate}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                backgroundColor: tokens.card,
                borderRadius: 999,
                paddingHorizontal: 11,
                paddingVertical: 5,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: tokens.border,
              }}
            >
              <NativeSymbol
                ios={
                  updateDownloading
                    ? "arrow.down.circle"
                    : updateDownloaded
                      ? "arrow.clockwise.circle.fill"
                      : "arrow.down.circle.fill"
                }
                android={
                  updateDownloading
                    ? "download-outline"
                    : updateDownloaded
                      ? "refresh-circle"
                      : "arrow-down-circle"
                }
                size={12}
                color={tokens.foreground}
              />
              <Text
                numberOfLines={1}
                style={{
                  color: tokens.foreground,
                  fontSize: 12.5,
                  lineHeight: 16,
                  fontWeight: "600",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {updatePillLabel}
              </Text>
            </MotionPressable>
          ) : null}
          <MotionPressable
            preset="icon"
            testID="home-hub-search-button"
            accessibilityRole="button"
            accessibilityLabel={t("Search")}
            onPress={() => router.push("/search")}
            hitSlop={4}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: tokens.card,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: tokens.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <NativeSymbol
              ios="magnifyingglass"
              android="search"
              size={16}
              color={tokens.foreground}
            />
          </MotionPressable>
          <MotionPressable
            preset="icon"
            testID="home-hub-settings-button"
            accessibilityRole="button"
            accessibilityLabel={t("Settings")}
            onPress={() => router.push("/settings-home")}
            hitSlop={4}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: tokens.card,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: tokens.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <NativeSymbol
              ios="gearshape"
              android="settings-outline"
              size={17}
              color={tokens.foreground}
            />
          </MotionPressable>
        </View>
      </View>

      {/* Header Row 2: Time-based Serif Greeting + Realtime Weather */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          columnGap: 10,
          rowGap: 6,
          marginTop: -2,
          marginBottom: 2,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            color: tokens.foreground,
            fontSize: 30,
            lineHeight: 36,
            fontWeight: "700",
            flexShrink: 1,
          }}
        >
          {greetingText}
        </Text>
        {resolvedWeather && weatherLabel && weatherSymbol ? (
          <MotionPressable
            preset="control"
            testID="home-hub-weather"
            accessibilityRole="button"
            accessibilityLabel={`${resolvedWeather.temperatureC}°C ${weatherLabel}`}
            onPress={() => router.push("/weather")}
            hitSlop={4}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: chipBackground,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: chipBorder,
            }}
          >
            <NativeSymbol
              ios={weatherSymbol.ios}
              android={weatherSymbol.android}
              size={16}
              color={softAccentInk}
            />
            <Text
              style={{
                color: tokens.foreground,
                fontSize: 13.5,
                lineHeight: 17,
                fontWeight: "600",
                fontVariant: ["tabular-nums"],
              }}
            >
              {`${resolvedWeather.temperatureC}°`}
            </Text>
          </MotionPressable>
        ) : null}
      </View>

      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: tokens.mutedForeground, fontSize: 13.5, lineHeight: 18 }}
        >
          {error}
        </Text>
      ) : null}

      {/* Pinned / Latest Spotlight Dark Atmospheric Banner */}
      <MotionPressable
        preset="card"
        activeOpacity={0.92}
        testID="home-hub-spotlight"
        accessibilityRole="button"
        accessibilityLabel={`${spotlightPreview} ${spotlightMeta}`}
        onPress={() => (spotlightBot ? openBotThread(spotlightBot) : triggerCreateBot())}
        style={{
          borderRadius: 22,
          backgroundColor: isLight ? "#2E2B27" : "#252830",
          experimental_backgroundImage: cardGradient(isLight, "spotlight"),
          padding: 16,
          overflow: "hidden",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: "rgba(250, 248, 244, 0.14)",
        }}
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
            backgroundColor: "rgba(246, 242, 234, 0.10)",
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
            backgroundColor: "rgba(24, 22, 19, 0.16)",
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
      </MotionPressable>

      {/* Background Companion Control Card */}
      <HomeCompanionCard
        bots={bots}
        primaryBot={primaryBot}
        spaceId={me?.spaceId ?? null}
        cardStyle={cardSurface("lavender")}
        onOpenBot={openBotThread}
      />

      {/* Map & Amap Navigation Widget Card */}
      <HomeMapCard cardStyle={cardSurface("sage")} />

      {/* Personal Bills & Payment Methods Vault Entry Card */}
      <HomeFinanceCard cardStyle={cardSurface("champagne")} />

      {/* 2-Column Bento Feature Grid */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {/* Tile 1: GitHub */}
        <MotionPressable
          preset="card"
          testID="home-hub-github-tile"
          accessibilityRole="button"
          accessibilityLabel="GitHub"
          onPress={() => router.push("/github")}
          style={[
            cardSurface("sage"),
            {
              flexBasis: "47%",
              flexGrow: 1,
              minWidth: 148,
              minHeight: 170,
              padding: 18,
              overflow: "hidden",
              justifyContent: "space-between",
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
        </MotionPressable>

        {/* Tile 2: Connect Apps */}
        <MotionPressable
          preset="card"
          testID="home-hub-integrations-tile"
          accessibilityRole="button"
          accessibilityLabel={copy("连接应用", "連接應用", "Connect Apps")}
          onPress={() => router.push("/integrations")}
          style={[
            cardSurface("rose"),
            {
              flexBasis: "47%",
              flexGrow: 1,
              minWidth: 148,
              minHeight: 170,
              padding: 18,
              overflow: "hidden",
              justifyContent: "space-between",
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
        </MotionPressable>

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
          <MotionPressable
            preset="card"
            testID="home-hub-routines-tile"
            accessibilityRole="button"
            accessibilityLabel={copy("例行与技能", "例行與技能", "Routines & Skills")}
            onPress={openRoutines}
            style={{ gap: 6 }}
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
          </MotionPressable>

          <MotionPressable
            preset="control"
            testID="home-hub-skills-chip"
            accessibilityRole="button"
            accessibilityLabel={copy("技能库", "技能庫", "Skills")}
            onPress={() => router.push("/skills")}
            style={{
              alignSelf: "flex-start",
              marginTop: 12,
              backgroundColor: chipBackground,
              borderRadius: 999,
              paddingHorizontal: 11,
              paddingVertical: 5,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: chipBorder,
            }}
          >
            <Text style={{ color: tokens.foreground, fontSize: 12.5, fontWeight: "600" }}>
              {copy("技能库 ›", "技能庫 ›", "Skills ›")}
            </Text>
          </MotionPressable>
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
          <MotionPressable
            preset="card"
            testID="home-hub-artifacts-tile"
            accessibilityRole="button"
            accessibilityLabel={copy("文件与换肤", "文件與換膚", "Files & Themes")}
            onPress={() => router.push("/artifacts")}
            style={{ gap: 6 }}
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
          </MotionPressable>

          <MotionPressable
            preset="control"
            testID="home-hub-appearance-chip"
            accessibilityRole="button"
            accessibilityLabel={copy("外观与换肤", "外觀與換膚", "Themes & Appearance")}
            onPress={openAppearance}
            style={{
              alignSelf: "flex-start",
              marginTop: 12,
              backgroundColor: chipBackground,
              borderRadius: 999,
              paddingHorizontal: 11,
              paddingVertical: 5,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: chipBorder,
            }}
          >
            <Text style={{ color: tokens.foreground, fontSize: 12.5, fontWeight: "600" }}>
              {copy("外观与换肤 ›", "外觀與換膚 ›", "Themes ›")}
            </Text>
          </MotionPressable>
        </View>
      </View>
    </ScrollView>
  );
}
