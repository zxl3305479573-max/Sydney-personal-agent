import { RPCHandler } from "@orpc/server/fetch";
import type { GithubAccountService } from "@rakazo/adapter-kit";
import {
  GithubAuthInvalidError,
  GithubNotFoundError,
  GithubRateLimitedError,
  GithubScopeInsufficientError,
  GithubUpstreamError,
} from "@rakazo/adapter-kit";
import type {
  Actor,
  GithubConnectionStatus,
  GithubProfileOverview,
  GithubRateLimit,
  GithubRepoDetail,
  GithubRepoPage,
  GithubRepoSummary,
  GithubSearchReposOutput,
} from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RouterDeps } from "./router.js";
import { createRouter } from "./router.js";

const auditEvents = vi.hoisted(() => ({ record: vi.fn(async () => undefined) }));
vi.mock("@rakazo/db", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  recordSecurityEvent: auditEvents.record,
}));

const actor = {
  spaceId: "space-1",
  userId: "user-1",
  email: "user@rakazo.test",
  isDeploymentOwner: false,
} satisfies Actor;

const sampleRateLimit: GithubRateLimit = {
  limit: 5000,
  remaining: 4992,
  resetAt: "2026-11-18T09:00:00.000Z",
};

const sampleConnectedStatus: GithubConnectionStatus = {
  status: "connected",
  authKind: "pat",
  githubUserId: "12345",
  login: "octocat",
  displayName: "Monalisa Octocat",
  avatarUrl: "https://avatars.githubusercontent.com/u/12345",
  htmlUrl: "https://github.com/octocat",
  scopes: ["read:user", "repo"],
  highRiskScopes: [],
  connectedAt: "2026-11-18T08:00:00.000Z",
  lastVerifiedAt: "2026-11-18T08:00:00.000Z",
  rateLimit: sampleRateLimit,
};

const sampleRepo: GithubRepoSummary = {
  id: "R_kgDO1",
  name: "hello-world",
  ownerLogin: "octocat",
  ownerAvatarUrl: "https://avatars.githubusercontent.com/u/12345",
  fullName: "octocat/hello-world",
  description: "Sample repository",
  htmlUrl: "https://github.com/octocat/hello-world",
  homepageUrl: null,
  cloneUrl: "https://github.com/octocat/hello-world.git",
  sshUrl: "git@github.com:octocat/hello-world.git",
  isPrivate: false,
  isFork: false,
  isArchived: false,
  defaultBranch: "main",
  primaryLanguage: { name: "TypeScript", color: "#3178c6" },
  stargazerCount: 42,
  forkCount: 7,
  openIssuesCount: 2,
  topics: ["sydney", "typescript"],
  licenseSpdxId: "MIT",
  pushedAt: "2026-11-18T07:30:00.000Z",
  updatedAt: "2026-11-18T07:30:00.000Z",
};

const sampleOverview: GithubProfileOverview = {
  profile: {
    githubUserId: "12345",
    login: "octocat",
    name: "Monalisa Octocat",
    avatarUrl: "https://avatars.githubusercontent.com/u/12345",
    bio: "Building tools",
    company: "@github",
    location: "San Francisco",
    blogUrl: "https://github.blog",
    twitterUsername: null,
    htmlUrl: "https://github.com/octocat",
    followers: 100,
    following: 12,
    publicRepos: 15,
    totalPrivateRepos: 3,
    createdAt: "2020-01-01T00:00:00.000Z",
  },
  calendar: {
    year: null,
    from: "2025-11-18T00:00:00.000Z",
    to: "2026-11-18T00:00:00.000Z",
    availableYears: [2026, 2025],
    totalContributions: 256,
    totalCommitContributions: 210,
    totalPullRequestContributions: 26,
    totalIssueContributions: 10,
    totalPullRequestReviewContributions: 10,
    restrictedContributionsCount: 0,
    currentStreakDays: 5,
    longestStreakDays: 21,
    weeks: [
      {
        contributionDays: [
          {
            date: "2026-11-18",
            contributionCount: 4,
            contributionLevel: "SECOND_QUARTILE",
            weekday: 3,
          },
        ],
      },
    ],
  },
  pinnedRepos: [sampleRepo],
  recentRepos: [sampleRepo],
  rateLimit: sampleRateLimit,
};

const sampleRepoPage: GithubRepoPage = {
  items: [sampleRepo],
  page: 1,
  perPage: 24,
  hasNextPage: false,
  totalCount: 1,
  rateLimit: sampleRateLimit,
};

const sampleSearchOutput: GithubSearchReposOutput = {
  items: [sampleRepo],
  totalCount: 1,
  incompleteResults: false,
  authenticated: true,
  effectiveQuery: "sydney language:TypeScript",
  page: 1,
  perPage: 20,
  hasNextPage: false,
  rateLimit: sampleRateLimit,
};

const sampleRepoDetail: GithubRepoDetail = {
  repo: sampleRepo,
  readme: {
    path: "README.md",
    content: "# Hello World\nWelcome to the repo.",
    truncated: false,
  },
  recentCommits: [
    {
      sha: "abcdef1234567890abcdef1234567890abcdef12",
      shortSha: "abcdef1",
      message: "Initial commit",
      authorName: "Monalisa Octocat",
      authorLogin: "octocat",
      committedAt: "2026-11-18T07:00:00.000Z",
      htmlUrl: "https://github.com/octocat/hello-world/commit/abcdef1234567890",
    },
  ],
  latestRelease: null,
  isViewerOwner: true,
  rateLimit: sampleRateLimit,
};

function createFakeGithubService() {
  return {
    getStatus: vi.fn<GithubAccountService["getStatus"]>(async () => sampleConnectedStatus),
    connect: vi.fn<GithubAccountService["connect"]>(async () => sampleConnectedStatus),
    disconnect: vi.fn<GithubAccountService["disconnect"]>(async () => ({
      status: "disconnected",
    })),
    getProfileOverview: vi.fn<GithubAccountService["getProfileOverview"]>(
      async () => sampleOverview,
    ),
    listMyRepos: vi.fn<GithubAccountService["listMyRepos"]>(async () => sampleRepoPage),
    searchRepos: vi.fn<GithubAccountService["searchRepos"]>(async () => sampleSearchOutput),
    getRepoDetail: vi.fn<GithubAccountService["getRepoDetail"]>(async () => sampleRepoDetail),
  };
}

type GithubPath =
  | "status"
  | "connect"
  | "disconnect"
  | "profileOverview"
  | "listMyRepos"
  | "searchRepos"
  | "repoDetail";

function githubRouterHarness(github: GithubAccountService | null) {
  const prisma = {
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  };
  const deps = {
    prisma: prisma as unknown as PrismaClient,
    secrets: {
      put: vi.fn(),
      load: vi.fn(),
      delete: vi.fn(),
    },
    github,
    env: {
      defaultProvider: "fake",
      defaultModel: "fake-model",
      webOrigin: "http://127.0.0.1:5173",
      screenProxySecret: "fake-test-secret",
      sandboxProvider: "fake",
    },
    dataDir: "/tmp/rakazo-github-router-test",
  } as unknown as RouterDeps;

  const handler = new RPCHandler(createRouter(deps));

  async function call(
    path: GithubPath,
    input?: unknown,
    requestActor: Actor | null = actor,
  ): Promise<{ status: number; text: string; body: { json?: unknown; message?: string } }> {
    const { response } = await handler.handle(
      new Request(`http://127.0.0.1/rpc/github/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input === undefined ? {} : { json: input }),
      }),
      { prefix: "/rpc", context: { actor: requestActor } },
    );
    if (!response) throw new Error(`Procedure /rpc/github/${path} did not match`);
    const text = await response.text();
    return {
      status: response.status,
      text,
      body: JSON.parse(text) as { json?: unknown; message?: string },
    };
  }

  return { call };
}

beforeEach(() => {
  auditEvents.record.mockClear();
});

describe("github routes", () => {
  it("returns 401 for unauthenticated requests on every github procedure", async () => {
    const service = createFakeGithubService();
    const { call } = githubRouterHarness(service);

    expect((await call("status", undefined, null)).status).toBe(401);
    expect((await call("connect", { token: "ghp_1234567890abcdef" }, null)).status).toBe(401);
    expect((await call("disconnect", undefined, null)).status).toBe(401);
    expect((await call("profileOverview", {}, null)).status).toBe(401);
    expect((await call("listMyRepos", {}, null)).status).toBe(401);
    expect((await call("searchRepos", { query: "sydney" }, null)).status).toBe(401);
    expect((await call("repoDetail", { owner: "octocat", repo: "hello-world" }, null)).status).toBe(
      401,
    );

    expect(service.getStatus).not.toHaveBeenCalled();
    expect(service.connect).not.toHaveBeenCalled();
    expect(service.disconnect).not.toHaveBeenCalled();
    expect(service.getProfileOverview).not.toHaveBeenCalled();
    expect(service.listMyRepos).not.toHaveBeenCalled();
    expect(service.searchRepos).not.toHaveBeenCalled();
    expect(service.getRepoDetail).not.toHaveBeenCalled();
  });

  it("handles disabled github integration (deps.github = null) cleanly", async () => {
    const { call } = githubRouterHarness(null);

    const statusRes = await call("status");
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.json).toEqual({ status: "disconnected" });

    const disconnectRes = await call("disconnect");
    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.body.json).toEqual({ status: "disconnected" });

    expect((await call("connect", { token: "ghp_1234567890abcdef" })).status).toBe(404);
    expect((await call("profileOverview", {})).status).toBe(404);
    expect((await call("listMyRepos", {})).status).toBe(404);
    expect((await call("searchRepos", { query: "sydney" })).status).toBe(404);
    expect((await call("repoDetail", { owner: "octocat", repo: "hello-world" })).status).toBe(404);
  });

  it("passes the authenticated actor to all procedures and never trusts client-supplied actor fields", async () => {
    const service = createFakeGithubService();
    const { call } = githubRouterHarness(service);
    const pat = "ghp_secretTokenValue1234567890";

    // status strips unknown fields and still uses context.actor
    const statusRes = await call("status", {
      verifyRemote: true,
      userId: "attacker-user",
      spaceId: "attacker-space",
    });
    expect(statusRes.status).toBe(200);
    expect(service.getStatus).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", spaceId: "space-1" }),
      { verifyRemote: true },
    );
    expect(service.getStatus.mock.calls[0]?.[0]).not.toMatchObject({ userId: "attacker-user" });

    // strict input schemas reject client-supplied actor fields outright
    const spoofedConnect = await call("connect", {
      token: pat,
      userId: "attacker-user",
      spaceId: "attacker-space",
    });
    expect(spoofedConnect.status).toBe(400);
    expect(service.connect).not.toHaveBeenCalled();

    const connectRes = await call("connect", { token: pat });
    expect(connectRes.status).toBe(200);
    expect(connectRes.body.json).toEqual(sampleConnectedStatus);
    expect(connectRes.text).not.toContain(pat);
    expect(service.connect).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", spaceId: "space-1" }),
      pat,
    );
    expect(auditEvents.record).toHaveBeenCalledWith({
      type: "credential.changed",
      userId: "user-1",
      spaceId: "space-1",
      metadata: { procedure: "github.connect", kind: "github" },
    });
    expect(JSON.stringify(auditEvents.record.mock.calls)).not.toContain(pat);

    const overviewRes = await call("profileOverview", { year: 2026, forceRefresh: true });
    expect(overviewRes.status).toBe(200);
    expect(service.getProfileOverview).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", spaceId: "space-1" }),
      { year: 2026, forceRefresh: true },
    );

    const reposRes = await call("listMyRepos");
    expect(reposRes.status).toBe(200);
    expect(service.listMyRepos).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", spaceId: "space-1" }),
      {
        affiliation: "all",
        visibility: "all",
        sort: "pushed",
        page: 1,
        perPage: 24,
      },
    );

    const searchRes = await call("searchRepos", { query: "sydney", language: "TypeScript" });
    expect(searchRes.status).toBe(200);
    expect(service.searchRepos).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", spaceId: "space-1" }),
      {
        query: "sydney",
        language: "TypeScript",
        sort: "best-match",
        page: 1,
        perPage: 20,
      },
    );

    const detailRes = await call("repoDetail", { owner: "octocat", repo: "hello-world" });
    expect(detailRes.status).toBe(200);
    expect(service.getRepoDetail).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", spaceId: "space-1" }),
      { owner: "octocat", repo: "hello-world" },
    );

    const disconnectRes = await call("disconnect");
    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.body.json).toEqual({ status: "disconnected" });
    expect(service.disconnect).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", spaceId: "space-1" }),
    );
    expect(auditEvents.record).toHaveBeenCalledWith({
      type: "credential.deleted",
      userId: "user-1",
      spaceId: "space-1",
      metadata: { procedure: "github.disconnect", kind: "github" },
    });
  });

  it("maps Github errors to safe non-401 HTTP statuses and scrubs leaked token substrings", async () => {
    const service = createFakeGithubService();
    const { call } = githubRouterHarness(service);

    const leakedClassic = "ghp_LeakedClassicToken123456789";
    const leakedFineGrained = "github_pat_11ABCDEF_LeakedFineGrained987654";
    const leakedOAuth = "gho_LeakedOAuthToken5555555555";
    const leakedBearer = "superSecretBearerTokenValue999";

    service.connect.mockRejectedValueOnce(
      new GithubAuthInvalidError(
        `Rejected PAT ${leakedClassic} and ${leakedFineGrained} via Bearer ${leakedBearer}`,
      ),
    );
    const invalidAuth = await call("connect", { token: leakedClassic });
    expect(invalidAuth.status).toBe(400);
    expect(invalidAuth.status).not.toBe(401);
    expect(invalidAuth.text).not.toContain(leakedClassic);
    expect(invalidAuth.text).not.toContain(leakedFineGrained);
    expect(invalidAuth.text).not.toContain(leakedBearer);
    expect(invalidAuth.text).toContain("[REDACTED]");

    service.getProfileOverview.mockRejectedValueOnce(
      new GithubRateLimitedError(
        `Rate limit exceeded for token ${leakedOAuth}`,
        "2026-11-18T09:00:00.000Z",
      ),
    );
    const rateLimited = await call("profileOverview", {});
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.text).not.toContain(leakedOAuth);
    expect(rateLimited.text).toContain("[REDACTED]");

    service.listMyRepos.mockRejectedValueOnce(
      new GithubScopeInsufficientError(`Insufficient scope for ${leakedClassic}`),
    );
    const forbidden = await call("listMyRepos", {});
    expect(forbidden.status).toBe(403);
    expect(forbidden.text).not.toContain(leakedClassic);

    service.getRepoDetail.mockRejectedValueOnce(
      new GithubNotFoundError(`Repository not found with Authorization: Bearer ${leakedBearer}`),
    );
    const notFound = await call("repoDetail", { owner: "octocat", repo: "missing-repo" });
    expect(notFound.status).toBe(404);
    expect(notFound.text).not.toContain(leakedBearer);

    service.searchRepos.mockRejectedValueOnce(
      new GithubUpstreamError(`Upstream failure for ${leakedFineGrained}`, 503),
    );
    const upstream = await call("searchRepos", { query: "sydney" });
    expect(upstream.status).toBe(502);
    expect(upstream.text).not.toContain(leakedFineGrained);
  });

  it("rejects traversal or malformed owner/repo inputs before calling the service", async () => {
    const service = createFakeGithubService();
    const { call } = githubRouterHarness(service);

    for (const badInput of [
      { owner: "octocat", repo: ".." },
      { owner: "octocat", repo: "." },
      { owner: "../octocat", repo: "hello-world" },
      { owner: "octocat", repo: "nested/repo" },
      { owner: "-leading-hyphen", repo: "hello-world" },
    ]) {
      const res = await call("repoDetail", badInput);
      expect(res.status).toBe(400);
    }

    expect(service.getRepoDetail).not.toHaveBeenCalled();
  });
});
