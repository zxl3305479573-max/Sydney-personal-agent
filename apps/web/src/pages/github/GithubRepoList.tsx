import { useLingui } from "@lingui/react";
import type {
  GithubRepoAffiliation,
  GithubRepoSort,
  GithubRepoSummary,
  GithubRepoVisibilityFilter,
} from "@rakazo/contracts";
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
import {
  Archive,
  CircleDot,
  FolderGit2,
  GitBranch,
  GitFork,
  Lock,
  Search,
  Star,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { getActiveUiLocale } from "../../lib/i18n";
import { useSpaceQueries } from "../../lib/query";
import { errorText } from "../../lib/user-error";
import type { GithubRepoListProps } from "./types";

const QUICK_LANGUAGES = ["TypeScript", "Python", "Rust", "Go", "Java", "JavaScript"] as const;

function useText() {
  const lingui = useLingui() as { i18n?: { locale?: string } };
  const locale = lingui?.i18n?.locale || getActiveUiLocale() || "zh-CN";
  return (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
}

function isSafeLanguageColor(color: string | null | undefined): color is string {
  return typeof color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(color);
}

function formatCompactCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(count);
}

function formatShortDate(iso: string | null, localeIsZh: boolean): string {
  if (!iso) return localeIsZh ? "暂无推送" : "No pushes yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(localeIsZh ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function GithubRepoList({
  connected,
  hidePrivate,
  selectedRepo,
  onSelectRepo,
  onRequestConnect,
}: GithubRepoListProps) {
  const text = useText();
  const localeIsZh = text("zh", "en") === "zh";
  const queries = useSpaceQueries();
  const sortSelectId = useId();
  const languageInputId = useId();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [effectiveQuery, setEffectiveQuery] = useState("");
  const [affiliation, setAffiliation] = useState<GithubRepoAffiliation>("all");
  const [visibility, setVisibility] = useState<GithubRepoVisibilityFilter>("all");
  const [languageFilter, setLanguageFilter] = useState("");
  const [sort, setSort] = useState<GithubRepoSort>("pushed");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const trimmed = searchInput.trim().slice(0, 120);
    if (trimmed === effectiveQuery) return;
    const timer = window.setTimeout(() => {
      setEffectiveQuery(trimmed);
      setPage(1);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [searchInput, effectiveQuery]);

  const effectiveVisibility: GithubRepoVisibilityFilter =
    hidePrivate && visibility === "private" ? "public" : visibility;

  useEffect(() => {
    if (hidePrivate && visibility === "private") {
      setPage(1);
    }
  }, [hidePrivate, visibility]);

  const normalizedLanguage = languageFilter.trim().slice(0, 48);

  const reposQuery = useQuery({
    ...queries.github.listMyRepos.queryOptions({
      input: {
        query: effectiveQuery || undefined,
        affiliation,
        visibility: effectiveVisibility,
        language: normalizedLanguage || undefined,
        sort,
        page,
        perPage: 24,
      },
    }),
    enabled: connected,
    placeholderData: keepPreviousData,
  });

  if (!connected) {
    return (
      <section
        aria-label={text("远程代码库", "Remote repositories")}
        className="sydney-list-surface flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-6"
        data-testid="github-repo-list-disconnected"
      >
        <div className="flex size-11 items-center justify-center rounded-2xl border border-border bg-muted text-foreground">
          <FolderGit2 className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold">
            {text(
              "连接 GitHub 账号以浏览远程代码库",
              "Connect GitHub to browse remote repositories",
            )}
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground leading-relaxed">
            {text(
              "连接 GitHub 后即可集中查看你创建的、参与协作的以及所属组织的公开与私有仓库，并可一键将仓库交给 Bot 深入解读。",
              "Connect your GitHub account to browse your owned, collaborated, and organization public & private repositories, and hand any repository to a Bot for analysis.",
            )}
          </p>
        </div>
        <Button type="button" onClick={onRequestConnect}>
          {text("连接 GitHub 账号", "Connect GitHub account")}
        </Button>
      </section>
    );
  }

  const affiliationOptions: { value: GithubRepoAffiliation; label: string }[] = [
    { value: "all", label: text("全部", "All") },
    { value: "owner", label: text("我创建的", "Owner") },
    { value: "collaborator", label: text("参与协作", "Collaborator") },
    { value: "organization_member", label: text("所属组织", "Organization") },
  ];

  const visibilityOptions: {
    value: GithubRepoVisibilityFilter;
    label: string;
    disabled?: boolean;
    title?: string;
  }[] = [
    { value: "all", label: text("全部", "All") },
    { value: "public", label: text("公开", "Public") },
    {
      value: "private",
      label: text("私有", "Private"),
      disabled: hidePrivate,
      title: hidePrivate
        ? text(
            "已开启隐私保护，当前隐藏私有仓库",
            "Privacy mode is enabled; private repositories are hidden",
          )
        : undefined,
    },
    { value: "fork", label: "Fork" },
    { value: "archived", label: text("已归档", "Archived") },
  ];

  const visibleItems = (reposQuery.data?.items ?? []).filter(
    (repo) => !(hidePrivate && repo.isPrivate),
  );

  const hasActiveFilters =
    Boolean(searchInput.trim()) ||
    Boolean(effectiveQuery) ||
    affiliation !== "all" ||
    effectiveVisibility !== "all" ||
    Boolean(normalizedLanguage) ||
    sort !== "pushed";

  function clearSearch() {
    setSearchInput("");
    setEffectiveQuery("");
    setPage(1);
    searchInputRef.current?.focus();
  }

  function resetAllFilters() {
    setSearchInput("");
    setEffectiveQuery("");
    setAffiliation("all");
    setVisibility("all");
    setLanguageFilter("");
    setSort("pushed");
    setPage(1);
  }

  return (
    <section
      aria-label={text("远程代码库列表", "Remote repositories list")}
      className="space-y-4"
      data-testid="github-repo-list"
    >
      <div className="sydney-list-surface space-y-3.5 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <form
            className="flex min-w-60 flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setEffectiveQuery(searchInput.trim().slice(0, 120));
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
                value={searchInput}
                maxLength={120}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Escape" &&
                    !event.nativeEvent.isComposing &&
                    searchInput.length > 0
                  ) {
                    event.preventDefault();
                    clearSearch();
                  }
                }}
                placeholder={text(
                  "搜索仓库名称或描述…",
                  "Filter repositories by name or description…",
                )}
                aria-label={text("搜索我的仓库", "Search my repositories")}
                autoComplete="off"
                name="github-my-repos-search"
              />
              <div className="flex w-8 shrink-0 items-center justify-center">
                {searchInput ? (
                  <button
                    type="button"
                    aria-label={text("清除仓库搜索", "Clear repository search")}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={clearSearch}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </InputGroup>
            <Button type="submit" variant="secondary">
              {text("筛选", "Filter")}
            </Button>
          </form>

          <div className="flex items-center gap-2">
            <label htmlFor={sortSelectId} className="text-xs font-medium text-muted-foreground">
              {text("排序", "Sort")}
            </label>
            <NativeSelect
              id={sortSelectId}
              aria-label={text("仓库排序", "Repository sort")}
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as GithubRepoSort);
                setPage(1);
              }}
            >
              <NativeSelectOption value="pushed">
                {text("最近推送", "Recently pushed")}
              </NativeSelectOption>
              <NativeSelectOption value="updated">
                {text("最近更新", "Recently updated")}
              </NativeSelectOption>
              <NativeSelectOption value="stars">{text("Star 数", "Most stars")}</NativeSelectOption>
              <NativeSelectOption value="full_name">
                {text("仓库名称", "Repository name")}
              </NativeSelectOption>
            </NativeSelect>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-muted-foreground">
              {text("归属", "Affiliation")}
            </span>
            {affiliationOptions.map((option) => {
              const active = affiliation === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  size="xs"
                  variant={active ? "default" : "outline"}
                  aria-pressed={active}
                  onClick={() => {
                    setAffiliation(option.value);
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
              {text("可见性", "Visibility")}
            </span>
            {visibilityOptions.map((option) => {
              const active = effectiveVisibility === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  size="xs"
                  variant={active ? "default" : "outline"}
                  disabled={option.disabled}
                  title={option.title}
                  aria-pressed={active}
                  onClick={() => {
                    if (option.disabled) return;
                    setVisibility(option.value);
                    setPage(1);
                  }}
                >
                  {option.label}
                </Button>
              );
            })}
            {hidePrivate ? (
              <span
                className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                data-testid="private-repos-hidden-hint"
              >
                <Lock className="size-3" aria-hidden="true" />
                {text("已隐藏私有仓库", "Private repositories hidden")}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <label
            htmlFor={languageInputId}
            className="mr-1 text-xs font-medium text-muted-foreground"
          >
            {text("语言", "Language")}
          </label>
          <Button
            type="button"
            size="xs"
            variant={!normalizedLanguage ? "default" : "outline"}
            aria-pressed={!normalizedLanguage}
            onClick={() => {
              setLanguageFilter("");
              setPage(1);
            }}
          >
            {text("全部", "All")}
          </Button>
          {QUICK_LANGUAGES.map((lang) => {
            const active = normalizedLanguage.toLowerCase() === lang.toLowerCase();
            return (
              <Button
                key={lang}
                type="button"
                size="xs"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                onClick={() => {
                  setLanguageFilter(active ? "" : lang);
                  setPage(1);
                }}
              >
                {lang}
              </Button>
            );
          })}
          <Input
            id={languageInputId}
            value={languageFilter}
            onChange={(event) => {
              setLanguageFilter(event.target.value);
              setPage(1);
            }}
            maxLength={48}
            placeholder={text("其他语言…", "Custom language…")}
            aria-label={text("按语言筛选仓库", "Filter repositories by language")}
            className="ml-1 h-7 w-32 text-xs"
          />
          {hasActiveFilters ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="ml-auto"
              onClick={resetAllFilters}
            >
              {text("重置筛选", "Reset filters")}
            </Button>
          ) : null}
        </div>
      </div>

      {reposQuery.data ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {reposQuery.data.totalCount !== null
                ? text(
                    `共匹配 ${reposQuery.data.totalCount} 个仓库（本页展示 ${visibleItems.length} 个）`,
                    `${reposQuery.data.totalCount} repositories matched (${visibleItems.length} shown on this page)`,
                  )
                : text(
                    `当前页展示 ${visibleItems.length} 个仓库`,
                    `Showing ${visibleItems.length} repositories on this page`,
                  )}
            </span>
            {reposQuery.isFetching ? <Spinner className="size-3.5" /> : null}
          </div>
          {reposQuery.data.rateLimit ? (
            <Badge variant="outline">
              {text(
                `API 配额 ${reposQuery.data.rateLimit.remaining}/${reposQuery.data.rateLimit.limit}`,
                `API quota ${reposQuery.data.rateLimit.remaining}/${reposQuery.data.rateLimit.limit}`,
              )}
            </Badge>
          ) : null}
        </div>
      ) : null}

      {reposQuery.isPending ? (
        <div
          role="status"
          className="sydney-list-surface flex items-center justify-center gap-2.5 rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground"
        >
          <Spinner />
          <span>{text("正在加载远程代码库…", "Loading remote repositories…")}</span>
        </div>
      ) : null}

      {reposQuery.error ? (
        <div
          role="alert"
          className="sydney-list-surface space-y-3 rounded-2xl border border-border bg-card p-5"
        >
          <p className="text-sm text-destructive">
            {errorText(
              reposQuery.error,
              text("无法加载远程代码库列表", "Could not load remote repositories"),
            )}
          </p>
          <Button type="button" variant="secondary" onClick={() => void reposQuery.refetch()}>
            {text("重试", "Retry")}
          </Button>
        </div>
      ) : null}

      {!reposQuery.isPending && !reposQuery.error && visibleItems.length === 0 ? (
        <div className="sydney-list-surface flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters
              ? text("没有符合当前筛选条件的仓库。", "No repositories match the current filters.")
              : text("当前账号下暂无可展示的仓库。", "No repositories available to display.")}
          </p>
          {hasActiveFilters ? (
            <Button type="button" variant="secondary" size="sm" onClick={resetAllFilters}>
              {text("清空筛选条件", "Clear filters")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!reposQuery.error && visibleItems.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((repo) => {
            const isSelected =
              selectedRepo?.owner === repo.ownerLogin && selectedRepo?.repo === repo.name;
            return (
              <RepoSummaryCard
                key={repo.id}
                repo={repo}
                isSelected={isSelected}
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

      {!reposQuery.error && (page > 1 || reposQuery.data?.hasNextPage) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-xs text-muted-foreground">
            {text(`第 ${page} 页`, `Page ${page}`)}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page <= 1 || reposQuery.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {text("上一页", "Previous page")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!reposQuery.data?.hasNextPage || page >= 50 || reposQuery.isFetching}
              onClick={() => setPage((current) => Math.min(50, current + 1))}
            >
              {text("下一页", "Next page")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RepoSummaryCard({
  repo,
  isSelected,
  localeIsZh,
  text,
  onSelect,
}: {
  repo: GithubRepoSummary;
  isSelected: boolean;
  localeIsZh: boolean;
  text: (zh: string, en: string) => string;
  onSelect: () => void;
}) {
  const langColor = repo.primaryLanguage?.color;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      data-selected={isSelected ? "true" : undefined}
      data-testid={`repo-card-${repo.fullName}`}
      className={cn(
        "sydney-list-surface flex h-full w-full flex-col items-start gap-2.5 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
        isSelected ? "border-primary bg-accent/30 ring-1 ring-primary/30" : "border-border",
      )}
    >
      <div className="flex w-full flex-wrap items-start justify-between gap-2">
        <span
          className="min-w-0 flex-1 break-words font-semibold text-sm text-foreground"
          dir="auto"
        >
          {repo.fullName}
        </span>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <Badge variant={repo.isPrivate ? "secondary" : "outline"}>
            {repo.isPrivate ? text("私有", "Private") : text("公开", "Public")}
          </Badge>
          {repo.isFork ? <Badge variant="outline">Fork</Badge> : null}
          {repo.isArchived ? (
            <Badge variant="secondary">
              <Archive className="size-3" aria-hidden="true" />
              {text("已归档", "Archived")}
            </Badge>
          ) : null}
        </div>
      </div>

      <p
        className="line-clamp-2 min-h-9 w-full text-xs text-muted-foreground leading-relaxed"
        dir="auto"
      >
        {repo.description || text("暂无仓库简介", "No description provided")}
      </p>

      {repo.topics.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {repo.topics.slice(0, 4).map((topic) => (
            <span
              key={topic}
              className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {topic}
            </span>
          ))}
          {repo.topics.length > 4 ? (
            <span className="text-[11px] text-muted-foreground">+{repo.topics.length - 4}</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs text-muted-foreground">
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
        <span className="inline-flex items-center gap-1" title="Stars">
          <Star className="size-3.5" aria-hidden="true" />
          {formatCompactCount(repo.stargazerCount)}
        </span>
        <span className="inline-flex items-center gap-1" title="Forks">
          <GitFork className="size-3.5" aria-hidden="true" />
          {formatCompactCount(repo.forkCount)}
        </span>
        <span className="inline-flex items-center gap-1" title="Open issues">
          <CircleDot className="size-3.5" aria-hidden="true" />
          {formatCompactCount(repo.openIssuesCount)}
        </span>
        <span className="inline-flex items-center gap-1">
          <GitBranch className="size-3.5" aria-hidden="true" />
          <span className="max-w-24 truncate font-mono text-[11px]">{repo.defaultBranch}</span>
        </span>
        <span className="ml-auto text-[11px] text-faint-foreground">
          {formatShortDate(repo.pushedAt ?? repo.updatedAt, localeIsZh)}
        </span>
      </div>
    </button>
  );
}
