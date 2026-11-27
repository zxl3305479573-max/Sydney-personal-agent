import type { GithubRepoSummary } from "@rakazo/contracts";
import { typeScale } from "@rakazo/ui-tokens";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { FeatureDisabledView } from "../components/feature-disabled-view";
import { GlassSurface } from "../components/glass-surface";
import { MenuPicker } from "../components/menu-picker";
import { MotionPressable } from "../components/motion-pressable";
import { NativeActionButton } from "../components/native-action-button";
import { NativeSwitch } from "../components/native-switch";
import { NativeSymbol } from "../components/native-symbol";
import { cardGradient } from "../lib/card-gradient";
import { useFeatureAccess } from "../lib/feature-access";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { usePageScroll, usePageState } from "../lib/page-state";
import { projectScopeKey, subscribeProjectScope } from "../lib/project-scope";
import { useScreenBackground } from "../lib/scoped-theme-context";
import { useSideInsets } from "../lib/side-insets";
import type { GithubSection } from "../lib/use-github";
import { rememberGithubRepoPreview, useGithub } from "../lib/use-github";

function isLightSurface(background?: string): boolean {
  if (!background || !background.startsWith("#") || background.length < 7) return true;
  return Number.parseInt(background.slice(1, 3), 16) >= 128;
}

export default function GithubScreen() {
  const { github } = useFeatureAccess();
  const scopeKey = useSyncExternalStore(subscribeProjectScope, projectScopeKey);
  if (!github) return <FeatureDisabledView feature="github" />;
  return <GithubBrowser key={scopeKey} scopeKey={scopeKey} />;
}

function GithubBrowser({ scopeKey }: { scopeKey: string }) {
  const router = useRouter();
  const github = useGithub(scopeKey);
  const scroll = usePageScroll(scopeKey, [
    "github-view",
    "contents",
    github.section,
    github.year,
    github.query,
    github.repositoryFilters,
    github.exploreFilters,
    github.hidePrivate,
  ]);
  const tokens = useMobileTokens();
  const screenBackground = useScreenBackground(tokens.background);
  const sideInsets = useSideInsets();
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
  const [token, setToken] = useState("");
  const [query, setQuery] = usePageState(scopeKey, ["github-view", "draftQuery"], github.query);
  const [language, setLanguage] = usePageState(scopeKey, ["github-view", "draftLanguage"], "");
  const [topic, setTopic] = usePageState(scopeKey, ["github-view", "draftTopic"], "");
  useFocusEffect(useCallback(() => () => setToken(""), []));
  const connected = github.status?.status === "connected";
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
  const inputStyle = {
    color: fg,
    backgroundColor: cardBg,
    borderColor: cardBorder,
    borderWidth: 0.5,
    borderRadius: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  };
  const sections: Array<{ id: GithubSection; label: string }> = [
    { id: "profile", label: text("个人主页", "Profile") },
    { id: "repositories", label: text("我的仓库", "My repositories") },
    { id: "explore", label: text("开源探索", "Explore") },
  ];
  const contributionFill = (count: number) => {
    if (!count) return isLight ? "#EDE9E0" : "#2A303B";
    if (count >= 8) return isLight ? "#5B7A62" : "#769E80";
    if (count >= 4) return isLight ? "#7E9B84" : "#61846A";
    return isLight ? "#A7BEAA" : "#4A6652";
  };

  const openRepo = (repo: GithubRepoSummary) => {
    rememberGithubRepoPreview(scopeKey, repo);
    router.push({
      pathname: "/github-repo",
      params: {
        owner: repo.ownerLogin,
        repo: repo.name,
        id: repo.id,
        fullName: repo.fullName,
        description: repo.description ?? "",
        isPrivate: repo.isPrivate ? "1" : "0",
      },
    });
  };

  const renderRepoCard = ({ item: repo }: { item: GithubRepoSummary }) => {
    const metadata = [
      repo.primaryLanguage?.name,
      `★ ${repo.stargazerCount}`,
      `${repo.forkCount} ${text("分支", "forks")}`,
      repo.isPrivate ? text("私有", "Private") : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <MotionPressable
        preset="card"
        accessibilityRole="button"
        accessibilityLabel={[repo.fullName, repo.description, metadata].filter(Boolean).join(". ")}
        accessibilityState={{ disabled: github.busy }}
        onPress={() => openRepo(repo)}
        disabled={github.busy}
        style={{ opacity: github.busy ? 0.5 : 1 }}
      >
        <GlassSurface
          shape="roundedRectangle"
          cornerRadius={20}
          gradient="sage"
          style={{
            borderRadius: 20,
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
          }}
          fallbackStyle={cardFallbackStyle}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: chipBg,
              borderWidth: 0.5,
              borderColor: chipBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <NativeSymbol
              ios={repo.isPrivate ? "lock.fill" : "book.closed.fill"}
              android={repo.isPrivate ? "lock-closed-outline" : "git-branch-outline"}
              size={18}
              color={accentTaupe}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
            <Text style={{ color: fg, ...typeScale.cardTitle }}>{repo.fullName}</Text>
            {repo.description ? <Text style={bodyStyle}>{repo.description}</Text> : null}
            <Text style={mutedStyle}>{metadata}</Text>
          </View>
          <NativeSymbol ios="chevron.right" android="chevron-forward" size={15} color={mutedFg} />
        </GlassSurface>
      </MotionPressable>
    );
  };

  const result = github.section === "explore" ? github.search : github.repositories;
  const overview = github.overview;
  const visibleRepos =
    github.section === "profile"
      ? connected && overview
        ? github.visible(overview.pinnedRepos.length ? overview.pinnedRepos : overview.recentRepos)
        : []
      : result
        ? github.visible(result.items)
        : [];

  const submitSearch = () => {
    github.setQuery(query);
    if (github.section === "explore")
      github.filterExplore({
        language: language.trim() || undefined,
        topic: topic.trim() || undefined,
      });
    else github.filterRepositories({ language: language.trim() || undefined });
  };

  const headerContent = (
    <View style={{ gap: 14 }}>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          width: "100%",
          minHeight: 44,
          backgroundColor: isLight ? "#EAE6DE" : "#1E222A",
          borderRadius: 24,
          padding: 3,
          gap: 3,
          borderWidth: 0.5,
          borderColor: chipBorder,
        }}
      >
        {sections.map((section) => {
          const selected = github.section === section.id;
          return (
            <MotionPressable
              key={section.id}
              preset="control"
              highlightColor={
                selected
                  ? undefined
                  : isLight
                    ? "rgba(38, 35, 31, 0.05)"
                    : "rgba(245, 244, 240, 0.06)"
              }
              accessibilityRole="tab"
              accessibilityLabel={section.label}
              accessibilityState={{
                selected,
                disabled: github.busy,
              }}
              disabled={github.busy}
              onPress={() => {
                setQuery("");
                setLanguage("");
                setTopic("");
                github.selectSection(section.id);
              }}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 21,
                paddingHorizontal: 4,
                paddingVertical: 8,
                borderWidth: 0.5,
                borderColor: selected ? cardBorder : "transparent",
                backgroundColor: selected ? (isLight ? "#FFFEFC" : "#2D3340") : "transparent",
                opacity: github.busy ? 0.45 : 1,
              }}
            >
              <Text
                style={{
                  color: selected ? (isLight ? "#26231F" : "#F5F4F0") : mutedFg,
                  fontSize: 15.5,
                  fontWeight: selected ? "600" : "500",
                  textAlign: "center",
                }}
              >
                {section.label}
              </Text>
            </MotionPressable>
          );
        })}
      </View>

      {github.error ? (
        <GlassSurface
          accessibilityLiveRegion="polite"
          shape="roundedRectangle"
          cornerRadius={20}
          style={{ borderRadius: 20, padding: 18, gap: 10 }}
          fallbackStyle={cardFallbackStyle}
        >
          <Text style={{ color: destructive }}>{github.error}</Text>
          <NativeActionButton label={text("重试", "Retry")} onPress={github.refresh} />
        </GlassSurface>
      ) : null}

      {github.status ? (
        <GlassSurface
          shape="roundedRectangle"
          cornerRadius={22}
          style={{ borderRadius: 22, padding: 18, gap: 12 }}
          fallbackStyle={{ ...cardFallbackStyle, borderRadius: 22 }}
        >
          <Text style={headingStyle}>
            {connected && github.status?.status === "connected"
              ? `@${github.status.login}`
              : text("连接 GitHub", "Connect GitHub")}
          </Text>
          {connected && github.status?.status === "connected" ? (
            <>
              {github.status.highRiskScopes.length ? (
                <Text style={{ color: destructive }}>
                  {text("此令牌包含高权限：", "This token has elevated permissions: ")}
                  {github.status.highRiskScopes.join(", ")}
                </Text>
              ) : null}
              {github.status.rateLimit ? (
                <Text style={mutedStyle}>
                  {text("剩余请求额度", "Requests remaining")}: {github.status.rateLimit.remaining}
                </Text>
              ) : null}
              <NativeActionButton
                label={text("断开 GitHub", "Disconnect GitHub")}
                prominence="destructive"
                busy={github.busy}
                onPress={() =>
                  Alert.alert(text("断开 GitHub？", "Disconnect GitHub?"), undefined, [
                    { text: text("取消", "Cancel"), style: "cancel" },
                    {
                      text: text("断开", "Disconnect"),
                      style: "destructive",
                      onPress: () => void github.disconnect(),
                    },
                  ])
                }
              />
            </>
          ) : (
            <>
              {github.status?.status === "invalid" ? (
                <Text style={{ color: destructive }}>{github.status.message}</Text>
              ) : null}
              <Text style={mutedStyle}>
                {text(
                  "使用仅授权所需仓库的只读 PAT。令牌只提交给当前后台，不保存在手机。",
                  "Use a read-only PAT limited to the repositories you need. The token is sent to your current server and is not saved on this phone.",
                )}
              </Text>
              <TextInput
                accessibilityLabel="GitHub Personal Access Token"
                placeholder="GitHub Personal Access Token"
                placeholderTextColor={mutedFg}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                maxLength={512}
                value={token}
                onChangeText={setToken}
                editable={!github.busy}
                style={{ ...inputStyle, backgroundColor: chipBg, borderColor: chipBorder }}
              />
              <NativeActionButton
                label={text("连接 GitHub", "Connect GitHub")}
                disabled={!token.trim() || github.loading}
                busy={github.busy}
                onPress={() => {
                  const submitted = token;
                  setToken("");
                  void github.connect(submitted);
                }}
              />
            </>
          )}
        </GlassSurface>
      ) : null}

      <GlassSurface
        shape="roundedRectangle"
        cornerRadius={18}
        style={{
          borderRadius: 18,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
        fallbackStyle={{ ...cardFallbackStyle, borderRadius: 18 }}
      >
        <Text style={bodyStyle}>{text("隐藏私有仓库", "Hide private repositories")}</Text>
        <NativeSwitch
          accessibilityLabel={text("隐藏私有仓库", "Hide private repositories")}
          value={github.hidePrivate}
          disabled={github.busy}
          onValueChange={github.setHidePrivate}
        />
      </GlassSurface>

      {github.section === "profile" ? (
        connected && overview ? (
          <>
            <GlassSurface
              shape="roundedRectangle"
              cornerRadius={22}
              style={{ borderRadius: 22, padding: 18, gap: 8 }}
              fallbackStyle={{ ...cardFallbackStyle, borderRadius: 22 }}
            >
              <Text style={headingStyle}>{overview.profile.name ?? overview.profile.login}</Text>
              {overview.profile.bio ? <Text style={bodyStyle}>{overview.profile.bio}</Text> : null}
              <Text style={mutedStyle}>
                {text("公开仓库", "Public repositories")}: {overview.profile.publicRepos} ·{" "}
                {text("关注者", "Followers")}: {overview.profile.followers}
              </Text>
            </GlassSurface>
            <GlassSurface
              shape="roundedRectangle"
              cornerRadius={22}
              style={{ borderRadius: 22, padding: 18, gap: 12 }}
              fallbackStyle={{ ...cardFallbackStyle, borderRadius: 22 }}
            >
              <ScrollView
                showsHorizontalScrollIndicator={false}
                horizontal
                contentContainerStyle={{ gap: 10 }}
              >
                <NativeActionButton
                  label={text("近一年", "Past year")}
                  prominence="plain"
                  selected={github.year === undefined}
                  onPress={() => github.selectYear(undefined)}
                />
                {overview.calendar.availableYears.map((year) => (
                  <NativeActionButton
                    key={year}
                    label={String(year)}
                    prominence="plain"
                    selected={github.year === year}
                    onPress={() => github.selectYear(year)}
                  />
                ))}
              </ScrollView>
              <Text style={bodyStyle}>
                {text("贡献", "Contributions")}: {overview.calendar.totalContributions}
              </Text>
              <ScrollView showsHorizontalScrollIndicator={false} horizontal>
                <View style={{ flexDirection: "row", gap: 3 }}>
                  {overview.calendar.weeks.map((week) => (
                    <View key={week.contributionDays[0]?.date} style={{ gap: 3 }}>
                      {week.contributionDays.map((day) => (
                        <View
                          key={day.date}
                          accessible
                          accessibilityLabel={`${day.date}: ${day.contributionCount}`}
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 3,
                            backgroundColor: contributionFill(day.contributionCount),
                          }}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
              {overview.calendar.restrictedContributionsCount ? (
                <Text style={mutedStyle}>
                  {text(
                    "贡献统计包含私有贡献，隐藏仓库不会改变此统计。",
                    "Contribution totals include private contributions; hiding repositories does not change these totals.",
                  )}
                </Text>
              ) : null}
            </GlassSurface>
          </>
        ) : github.status && !connected ? (
          <GlassSurface
            shape="roundedRectangle"
            cornerRadius={20}
            style={{ borderRadius: 20, padding: 18 }}
            fallbackStyle={cardFallbackStyle}
          >
            <Text style={mutedStyle}>
              {text(
                "连接后查看个人主页，或切换到开源探索。",
                "Connect to view your profile, or explore public repositories.",
              )}
            </Text>
          </GlassSurface>
        ) : null
      ) : (
        <>
          <GlassSurface
            shape="roundedRectangle"
            cornerRadius={22}
            style={{ borderRadius: 22, padding: 16, gap: 12 }}
            fallbackStyle={{ ...cardFallbackStyle, borderRadius: 22 }}
          >
            <TextInput
              accessibilityLabel={text("搜索仓库", "Search repositories")}
              placeholder={text("搜索仓库", "Search repositories")}
              placeholderTextColor={mutedFg}
              value={query}
              onChangeText={setQuery}
              maxLength={github.section === "explore" ? 200 : 120}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={submitSearch}
              style={{ ...inputStyle, backgroundColor: chipBg, borderColor: chipBorder }}
            />
            <TextInput
              accessibilityLabel={text("编程语言", "Language")}
              placeholder={text("编程语言（可选）", "Language (optional)")}
              placeholderTextColor={mutedFg}
              value={language}
              onChangeText={setLanguage}
              maxLength={48}
              autoCapitalize="none"
              style={{ ...inputStyle, backgroundColor: chipBg, borderColor: chipBorder }}
            />
            {github.section === "explore" ? (
              <>
                <TextInput
                  accessibilityLabel="Topic"
                  placeholder="Topic"
                  placeholderTextColor={mutedFg}
                  value={topic}
                  onChangeText={setTopic}
                  maxLength={64}
                  autoCapitalize="none"
                  style={{ ...inputStyle, backgroundColor: chipBg, borderColor: chipBorder }}
                />
                <MenuPicker
                  label={text("最低 Star", "Minimum stars")}
                  choices={[
                    { key: "", label: text("不限", "Any") },
                    { key: "100", label: "100+" },
                    { key: "1000", label: "1k+" },
                    { key: "10000", label: "10k+" },
                  ]}
                  value={String(github.exploreFilters.minStars ?? "")}
                  onChange={(key) =>
                    github.filterExplore({ minStars: key ? Number(key) : undefined })
                  }
                />
                <MenuPicker
                  label={text("最近更新", "Last updated")}
                  choices={[
                    { key: "", label: text("不限", "Any time") },
                    { key: "30", label: text("30 天内", "Within 30 days") },
                    { key: "365", label: text("一年内", "Within a year") },
                  ]}
                  value={String(github.exploreFilters.pushedWithinDays ?? "")}
                  onChange={(key) =>
                    github.filterExplore({ pushedWithinDays: key ? Number(key) : undefined })
                  }
                />
                <MenuPicker
                  label={text("排序", "Sort")}
                  choices={[
                    { key: "best-match", label: text("相关度", "Best match") },
                    { key: "stars", label: "Stars" },
                    { key: "forks", label: "Forks" },
                    { key: "updated", label: text("更新时间", "Updated") },
                  ]}
                  value={github.exploreFilters.sort}
                  onChange={(key) => {
                    if (["best-match", "stars", "forks", "updated"].includes(key))
                      github.filterExplore({ sort: key as typeof github.exploreFilters.sort });
                  }}
                />
              </>
            ) : (
              <>
                <MenuPicker
                  label={text("归属", "Affiliation")}
                  choices={[
                    { key: "all", label: text("全部", "All") },
                    { key: "owner", label: text("我的", "Owned") },
                    { key: "collaborator", label: text("协作", "Collaborator") },
                    { key: "organization_member", label: text("组织", "Organization") },
                  ]}
                  value={github.repositoryFilters.affiliation}
                  onChange={(key) => {
                    if (["all", "owner", "collaborator", "organization_member"].includes(key))
                      github.filterRepositories({
                        affiliation: key as typeof github.repositoryFilters.affiliation,
                      });
                  }}
                />
                <MenuPicker
                  label={text("可见性", "Visibility")}
                  choices={[
                    { key: "all", label: text("全部", "All") },
                    { key: "public", label: text("公开", "Public") },
                    ...(!github.hidePrivate
                      ? [{ key: "private", label: text("私有", "Private") }]
                      : []),
                    { key: "fork", label: "Fork" },
                    { key: "archived", label: text("归档", "Archived") },
                  ]}
                  value={github.hidePrivate ? "public" : github.repositoryFilters.visibility}
                  onChange={(key) => {
                    if (["all", "public", "private", "fork", "archived"].includes(key))
                      github.filterRepositories({
                        visibility: key as typeof github.repositoryFilters.visibility,
                      });
                  }}
                />
                <MenuPicker
                  label={text("排序", "Sort")}
                  choices={[
                    { key: "pushed", label: text("最近推送", "Recently pushed") },
                    { key: "updated", label: text("最近更新", "Recently updated") },
                    { key: "full_name", label: text("名称", "Name") },
                    { key: "stars", label: "Stars" },
                  ]}
                  value={github.repositoryFilters.sort}
                  onChange={(key) => {
                    if (["pushed", "updated", "full_name", "stars"].includes(key))
                      github.filterRepositories({
                        sort: key as typeof github.repositoryFilters.sort,
                      });
                  }}
                />
              </>
            )}
            <NativeActionButton
              label={text("搜索", "Search")}
              onPress={submitSearch}
              disabled={github.busy}
            />
          </GlassSurface>
          {github.section === "explore" && github.search?.authenticated === false ? (
            <Text style={mutedStyle}>
              {text("当前使用 GitHub 匿名查询额度。", "Using GitHub's anonymous request quota.")}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: screenBackground }}
    >
      <FlatList<GithubRepoSummary>
        data={visibleRepos}
        keyExtractor={(repo) => repo.id}
        renderItem={renderRepoCard}
        showsVerticalScrollIndicator={false}
        {...scroll}
        style={sideInsets}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 20, paddingBottom: 36, gap: 14 }}
        onEndReached={() => {
          if (github.section !== "profile") void github.loadMore();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={github.refreshing} onRefresh={github.pullToRefresh} />
        }
        ListHeaderComponent={headerContent}
        ListFooterComponent={
          github.section !== "profile" ? (
            <View style={{ gap: 10 }}>
              {result?.items.length === 0 ? (
                <Text style={mutedStyle}>{text("没有找到仓库", "No repositories found")}</Text>
              ) : null}
              {!connected && github.section === "repositories" ? (
                <Text style={mutedStyle}>
                  {text("连接后查看我的仓库", "Connect to view your repositories")}
                </Text>
              ) : null}
              {github.loadingMore ? (
                <View style={{ paddingVertical: 14, alignItems: "center" }}>
                  <ActivityIndicator color={mutedFg} />
                </View>
              ) : null}
            </View>
          ) : null
        }
      />
    </KeyboardAvoidingView>
  );
}
