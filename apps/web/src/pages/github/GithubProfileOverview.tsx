import { useLingui } from "@lingui/react/macro";
import { RemoteImagesContext } from "@rakazo/chat-ui/web";
import type {
  GithubProfileOverview as GithubProfileOverviewData,
  GithubRateLimit,
} from "@rakazo/contracts";
import { Badge, Button } from "@rakazo/ui-web";
import { useQuery } from "@tanstack/react-query";
import { Building2, ExternalLink, GitFork, Globe, Lock, MapPin, Star } from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import { useSpaceQueries } from "../../lib/query";
import { errorText } from "../../lib/user-error";
import { GithubContributionHeatmap } from "./GithubContributionHeatmap";
import type { SelectedGithubRepo } from "./types";

function normalizeExternalHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function profileInitials(name: string | null | undefined, login: string): string {
  const source = (name?.trim() || login.trim() || "GH").replace(/^@/, "");
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export interface GithubProfileOverviewProps {
  hidePrivate: boolean;
  onSelectRepo: (target: SelectedGithubRepo) => void;
  onRateLimitChange?: (rateLimit: GithubRateLimit | null) => void;
}

export function GithubProfileOverview({
  hidePrivate,
  onSelectRepo,
  onRateLimitChange,
}: GithubProfileOverviewProps) {
  const { i18n } = useLingui();
  const isZh = (i18n?.locale ?? "zh").startsWith("zh");
  const text = (chinese: string, english: string) => (isZh ? chinese : english);

  const allowRemoteImages = useContext(RemoteImagesContext);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);

  const queries = useSpaceQueries();
  const overviewQuery = useQuery(
    queries.github.profileOverview.queryOptions({
      input: { year: selectedYear },
    }),
  );

  const lastOverviewRef = useRef<GithubProfileOverviewData | null>(null);
  if (overviewQuery.data) {
    lastOverviewRef.current = overviewQuery.data;
  }
  const activeData = overviewQuery.data ?? lastOverviewRef.current;

  useEffect(() => {
    if (overviewQuery.data && onRateLimitChange) {
      onRateLimitChange(overviewQuery.data.rateLimit);
    }
  }, [overviewQuery.data, onRateLimitChange]);

  if (overviewQuery.isPending && !activeData) {
    return (
      <div className="grid gap-5" data-testid="github-profile-overview-loading">
        <div
          role="status"
          className="sydney-list-surface rounded-2xl border border-border p-6 text-sm text-muted-foreground"
        >
          {text(
            "正在加载 GitHub 个人主页与贡献热力图…",
            "Loading GitHub profile & contribution heatmap…",
          )}
        </div>
        <GithubContributionHeatmap
          status="loading"
          selectedYear={selectedYear}
          onSelectYear={setSelectedYear}
        />
      </div>
    );
  }

  if (overviewQuery.error && !activeData) {
    const errMsg = errorText(
      overviewQuery.error,
      text("无法加载 GitHub 个人主页", "Could not load GitHub profile overview"),
    );
    return (
      <div
        role="alert"
        className="sydney-list-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-5"
      >
        <div className="grid gap-1">
          <p className="m-0 font-medium text-foreground">
            {text("个人主页加载失败", "Failed to load GitHub profile")}
          </p>
          <p className="m-0 text-sm text-muted-foreground">{errMsg}</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void overviewQuery.refetch()}>
          {text("重试", "Retry")}
        </Button>
      </div>
    );
  }

  if (!activeData) return null;

  const { profile, pinnedRepos, recentRepos } = activeData;
  const calendar = overviewQuery.data?.calendar ?? activeData.calendar;
  const heatmapStatus = overviewQuery.isPending
    ? "loading"
    : overviewQuery.error
      ? "error"
      : "success";
  const heatmapError = overviewQuery.error
    ? errorText(
        overviewQuery.error,
        text("贡献热力图加载失败，请重试。", "Could not load contribution calendar."),
      )
    : null;

  const showAvatarImage =
    allowRemoteImages && Boolean(profile.avatarUrl) && failedAvatarUrl !== profile.avatarUrl;
  const blogHref = normalizeExternalHttpUrl(profile.blogUrl);
  const githubProfileHref =
    normalizeExternalHttpUrl(profile.htmlUrl) ??
    `https://github.com/${encodeURIComponent(profile.login)}`;

  const hasPinned = pinnedRepos.length > 0;
  const sourceRepos = hasPinned ? pinnedRepos : recentRepos;
  const visibleRepos = hidePrivate ? sourceRepos.filter((repo) => !repo.isPrivate) : sourceRepos;

  const privateStatDisplay = hidePrivate
    ? text("已隐藏", "Hidden")
    : profile.totalPrivateRepos !== null
      ? String(profile.totalPrivateRepos)
      : "—";

  return (
    <div className="grid gap-5" data-testid="github-profile-overview">
      {/* Top / Left Profile Card */}
      <section
        aria-label={text("GitHub 个人资料", "GitHub profile")}
        className="sydney-list-surface grid gap-5 rounded-2xl border border-border p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center"
      >
        <div className="flex min-w-0 items-start gap-4">
          <div
            data-testid="github-profile-avatar"
            className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted text-lg font-semibold text-foreground"
          >
            {showAvatarImage && profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="size-full object-cover"
                onError={() => setFailedAvatarUrl(profile.avatarUrl)}
              />
            ) : (
              <span>{profileInitials(profile.name, profile.login)}</span>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 truncate text-xl font-semibold text-foreground" dir="auto">
                {profile.name || profile.login}
              </h2>
              <span className="text-sm text-muted-foreground">@{profile.login}</span>
              <a
                href={githubProfileHref}
                target="_blank"
                rel="noopener noreferrer"
                className="ms-auto inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <span>{text("GitHub 主页", "View on GitHub")}</span>
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            </div>

            {profile.bio ? (
              <p className="m-0 text-sm leading-relaxed text-muted-foreground" dir="auto">
                {profile.bio}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {profile.company ? (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 size={13} aria-hidden="true" />
                  <span>{profile.company}</span>
                </span>
              ) : null}
              {profile.location ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={13} aria-hidden="true" />
                  <span>{profile.location}</span>
                </span>
              ) : null}
              {blogHref && profile.blogUrl ? (
                <a
                  href={blogHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-[260px] items-center gap-1.5 truncate text-primary hover:underline"
                >
                  <Globe size={13} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{profile.blogUrl}</span>
                </a>
              ) : null}
            </div>
          </div>
        </div>

        {/* 4 Stat Cards */}
        <div data-testid="github-profile-stats" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-border/80 bg-background/70 px-3.5 py-2.5">
            <div className="text-xs text-muted-foreground">{text("关注者", "Followers")}</div>
            <div className="mt-1 text-base font-semibold tabular-nums text-foreground">
              {profile.followers}
            </div>
          </div>
          <div className="rounded-xl border border-border/80 bg-background/70 px-3.5 py-2.5">
            <div className="text-xs text-muted-foreground">{text("正在关注", "Following")}</div>
            <div className="mt-1 text-base font-semibold tabular-nums text-foreground">
              {profile.following}
            </div>
          </div>
          <div className="rounded-xl border border-border/80 bg-background/70 px-3.5 py-2.5">
            <div className="text-xs text-muted-foreground">{text("公开仓库", "Public Repos")}</div>
            <div className="mt-1 text-base font-semibold tabular-nums text-foreground">
              {profile.publicRepos}
            </div>
          </div>
          <div
            data-testid="github-private-repos-stat"
            className="rounded-xl border border-border/80 bg-background/70 px-3.5 py-2.5"
          >
            <div className="text-xs text-muted-foreground">{text("私有仓库", "Private Repos")}</div>
            <div className="mt-1 text-base font-semibold tabular-nums text-foreground">
              {privateStatDisplay}
            </div>
          </div>
        </div>
      </section>

      {/* 52-Week Contribution Heatmap */}
      <GithubContributionHeatmap
        calendar={calendar}
        status={heatmapStatus}
        selectedYear={selectedYear}
        errorMessage={heatmapError}
        onSelectYear={setSelectedYear}
        onRetry={() => void overviewQuery.refetch()}
      />

      {/* Pinned / Recent Active Repositories */}
      <section
        aria-label={
          hasPinned
            ? text("置顶项目", "Pinned repositories")
            : text("近期活跃项目", "Recent active repositories")
        }
        className="grid gap-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-base font-semibold text-foreground">
            {hasPinned
              ? text("置顶项目", "Pinned repositories")
              : text("近期活跃项目", "Recent active repositories")}
          </h3>
          {hidePrivate && sourceRepos.some((repo) => repo.isPrivate) ? (
            <span className="text-xs text-muted-foreground">
              {text("已隐藏私有仓库", "Private repositories hidden")}
            </span>
          ) : null}
        </div>

        {visibleRepos.length === 0 ? (
          <div className="sydney-list-surface rounded-2xl border border-border p-5 text-sm text-muted-foreground">
            {hidePrivate && sourceRepos.length > 0
              ? text(
                  "当前列表中的私有仓库已隐藏，可关闭顶部「隐藏私有仓库」查看。",
                  "Private repositories in this list are currently hidden.",
                )
              : text("暂无可展示的仓库记录。", "No repositories to display yet.")}
          </div>
        ) : (
          <div
            data-testid="github-overview-repos"
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          >
            {visibleRepos.map((repo) => (
              <button
                key={repo.id}
                type="button"
                onClick={() =>
                  onSelectRepo({
                    owner: repo.ownerLogin,
                    repo: repo.name,
                    summary: repo,
                  })
                }
                className="sydney-list-surface group flex min-w-0 flex-col justify-between gap-3 rounded-2xl border border-border p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="min-w-0 truncate text-sm font-semibold text-foreground group-hover:text-primary"
                      dir="auto"
                    >
                      {repo.fullName}
                    </span>
                    <Badge variant={repo.isPrivate ? "secondary" : "outline"} className="shrink-0">
                      {repo.isPrivate ? (
                        <span className="inline-flex items-center gap-1">
                          <Lock size={11} aria-hidden="true" />
                          {text("私有", "Private")}
                        </span>
                      ) : (
                        text("公开", "Public")
                      )}
                    </Badge>
                  </div>
                  {repo.description ? (
                    <p
                      className="m-0 line-clamp-2 text-xs leading-relaxed text-muted-foreground"
                      dir="auto"
                    >
                      {repo.description}
                    </p>
                  ) : (
                    <p className="m-0 text-xs italic text-muted-foreground/70">
                      {text("暂无描述", "No description")}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {repo.primaryLanguage ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="size-2.5 rounded-full"
                        style={{
                          backgroundColor: repo.primaryLanguage.color ?? "var(--muted-foreground)",
                        }}
                      />
                      <span>{repo.primaryLanguage.name}</span>
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Star size={13} aria-hidden="true" />
                    {repo.stargazerCount}
                  </span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <GitFork size={13} aria-hidden="true" />
                    {repo.forkCount}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
