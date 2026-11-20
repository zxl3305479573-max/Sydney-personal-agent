import { useLingui } from "@lingui/react";
import type { Bot, GithubCommitSummary, GithubReleaseSummary } from "@rakazo/contracts";
import { Badge, Button, cn, NativeSelect, NativeSelectOption, Spinner } from "@rakazo/ui-web";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  Bot as BotIcon,
  Check,
  CircleDot,
  Copy,
  ExternalLink,
  FileText,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  Scale,
  Sparkles,
  Star,
  Tag,
  Webhook,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { readComposerDraft, writeComposerDraft } from "../../lib/composer-draft";
import { getActiveUiLocale } from "../../lib/i18n";
import { useSpaceQueries } from "../../lib/query";
import { errorText } from "../../lib/user-error";
import type { GithubRepoDrawerProps } from "./types";

type InspectorTab = "readme" | "commits" | "releases";
type AnalysisTemplateKey = "architecture" | "commits" | "integration";
type CopiedKind = "https" | "ssh" | "webhook" | null;

const INLINE_TOKEN_REGEX =
  /`([^`\n]+)`|!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*([^*\n]+)\*\*/g;

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

function formatDateTime(iso: string | null, localeIsZh: boolean): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(localeIsZh ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildBotAnalysisPrompt(options: {
  fullName: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  defaultBranch: string | null;
  template: AnalysisTemplateKey;
  connected: boolean;
  localeIsZh: boolean;
}): string {
  const {
    fullName,
    htmlUrl,
    description,
    language,
    defaultBranch,
    template,
    connected,
    localeIsZh,
  } = options;

  if (!localeIsZh) {
    const instructions: Record<AnalysisTemplateKey, string> = {
      architecture:
        "Please analyze this repository's overall architecture, directory structure, core modules, and key design trade-offs.",
      commits:
        "Please summarize this repository's recent commits, active development direction, and notable changes.",
      integration:
        "Please evaluate how to integrate or adopt this repository, including setup steps, license/maintenance signals, and dependency risks.",
    };
    const lines = [
      `Please analyze the GitHub repository \`${fullName}\` (${htmlUrl}).`,
      description ? `- Description: ${description}` : null,
      language ? `- Primary language: ${language}` : null,
      defaultBranch ? `- Default branch: ${defaultBranch}` : null,
      "",
      instructions[template],
      connected
        ? "Tip: GitHub is connected—you can call `github_read_repo` to inspect its directory tree, README, and key source files directly."
        : "Tip: If GitHub is connected in this space, you can also call `github_read_repo` to inspect files directly.",
    ].filter((line): line is string => line !== null);
    return lines.join("\n");
  }

  const instructionsZh: Record<AnalysisTemplateKey, string> = {
    architecture:
      "请帮我深入解读该仓库的整体架构与核心设计：梳理目录结构、核心模块职责、关键数据流以及值得借鉴的工程实践。",
    commits:
      "请帮我总结该仓库的近期提交与演进脉络：归纳最近重点迭代方向、重要特性或修复，以及当前的活跃维护情况。",
    integration:
      "请帮我评估该仓库的接入方式与依赖风险：说明典型接入步骤、核心外部依赖、开源许可证约束及潜在维护风险。",
  };

  const lines = [
    `请分析 GitHub 仓库 \`${fullName}\`（${htmlUrl}）：`,
    description ? `- 仓库简介：${description}` : null,
    language ? `- 主要语言：${language}` : null,
    defaultBranch ? `- 默认分支：${defaultBranch}` : null,
    "",
    instructionsZh[template],
    connected
      ? "提示：当前已连接 GitHub，你可以直接调用 `github_read_repo` 工具读取该仓库的目录树与关键源码文件进行核实。"
      : "提示：若已连接 GitHub，你也可以调用 `github_read_repo` 工具按路径读取该仓库目录与源码文件。",
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}

export function GithubRepoDrawer({
  target,
  connected,
  viewerLogin,
  bots,
  onClose,
}: GithubRepoDrawerProps) {
  const text = useText();
  const localeIsZh = text("zh", "en") === "zh";
  const queries = useSpaceQueries();
  const navigate = useNavigate();
  const drawerTitleId = useId();
  const botSelectId = useId();
  const templateSelectId = useId();

  const [activeTab, setActiveTab] = useState<InspectorTab>("readme");
  const [selectedBotId, setSelectedBotId] = useState<string>("");
  const [template, setTemplate] = useState<AnalysisTemplateKey>("architecture");
  const [copiedKind, setCopiedKind] = useState<CopiedKind>(null);
  const copyTimerRef = useRef<number | null>(null);

  const owner = target?.owner ?? "";
  const repoName = target?.repo ?? "";

  useEffect(() => {
    if (!owner || !repoName) return;
    setActiveTab("readme");
    setCopiedKind(null);
  }, [owner, repoName]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [target, onClose]);

  const detailQuery = useQuery({
    ...queries.github.repoDetail.queryOptions({
      input: { owner: owner || "octocat", repo: repoName || "Hello-World" },
    }),
    enabled: Boolean(target),
  });

  if (target === null) {
    return null;
  }

  const detail = detailQuery.data ?? null;
  const repo = detail?.repo ?? target.summary ?? null;
  const fullName = repo?.fullName ?? `${target.owner}/${target.repo}`;
  const fallbackHtmlUrl = `https://github.com/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;
  const safeHtmlUrl = sanitizeHttpUrl(repo?.htmlUrl) ?? fallbackHtmlUrl;
  const httpsCloneUrl = repo?.cloneUrl ?? `https://github.com/${target.owner}/${target.repo}.git`;
  const sshCloneUrl = repo?.sshUrl ?? `git@github.com:${target.owner}/${target.repo}.git`;

  const resolvedBot: Bot | undefined = bots.find((bot) => bot.id === selectedBotId) ?? bots[0];
  const resolvedBotId = resolvedBot?.id ?? "";

  const isViewerOwner =
    Boolean(detail?.isViewerOwner) ||
    Boolean(
      viewerLogin && (repo?.ownerLogin ?? target.owner).toLowerCase() === viewerLogin.toLowerCase(),
    );

  async function copyText(value: string, kind: Exclude<CopiedKind, null>) {
    try {
      await navigator.clipboard?.writeText(value);
      setCopiedKind(kind);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedKind(null);
      }, 2000);
    } catch {
      // Clipboard API unavailable or denied in current environment.
    }
  }

  function handleSendToBot() {
    if (!resolvedBotId) return;
    const threadKey = `bot:${resolvedBotId}`;
    const existingDraft = readComposerDraft(threadKey);
    const promptBlock = buildBotAnalysisPrompt({
      fullName,
      htmlUrl: safeHtmlUrl,
      description: repo?.description ?? null,
      language: repo?.primaryLanguage?.name ?? null,
      defaultBranch: repo?.defaultBranch ?? null,
      template,
      connected,
      localeIsZh,
    });
    const nextDraft = existingDraft.trim()
      ? `${existingDraft.trimEnd()}\n\n${promptBlock}`
      : promptBlock;
    writeComposerDraft(threadKey, nextDraft);
    navigate(`/app/${encodeURIComponent(resolvedBotId)}`);
  }

  const langColor = repo?.primaryLanguage?.color;

  return (
    <>
      <button
        type="button"
        aria-label={text("关闭仓库详情抽屉", "Close repository inspector")}
        onClick={onClose}
        data-testid="repo-drawer-backdrop"
        className="fixed inset-0 z-40 bg-overlay/50 md:hidden"
      />
      <section
        aria-labelledby={drawerTitleId}
        data-testid="github-repo-drawer"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-dialog text-foreground shadow-2xl"
      >
        <header className="shrink-0 space-y-3 border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id={drawerTitleId}
                  className="break-words font-semibold text-base text-foreground"
                  dir="auto"
                >
                  {fullName}
                </h2>
                {repo ? (
                  <>
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
                    {repo.licenseSpdxId && repo.licenseSpdxId !== "NOASSERTION" ? (
                      <Badge variant="outline">
                        <Scale className="size-3" aria-hidden="true" />
                        {repo.licenseSpdxId}
                      </Badge>
                    ) : null}
                  </>
                ) : null}
              </div>
              {repo?.description ? (
                <p className="text-xs text-muted-foreground leading-relaxed" dir="auto">
                  {repo.description}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={text("关闭详情", "Close inspector")}
              onClick={onClose}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>

          {repo ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {repo.primaryLanguage ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full bg-primary"
                    style={
                      isSafeLanguageColor(langColor) ? { backgroundColor: langColor } : undefined
                    }
                  />
                  <span>{repo.primaryLanguage.name}</span>
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5" aria-hidden="true" />
                {formatCompactCount(repo.stargazerCount)} Stars
              </span>
              <span className="inline-flex items-center gap-1">
                <GitFork className="size-3.5" aria-hidden="true" />
                {formatCompactCount(repo.forkCount)} Forks
              </span>
              <span className="inline-flex items-center gap-1">
                <CircleDot className="size-3.5" aria-hidden="true" />
                {formatCompactCount(repo.openIssuesCount)} Issues
              </span>
              <span className="inline-flex items-center gap-1">
                <GitBranch className="size-3.5" aria-hidden="true" />
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                  {repo.defaultBranch}
                </code>
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={safeHtmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {text("在 GitHub 打开", "Open on GitHub")}
            </a>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyText(httpsCloneUrl, "https")}
            >
              {copiedKind === "https" ? (
                <Check className="size-3.5 text-success" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
              {copiedKind === "https"
                ? text("已复制", "Copied")
                : text("复制 HTTPS 克隆", "Copy HTTPS clone")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyText(sshCloneUrl, "ssh")}
            >
              {copiedKind === "ssh" ? (
                <Check className="size-3.5 text-success" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
              {copiedKind === "ssh"
                ? text("已复制", "Copied")
                : text("复制 SSH 克隆", "Copy SSH clone")}
            </Button>
          </div>

          <div
            className="rounded-xl border border-border bg-card p-3 space-y-2.5"
            data-testid="repo-bot-handoff"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
              <span>{text("交给 Bot 分析", "Send to Bot for analysis")}</span>
            </div>
            {bots.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {text(
                    "当前空间暂无可用 Bot，请先返回首页创建 Bot",
                    "No bots available in this space yet. Return home to create a bot first.",
                  )}
                </span>
                <Link
                  to="/app"
                  className="font-medium text-link underline underline-offset-2 hover:opacity-80"
                >
                  {text("返回首页", "Go to Home")}
                </Link>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex min-w-32 flex-col gap-1">
                  <label htmlFor={botSelectId} className="text-[11px] text-muted-foreground">
                    {text("选择 Bot", "Target Bot")}
                  </label>
                  <NativeSelect
                    id={botSelectId}
                    size="sm"
                    aria-label={text("选择分析 Bot", "Choose bot for analysis")}
                    value={resolvedBotId}
                    onChange={(event) => setSelectedBotId(event.target.value)}
                  >
                    {bots.map((bot) => (
                      <NativeSelectOption key={bot.id} value={bot.id}>
                        {bot.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>

                <div className="flex min-w-44 flex-1 flex-col gap-1">
                  <label htmlFor={templateSelectId} className="text-[11px] text-muted-foreground">
                    {text("分析角度", "Analysis focus")}
                  </label>
                  <NativeSelect
                    id={templateSelectId}
                    size="sm"
                    className="w-full"
                    aria-label={text("选择分析模板", "Choose analysis template")}
                    value={template}
                    onChange={(event) => setTemplate(event.target.value as AnalysisTemplateKey)}
                  >
                    <NativeSelectOption value="architecture">
                      {text("解读仓库架构与核心设计", "Analyze architecture & core design")}
                    </NativeSelectOption>
                    <NativeSelectOption value="commits">
                      {text("总结近期提交与演进", "Summarize recent commits & evolution")}
                    </NativeSelectOption>
                    <NativeSelectOption value="integration">
                      {text("评估接入方式与依赖风险", "Evaluate integration & dependency risks")}
                    </NativeSelectOption>
                  </NativeSelect>
                </div>

                <Button type="button" size="sm" onClick={handleSendToBot}>
                  <BotIcon className="size-3.5" aria-hidden="true" />
                  {text("交给 Bot 分析", "Send to Bot")}
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 pt-0.5" role="tablist">
            <SubTabButton
              active={activeTab === "readme"}
              onClick={() => setActiveTab("readme")}
              icon={<FileText className="size-3.5" aria-hidden="true" />}
              label="README"
            />
            <SubTabButton
              active={activeTab === "commits"}
              onClick={() => setActiveTab("commits")}
              icon={<GitCommitHorizontal className="size-3.5" aria-hidden="true" />}
              label={text("近期提交", "Recent commits")}
              badge={detail ? String(detail.recentCommits.length) : undefined}
            />
            <SubTabButton
              active={activeTab === "releases"}
              onClick={() => setActiveTab("releases")}
              icon={<Tag className="size-3.5" aria-hidden="true" />}
              label={text("版本与联动", "Releases & Webhook")}
            />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {detailQuery.isPending ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2.5 py-12 text-sm text-muted-foreground"
            >
              <Spinner />
              <span>{text("正在加载仓库详情…", "Loading repository details…")}</span>
            </div>
          ) : detailQuery.error ? (
            <div role="alert" className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <p className="text-sm text-destructive">
                {errorText(
                  detailQuery.error,
                  text("无法读取仓库详情", "Could not load repository details"),
                )}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void detailQuery.refetch()}
              >
                {text("重试", "Retry")}
              </Button>
            </div>
          ) : detail ? (
            <>
              {activeTab === "readme" ? (
                <div data-testid="repo-drawer-readme">
                  {detail.readme === null ? (
                    <p className="py-6 text-sm text-muted-foreground">
                      {text("该仓库暂无 README", "No README found in this repository.")}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                          {detail.readme.path}
                        </code>
                      </div>
                      <SafeMarkdownView content={detail.readme.content} />
                      {detail.readme.truncated ? (
                        <div className="rounded-xl border border-border bg-muted/60 px-3.5 py-2.5 text-xs text-muted-foreground">
                          {text(
                            "README 内容较长，已截断预览；",
                            "README preview was truncated due to length; ",
                          )}
                          <a
                            href={safeHtmlUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-link underline underline-offset-2"
                          >
                            {text("前往 GitHub 查看完整文档", "view full README on GitHub")}
                          </a>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}

              {activeTab === "commits" ? (
                <RecentCommitsSection
                  commits={detail.recentCommits}
                  localeIsZh={localeIsZh}
                  text={text}
                />
              ) : null}

              {activeTab === "releases" ? (
                <ReleasesAndWebhookSection
                  release={detail.latestRelease}
                  isViewerOwner={isViewerOwner}
                  resolvedBotId={resolvedBotId}
                  copiedWebhook={copiedKind === "webhook"}
                  onCopyWebhook={(endpoint) => void copyText(endpoint, "webhook")}
                  localeIsZh={localeIsZh}
                  text={text}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}

function SubTabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: string;
}) {
  return (
    <Button
      type="button"
      role="tab"
      size="xs"
      variant={active ? "default" : "outline"}
      aria-selected={active}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined ? (
        <span className="ml-0.5 rounded-full bg-background/20 px-1.5 text-[10px]">{badge}</span>
      ) : null}
    </Button>
  );
}

function RecentCommitsSection({
  commits,
  localeIsZh,
  text,
}: {
  commits: readonly GithubCommitSummary[];
  localeIsZh: boolean;
  text: (zh: string, en: string) => string;
}) {
  if (commits.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        {text("暂无近期提交记录", "No recent commits found.")}
      </p>
    );
  }

  return (
    <ul className="space-y-2.5" data-testid="repo-drawer-commits">
      {commits.map((commit) => {
        const headline = commit.message.split(/\r?\n/, 1)[0] || commit.shortSha;
        const safeCommitUrl = sanitizeHttpUrl(commit.htmlUrl);
        return (
          <li key={commit.sha} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p
                className="min-w-0 flex-1 break-words font-medium text-sm text-foreground"
                dir="auto"
              >
                {headline}
              </p>
              {safeCommitUrl ? (
                <a
                  href={safeCommitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-link hover:opacity-80"
                >
                  {commit.shortSha}
                </a>
              ) : (
                <code className="shrink-0 rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {commit.shortSha}
                </code>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {commit.authorLogin
                  ? `${commit.authorName} (@${commit.authorLogin})`
                  : commit.authorName}
              </span>
              {commit.committedAt ? (
                <span className="text-faint-foreground">
                  · {formatDateTime(commit.committedAt, localeIsZh)}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ReleasesAndWebhookSection({
  release,
  isViewerOwner,
  resolvedBotId,
  copiedWebhook,
  onCopyWebhook,
  localeIsZh,
  text,
}: {
  release: GithubReleaseSummary | null;
  isViewerOwner: boolean;
  resolvedBotId: string;
  copiedWebhook: boolean;
  onCopyWebhook: (endpoint: string) => void;
  localeIsZh: boolean;
  text: (zh: string, en: string) => string;
}) {
  const safeReleaseUrl = sanitizeHttpUrl(release?.htmlUrl);
  const concretePath = resolvedBotId
    ? `/api/v1/bots/${resolvedBotId}/github`
    : "/api/v1/bots/<botId>/github";

  return (
    <div className="space-y-4" data-testid="repo-drawer-releases">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-sm text-foreground">
            {text("最新发版 (Latest Release)", "Latest Release")}
          </h3>
          {release && safeReleaseUrl ? (
            <a
              href={safeReleaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-link underline underline-offset-2"
            >
              <ExternalLink className="size-3" aria-hidden="true" />
              {text("查看 Release", "Open release")}
            </a>
          ) : null}
        </div>

        {release === null ? (
          <p className="text-xs text-muted-foreground">
            {text("该仓库暂无已发布的 Release。", "No published releases for this repository.")}
          </p>
        ) : (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs font-semibold">
                {release.tagName}
              </code>
              {release.name && release.name !== release.tagName ? (
                <span className="font-medium text-sm text-foreground">{release.name}</span>
              ) : null}
              <Badge variant={release.prerelease ? "secondary" : "default"}>
                {release.prerelease ? text("预发布", "Pre-release") : text("正式版", "Latest")}
              </Badge>
              {release.publishedAt ? (
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(release.publishedAt, localeIsZh)}
                </span>
              ) : null}
            </div>
            {release.body.trim() ? (
              <div className="border-t border-border pt-2">
                <SafeMarkdownView content={release.body} />
                {release.truncated ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {text("发版说明较长，已截断显示。", "Release notes preview truncated.")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {isViewerOwner ? (
        <div
          className="rounded-2xl border border-border bg-card p-4 space-y-2.5"
          data-testid="repo-webhook-helper"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Webhook className="size-4 text-primary" aria-hidden="true" />
            <span>{text("Sydney 事件联动 (Webhook)", "Sydney Webhook Integration")}</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {text(
              "你是该仓库的所有者，可在仓库 Settings → Webhooks 中配置 Sydney 接收端点，将 Push、PR 或 Issue 事件接入 Bot Routine 自动处理：",
              "You own this repository. Configure a GitHub Webhook in Settings → Webhooks pointing to Sydney so Push, PR, or Issue events trigger Bot Routines:",
            )}
          </p>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-lg border border-border bg-muted px-2.5 py-1 font-mono text-xs text-foreground">
                /api/v1/bots/&lt;botId&gt;/github
              </code>
            </div>
            {resolvedBotId ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5">
                <code className="break-all font-mono text-xs text-foreground">{concretePath}</code>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => onCopyWebhook(concretePath)}
                >
                  {copiedWebhook ? (
                    <Check className="size-3 text-success" aria-hidden="true" />
                  ) : (
                    <Copy className="size-3" aria-hidden="true" />
                  )}
                  {copiedWebhook ? text("已复制", "Copied") : text("复制路径", "Copy path")}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Pure React safe Markdown renderer for untrusted GitHub README & Release bodies.
 * Never uses dangerouslySetInnerHTML or HTML parsing; raw HTML tags stay inert text nodes.
 */
function SafeMarkdownView({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    // Blank line
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    // Fenced code block (``` or ~~~)
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})([^\s`~]*)\s*$/);
    if (fenceMatch) {
      const markerChar = fenceMatch[1]![0]!;
      const markerLen = fenceMatch[1]!.length;
      const lang = fenceMatch[2] || "";
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        const closeMatch = candidate.match(/^\s*(`{3,}|~{3,})\s*$/);
        if (closeMatch && closeMatch[1]![0] === markerChar && closeMatch[1]!.length >= markerLen) {
          index += 1;
          break;
        }
        codeLines.push(candidate);
        index += 1;
      }
      blocks.push(
        <div
          key={`code-${index}`}
          className="my-2.5 overflow-hidden rounded-xl border border-border bg-muted"
        >
          {lang ? (
            <div className="border-b border-border px-3 py-1 font-mono text-[11px] text-muted-foreground">
              {lang}
            </div>
          ) : null}
          <pre className="overflow-x-auto p-3 font-mono text-xs text-foreground leading-relaxed">
            <code>{codeLines.join("\n")}</code>
          </pre>
        </div>,
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} className="my-3 border-border" />);
      index += 1;
      continue;
    }

    // Headings (# .. ####)
    const headingMatch = line.match(/^(#{1,4})\s+(.+?)\s*#*$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const headingText = headingMatch[2]!;
      const inline = renderInlineMarkdown(headingText, `h-${index}`);
      const className = cn(
        "mt-4 mb-1.5 font-semibold text-foreground break-words",
        level === 1 && "text-base border-b border-border pb-1",
        level === 2 && "text-sm border-b border-border/60 pb-1",
        level === 3 && "text-sm",
        level === 4 && "text-xs uppercase tracking-wide text-muted-foreground",
      );
      if (level === 1)
        blocks.push(
          <h3 key={`h1-${index}`} className={className}>
            {inline}
          </h3>,
        );
      else if (level === 2)
        blocks.push(
          <h4 key={`h2-${index}`} className={className}>
            {inline}
          </h4>,
        );
      else if (level === 3)
        blocks.push(
          <h5 key={`h3-${index}`} className={className}>
            {inline}
          </h5>,
        );
      else
        blocks.push(
          <h6 key={`h4-${index}`} className={className}>
            {inline}
          </h6>,
        );
      index += 1;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index] ?? "")) {
        quoteLines.push((lines[index] ?? "").replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={`quote-${index}`}
          className="my-2 border-l-2 border-primary/50 pl-3 text-xs text-muted-foreground italic leading-relaxed"
        >
          {renderInlineMarkdown(quoteLines.join(" "), `q-${index}`)}
        </blockquote>,
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*[-*+]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul
          key={`ul-${index}`}
          className="my-2 list-disc space-y-1 pl-5 text-sm text-foreground leading-relaxed"
        >
          {items.map((item, itemIdx) => (
            <li key={`uli-${index}-${itemIdx}`} className="break-words">
              {renderInlineMarkdown(item, `uli-${index}-${itemIdx}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*\d+[.)]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ol
          key={`ol-${index}`}
          className="my-2 list-decimal space-y-1 pl-5 text-sm text-foreground leading-relaxed"
        >
          {items.map((item, itemIdx) => (
            <li key={`oli-${index}-${itemIdx}`} className="break-words">
              {renderInlineMarkdown(item, `oli-${index}-${itemIdx}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph (collect consecutive plain lines)
    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (
        current.trim() === "" ||
        /^\s*(`{3,}|~{3,})/.test(current) ||
        /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(current) ||
        /^(#{1,4})\s+/.test(current) ||
        /^\s*>\s?/.test(current) ||
        /^\s*[-*+]\s+/.test(current) ||
        /^\s*\d+[.)]\s+/.test(current)
      ) {
        break;
      }
      paragraphLines.push(current.trim());
      index += 1;
    }

    blocks.push(
      <p
        key={`p-${index}`}
        className="my-2 break-words text-sm text-foreground/90 leading-relaxed"
        dir="auto"
      >
        {renderInlineMarkdown(paragraphLines.join(" "), `p-${index}`)}
      </p>,
    );
  }

  return <div className="space-y-1">{blocks}</div>;
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenCounter = 0;

  for (const match of text.matchAll(INLINE_TOKEN_REGEX)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      nodes.push(text.slice(cursor, start));
    }
    tokenCounter += 1;
    const key = `${keyPrefix}-${tokenCounter}`;

    if (match[1] !== undefined) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
        >
          {match[1]}
        </code>,
      );
    } else if (match[2] !== undefined && match[3] !== undefined) {
      const alt = match[2].trim() || "image";
      const safeImageHref = sanitizeHttpUrl(match[3]);
      if (safeImageHref) {
        nodes.push(
          <a
            key={key}
            href={safeImageHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-link hover:opacity-80"
          >
            [{alt}]
          </a>,
        );
      } else {
        nodes.push(`[${alt}]`);
      }
    } else if (match[4] !== undefined && match[5] !== undefined) {
      const label = match[4];
      const safeHref = sanitizeHttpUrl(match[5]);
      if (safeHref) {
        nodes.push(
          <a
            key={key}
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link underline underline-offset-2 hover:opacity-80"
          >
            {label}
          </a>,
        );
      } else {
        nodes.push(label);
      }
    } else if (match[6] !== undefined) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {match[6]}
        </strong>,
      );
    }

    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}
