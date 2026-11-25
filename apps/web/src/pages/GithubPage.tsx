import { useLingui } from "@lingui/react/macro";
import type { GithubRateLimit, GithubRepoSummary } from "@rakazo/contracts";
import { GithubOwnerSchema, GithubRepoNameSchema } from "@rakazo/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  SegmentedControl,
} from "@rakazo/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Bot as BotIcon,
  Compass,
  Eye,
  EyeOff,
  FolderGit2,
  GitBranch,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Unlink,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryUserId, useSpaceQueries } from "../lib/query";
import { createSpaceRpc, selectedSpaceId } from "../lib/rpc";
import { errorText } from "../lib/user-error";
import { GithubConnectDialog } from "./github/GithubConnectDialog";
import { GithubExploreSearch } from "./github/GithubExploreSearch";
import { GithubProfileOverview } from "./github/GithubProfileOverview";
import { GithubRepoDrawer } from "./github/GithubRepoDrawer";
import { GithubRepoList } from "./github/GithubRepoList";
import type { GithubModuleTab, SelectedGithubRepo } from "./github/types";
import { WindowChrome } from "./WindowChrome";

export function parseGithubModuleTab(raw: string | null): GithubModuleTab {
  if (raw === "repos" || raw === "explore") return raw;
  return "overview";
}

export function parseRepoSearchParam(raw: string | null): SelectedGithubRepo | null {
  if (!raw) return null;
  const segments = raw.trim().split("/");
  if (segments.length !== 2) return null;
  const ownerParsed = GithubOwnerSchema.safeParse(segments[0]);
  const repoParsed = GithubRepoNameSchema.safeParse(segments[1]);
  if (!ownerParsed.success || !repoParsed.success) return null;
  return {
    owner: ownerParsed.data,
    repo: repoParsed.data,
  };
}

export function GithubPage() {
  const userId = useQueryUserId();
  const spaceId = selectedSpaceId();
  return <GithubWorkbench key={JSON.stringify([userId, spaceId])} spaceId={spaceId} />;
}

function GithubWorkbench({ spaceId }: { spaceId: string | null }) {
  const { i18n } = useLingui();
  const isZh = (i18n?.locale ?? "zh").startsWith("zh");
  const text = (chinese: string, english: string) => (isZh ? chinese : english);

  const [searchParams, setSearchParams] = useSearchParams();
  const queries = useSpaceQueries();
  const qc = useQueryClient();

  const mountedRef = useRef(false);
  const disconnectingRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [hidePrivate, setHidePrivate] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [latestRateLimit, setLatestRateLimit] = useState<GithubRateLimit | null>(null);
  const [cachedSummary, setCachedSummary] = useState<{
    fullName: string;
    summary: GithubRepoSummary;
  } | null>(null);

  const activeTab = parseGithubModuleTab(searchParams.get("tab"));
  const parsedRepoParam = useMemo(
    () => parseRepoSearchParam(searchParams.get("repo")),
    [searchParams],
  );

  const selectedRepo = useMemo<SelectedGithubRepo | null>(() => {
    if (!parsedRepoParam) return null;
    const key = `${parsedRepoParam.owner}/${parsedRepoParam.repo}`.toLowerCase();
    if (cachedSummary && cachedSummary.fullName.toLowerCase() === key) {
      return {
        ...parsedRepoParam,
        summary: cachedSummary.summary,
      };
    }
    return parsedRepoParam;
  }, [parsedRepoParam, cachedSummary]);

  const statusOptions = queries.github.status.queryOptions();
  const statusQuery = useQuery(statusOptions);
  const botsQuery = useQuery(queries.bots.list.queryOptions());

  const status = statusQuery.data;
  const isConnected = status?.status === "connected";
  const connectedLogin = status?.status === "connected" ? status.login : null;
  const bots = botsQuery.data ?? [];

  const effectiveRateLimit =
    latestRateLimit ?? (status?.status === "connected" ? status.rateLimit : null);

  const handleTabChange = useCallback(
    (nextTab: GithubModuleTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (nextTab === "overview") {
            next.delete("tab");
          } else {
            next.set("tab", nextTab);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleSelectRepo = useCallback(
    (target: SelectedGithubRepo) => {
      const ownerParsed = GithubOwnerSchema.safeParse(target.owner);
      const repoParsed = GithubRepoNameSchema.safeParse(target.repo);
      if (!ownerParsed.success || !repoParsed.success) return;

      const fullName = `${ownerParsed.data}/${repoParsed.data}`;
      if (target.summary) {
        setCachedSummary({ fullName, summary: target.summary });
      }
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("repo", fullName);
        return next;
      });
    },
    [setSearchParams],
  );

  const clearSelectedRepo = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("repo");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  async function handleConnectToken(token: string) {
    if (selectedSpaceId() !== spaceId) {
      throw new Error(text("空间已切换，请重试。", "Workspace changed. Try again."));
    }
    const nextStatus = await createSpaceRpc(spaceId).github.connect({ token });
    if (!mountedRef.current || selectedSpaceId() !== spaceId) return;
    qc.setQueryData(statusOptions.queryKey, nextStatus);
    if (nextStatus.status === "connected") {
      setLatestRateLimit(nextStatus.rateLimit);
    }
    await qc.invalidateQueries({ queryKey: queries.github.key() });
  }

  async function handleRefresh() {
    if (refreshing || selectedSpaceId() !== spaceId) return;
    setRefreshing(true);
    try {
      const verifiedStatus = await createSpaceRpc(spaceId).github.status({
        verifyRemote: true,
      });
      if (!mountedRef.current || selectedSpaceId() !== spaceId) return;
      qc.setQueryData(statusOptions.queryKey, verifiedStatus);
      if (verifiedStatus.status === "connected") {
        setLatestRateLimit(verifiedStatus.rateLimit);
      }
      await qc.invalidateQueries({ queryKey: queries.github.key() });
    } catch {
      if (mountedRef.current && selectedSpaceId() === spaceId) {
        await qc.invalidateQueries({ queryKey: queries.github.key() });
      }
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }

  async function handleDisconnect() {
    if (disconnectingRef.current || selectedSpaceId() !== spaceId) return;
    disconnectingRef.current = true;
    setDisconnecting(true);
    setDisconnectError(null);
    try {
      const nextStatus = await createSpaceRpc(spaceId).github.disconnect();
      if (!mountedRef.current || selectedSpaceId() !== spaceId) return;
      setLatestRateLimit(null);
      setCachedSummary(null);
      qc.setQueryData(statusOptions.queryKey, nextStatus);
      qc.removeQueries({ queryKey: queries.github.profileOverview.key() });
      qc.removeQueries({ queryKey: queries.github.listMyRepos.key() });
      await qc.invalidateQueries({ queryKey: queries.github.key() });
      setDisconnectOpen(false);
    } catch (cause) {
      if (mountedRef.current && selectedSpaceId() === spaceId) {
        setDisconnectError(
          errorText(
            cause,
            text("无法断开 GitHub 连接，请稍后重试。", "Could not disconnect GitHub. Try again."),
          ),
        );
      }
    } finally {
      disconnectingRef.current = false;
      if (mountedRef.current) setDisconnecting(false);
    }
  }

  const tabOptions = [
    { value: "overview", label: text("个人主页", "Overview") },
    { value: "repos", label: text("远端项目", "Repositories") },
    { value: "explore", label: text("搜索开源", "Explore") },
  ];

  return (
    <main className="flex h-full min-h-0 flex-col" data-github-workbench>
      {/* Top Header */}
      <header className="app-drag flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-5">
        <WindowChrome />
        <Link
          to="/app"
          className="app-no-drag inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{text("首页", "Home")}</span>
        </Link>
        <h1 className="m-0 flex items-center gap-2 text-lg font-semibold text-foreground">
          <GitBranch size={20} aria-hidden="true" />
          <span>GitHub</span>
        </h1>

        <div className="app-no-drag">
          <SegmentedControl
            label={text("GitHub 模块视图", "GitHub module view")}
            options={tabOptions}
            value={activeTab}
            onValueChange={(value) => handleTabChange(parseGithubModuleTab(value))}
          />
        </div>

        <div className="app-no-drag ms-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="github-hide-private-toggle"
            aria-pressed={hidePrivate}
            onClick={() => setHidePrivate((prev) => !prev)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
              hidePrivate
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {hidePrivate ? (
              <EyeOff size={14} aria-hidden="true" />
            ) : (
              <Eye size={14} aria-hidden="true" />
            )}
            <span>{text("隐藏私有仓库", "Hide private")}</span>
          </button>

          {isConnected && status ? (
            <>
              <div
                data-testid="github-connection-pill"
                className="inline-flex h-8 items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-medium text-foreground"
              >
                <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                <span>@{status.login}</span>
                {effectiveRateLimit ? (
                  <span className="border-s border-border ps-2 tabular-nums text-muted-foreground">
                    {text(
                      `配额 ${effectiveRateLimit.remaining}/${effectiveRateLimit.limit}`,
                      `Quota ${effectiveRateLimit.remaining}/${effectiveRateLimit.limit}`,
                    )}
                  </span>
                ) : null}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={refreshing}
                aria-label={text("刷新 GitHub 数据", "Refresh GitHub data")}
                onClick={() => void handleRefresh()}
              >
                <RefreshCw
                  size={14}
                  className={refreshing ? "animate-spin" : undefined}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">{text("刷新", "Refresh")}</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConnectOpen(true)}
              >
                <KeyRound size={14} aria-hidden="true" />
                <span>{text("更换 Token", "Change token")}</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDisconnectError(null);
                  setDisconnectOpen(true);
                }}
              >
                <Unlink size={14} aria-hidden="true" />
                <span>{text("断开", "Disconnect")}</span>
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              data-testid="github-header-connect-button"
              onClick={() => setConnectOpen(true)}
            >
              <KeyRound size={14} aria-hidden="true" />
              <span>
                {status?.status === "invalid"
                  ? text("重新连接 GitHub", "Reconnect GitHub")
                  : text("连接 GitHub", "Connect GitHub")}
              </span>
            </Button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="mx-auto grid max-w-6xl gap-4">
          {/* Security Warning Banner for High-Risk Scopes */}
          {isConnected && status.highRiskScopes.length > 0 ? (
            <div
              role="alert"
              data-testid="github-high-risk-banner"
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <ShieldAlert
                  size={18}
                  className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                <div className="min-w-0 space-y-1">
                  <p className="m-0 font-semibold text-foreground">
                    {text(
                      "检测到高危 GitHub Token 权限范围",
                      "High-risk GitHub token scopes detected",
                    )}
                  </p>
                  <p className="m-0 text-xs leading-relaxed text-muted-foreground">
                    {text(
                      `当前令牌包含高危权限：${status.highRiskScopes.join(", ")}。虽然本工作台仅执行只读查询，为保障账号与仓库安全，强烈建议更换为仅开启 Metadata / Contents 只读权限的 Fine-grained PAT。`,
                      `Your current token grants high-risk scopes (${status.highRiskScopes.join(", ")}). Switch to a minimal read-only Fine-grained PAT for safety.`,
                    )}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConnectOpen(true)}
              >
                {text("更换为只读 Token", "Switch to read-only token")}
              </Button>
            </div>
          ) : null}

          {/* Reconnect Banner when Token is Invalid / Revoked */}
          {status?.status === "invalid" ? (
            <div
              role="alert"
              data-testid="github-invalid-banner"
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <AlertTriangle
                  size={18}
                  className="mt-0.5 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <div className="min-w-0 space-y-1">
                  <p className="m-0 font-semibold text-foreground">
                    {text(
                      `GitHub 令牌已失效（@${status.login}）`,
                      `GitHub token is no longer valid (@${status.login})`,
                    )}
                  </p>
                  <p className="m-0 text-xs leading-relaxed text-muted-foreground">
                    {status.message}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" onClick={() => setConnectOpen(true)}>
                  {text("重新连接 Token", "Reconnect token")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDisconnectError(null);
                    setDisconnectOpen(true);
                  }}
                >
                  {text("移除失效连接", "Remove")}
                </Button>
              </div>
            </div>
          ) : null}

          {/* Active Tab View */}
          {activeTab === "overview" ? (
            statusQuery.isPending && !status ? (
              <p role="status" className="text-sm text-muted-foreground">
                {text("正在检查 GitHub 连接状态…", "Checking GitHub connection status…")}
              </p>
            ) : statusQuery.error && !status ? (
              <div
                role="alert"
                className="sydney-list-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 p-5"
              >
                <p className="m-0 text-sm text-destructive">
                  {errorText(
                    statusQuery.error,
                    text("无法检查 GitHub 连接状态", "Could not check GitHub connection status"),
                  )}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void statusQuery.refetch()}
                >
                  {text("重试", "Retry")}
                </Button>
              </div>
            ) : isConnected ? (
              <GithubProfileOverview
                hidePrivate={hidePrivate}
                onSelectRepo={handleSelectRepo}
                onRateLimitChange={setLatestRateLimit}
              />
            ) : (
              <section
                data-testid="github-onboarding-card"
                aria-label={text("连接 GitHub 引导", "Connect GitHub onboarding")}
                className="sydney-list-surface grid gap-6 rounded-2xl border border-border p-6 sm:p-8"
              >
                <div className="max-w-2xl space-y-2">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                    <Sparkles size={13} aria-hidden="true" />
                    <span>{text("只读安全接入 · 零远端副作用", "Read-only integration")}</span>
                  </div>
                  <h2 className="m-0 text-2xl font-semibold text-foreground">
                    {text(
                      "在工作台中查看你的 GitHub 主页、贡献热力图与远端项目",
                      "Bring your GitHub profile, contribution heatmap, and repositories into Sydney",
                    )}
                  </h2>
                  <p className="m-0 text-sm leading-relaxed text-muted-foreground">
                    {text(
                      "连接 Personal Access Token 后即可查看完整个人主页与 52 周贡献热力图、检索个人/组织仓库，并让对话中的 Bot 按需只读查阅你的仓库与 README。未连接时也可直接搜索公开开源项目。",
                      "Connect a Personal Access Token to view your profile, 52-week contribution heatmap, and remote repositories, or explore public open-source projects right away.",
                    )}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border/80 bg-background/60 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <GitBranch size={16} className="text-emerald-500" aria-hidden="true" />
                      <span>{text("个人主页与 52 周热力图", "Profile & 52-week heatmap")}</span>
                    </div>
                    <p className="mt-1.5 mb-0 text-xs leading-relaxed text-muted-foreground">
                      {text(
                        "展示个人资料、置顶仓库、年度贡献切换、Commits / PRs / Issues 统计与连续活跃天数。",
                        "Inspect profile stats, pinned repositories, yearly contributions, commits, PRs, issues, and streaks.",
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-background/60 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <FolderGit2 size={16} className="text-primary" aria-hidden="true" />
                      <span>{text("远端项目与开源探索", "Remote projects & explore")}</span>
                    </div>
                    <p className="mt-1.5 mb-0 text-xs leading-relaxed text-muted-foreground">
                      {text(
                        "按语言、可见性与归属筛选仓库，在抽屉中预览 README、近期提交、Release 与克隆命令。",
                        "Filter your repositories or search open-source projects with inline README, commits, and release previews.",
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-background/60 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <BotIcon size={16} className="text-amber-500" aria-hidden="true" />
                      <span>{text("Bot 只读 GitHub 工具", "Bot read-only GitHub tools")}</span>
                    </div>
                    <p className="mt-1.5 mb-0 text-xs leading-relaxed text-muted-foreground">
                      {text(
                        "对话小伙伴可调用只读工具阅读仓库结构、源码与 README，绝不执行推送、合并或删库操作。",
                        "Bots can inspect repository trees, files, and READMEs with strictly read-only built-in tools.",
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    data-testid="github-onboarding-connect-button"
                    onClick={() => setConnectOpen(true)}
                  >
                    <KeyRound size={15} aria-hidden="true" />
                    <span>{text("连接 GitHub Token", "Connect GitHub Token")}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    data-testid="github-onboarding-explore-button"
                    onClick={() => handleTabChange("explore")}
                  >
                    <Compass size={15} aria-hidden="true" />
                    <span>{text("先去搜索开源项目", "Explore public repos first")}</span>
                  </Button>
                </div>
              </section>
            )
          ) : activeTab === "repos" ? (
            <GithubRepoList
              connected={isConnected}
              hidePrivate={hidePrivate}
              selectedRepo={selectedRepo}
              onSelectRepo={handleSelectRepo}
              onRequestConnect={() => setConnectOpen(true)}
            />
          ) : (
            <GithubExploreSearch
              connected={isConnected}
              selectedRepo={selectedRepo}
              onSelectRepo={handleSelectRepo}
              onRequestConnect={() => setConnectOpen(true)}
            />
          )}
        </div>
      </div>

      {/* Repository Detail Drawer */}
      <GithubRepoDrawer
        target={selectedRepo}
        connected={isConnected}
        viewerLogin={connectedLogin}
        bots={bots}
        onClose={clearSelectedRepo}
      />

      {/* Connect / Replace Token Dialog */}
      <GithubConnectDialog
        open={connectOpen}
        mode={isConnected || status?.status === "invalid" ? "replace" : "connect"}
        onOpenChange={setConnectOpen}
        onConnect={handleConnectToken}
      />

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog
        open={disconnectOpen}
        onOpenChange={(open) => {
          if (!open && !disconnectingRef.current) {
            setDisconnectOpen(false);
            setDisconnectError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{text("断开 GitHub 连接？", "Disconnect GitHub?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {text(
                "服务端保存的加密令牌与缓存将被立即清除，Bot 也将停止访问你的私有 GitHub 数据；你仍可继续搜索公开开源项目。",
                "Your encrypted server token and cached GitHub data will be removed immediately. Public repository search remains available.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {disconnectError ? (
            <p role="alert" className="m-0 text-sm text-destructive">
              {disconnectError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>{text("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={disconnecting}
              onClick={(event) => {
                event.preventDefault();
                void handleDisconnect();
              }}
            >
              {disconnecting ? text("正在断开…", "Disconnecting…") : text("确认断开", "Disconnect")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
