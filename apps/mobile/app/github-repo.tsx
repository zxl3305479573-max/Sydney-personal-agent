import type { GithubRepoSummary } from "@rakazo/contracts";
import { typeScale } from "@rakazo/ui-tokens";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useSyncExternalStore } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { GithubBotAnalysis } from "../components/github-bot-analysis";
import { GlassSurface } from "../components/glass-surface";
import { glassHeaderOptions } from "../components/glass-title";
import { NativeActionButton } from "../components/native-action-button";
import { cardGradient } from "../lib/card-gradient";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { projectScopeKey, subscribeProjectScope } from "../lib/project-scope";
import { useScreenBackground } from "../lib/scoped-theme-context";
import { useSideInsets } from "../lib/side-insets";
import { readGithubRepoPreview, useGithubRepoDetail } from "../lib/use-github";

function isLightSurface(background?: string): boolean {
  if (!background || !background.startsWith("#") || background.length < 7) return true;
  return Number.parseInt(background.slice(1, 3), 16) >= 128;
}

export default function GithubRepoScreen() {
  const scopeKey = useSyncExternalStore(subscribeProjectScope, projectScopeKey);
  const params = useLocalSearchParams<{
    owner?: string;
    repo?: string;
    id?: string;
    fullName?: string;
    description?: string;
    isPrivate?: string;
  }>();
  const owner = typeof params.owner === "string" ? params.owner : "";
  const repoName = typeof params.repo === "string" ? params.repo : "";
  const isPrivate = params.isPrivate === "1";

  const { detail, loading, refreshing, error, refresh, pullToRefresh } = useGithubRepoDetail(
    scopeKey,
    owner,
    repoName,
    isPrivate,
  );
  const cachedPreview = useMemo(
    () => (owner && repoName ? readGithubRepoPreview(scopeKey, owner, repoName) : null),
    [scopeKey, owner, repoName],
  );
  const repoSummary = useMemo<GithubRepoSummary | null>(() => {
    if (detail?.repo) return detail.repo;
    if (cachedPreview) return cachedPreview;
    if (!owner || !repoName) return null;
    const fullName =
      typeof params.fullName === "string" && params.fullName
        ? params.fullName
        : `${owner}/${repoName}`;
    return {
      id: typeof params.id === "string" && params.id ? params.id : fullName,
      ownerLogin: owner,
      ownerAvatarUrl: null,
      name: repoName,
      fullName,
      description:
        typeof params.description === "string" && params.description ? params.description : null,
      isPrivate,
      isFork: false,
      isArchived: false,
      primaryLanguage: null,
      stargazerCount: 0,
      forkCount: 0,
      openIssuesCount: 0,
      defaultBranch: "main",
      htmlUrl: `https://github.com/${owner}/${repoName}`,
      homepageUrl: null,
      cloneUrl: `https://github.com/${owner}/${repoName}.git`,
      sshUrl: `git@github.com:${owner}/${repoName}.git`,
      licenseSpdxId: null,
      pushedAt: null,
      updatedAt: "",
      topics: [],
    };
  }, [
    detail?.repo,
    cachedPreview,
    owner,
    repoName,
    params.fullName,
    params.id,
    params.description,
    isPrivate,
  ]);

  const tokens = useMobileTokens();
  const screenBackground = useScreenBackground(tokens.background);
  const sideInsets = useSideInsets();
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);

  const isLight = isLightSurface(tokens?.background);
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder = isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const accentTaupe = isLight ? "#6E675E" : "#B8B3AA";
  const fg = tokens?.foreground ?? (isLight ? "#26231F" : "#F5F4F0");
  const mutedFg = tokens?.mutedForeground ?? accentTaupe;
  const destructive = tokens?.destructive ?? (isLight ? "#C4272D" : "#FF8F8C");
  const cardShadow = {
    shadowColor: "#26231F",
    shadowOpacity: isLight ? 0.028 : 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  } as const;
  const cardFallbackStyle = {
    backgroundColor: cardBg,
    experimental_backgroundImage: cardGradient(isLight, "sage"),
    overflow: "hidden" as const,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: cardBorder,
    ...cardShadow,
  } as const;
  const headingStyle = { color: fg, ...typeScale.headline };
  const bodyStyle = { color: fg, ...typeScale.secondary };
  const mutedStyle = { color: mutedFg, ...typeScale.caption };

  const headerTitle = repoSummary?.name || repoName || "GitHub";

  return (
    <View style={{ flex: 1, backgroundColor: screenBackground }}>
      <Stack.Screen options={glassHeaderOptions(headerTitle)} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={sideInsets}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 20, paddingBottom: 36, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} />}
      >
        {error ? (
          <GlassSurface
            accessibilityLiveRegion="polite"
            shape="roundedRectangle"
            cornerRadius={20}
            style={{ borderRadius: 20, padding: 18, gap: 10 }}
            fallbackStyle={cardFallbackStyle}
          >
            <Text style={{ color: destructive }}>{error}</Text>
            <NativeActionButton label={text("重试", "Retry")} onPress={refresh} />
          </GlassSurface>
        ) : null}

        {repoSummary ? (
          <>
            <GlassSurface
              shape="roundedRectangle"
              cornerRadius={22}
              style={{ borderRadius: 22, padding: 18, gap: 8 }}
              fallbackStyle={{ ...cardFallbackStyle, borderRadius: 22 }}
            >
              <Text style={headingStyle}>{repoSummary.fullName}</Text>
              {repoSummary.description ? (
                <Text style={bodyStyle}>{repoSummary.description}</Text>
              ) : null}
            </GlassSurface>

            <GithubBotAnalysis key={repoSummary.id} repo={repoSummary} scopeKey={scopeKey} />
          </>
        ) : null}

        {loading && !detail ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <ActivityIndicator color={mutedFg} />
          </View>
        ) : null}

        {detail ? (
          <>
            <GlassSurface
              shape="roundedRectangle"
              cornerRadius={20}
              style={{ borderRadius: 20, padding: 18, gap: 10 }}
              fallbackStyle={cardFallbackStyle}
            >
              <Text style={headingStyle}>README</Text>
              <Text selectable style={bodyStyle}>
                {detail.readme?.content ?? text("暂无 README", "No README available")}
              </Text>
              {detail.readme?.truncated ? (
                <Text style={mutedStyle}>{text("内容已截断", "Content is truncated")}</Text>
              ) : null}
            </GlassSurface>

            <GlassSurface
              shape="roundedRectangle"
              cornerRadius={20}
              style={{ borderRadius: 20, padding: 18, gap: 10 }}
              fallbackStyle={cardFallbackStyle}
            >
              <Text style={headingStyle}>{text("近期提交", "Recent commits")}</Text>
              {detail.recentCommits.map((commit) => (
                <View
                  key={commit.sha}
                  style={{
                    backgroundColor: chipBg,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderWidth: 0.5,
                    borderColor: chipBorder,
                  }}
                >
                  <Text selectable style={bodyStyle}>
                    {commit.shortSha} · {commit.message}
                  </Text>
                </View>
              ))}
            </GlassSurface>

            <GlassSurface
              shape="roundedRectangle"
              cornerRadius={20}
              style={{ borderRadius: 20, padding: 18, gap: 10 }}
              fallbackStyle={cardFallbackStyle}
            >
              <Text style={headingStyle}>{text("最新版本", "Latest release")}</Text>
              <Text selectable style={bodyStyle}>
                {detail.latestRelease
                  ? `${detail.latestRelease.tagName}\n${detail.latestRelease.body}`
                  : text("暂无版本", "No release available")}
              </Text>
              <Text selectable style={mutedStyle}>
                {detail.repo.cloneUrl}
              </Text>
            </GlassSurface>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
