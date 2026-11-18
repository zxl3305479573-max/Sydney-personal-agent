import { useLingui } from "@lingui/react/macro";
import { RemoteImagesContext } from "@rakazo/chat-ui/web";
import type { GithubRepoSummary, GithubSearchSort } from "@rakazo/contracts";
import {
  Badge,
  Button,
  cn,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  NativeSelect,
  NativeSelectOption,
  Spinner,
} from "@rakazo/ui-web";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Compass, GitFork, Info, Scale, Search, Star, X } from "lucide-react";
import { useContext, useEffect, useId, useRef, useState } from "react";
import { getActiveUiLocale } from "../../lib/i18n";
import { useSpaceQueries } from "../../lib/query";
import { errorText } from "../../lib/user-error";
import type { GithubExploreSearchProps } from "./types";

const EXPLORE_LANGUAGES = ["TypeScript", "Python", "Rust", "Go", "Java", "C++", "Swift"] as const;

const MIN_STARS_OPTIONS: readonly { label: string; value: number | undefined }[] = [
  { label: "100+", value: 100 },
  { label: "1k+", value: 1000 },
  { label: "10k+", value: 10000 },
];

const QUICK_TOPICS = ["ai-agent", "mcp", "llm", "cli", "rag"] as const;
const VALID_TOPIC_PATTERN = /^[A-Za-z0-9-]*$/;

function useText() {
  const lingui = useLingui() as { i18n?: { locale?: string } };
  const locale = lingui?.i18n?.locale || getActiveUiLocale() || "zh-CN";
  return (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
}

function isSafeLanguageColor(color: string | null | undefined): color is string {
  return typeof color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(color);
}

function sanitizeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function formatCompactCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(count);
}

function formatShortDate(iso: string | null, localeIsZh: boolean): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(localeIsZh ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function GithubExploreSearch({
  connected,
  selectedRepo,
  onSelectRepo,
  onRequestConnect,
}: GithubExploreSearchProps) {
  const text = useText();
  const localeIsZh = text("zh", "en") === "zh";
  const queries = useSpaceQueries();
  const allowRemoteImages = useContext(RemoteImagesContext);
  const sortSelectId = useId();
  const topicInputId = useId();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [queryInput, setQueryInput] = useState("");
  const [effectiveKeyword, setEffectiveKeyword] = useState("");
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const [minStars, setMinStars] = useState<number | undefined>(undefined);
  const [pushedWithinDays, setPushedWithinDays] = useState<number | undefined>(undefined);
  const [topicInput, setTopicInput] = useState("");
  const [sort, setSort] = useState<GithubSearchSort>("best-match");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const trimmed = queryInput.trim().slice(0, 200);
    if (trimmed === effectiveKeyword) return;
    const timer = window.setTimeout(() => {
      setEffectiveKeyword(trimmed);
      setPage(1);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [queryInput, effectiveKeyword]);

  const trimmedTopic = topicInput.trim().slice(0, 64);
  const isTopicValid = VALID_TOPIC_PATTERN.test(trimmedTopic);
  const sanitizedTopic = isTopicValid && trimmedTopic.length > 0 ? trimmedTopic : undefined;

  const searchQuery = useQuery({
    ...queries.github.searchRepos.queryOptions({
      input: {
        query: effectiveKeyword,
        language,
        minStars,
        pushedWithinDays,
        topic: sanitizedTopic,
        sort,
        page,
        perPage: 20,
      },
    }),
    placeholderData: keepPreviousData,
  });

  const activityOptions: { label: string; value: number | undefined }[] = [
    { label: text("不限", "Any time"), value: undefined },
    { label: text("近 30 天活跃", "Active in 30d"), value: 30 },
    { label: text("近 90 天活跃", "Active in 90d"), value: 90 },
    { label: text("近 1 年活跃", "Active in 1y"), value: 365 },
  ];

  const hasActiveFilters =
    Boolean(queryInput.trim()) ||
    Boolean(effectiveKeyword) ||
    language !== undefined ||
    minStars !== undefined ||
    pushedWithinDays !== undefined ||
    Boolean(trimmedTopic) ||
    sort !== "best-match";

  function clearKeyword() {
    setQueryInput("");
    setEffectiveKeyword("");
    setPage(1);
    searchInputRef.current?.focus();
  }

  function resetAll() {
    setQueryInput("");
    setEffectiveKeyword("");
    setLanguage(undefined);
    setMinStars(undefined);
    setPushedWithinDays(undefined);
    setTopicInput("");
    setSort("best-match");
    setPage(1);
  }

  return (
    <section
      aria-label={text("开源搜索", "Open-source repository search")}
      className="space-y-4"
      data-testid="github-explore-search"
    >
      {!connected ? (
        <div
          className="sydney-list-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm"
          data-testid="github-explore-anonymous-banner"
        >
          <div className="flex min-w-0 items-center gap-2.5 text-muted-foreground">
            <Info className="size-4 shrink-0 text-foreground" aria-hidden="true" />
            <span>
              {text(
                "当前使用 GitHub 公开匿名检索配额；连接账号可提升配额并查看个人主页",
                "Using GitHub public anonymous search quota; connect an account for higher rate limits and your profile overview.",
              )}
            </span>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={onRequestConnect}>
            {text("连接 GitHub", "Connect GitHub")}
          </Button>
        </div>
      ) : null}

      <div className="sydney-list-surface space-y-3.5 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <form
            className="flex min-w-60 flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setEffectiveKeyword(queryInput.trim().slice(0, 200));
              setPage(1);
            }}
          >
            <InputGroup className="flex-1 rounded-xl border border-border bg-background text-muted-foreground focus-within:border-ring">
              <InputGroupAddon>
                <Search size={16} strokeWidth={1.8} aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                ref={searchInputRef}
                type="search"
                className="[&::-webkit-search-cancel-button]:hidden"
                value={queryInput}
                maxLength={200}
                onChange={(event) => setQueryInput(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Escape" &&
                    !event.nativeEvent.isComposing &&
                    queryInput.length > 0
                  ) {
                    event.preventDefault();
                    clearKeyword();
                  }
                }}
                placeholder={text(
                  "搜索开源项目关键词、技术栈或领域…",
                  "Search open-source projects, frameworks, or keywords…",
                )}
                aria-label={text("开源项目关键词搜索", "Search open-source repositories")}
                autoComplete="off"
                name="github-explore-search"
              />
              <div className="flex w-8 shrink-0 items-center justify-center">
                {queryInput ? (
                  <button
                    type="button"
                    aria-label={text("清除搜索关键词", "Clear search query")}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={clearKeyword}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </InputGroup>
            <Button type="submit">{text("搜索", "Search")}</Button>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" onClick={resetAll}>
                {text("清除条件", "Reset")}
              </Button>
            ) : null}
          </form>

          <div className="flex items-center gap-2">
            <label htmlFor={sortSelectId} className="text-xs font-medium text-muted-foreground">
              {text("排序", "Sort")}
            </label>
            <NativeSelect
              id={sortSelectId}
              aria-label={text("开源搜索排序", "Search sort order")}
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as GithubSearchSort);
                setPage(1);
              }}
            >
              <NativeSelectOption value="best-match">
                {text("最佳匹配", "Best match")}
              </NativeSelectOption>
              <NativeSelectOption value="stars">
                {text("Stars 最多", "Most stars")}
              </NativeSelectOption>
              <NativeSelectOption value="forks">
                {text("Forks 最多", "Most forks")}
              </NativeSelectOption>
              <NativeSelectOption value="updated">
                {text("最近更新", "Recently updated")}
              </NativeSelectOption>
            </NativeSelect>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">
            {text("语言", "Language")}
          </span>
          <Button
            type="button"
            size="xs"
            variant={language === undefined ? "default" : "outline"}
            aria-pressed={language === undefined}
            onClick={() => {
              setLanguage(undefined);
              setPage(1);
            }}
          >
            {text("全部", "All")}
          </Button>
          {EXPLORE_LANGUAGES.map((lang) => {
            const active = language === lang;
            return (
              <Button
                key={lang}
                type="button"
                size="xs"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                onClick={() => {
                  setLanguage(active ? undefined : lang);
                  setPage(1);
                }}
              >
                {lang}
              </Button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-muted-foreground">
              {text("最低 Stars", "Min stars")}
            </span>
            <Button
              type="button"
              size="xs"
              variant={minStars === undefined ? "default" : "outline"}
              aria-pressed={minStars === undefined}
              onClick={() => {
                setMinStars(undefined);
                setPage(1);
              }}
            >
              {text("不限", "Any")}
            </Button>
            {MIN_STARS_OPTIONS.map((option) => {
              const active = minStars === option.value;
              return (
                <Button
                  key={option.label}
                  type="button"
                  size="xs"
                  variant={active ? "default" : "outline"}
                  aria-pressed={active}
                  onClick={() => {
                    setMinStars(active ? undefined : option.value);
                    setPage(1);
                  }}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-muted-foreground">
              {text("活跃度", "Activity")}
            </span>
            {activityOptions.map((option) => {
              const active = pushedWithinDays === option.value;
              return (
                <Button
                  key={option.label}
                  type="button"
                  size="xs"
                  variant={active ? "default" : "outline"}
                  aria-pressed={active}
                  onClick={() => {
                    setPushedWithinDays(option.value);
                    setPage(1);
                  }}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <label htmlFor={topicInputId} className="mr-1 text-xs font-medium text-muted-foreground">
            {text("主题 Topic", "Topic")}
          </label>
          {QUICK_TOPICS.map((item) => {
            const active = sanitizedTopic?.toLowerCase() === item;
            return (
              <Button
                key={item}
                type="button"
                size="xs"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                onClick={() => {
                  setTopicInput(active ? "" : item);
                  setPage(1);
                }}
              >
                {item}
              </Button>
            );
          })}
          <Input
            id={topicInputId}
            value={topicInput}
            maxLength={64}
            aria-invalid={!isTopicValid}
            onChange={(event) => {
              setTopicInput(event.target.value);
              setPage(1);
            }}
            placeholder={text("自定义 topic（字母/数字/-）", "Custom topic (a-z, 0-9, -)")}
            aria-label={text("按 Topic 筛选开源仓库", "Filter by GitHub topic")}
            className="ml-1 h-7 w-48 text-xs"
          />
          {!isTopicValid ? (
            <span className="text-xs text-destructive">
              {text(
                "Topic 仅支持字母、数字与连字符 (-)",
                "Topics only allow letters, numbers, and hyphens",
              )}
            </span>
          ) : null}
        </div>
      </div>

      {searchQuery.data ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {text(
                `共找到 ${searchQuery.data.totalCount.toLocaleString()} 个开源仓库`,
                `${searchQuery.data.totalCount.toLocaleString()} open-source repositories found`,
              )}
            </span>
            {searchQuery.data.incompleteResults ? (
              <Badge variant="outline">{text("部分结果（查询超时截断）", "Partial results")}</Badge>
            ) : null}
            <code
              className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground"
              data-testid="explore-effective-query"
            >
              {searchQuery.data.effectiveQuery}
            </code>
            {searchQuery.isFetching ? <Spinner className="size-3.5" /> : null}
          </div>
          {searchQuery.data.rateLimit ? (
            <Badge variant="outline" data-testid="explore-rate-limit">
              {text(
                `搜索配额 ${searchQuery.data.rateLimit.remaining}/${searchQuery.data.rateLimit.limit}`,
                `Search quota ${searchQuery.data.rateLimit.remaining}/${searchQuery.data.rateLimit.limit}`,
              )}
            </Badge>
          ) : null}
        </div>
      ) : null}

      {searchQuery.isPending ? (
        <div
          role="status"
          className="sydney-list-surface flex items-center justify-center gap-2.5 rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground"
        >
          <Spinner />
          <span>{text("正在检索开源仓库…", "Searching open-source repositories…")}</span>
        </div>
      ) : null}

      {searchQuery.error ? (
        <div
          role="alert"
          className="sydney-list-surface space-y-3 rounded-2xl border border-border bg-card p-5"
        >
          <p className="text-sm text-destructive">
            {errorText(
              searchQuery.error,
              text("开源仓库检索失败，请稍后重试", "Could not search open-source repositories"),
            )}
          </p>
          <Button type="button" variant="secondary" onClick={() => void searchQuery.refetch()}>
            {text("重试", "Retry")}
          </Button>
        </div>
      ) : null}

      {!searchQuery.isPending && !searchQuery.error && searchQuery.data?.items.length === 0 ? (
        <div className="sydney-list-surface flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Compass className="size-4 text-muted-foreground" aria-hidden="true" />
            <span>
              {text("未找到匹配的开源仓库", "No matching open-source repositories found")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {text(
              "可以尝试放宽最低 Stars、活跃时间或更换关键词重新检索。",
              "Try relaxing the minimum stars, activity window, or trying different keywords.",
            )}
          </p>
          {hasActiveFilters ? (
            <Button type="button" variant="secondary" size="sm" onClick={resetAll}>
              {text("重置检索条件", "Reset search filters")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!searchQuery.error && (searchQuery.data?.items.length ?? 0) > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {searchQuery.data?.items.map((repo) => {
            const isSelected =
              selectedRepo?.owner === repo.ownerLogin && selectedRepo?.repo === repo.name;
            return (
              <ExploreRepoCard
                key={repo.id}
                repo={repo}
                isSelected={isSelected}
                allowRemoteImages={allowRemoteImages}
                localeIsZh={localeIsZh}
                text={text}
                onSelect={() =>
                  onSelectRepo({
                    owner: repo.ownerLogin,
                    repo: repo.name,
                    summary: repo,
                  })
                }
              />
            );
          })}
        </div>
      ) : null}

      {!searchQuery.error && (page > 1 || searchQuery.data?.hasNextPage) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-xs text-muted-foreground">
            {text(`第 ${page} 页`, `Page ${page}`)}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page <= 1 || searchQuery.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {text("上一页", "Previous page")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!searchQuery.data?.hasNextPage || page >= 20 || searchQuery.isFetching}
              onClick={() => setPage((current) => Math.min(20, current + 1))}
            >
              {text("下一页", "Next page")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ExploreRepoCard({
  repo,
  isSelected,
  allowRemoteImages,
  localeIsZh,
  text,
  onSelect,
}: {
  repo: GithubRepoSummary;
  isSelected: boolean;
  allowRemoteImages: boolean;
  localeIsZh: boolean;
  text: (zh: string, en: string) => string;
  onSelect: () => void;
}) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const safeAvatarUrl =
    allowRemoteImages && !avatarFailed ? sanitizeHttpUrl(repo.ownerAvatarUrl) : null;
  const langColor = repo.primaryLanguage?.color;
  const initial = (repo.ownerLogin.trim()[0] ?? "?").toUpperCase();

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      data-selected={isSelected ? "true" : undefined}
      data-testid={`explore-card-${repo.fullName}`}
      className={cn(
        "sydney-list-surface flex h-full w-full flex-col items-start gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
        isSelected ? "border-primary bg-accent/30 ring-1 ring-primary/30" : "border-border",
      )}
    >
      <div className="flex w-full items-start gap-3">
        {safeAvatarUrl ? (
          <img
            src={safeAvatarUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setAvatarFailed(true)}
            className="size-8 shrink-0 rounded-full border border-border bg-muted object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground"
          >
            {initial}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="break-words font-semibold text-sm text-foreground" dir="auto">
              {repo.fullName}
            </span>
            {repo.licenseSpdxId && repo.licenseSpdxId !== "NOASSERTION" ? (
              <Badge variant="outline">
                <Scale className="size-3" aria-hidden="true" />
                {repo.licenseSpdxId}
              </Badge>
            ) : null}
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed" dir="auto">
            {repo.description || text("暂无仓库简介", "No description provided")}
          </p>
        </div>
      </div>

      {repo.topics.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {repo.topics.slice(0, 5).map((topic) => (
            <span
              key={topic}
              className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {topic}
            </span>
          ))}
          {repo.topics.length > 5 ? (
            <span className="text-[11px] text-muted-foreground">+{repo.topics.length - 5}</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex w-full flex-wrap items-center gap-x-3.5 gap-y-1.5 pt-1 text-xs text-muted-foreground">
        {repo.primaryLanguage ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full bg-primary"
              style={isSafeLanguageColor(langColor) ? { backgroundColor: langColor } : undefined}
            />
            <span>{repo.primaryLanguage.name}</span>
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <Star className="size-3.5" aria-hidden="true" />
          {formatCompactCount(repo.stargazerCount)}
        </span>
        <span className="inline-flex items-center gap-1">
          <GitFork className="size-3.5" aria-hidden="true" />
          {formatCompactCount(repo.forkCount)}
        </span>
        <span className="ml-auto text-[11px] text-faint-foreground">
          {text("更新于 ", "Updated ")}
          {formatShortDate(repo.updatedAt, localeIsZh)}
        </span>
      </div>
    </button>
  );
}
