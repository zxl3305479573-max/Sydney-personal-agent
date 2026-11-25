import { createHash } from "node:crypto";
import type { AdapterContext, GithubProvider, GithubVerifiedIdentity } from "@rakazo/adapter-kit";
import {
  GithubAuthInvalidError,
  GithubNotFoundError,
  GithubRateLimitedError,
  GithubScopeInsufficientError,
  GithubUpstreamError,
} from "@rakazo/adapter-kit";
import type {
  GithubCommitSummary,
  GithubContributionDay,
  GithubContributionLevel,
  GithubContributionWeek,
  GithubListMyReposInput,
  GithubProfileOverview,
  GithubProfileOverviewInput,
  GithubRateLimit,
  GithubReadmePreview,
  GithubReadRepoFileInput,
  GithubReleaseSummary,
  GithubRepoDetail,
  GithubRepoDetailInput,
  GithubRepoDirectoryEntry,
  GithubRepoPage,
  GithubRepoPathContent,
  GithubRepoSummary,
  GithubSearchReposInput,
  GithubSearchReposOutput,
} from "@rakazo/contracts";
import {
  GITHUB_HIGH_RISK_SCOPES,
  GithubContributionLevelSchema,
  GithubListMyReposInputSchema,
  GithubProfileOverviewInputSchema,
  GithubReadRepoFileInputSchema,
  GithubRepoDetailInputSchema,
  GithubSearchReposInputSchema,
} from "@rakazo/contracts";

const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_ACCEPT_HEADER = "application/vnd.github+json";
const GITHUB_USER_AGENT = "Sydney-Personal-Agent";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_MARKDOWN_CHARS = 64_000;
const MAX_FILE_TEXT_CHARS = 32_000;
const MAX_DIRECTORY_ENTRIES = 200;
const DEFAULT_CACHE_TTL_MS = 300_000;
const DAY_MS = 86_400_000;

const HIGH_RISK_SCOPE_SET: ReadonlySet<string> = new Set(GITHUB_HIGH_RISK_SCOPES);

const PROFILE_OVERVIEW_QUERY = `
  fragment RepoFields on Repository {
    id
    name
    nameWithOwner
    description
    url
    homepageUrl
    sshUrl
    isPrivate
    isFork
    isArchived
    pushedAt
    updatedAt
    stargazerCount
    forkCount
    owner {
      login
      avatarUrl
    }
    defaultBranchRef {
      name
    }
    primaryLanguage {
      name
      color
    }
    licenseInfo {
      spdxId
    }
    issues(states: OPEN) {
      totalCount
    }
    repositoryTopics(first: 10) {
      nodes {
        topic {
          name
        }
      }
    }
  }

  query SydneyGithubProfileOverview($from: DateTime!, $to: DateTime!) {
    viewer {
      id
      databaseId
      login
      name
      avatarUrl
      bio
      company
      location
      websiteUrl
      twitterUsername
      url
      createdAt
      followers {
        totalCount
      }
      following {
        totalCount
      }
      publicRepos: repositories(privacy: PUBLIC, ownerAffiliations: [OWNER]) {
        totalCount
      }
      privateRepos: repositories(privacy: PRIVATE, ownerAffiliations: [OWNER]) {
        totalCount
      }
      contributionsCollection(from: $from, to: $to) {
        contributionYears
        totalCommitContributions
        totalPullRequestContributions
        totalIssueContributions
        totalPullRequestReviewContributions
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              contributionLevel
              weekday
            }
          }
        }
      }
      pinnedItems(first: 6, types: [REPOSITORY]) {
        nodes {
          ...RepoFields
        }
      }
      recentRepos: repositories(
        first: 6
        orderBy: { field: PUSHED_AT, direction: DESC }
        ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
      ) {
        nodes {
          ...RepoFields
        }
      }
    }
  }
`;

export function redactGithubSecrets(text: string, token?: string | null): string {
  let redacted = text
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]+\b/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, "[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]");

  const trimmedToken = token?.trim();
  if (trimmedToken && trimmedToken.length >= 4) {
    redacted = redacted.replaceAll(trimmedToken, "[REDACTED]");
    const encoded = encodeURIComponent(trimmedToken);
    if (encoded !== trimmedToken) {
      redacted = redacted.replaceAll(encoded, "[REDACTED]");
    }
  }
  return redacted;
}

export function buildGithubSearchQuery(input: GithubSearchReposInput, now?: Date): string {
  const parsed = GithubSearchReposInputSchema.parse(input);
  const parts: string[] = [];

  const sanitizedFreeText = sanitizeSearchTerm(parsed.query);
  if (sanitizedFreeText) {
    parts.push(sanitizedFreeText);
  }

  if (parsed.language) {
    const cleanLanguage = sanitizeSearchTerm(parsed.language);
    if (cleanLanguage) {
      parts.push(`language:"${cleanLanguage}"`);
    }
  }

  if (parsed.minStars !== undefined) {
    parts.push(`stars:>=${parsed.minStars}`);
  }

  if (parsed.pushedWithinDays !== undefined) {
    const reference = now ?? new Date();
    const cutoff = new Date(reference.getTime() - parsed.pushedWithinDays * DAY_MS);
    parts.push(`pushed:>=${formatUtcDate(cutoff)}`);
  }

  if (parsed.topic) {
    const cleanTopic = parsed.topic.trim().toLowerCase();
    if (cleanTopic) {
      parts.push(`topic:${cleanTopic}`);
    }
  }

  return parts.length > 0 ? parts.join(" ") : "stars:>=100";
}

export function computeContributionStreaks(
  days: readonly { date: string; contributionCount: number }[],
  todayUtc?: string,
): { currentStreakDays: number; longestStreakDays: number } {
  if (days.length === 0) {
    return { currentStreakDays: 0, longestStreakDays: 0 };
  }

  const byDate = new Map<string, number>();
  for (const entry of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) continue;
    if (todayUtc && entry.date > todayUtc) continue;
    const count = Math.max(0, Math.trunc(entry.contributionCount));
    byDate.set(entry.date, Math.max(byDate.get(entry.date) ?? 0, count));
  }

  const sortedDates = [...byDate.keys()].sort();
  if (sortedDates.length === 0) {
    return { currentStreakDays: 0, longestStreakDays: 0 };
  }

  let longestStreakDays = 0;
  let runningStreak = 0;
  let previousDayEpoch: number | null = null;

  for (const date of sortedDates) {
    const count = byDate.get(date) ?? 0;
    const epoch = parseUtcDayEpoch(date);
    if (count > 0) {
      if (previousDayEpoch !== null && epoch - previousDayEpoch === DAY_MS) {
        runningStreak += 1;
      } else {
        runningStreak = 1;
      }
      if (runningStreak > longestStreakDays) {
        longestStreakDays = runningStreak;
      }
      previousDayEpoch = epoch;
    } else {
      runningStreak = 0;
      previousDayEpoch = null;
    }
  }

  const referenceDate = todayUtc ?? sortedDates[sortedDates.length - 1]!;
  const referenceEpoch = parseUtcDayEpoch(referenceDate);
  const yesterdayDate = formatUtcDate(new Date(referenceEpoch - DAY_MS));

  let anchorEpoch: number | null = null;
  if ((byDate.get(referenceDate) ?? 0) > 0) {
    anchorEpoch = referenceEpoch;
  } else if ((byDate.get(yesterdayDate) ?? 0) > 0) {
    anchorEpoch = referenceEpoch - DAY_MS;
  }

  let currentStreakDays = 0;
  if (anchorEpoch !== null) {
    let cursorEpoch = anchorEpoch;
    while ((byDate.get(formatUtcDate(new Date(cursorEpoch))) ?? 0) > 0) {
      currentStreakDays += 1;
      cursorEpoch -= DAY_MS;
    }
  }

  return { currentStreakDays, longestStreakDays };
}

export function createHttpGithubProvider(options?: {
  fetchImpl?: typeof fetch;
  cacheTtlMs?: number;
  now?: () => Date;
}): GithubProvider {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = options?.now ?? (() => new Date());

  type CachedOverview = {
    expiresAt: number;
    value: GithubProfileOverview;
  };
  const profileCache = new Map<string, CachedOverview>();
  const userCacheKeys = new Map<string, Set<string>>();

  function trackCacheKey(userId: string | undefined | null, cacheKey: string): void {
    if (!userId) return;
    let set = userCacheKeys.get(userId);
    if (!set) {
      set = new Set<string>();
      userCacheKeys.set(userId, set);
    }
    set.add(cacheKey);
  }

  async function requestJson<T>(
    path: string,
    init: {
      method?: "GET" | "POST";
      token?: string | null;
      body?: unknown;
      ctx?: AdapterContext;
    },
  ): Promise<{ data: T; headers: Headers; rateLimit: GithubRateLimit | null }> {
    const url = new URL(path, GITHUB_API_ORIGIN);
    if (url.origin !== GITHUB_API_ORIGIN) {
      throw new GithubUpstreamError("Refusing request outside https://api.github.com");
    }

    const token = init.token?.trim() ? init.token.trim() : null;
    const headers: Record<string, string> = {
      Accept: GITHUB_ACCEPT_HEADER,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": GITHUB_USER_AGENT,
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = init.ctx?.signal
      ? AbortSignal.any([init.ctx.signal, timeoutSignal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method: init.method ?? "GET",
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        redirect: "manual",
        signal,
      });
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : String(error);
      throw new GithubUpstreamError(
        redactGithubSecrets(`GitHub API request failed: ${rawMsg}`, token),
      );
    }

    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel().catch(() => undefined);
      throw new GithubUpstreamError("GitHub API redirect rejected", response.status || 302);
    }

    const rateLimit = parseRateLimit(response.headers);
    const rawText = await readLimitedResponseText(response, token);

    let parsedBody: unknown = null;
    if (rawText.trim().length > 0) {
      try {
        parsedBody = JSON.parse(rawText);
      } catch {
        if (response.ok) {
          throw new GithubUpstreamError("GitHub API returned invalid JSON", response.status);
        }
      }
    }

    if (!response.ok) {
      throw mapHttpError(
        response.status,
        response.headers,
        rateLimit,
        parsedBody,
        rawText,
        token,
        now,
      );
    }

    return { data: parsedBody as T, headers: response.headers, rateLimit };
  }

  return {
    describe() {
      return { id: "github", displayName: "GitHub" };
    },

    evictUserCache(userId: string) {
      const tracked = userCacheKeys.get(userId);
      if (tracked) {
        for (const key of tracked) {
          profileCache.delete(key);
        }
        userCacheKeys.delete(userId);
        return;
      }
      profileCache.clear();
    },

    async verifyToken(token: string, ctx?: AdapterContext): Promise<GithubVerifiedIdentity> {
      const cleanToken = token.trim();
      if (!cleanToken) {
        throw new GithubAuthInvalidError();
      }
      const { data, headers, rateLimit } = await requestJson<Record<string, unknown>>("/user", {
        token: cleanToken,
        ctx,
      });

      const login = typeof data?.login === "string" ? data.login.trim() : "";
      if (!login || (typeof data?.id !== "number" && typeof data?.id !== "string")) {
        throw new GithubUpstreamError("GitHub /user response missing account identity");
      }

      const scopesHeader = headers.get("x-oauth-scopes") ?? "";
      const scopes = [
        ...new Set(
          scopesHeader
            .split(",")
            .map((scope) => scope.trim())
            .filter((scope) => scope.length > 0),
        ),
      ];
      const highRiskScopes = scopes.filter((scope) => HIGH_RISK_SCOPE_SET.has(scope));

      return {
        githubUserId: String(data.id),
        login,
        displayName: nonEmptyStringOrNull(data.name),
        avatarUrl: nonEmptyStringOrNull(data.avatar_url),
        htmlUrl: nonEmptyStringOrNull(data.html_url) ?? `https://github.com/${login}`,
        scopes,
        highRiskScopes,
        rateLimit,
      };
    },

    async getProfileOverview(
      token: string,
      input: GithubProfileOverviewInput,
      ctx?: AdapterContext,
    ): Promise<GithubProfileOverview> {
      const cleanToken = token.trim();
      if (!cleanToken) {
        throw new GithubAuthInvalidError();
      }
      const parsed = GithubProfileOverviewInputSchema.parse(input);
      const tokenHash = createHash("sha256").update(cleanToken).digest("hex");
      const cacheKey = `${tokenHash}:${parsed.year ?? "rolling"}`;
      const nowDate = now();

      if (!parsed.forceRefresh && cacheTtlMs > 0) {
        const cached = profileCache.get(cacheKey);
        if (cached && cached.expiresAt > nowDate.getTime()) {
          trackCacheKey(ctx?.userId, cacheKey);
          return cached.value;
        }
      }

      const { from, to } = resolveContributionWindow(parsed.year, nowDate);
      const { data, rateLimit } = await requestJson<{
        data?: { viewer?: Record<string, unknown> | null };
        errors?: Array<{ message?: string; type?: string }>;
      }>("/graphql", {
        method: "POST",
        token: cleanToken,
        body: {
          query: PROFILE_OVERVIEW_QUERY,
          variables: { from, to },
        },
        ctx,
      });

      const viewer = data?.data?.viewer;
      if (!viewer || typeof viewer !== "object") {
        throw mapGraphqlErrors(data?.errors, rateLimit, cleanToken);
      }

      const login = String(viewer.login ?? "");
      const githubUserId =
        viewer.databaseId !== undefined && viewer.databaseId !== null
          ? String(viewer.databaseId)
          : String(viewer.id ?? login);

      const contrib = (viewer.contributionsCollection ?? {}) as Record<string, unknown>;
      const calendarRaw = (contrib.contributionCalendar ?? {}) as Record<string, unknown>;
      const weeksRaw = Array.isArray(calendarRaw.weeks) ? calendarRaw.weeks : [];
      const weeks: GithubContributionWeek[] = weeksRaw.map((week) => {
        const daysRaw = Array.isArray((week as Record<string, unknown>)?.contributionDays)
          ? ((week as Record<string, unknown>).contributionDays as Array<Record<string, unknown>>)
          : [];
        const contributionDays: GithubContributionDay[] = daysRaw.map((day) => ({
          date: String(day.date ?? "1970-01-01"),
          contributionCount: nonNegativeInt(day.contributionCount),
          contributionLevel: parseContributionLevel(day.contributionLevel),
          weekday: clampInt(day.weekday, 0, 6),
        }));
        return { contributionDays };
      });

      const flatDays = weeks.flatMap((week) => week.contributionDays);
      const todayUtc = formatUtcDate(nowDate);
      const { currentStreakDays, longestStreakDays } = computeContributionStreaks(
        flatDays,
        todayUtc,
      );

      const availableYears = Array.isArray(contrib.contributionYears)
        ? contrib.contributionYears
            .map((year) => Number(year))
            .filter((year) => Number.isInteger(year) && year >= 2008 && year <= 2100)
            .sort((a, b) => b - a)
        : [];

      const pinnedNodes = extractGraphqlNodes(viewer.pinnedItems);
      const recentNodes = extractGraphqlNodes(viewer.recentRepos);

      const overview: GithubProfileOverview = {
        profile: {
          githubUserId,
          login,
          name: nonEmptyStringOrNull(viewer.name),
          avatarUrl: nonEmptyStringOrNull(viewer.avatarUrl),
          bio: nonEmptyStringOrNull(viewer.bio),
          company: nonEmptyStringOrNull(viewer.company),
          location: nonEmptyStringOrNull(viewer.location),
          blogUrl: nonEmptyStringOrNull(viewer.websiteUrl),
          twitterUsername: nonEmptyStringOrNull(viewer.twitterUsername),
          htmlUrl: nonEmptyStringOrNull(viewer.url) ?? `https://github.com/${login}`,
          followers: countField(viewer.followers),
          following: countField(viewer.following),
          publicRepos: countField(viewer.publicRepos),
          totalPrivateRepos:
            viewer.privateRepos && typeof viewer.privateRepos === "object"
              ? countField(viewer.privateRepos)
              : null,
          createdAt: normalizeIsoDate(viewer.createdAt) ?? nowDate.toISOString(),
        },
        calendar: {
          year: parsed.year ?? null,
          from,
          to,
          availableYears,
          totalContributions: nonNegativeInt(calendarRaw.totalContributions),
          totalCommitContributions: nonNegativeInt(contrib.totalCommitContributions),
          totalPullRequestContributions: nonNegativeInt(contrib.totalPullRequestContributions),
          totalIssueContributions: nonNegativeInt(contrib.totalIssueContributions),
          totalPullRequestReviewContributions: nonNegativeInt(
            contrib.totalPullRequestReviewContributions,
          ),
          restrictedContributionsCount: nonNegativeInt(contrib.restrictedContributionsCount),
          currentStreakDays,
          longestStreakDays,
          weeks,
        },
        pinnedRepos: pinnedNodes.map(mapGraphqlRepo),
        recentRepos: recentNodes.map(mapGraphqlRepo),
        rateLimit,
      };

      if (cacheTtlMs > 0) {
        profileCache.set(cacheKey, {
          expiresAt: nowDate.getTime() + cacheTtlMs,
          value: overview,
        });
        trackCacheKey(ctx?.userId, cacheKey);
        trackCacheKey(githubUserId, cacheKey);
        trackCacheKey(login, cacheKey);
      }

      return overview;
    },

    async listMyRepos(
      token: string,
      input: GithubListMyReposInput,
      ctx?: AdapterContext,
    ): Promise<GithubRepoPage> {
      const cleanToken = token.trim();
      if (!cleanToken) {
        throw new GithubAuthInvalidError();
      }
      const parsed = GithubListMyReposInputSchema.parse(input);
      const affiliation =
        parsed.affiliation === "all"
          ? "owner,collaborator,organization_member"
          : parsed.affiliation;

      const needsClientFiltering =
        parsed.sort === "stars" ||
        parsed.visibility === "fork" ||
        parsed.visibility === "archived" ||
        Boolean(parsed.language) ||
        Boolean(parsed.query);

      const apiSort = parsed.sort === "stars" ? "updated" : parsed.sort;
      const direction = parsed.sort === "full_name" ? "asc" : "desc";
      const params = new URLSearchParams({
        affiliation,
        sort: apiSort,
        direction,
        per_page: String(needsClientFiltering ? 100 : parsed.perPage),
        page: String(needsClientFiltering ? 1 : parsed.page),
      });
      if (parsed.visibility === "public" || parsed.visibility === "private") {
        params.set("visibility", parsed.visibility);
      }

      const { data, headers, rateLimit } = await requestJson<unknown[]>(
        `/user/repos?${params.toString()}`,
        {
          token: cleanToken,
          ctx,
        },
      );

      const mapped = (Array.isArray(data) ? data : []).map((item) =>
        mapRestRepo(item as Record<string, unknown>, now()),
      );
      const filtered = filterAndSortRepos(mapped, parsed);

      if (needsClientFiltering) {
        const start = (parsed.page - 1) * parsed.perPage;
        const items = filtered.slice(start, start + parsed.perPage);
        return {
          items,
          page: parsed.page,
          perPage: parsed.perPage,
          hasNextPage: start + parsed.perPage < filtered.length,
          totalCount: filtered.length,
          rateLimit,
        };
      }

      return {
        items: filtered,
        page: parsed.page,
        perPage: parsed.perPage,
        hasNextPage:
          hasNextLink(headers.get("link")) ||
          (Array.isArray(data) && data.length >= parsed.perPage),
        totalCount: null,
        rateLimit,
      };
    },

    async searchRepos(
      token: string | null,
      input: GithubSearchReposInput,
      ctx?: AdapterContext,
    ): Promise<GithubSearchReposOutput> {
      const parsed = GithubSearchReposInputSchema.parse(input);
      const effectiveQuery = buildGithubSearchQuery(parsed, now());
      const params = new URLSearchParams({
        q: effectiveQuery,
        per_page: String(parsed.perPage),
        page: String(parsed.page),
      });
      if (parsed.sort !== "best-match") {
        params.set("sort", parsed.sort);
        params.set("order", "desc");
      }

      const cleanToken = token?.trim() ? token.trim() : null;
      const { data, headers, rateLimit } = await requestJson<{
        total_count?: number;
        incomplete_results?: boolean;
        items?: Array<Record<string, unknown>>;
      }>(`/search/repositories?${params.toString()}`, {
        token: cleanToken,
        ctx,
      });

      const nowDate = now();
      const items = (Array.isArray(data?.items) ? data.items : []).map((item) =>
        mapRestRepo(item, nowDate),
      );
      const totalCount = nonNegativeInt(data?.total_count);
      const cappedTotal = Math.min(totalCount, 1_000);

      return {
        items,
        totalCount,
        incompleteResults: Boolean(data?.incomplete_results),
        authenticated: Boolean(cleanToken),
        effectiveQuery,
        page: parsed.page,
        perPage: parsed.perPage,
        hasNextPage: hasNextLink(headers.get("link")) || parsed.page * parsed.perPage < cappedTotal,
        rateLimit,
      };
    },

    async getRepoDetail(
      token: string | null,
      input: GithubRepoDetailInput & { viewerLogin?: string | null },
      ctx?: AdapterContext,
    ): Promise<GithubRepoDetail> {
      const parsed = GithubRepoDetailInputSchema.parse({
        owner: input.owner,
        repo: input.repo,
        ...(input.forceRefresh !== undefined ? { forceRefresh: input.forceRefresh } : {}),
      });
      const encOwner = encodeURIComponent(parsed.owner);
      const encRepo = encodeURIComponent(parsed.repo);
      const cleanToken = token?.trim() ? token.trim() : null;

      const repoRes = await requestJson<Record<string, unknown>>(`/repos/${encOwner}/${encRepo}`, {
        token: cleanToken,
        ctx,
      });

      const [readme, recentCommits, latestRelease] = await Promise.all([
        fetchReadmeOptional(requestJson, encOwner, encRepo, cleanToken, ctx),
        fetchCommitsOptional(requestJson, encOwner, encRepo, cleanToken, now(), ctx),
        fetchLatestReleaseOptional(requestJson, encOwner, encRepo, cleanToken, ctx),
      ]);

      const repo = mapRestRepo(repoRes.data, now());
      const isViewerOwner = Boolean(
        input.viewerLogin &&
          repo.ownerLogin.toLowerCase() === input.viewerLogin.trim().toLowerCase(),
      );

      return {
        repo,
        readme,
        recentCommits,
        latestRelease,
        isViewerOwner,
        rateLimit: repoRes.rateLimit,
      };
    },

    async readRepoPath(
      token: string | null,
      input: GithubReadRepoFileInput,
      ctx?: AdapterContext,
    ): Promise<GithubRepoPathContent> {
      const parsed = GithubReadRepoFileInputSchema.parse(input);
      const encOwner = encodeURIComponent(parsed.owner);
      const encRepo = encodeURIComponent(parsed.repo);
      const encPath = parsed.path
        ? `/${parsed.path.split("/").map(encodeURIComponent).join("/")}`
        : "";
      const query = parsed.ref ? `?ref=${encodeURIComponent(parsed.ref)}` : "";
      const cleanToken = token?.trim() ? token.trim() : null;

      const { data, rateLimit } = await requestJson<unknown>(
        `/repos/${encOwner}/${encRepo}/contents${encPath}${query}`,
        { token: cleanToken, ctx },
      );

      if (Array.isArray(data)) {
        const mapped: GithubRepoDirectoryEntry[] = data.map((entry) => {
          const item = (entry ?? {}) as Record<string, unknown>;
          return {
            name: String(item.name ?? ""),
            path: String(item.path ?? ""),
            type: normalizeDirectoryEntryType(item.type),
            size: nonNegativeInt(item.size),
          };
        });
        return {
          kind: "directory",
          path: parsed.path ?? "",
          entries: mapped.slice(0, MAX_DIRECTORY_ENTRIES),
          truncated: mapped.length > MAX_DIRECTORY_ENTRIES,
          rateLimit,
        };
      }

      if (!data || typeof data !== "object") {
        throw new GithubUpstreamError("Unexpected GitHub contents payload");
      }

      const fileObj = data as Record<string, unknown>;
      if (fileObj.type && fileObj.type !== "file") {
        throw new GithubUpstreamError(
          `Unsupported GitHub content entry type: ${String(fileObj.type)}`,
        );
      }

      const decoded = decodeRepoFileText(fileObj);
      const truncated = decoded.length > MAX_FILE_TEXT_CHARS;

      return {
        kind: "file",
        path: String(fileObj.path ?? parsed.path ?? ""),
        size: nonNegativeInt(fileObj.size ?? Buffer.byteLength(decoded, "utf8")),
        content: truncated ? decoded.slice(0, MAX_FILE_TEXT_CHARS) : decoded,
        truncated,
        rateLimit,
      };
    },
  };
}

async function fetchReadmeOptional(
  requestJson: <T>(
    path: string,
    init: { token?: string | null; ctx?: AdapterContext },
  ) => Promise<{ data: T }>,
  encOwner: string,
  encRepo: string,
  token: string | null,
  ctx: AdapterContext | undefined,
): Promise<GithubReadmePreview | null> {
  try {
    const { data } = await requestJson<Record<string, unknown>>(
      `/repos/${encOwner}/${encRepo}/readme`,
      { token, ctx },
    );
    const rawContent = typeof data?.content === "string" ? data.content : "";
    const encoding = typeof data?.encoding === "string" ? data.encoding : "base64";
    const text =
      encoding === "base64"
        ? Buffer.from(rawContent.replace(/\s+/g, ""), "base64").toString("utf8")
        : rawContent;
    const truncated = text.length > MAX_MARKDOWN_CHARS;
    return {
      path: typeof data?.path === "string" && data.path ? data.path : "README.md",
      content: truncated ? text.slice(0, MAX_MARKDOWN_CHARS) : text,
      truncated,
    };
  } catch (error) {
    if (error instanceof GithubNotFoundError) return null;
    throw error;
  }
}

async function fetchCommitsOptional(
  requestJson: <T>(
    path: string,
    init: { token?: string | null; ctx?: AdapterContext },
  ) => Promise<{ data: T }>,
  encOwner: string,
  encRepo: string,
  token: string | null,
  fallbackNow: Date,
  ctx: AdapterContext | undefined,
): Promise<GithubCommitSummary[]> {
  try {
    const { data } = await requestJson<Array<Record<string, unknown>>>(
      `/repos/${encOwner}/${encRepo}/commits?per_page=10`,
      { token, ctx },
    );
    if (!Array.isArray(data)) return [];
    return data.slice(0, 10).map((entry) => {
      const sha = String(entry.sha ?? "");
      const commit = (entry.commit ?? {}) as Record<string, unknown>;
      const commitAuthor = (commit.author ?? {}) as Record<string, unknown>;
      const ghAuthor = (entry.author ?? null) as Record<string, unknown> | null;
      const rawMessage = String(commit.message ?? "").trim();
      const firstLine = rawMessage.split(/\r?\n/, 1)[0] ?? "";
      return {
        sha,
        shortSha: sha.slice(0, 7),
        message: firstLine,
        authorName: nonEmptyStringOrNull(commitAuthor.name) ?? "Unknown",
        authorLogin: ghAuthor ? nonEmptyStringOrNull(ghAuthor.login) : null,
        committedAt: normalizeIsoDate(commitAuthor.date),
        htmlUrl:
          nonEmptyStringOrNull(entry.html_url) ??
          `https://github.com/${decodeURIComponent(encOwner)}/${decodeURIComponent(encRepo)}/commit/${sha}`,
      };
    });
  } catch (error) {
    if (error instanceof GithubNotFoundError) return [];
    if (error instanceof GithubUpstreamError && error.status === 409) {
      void fallbackNow;
      return [];
    }
    throw error;
  }
}

async function fetchLatestReleaseOptional(
  requestJson: <T>(
    path: string,
    init: { token?: string | null; ctx?: AdapterContext },
  ) => Promise<{ data: T }>,
  encOwner: string,
  encRepo: string,
  token: string | null,
  ctx: AdapterContext | undefined,
): Promise<GithubReleaseSummary | null> {
  try {
    const { data } = await requestJson<Record<string, unknown>>(
      `/repos/${encOwner}/${encRepo}/releases/latest`,
      { token, ctx },
    );
    const rawBody = typeof data?.body === "string" ? data.body : "";
    const truncated = rawBody.length > MAX_MARKDOWN_CHARS;
    const tagName = String(data?.tag_name ?? "");
    return {
      tagName,
      name: nonEmptyStringOrNull(data?.name),
      publishedAt: normalizeIsoDate(data?.published_at),
      prerelease: Boolean(data?.prerelease),
      body: truncated ? rawBody.slice(0, MAX_MARKDOWN_CHARS) : rawBody,
      truncated,
      htmlUrl:
        nonEmptyStringOrNull(data?.html_url) ??
        `https://github.com/${decodeURIComponent(encOwner)}/${decodeURIComponent(encRepo)}/releases/tag/${encodeURIComponent(tagName)}`,
    };
  } catch (error) {
    if (error instanceof GithubNotFoundError) return null;
    throw error;
  }
}

function decodeRepoFileText(fileObj: Record<string, unknown>): string {
  const encoding = typeof fileObj.encoding === "string" ? fileObj.encoding : "base64";
  const rawContent = fileObj.content;

  if (typeof rawContent !== "string") {
    if (nonNegativeInt(fileObj.size) === 0) return "";
    throw new GithubUpstreamError("Binary files cannot be read as text");
  }

  if (encoding === "base64") {
    const bytes = Buffer.from(rawContent.replace(/\s+/g, ""), "base64");
    if (bytes.includes(0)) {
      throw new GithubUpstreamError("Binary files cannot be read as text");
    }
    return bytes.toString("utf8");
  }

  if (rawContent.includes("\0")) {
    throw new GithubUpstreamError("Binary files cannot be read as text");
  }
  return rawContent;
}

async function readLimitedResponseText(response: Response, token: string | null): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_RESPONSE_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw new GithubUpstreamError("GitHub API response exceeded 1 MiB limit");
    }
  }

  try {
    if (!response.body) {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > MAX_RESPONSE_BYTES) {
        throw new GithubUpstreamError("GitHub API response exceeded 1 MiB limit");
      }
      return buffer.toString("utf8");
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new GithubUpstreamError("GitHub API response exceeded 1 MiB limit");
        }
        chunks.push(Buffer.from(value));
      }
    }

    return Buffer.concat(chunks, totalBytes).toString("utf8");
  } catch (error) {
    if (error instanceof GithubUpstreamError) throw error;
    const rawMsg = error instanceof Error ? error.message : String(error);
    throw new GithubUpstreamError(
      redactGithubSecrets(`Failed to read GitHub API response: ${rawMsg}`, token),
    );
  }
}

function parseRateLimit(headers: Headers): GithubRateLimit | null {
  const rawLimit = headers.get("x-ratelimit-limit");
  const rawRemaining = headers.get("x-ratelimit-remaining");
  if (rawLimit === null || rawRemaining === null) return null;

  const limit = Number(rawLimit);
  const remaining = Number(rawRemaining);
  if (!Number.isInteger(limit) || limit < 0 || !Number.isInteger(remaining) || remaining < 0) {
    return null;
  }

  const rawReset = headers.get("x-ratelimit-reset");
  let resetAt: string | null = null;
  if (rawReset !== null) {
    const resetSeconds = Number(rawReset);
    if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
      resetAt = new Date(Math.trunc(resetSeconds) * 1_000).toISOString();
    }
  }

  return { limit, remaining, resetAt };
}

function mapHttpError(
  status: number,
  headers: Headers,
  rateLimit: GithubRateLimit | null,
  parsedBody: unknown,
  rawText: string,
  token: string | null,
  now: () => Date,
): Error {
  const bodyMessage =
    parsedBody &&
    typeof parsedBody === "object" &&
    typeof (parsedBody as Record<string, unknown>).message === "string"
      ? ((parsedBody as Record<string, unknown>).message as string)
      : rawText.slice(0, 240);
  const safeMessage = redactGithubSecrets(bodyMessage.trim(), token).slice(0, 240);

  if (status === 401) {
    return new GithubAuthInvalidError(
      safeMessage || "GitHub Personal Access Token is invalid or expired",
    );
  }

  const retryAfter = headers.get("retry-after");
  const isRateLimited =
    status === 429 ||
    (status === 403 &&
      (rateLimit?.remaining === 0 ||
        retryAfter !== null ||
        /rate limit|secondary rate|abuse detection/i.test(bodyMessage)));

  if (isRateLimited) {
    let resetAt = rateLimit?.resetAt ?? null;
    if (!resetAt && retryAfter !== null) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) {
        resetAt = new Date(now().getTime() + Math.trunc(seconds) * 1_000).toISOString();
      }
    }
    return new GithubRateLimitedError(safeMessage || "GitHub API rate limit exceeded", resetAt);
  }

  if (status === 403) {
    return new GithubScopeInsufficientError(
      safeMessage || "GitHub token does not have permission for this resource",
    );
  }

  if (status === 404) {
    return new GithubNotFoundError(safeMessage || "GitHub resource not found");
  }

  return new GithubUpstreamError(safeMessage || `GitHub API request failed (${status})`, status);
}

function mapGraphqlErrors(
  errors: Array<{ message?: string; type?: string }> | undefined,
  rateLimit: GithubRateLimit | null,
  token: string,
): Error {
  const first = errors?.[0];
  const rawMessage = first?.message ?? "GitHub GraphQL query failed";
  const safeMessage = redactGithubSecrets(rawMessage, token).slice(0, 240);
  const errorType = (first?.type ?? "").toUpperCase();

  if (errorType === "RATE_LIMITED" || /rate limit/i.test(rawMessage)) {
    return new GithubRateLimitedError(safeMessage, rateLimit?.resetAt ?? null);
  }
  if (errorType === "FORBIDDEN" || errorType === "INSUFFICIENT_SCOPES") {
    return new GithubScopeInsufficientError(safeMessage);
  }
  if (errorType === "NOT_FOUND") {
    return new GithubNotFoundError(safeMessage);
  }
  return new GithubUpstreamError(safeMessage);
}

function resolveContributionWindow(
  year: number | undefined,
  nowDate: Date,
): { from: string; to: string } {
  if (year !== undefined) {
    return {
      from: `${year}-01-01T00:00:00.000Z`,
      to: `${year}-12-31T23:59:59.999Z`,
    };
  }
  const endUtc = new Date(
    Date.UTC(
      nowDate.getUTCFullYear(),
      nowDate.getUTCMonth(),
      nowDate.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
  const startUtc = new Date(
    Date.UTC(
      nowDate.getUTCFullYear(),
      nowDate.getUTCMonth(),
      nowDate.getUTCDate() - 364,
      0,
      0,
      0,
      0,
    ),
  );
  return {
    from: startUtc.toISOString(),
    to: endUtc.toISOString(),
  };
}

function mapGraphqlRepo(node: Record<string, unknown>): GithubRepoSummary {
  const owner = (node.owner ?? {}) as Record<string, unknown>;
  const ownerLogin = String(owner.login ?? "");
  const name = String(node.name ?? "");
  const fullName = nonEmptyStringOrNull(node.nameWithOwner) ?? `${ownerLogin}/${name}`;
  const htmlUrl = nonEmptyStringOrNull(node.url) ?? `https://github.com/${fullName}`;
  const defaultBranchRef = (node.defaultBranchRef ?? null) as Record<string, unknown> | null;
  const primaryLangRaw = (node.primaryLanguage ?? null) as Record<string, unknown> | null;
  const licenseRaw = (node.licenseInfo ?? null) as Record<string, unknown> | null;
  const topicNodes = extractGraphqlNodes(node.repositoryTopics);
  const topics = topicNodes
    .map((entry) => {
      const topic = (entry.topic ?? null) as Record<string, unknown> | null;
      return topic && typeof topic.name === "string" ? topic.name.trim() : "";
    })
    .filter((topic) => topic.length > 0);
  const licenseSpdx = licenseRaw ? nonEmptyStringOrNull(licenseRaw.spdxId) : null;

  return {
    id: String(node.id ?? fullName),
    name,
    ownerLogin,
    ownerAvatarUrl: nonEmptyStringOrNull(owner.avatarUrl),
    fullName,
    description: nonEmptyStringOrNull(node.description),
    htmlUrl,
    homepageUrl: nonEmptyStringOrNull(node.homepageUrl),
    cloneUrl: `${htmlUrl}.git`,
    sshUrl: nonEmptyStringOrNull(node.sshUrl) ?? `git@github.com:${fullName}.git`,
    isPrivate: Boolean(node.isPrivate),
    isFork: Boolean(node.isFork),
    isArchived: Boolean(node.isArchived),
    defaultBranch:
      (defaultBranchRef ? nonEmptyStringOrNull(defaultBranchRef.name) : null) ?? "main",
    primaryLanguage:
      primaryLangRaw && typeof primaryLangRaw.name === "string" && primaryLangRaw.name.trim()
        ? {
            name: primaryLangRaw.name.trim(),
            color: nonEmptyStringOrNull(primaryLangRaw.color),
          }
        : null,
    stargazerCount: nonNegativeInt(node.stargazerCount),
    forkCount: nonNegativeInt(node.forkCount),
    openIssuesCount: countField(node.issues),
    topics,
    licenseSpdxId: licenseSpdx && licenseSpdx !== "NOASSERTION" ? licenseSpdx : null,
    pushedAt: normalizeIsoDate(node.pushedAt),
    updatedAt: normalizeIsoDate(node.updatedAt) ?? new Date(0).toISOString(),
  };
}

function mapRestRepo(raw: Record<string, unknown>, fallbackNow: Date): GithubRepoSummary {
  const owner = (raw.owner ?? {}) as Record<string, unknown>;
  const ownerLogin = String(owner.login ?? "");
  const name = String(raw.name ?? "");
  const fullName = nonEmptyStringOrNull(raw.full_name) ?? `${ownerLogin}/${name}`;
  const htmlUrl = nonEmptyStringOrNull(raw.html_url) ?? `https://github.com/${fullName}`;
  const languageName = nonEmptyStringOrNull(raw.language);
  const license = (raw.license ?? null) as Record<string, unknown> | null;
  const spdxId = license ? nonEmptyStringOrNull(license.spdx_id) : null;
  const topics = Array.isArray(raw.topics)
    ? raw.topics
        .filter((topic): topic is string => typeof topic === "string" && topic.trim().length > 0)
        .map((topic) => topic.trim())
    : [];

  return {
    id: String(raw.node_id ?? raw.id ?? fullName),
    name,
    ownerLogin,
    ownerAvatarUrl: nonEmptyStringOrNull(owner.avatar_url),
    fullName,
    description: nonEmptyStringOrNull(raw.description),
    htmlUrl,
    homepageUrl: nonEmptyStringOrNull(raw.homepage),
    cloneUrl: nonEmptyStringOrNull(raw.clone_url) ?? `${htmlUrl}.git`,
    sshUrl: nonEmptyStringOrNull(raw.ssh_url) ?? `git@github.com:${fullName}.git`,
    isPrivate: Boolean(raw.private),
    isFork: Boolean(raw.fork),
    isArchived: Boolean(raw.archived),
    defaultBranch: nonEmptyStringOrNull(raw.default_branch) ?? "main",
    primaryLanguage: languageName ? { name: languageName, color: null } : null,
    stargazerCount: nonNegativeInt(raw.stargazers_count),
    forkCount: nonNegativeInt(raw.forks_count),
    openIssuesCount: nonNegativeInt(raw.open_issues_count),
    topics,
    licenseSpdxId: spdxId && spdxId !== "NOASSERTION" ? spdxId : null,
    pushedAt: normalizeIsoDate(raw.pushed_at),
    updatedAt: normalizeIsoDate(raw.updated_at) ?? fallbackNow.toISOString(),
  };
}

function filterAndSortRepos(
  repos: readonly GithubRepoSummary[],
  input: GithubListMyReposInput,
): GithubRepoSummary[] {
  const languageLower = input.language?.trim().toLowerCase();
  const queryLower = input.query?.trim().toLowerCase();

  const filtered = repos.filter((repo) => {
    if (input.visibility === "public" && repo.isPrivate) return false;
    if (input.visibility === "private" && !repo.isPrivate) return false;
    if (input.visibility === "fork" && !repo.isFork) return false;
    if (input.visibility === "archived" && !repo.isArchived) return false;

    if (languageLower) {
      const repoLang = repo.primaryLanguage?.name.toLowerCase() ?? "";
      if (repoLang !== languageLower) return false;
    }

    if (queryLower) {
      const matchesName = repo.fullName.toLowerCase().includes(queryLower);
      const matchesDesc = (repo.description ?? "").toLowerCase().includes(queryLower);
      const matchesTopic = repo.topics.some((topic) => topic.toLowerCase().includes(queryLower));
      if (!matchesName && !matchesDesc && !matchesTopic) return false;
    }

    return true;
  });

  if (input.sort === "stars") {
    return [...filtered].sort(
      (a, b) => b.stargazerCount - a.stargazerCount || a.fullName.localeCompare(b.fullName),
    );
  }
  return filtered;
}

function sanitizeSearchTerm(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if ((code >= 0 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f) || ch === '"') {
      out += " ";
    } else {
      out += ch;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

function extractGraphqlNodes(container: unknown): Array<Record<string, unknown>> {
  if (!container || typeof container !== "object") return [];
  const nodes = (container as Record<string, unknown>).nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.filter((node): node is Record<string, unknown> =>
    Boolean(node && typeof node === "object"),
  );
}

function countField(container: unknown): number {
  if (!container || typeof container !== "object") return 0;
  return nonNegativeInt((container as Record<string, unknown>).totalCount);
}

function nonNegativeInt(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.trunc(num);
}

function clampInt(value: unknown, min: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, Math.trunc(num)));
}

function parseContributionLevel(value: unknown): GithubContributionLevel {
  const parsed = GithubContributionLevelSchema.safeParse(value);
  return parsed.success ? parsed.data : "NONE";
}

function normalizeDirectoryEntryType(value: unknown): "file" | "dir" | "symlink" | "submodule" {
  if (value === "dir" || value === "symlink" || value === "submodule") return value;
  return "file";
}

function nonEmptyStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseUtcDayEpoch(yyyyMmDd: string): number {
  const [year, month, day] = yyyyMmDd.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

function hasNextLink(linkHeader: string | null): boolean {
  if (!linkHeader) return false;
  return /<[^>]+>;\s*rel="next"/i.test(linkHeader);
}
