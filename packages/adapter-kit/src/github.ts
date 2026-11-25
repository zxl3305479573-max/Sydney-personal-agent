import type {
  GithubConnectionStatus,
  GithubListMyReposInput,
  GithubProfileOverview,
  GithubProfileOverviewInput,
  GithubRateLimit,
  GithubReadRepoFileInput,
  GithubRepoDetail,
  GithubRepoDetailInput,
  GithubRepoPage,
  GithubRepoPathContent,
  GithubSearchReposInput,
  GithubSearchReposOutput,
} from "@rakazo/contracts";
import type { AdapterContext } from "./types.js";

export class GithubAuthInvalidError extends Error {
  constructor(message = "GitHub Personal Access Token is invalid or expired") {
    super(message);
    this.name = "GithubAuthInvalidError";
  }
}

export class GithubScopeInsufficientError extends Error {
  constructor(message = "GitHub token does not have permission for this resource") {
    super(message);
    this.name = "GithubScopeInsufficientError";
  }
}

export class GithubRateLimitedError extends Error {
  readonly resetAt: string | null;

  constructor(message = "GitHub API rate limit exceeded", resetAt: string | null = null) {
    super(message);
    this.name = "GithubRateLimitedError";
    this.resetAt = resetAt;
  }
}

export class GithubNotFoundError extends Error {
  constructor(message = "GitHub resource not found") {
    super(message);
    this.name = "GithubNotFoundError";
  }
}

export class GithubUpstreamError extends Error {
  readonly status?: number;

  constructor(message = "GitHub API request failed", status?: number) {
    super(message);
    this.name = "GithubUpstreamError";
    this.status = status;
  }
}

export interface GithubVerifiedIdentity {
  githubUserId: string;
  login: string;
  displayName: string | null;
  avatarUrl: string | null;
  htmlUrl: string;
  scopes: string[];
  highRiskScopes: string[];
  rateLimit: GithubRateLimit | null;
}

export interface GithubProvider {
  describe(): { id: string; displayName: string };

  verifyToken(token: string, ctx?: AdapterContext): Promise<GithubVerifiedIdentity>;

  getProfileOverview(
    token: string,
    input: GithubProfileOverviewInput,
    ctx?: AdapterContext,
  ): Promise<GithubProfileOverview>;

  listMyRepos(
    token: string,
    input: GithubListMyReposInput,
    ctx?: AdapterContext,
  ): Promise<GithubRepoPage>;

  searchRepos(
    token: string | null,
    input: GithubSearchReposInput,
    ctx?: AdapterContext,
  ): Promise<GithubSearchReposOutput>;

  getRepoDetail(
    token: string | null,
    input: GithubRepoDetailInput & { viewerLogin?: string | null },
    ctx?: AdapterContext,
  ): Promise<GithubRepoDetail>;

  readRepoPath(
    token: string | null,
    input: GithubReadRepoFileInput,
    ctx?: AdapterContext,
  ): Promise<GithubRepoPathContent>;

  evictUserCache?(userId: string): void;
}

export interface GithubAccountActor {
  userId: string;
  spaceId: string;
}

/**
 * High-level service combining encrypted credential persistence (`github_connections` + `SecretStore`)
 * with `GithubProvider` calls, consumed by `apps/api` routes without coupling API routes to Prisma/HTTP internals.
 */
export interface GithubAccountService {
  getStatus(
    actor: GithubAccountActor,
    options?: { verifyRemote?: boolean },
  ): Promise<GithubConnectionStatus>;

  connect(actor: GithubAccountActor, token: string): Promise<GithubConnectionStatus>;

  disconnect(actor: GithubAccountActor): Promise<GithubConnectionStatus>;

  getProfileOverview(
    actor: GithubAccountActor,
    input: GithubProfileOverviewInput,
  ): Promise<GithubProfileOverview>;

  listMyRepos(
    actor: GithubAccountActor,
    input: GithubListMyReposInput,
  ): Promise<GithubRepoPage>;

  searchRepos(
    actor: GithubAccountActor,
    input: GithubSearchReposInput,
  ): Promise<GithubSearchReposOutput>;

  getRepoDetail(
    actor: GithubAccountActor,
    input: GithubRepoDetailInput,
  ): Promise<GithubRepoDetail>;
}
