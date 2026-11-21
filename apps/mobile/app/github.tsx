import type { GithubRepoSummary } from "@rakazo/contracts";
import { typeScale } from "@rakazo/ui-tokens";
import { useFocusEffect } from "expo-router";
import { useCallback, useState, useSyncExternalStore } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { GithubBotAnalysis } from "../components/github-bot-analysis";
import { GlassSurface } from "../components/glass-surface";
import { MainNavigationHeader } from "../components/main-navigation-header";
import { MenuPicker } from "../components/menu-picker";
import { NativeActionButton } from "../components/native-action-button";
import { NativeSwitch } from "../components/native-switch";
import { NativeSymbol } from "../components/native-symbol";
import { useI18n } from "../lib/i18n";
import { useHideMainNavigation } from "../lib/main-navigation";
import { useMobileTokens } from "../lib/native";
import { usePageScroll, usePageState } from "../lib/page-state";
import { projectScopeKey, subscribeProjectScope } from "../lib/project-scope";
import { useSideInsets } from "../lib/side-insets";
import type { GithubSection } from "../lib/use-github";
import { useGithub } from "../lib/use-github";

export default function GithubScreen() {
  const scopeKey = useSyncExternalStore(subscribeProjectScope, projectScopeKey);
  return <GithubBrowser key={scopeKey} scopeKey={scopeKey} />;
}

function GithubBrowser({ scopeKey }: { scopeKey: string }) {
  const github = useGithub(scopeKey);
  const scroll = usePageScroll(scopeKey, [
    "github-view",
    "contents",
    github.section,
    github.selectedRepo?.id,
    github.year,
    github.page,
    github.query,
    github.repositoryFilters,
    github.exploreFilters,
    github.hidePrivate,
  ]);
  useHideMainNavigation(github.selectedRepo !== null);
  const tokens = useMobileTokens();
  const sideInsets = useSideInsets();
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
  const [token, setToken] = useState("");
  const [query, setQuery] = usePageState(scopeKey, ["github-view", "draftQuery"], github.query);
  const [language, setLanguage] = usePageState(scopeKey, ["github-view", "draftLanguage"], "");
  const [topic, setTopic] = usePageState(scopeKey, ["github-view", "draftTopic"], "");
  useFocusEffect(useCallback(() => () => setToken(""), []));
  const connected = github.status?.status === "connected";
  const headingStyle = { color: tokens.foreground, ...typeScale.headline };
  const bodyStyle = { color: tokens.foreground, ...typeScale.secondary };
  const mutedStyle = { color: tokens.mutedForeground, ...typeScale.caption };
  const inputStyle = {
    color: tokens.foreground,
    borderColor: tokens.border,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 46,
    padding: 12,
    fontSize: 17,
  };
  const sections: Array<{ id: GithubSection; label: string }> = [
    { id: "profile", label: text("个人主页", "Profile") },
    { id: "repositories", label: text("我的仓库", "My repositories") },
    { id: "explore", label: text("开源探索", "Explore") },
  ];
  const repoRows = (repos: GithubRepoSummary[]) =>
    github.visible(repos).map((repo) => {
      const metadata = [
        repo.primaryLanguage?.name,
        `★ ${repo.stargazerCount}`,
        `${repo.forkCount} ${text("分支", "forks")}`,
        repo.isPrivate ? text("私有", "Private") : undefined,
      ]
        .filter(Boolean)
        .join(" · ");
      return (
        <Pressable
          key={repo.id}
          accessibilityRole="button"
          accessibilityLabel={[repo.fullName, repo.description, metadata]
            .filter(Boolean)
            .join(". ")}
          accessibilityState={{ disabled: github.busy }}
          onPress={() => github.selectRepo(repo)}
          disabled={github.busy}
          style={({ pressed }) => ({ opacity: github.busy ? 0.5 : pressed ? 0.7 : 1 })}
        >
          <GlassSurface
            shape="roundedRectangle"
            cornerRadius={14}
            style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}
            fallbackStyle={{ backgroundColor: tokens.card, borderRadius: 14 }}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <Text style={{ color: tokens.foreground, ...typeScale.cardTitle }}>
                {repo.fullName}
              </Text>
              {repo.description ? <Text style={bodyStyle}>{repo.description}</Text> : null}
              <Text style={mutedStyle}>{metadata}</Text>
            </View>
            <NativeSymbol
              ios="chevron.right"
              android="chevron-forward"
              size={14}
              color={tokens.mutedForeground}
            />
          </GlassSurface>
        </Pressable>
      );
    });
  const result = github.section === "explore" ? github.search : github.repositories;
  const overview = github.overview;
  const detail = github.detail;
  const submitSearch = () => {
    github.setQuery(query);
    if (github.section === "explore")
      github.filterExplore({
        language: language.trim() || undefined,
        topic: topic.trim() || undefined,
      });
    else github.filterRepositories({ language: language.trim() || undefined });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: tokens.background }}
    >
      <MainNavigationHeader
        onBack={github.selectedRepo ? () => github.selectRepo(null) : undefined}
      />
      <ScrollView
        {...scroll}
        style={sideInsets}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 18 }}
        refreshControl={
          <RefreshControl refreshing={github.refreshing} onRefresh={github.pullToRefresh} />
        }
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {sections.map((section) => (
            <NativeActionButton
              key={section.id}
              label={section.label}
              prominence="plain"
              selected={github.section === section.id}
              disabled={github.busy}
              onPress={() => {
                setQuery("");
                setLanguage("");
                setTopic("");
                github.selectSection(section.id);
              }}
            />
          ))}
        </View>
        {github.error ? (
          <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
            <Text style={{ color: tokens.destructive }}>{github.error}</Text>
            <NativeActionButton label={text("重试", "Retry")} onPress={github.refresh} />
          </View>
        ) : null}
        {github.status ? (
          <View style={{ gap: 10 }}>
            <Text style={headingStyle}>
              {connected && github.status?.status === "connected"
                ? `@${github.status.login}`
                : text("连接 GitHub", "Connect GitHub")}
            </Text>
            {connected && github.status?.status === "connected" ? (
              <>
                {github.status.highRiskScopes.length ? (
                  <Text style={{ color: tokens.destructive }}>
                    {text("此令牌包含高权限：", "This token has elevated permissions: ")}
                    {github.status.highRiskScopes.join(", ")}
                  </Text>
                ) : null}
                {github.status.rateLimit ? (
                  <Text style={mutedStyle}>
                    {text("剩余请求额度", "Requests remaining")}:{" "}
                    {github.status.rateLimit.remaining}
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
                  <Text style={{ color: tokens.destructive }}>{github.status.message}</Text>
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
                  placeholderTextColor={tokens.mutedForeground}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  maxLength={512}
                  value={token}
                  onChangeText={setToken}
                  editable={!github.busy}
                  style={inputStyle}
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
          </View>
        ) : null}
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Text style={bodyStyle}>{text("隐藏私有仓库", "Hide private repositories")}</Text>
          <NativeSwitch
            accessibilityLabel={text("隐藏私有仓库", "Hide private repositories")}
            value={github.hidePrivate}
            disabled={github.busy}
            onValueChange={github.setHidePrivate}
          />
        </View>
        {github.selectedRepo ? (
          <>
            <NativeActionButton
              label={text("返回列表", "Back to list")}
              prominence="plain"
              onPress={() => github.selectRepo(null)}
            />
            <Text style={headingStyle}>{github.selectedRepo.fullName}</Text>
            <GithubBotAnalysis
              key={github.selectedRepo.id}
              repo={github.selectedRepo}
              scopeKey={scopeKey}
            />
            {detail ? (
              <>
                <Text style={headingStyle}>README</Text>
                <Text selectable style={bodyStyle}>
                  {detail.readme?.content ?? text("暂无 README", "No README available")}
                </Text>
                {detail.readme?.truncated ? (
                  <Text style={mutedStyle}>{text("内容已截断", "Content is truncated")}</Text>
                ) : null}
                <Text style={headingStyle}>{text("近期提交", "Recent commits")}</Text>
                {detail.recentCommits.map((commit) => (
                  <Text key={commit.sha} selectable style={bodyStyle}>
                    {commit.shortSha} · {commit.message}
                  </Text>
                ))}
                <Text style={headingStyle}>{text("最新版本", "Latest release")}</Text>
                <Text selectable style={bodyStyle}>
                  {detail.latestRelease
                    ? `${detail.latestRelease.tagName}\n${detail.latestRelease.body}`
                    : text("暂无版本", "No release available")}
                </Text>
                <Text selectable style={mutedStyle}>
                  {detail.repo.cloneUrl}
                </Text>
              </>
            ) : null}
          </>
        ) : github.section === "profile" ? (
          connected && overview ? (
            <>
              <Text style={headingStyle}>{overview.profile.name ?? overview.profile.login}</Text>
              {overview.profile.bio ? <Text style={bodyStyle}>{overview.profile.bio}</Text> : null}
              <Text style={mutedStyle}>
                {text("公开仓库", "Public repositories")}: {overview.profile.publicRepos} ·{" "}
                {text("关注者", "Followers")}: {overview.profile.followers}
              </Text>
              <ScrollView horizontal contentContainerStyle={{ gap: 10 }}>
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
              <ScrollView horizontal>
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
                            borderRadius: 2,
                            backgroundColor: day.contributionCount ? tokens.primary : tokens.border,
                            opacity: day.contributionCount
                              ? Math.min(1, 0.3 + day.contributionCount / 10)
                              : 1,
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
              {repoRows(overview.pinnedRepos.length ? overview.pinnedRepos : overview.recentRepos)}
            </>
          ) : github.status && !connected ? (
            <Text style={mutedStyle}>
              {text(
                "连接后查看个人主页，或切换到开源探索。",
                "Connect to view your profile, or explore public repositories.",
              )}
            </Text>
          ) : null
        ) : (
          <>
            <TextInput
              accessibilityLabel={text("搜索仓库", "Search repositories")}
              placeholder={text("搜索仓库", "Search repositories")}
              placeholderTextColor={tokens.mutedForeground}
              value={query}
              onChangeText={setQuery}
              maxLength={github.section === "explore" ? 200 : 120}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={submitSearch}
              style={inputStyle}
            />
            <TextInput
              accessibilityLabel={text("编程语言", "Language")}
              placeholder={text("编程语言（可选）", "Language (optional)")}
              placeholderTextColor={tokens.mutedForeground}
              value={language}
              onChangeText={setLanguage}
              maxLength={48}
              autoCapitalize="none"
              style={inputStyle}
            />
            {github.section === "explore" ? (
              <>
                <TextInput
                  accessibilityLabel="Topic"
                  placeholder="Topic"
                  placeholderTextColor={tokens.mutedForeground}
                  value={topic}
                  onChangeText={setTopic}
                  maxLength={64}
                  autoCapitalize="none"
                  style={inputStyle}
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
            {github.section === "explore" && github.search?.authenticated === false ? (
              <Text style={mutedStyle}>
                {text("当前使用 GitHub 匿名查询额度。", "Using GitHub's anonymous request quota.")}
              </Text>
            ) : null}
            {result ? repoRows(result.items) : null}
            {result?.items.length === 0 ? (
              <Text style={mutedStyle}>{text("没有找到仓库", "No repositories found")}</Text>
            ) : null}
            {!connected && github.section === "repositories" ? (
              <Text style={mutedStyle}>
                {text("连接后查看我的仓库", "Connect to view your repositories")}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: 16 }}>
              <NativeActionButton
                label={text("上一页", "Previous")}
                disabled={github.page <= 1 || github.loading}
                onPress={() => github.selectPage(github.page - 1)}
              />
              <NativeActionButton
                label={text("下一页", "Next")}
                disabled={!result?.hasNextPage || github.loading}
                onPress={() => github.selectPage(github.page + 1)}
              />
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
