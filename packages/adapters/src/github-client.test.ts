import {
  GithubAuthInvalidError,
  GithubNotFoundError,
  GithubRateLimitedError,
  GithubScopeInsufficientError,
  GithubUpstreamError,
} from "@rakazo/adapter-kit";
import {
  GithubProfileOverviewSchema,
  GithubRepoDetailSchema,
  GithubRepoPageSchema,
  GithubRepoPathContentSchema,
  GithubSearchReposOutputSchema,
} from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  buildGithubSearchQuery,
  computeContributionStreaks,
  createHttpGithubProvider,
  redactGithubSecrets,
} from "./github-client.js";
import { createGithubEmulator } from "./github-emulator.js";

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      "x-ratelimit-limit": "5000",
      "x-ratelimit-remaining": "4990",
      "x-ratelimit-reset": "1795000000",
      ...init.headers,
    },
  });
}

describe("redactGithubSecrets", () => {
  it("redacts classic PATs, fine-grained PATs, OAuth tokens, Bearer headers, and custom tokens", () => {
    const customToken = "custom_secret_token_998877";
    const text = [
      "Header Authorization: Bearer super_secret_bearer_value",
      "Classic ghp_1234567890abcdefghijklmnopqrstuv",
      "Fine-grained github_pat_11ABCDEF0123456789_abcdefghijklmnopqrstuv",
      "OAuth gho_abcdef1234567890 ghu_abcdef1234567890 ghs_abcdef1234567890",
      `Echoed ${customToken} and ${encodeURIComponent("tok+en/12345")}`,
    ].join(" | ");

    const redacted = redactGithubSecrets(text, customToken);
    expect(redacted).not.toContain("super_secret_bearer_value");
    expect(redacted).not.toContain("ghp_1234567890");
    expect(redacted).not.toContain("github_pat_11ABCDEF");
    expect(redacted).not.toContain("gho_abcdef1234567890");
    expect(redacted).not.toContain("ghu_abcdef1234567890");
    expect(redacted).not.toContain("ghs_abcdef1234567890");
    expect(redacted).not.toContain(customToken);
    expect(redactGithubSecrets("url?t=tok%2Ben%2F12345", "tok+en/12345")).not.toContain(
      "tok%2Ben%2F12345",
    );
  });
});

describe("buildGithubSearchQuery", () => {
  it("defaults to stars:>=100 when all inputs are blank", () => {
    expect(
      buildGithubSearchQuery({
        query: "   ",
        sort: "best-match",
        page: 1,
        perPage: 20,
      }),
    ).toBe("stars:>=100");
  });

  it("strips control chars, sanitizes quotes, and appends structured qualifiers", () => {
    const now = new Date("2026-11-18T12:00:00.000Z");
    const effective = buildGithubSearchQuery(
      {
        query: 'mcp\u0000 "agent"\nserver',
        language: "TypeScript",
        minStars: 250,
        pushedWithinDays: 10,
        topic: "AI-Agent",
        sort: "stars",
        page: 1,
        perPage: 20,
      },
      now,
    );
    expect(effective).toBe(
      'mcp agent server language:"TypeScript" stars:>=250 pushed:>=2026-11-08 topic:ai-agent',
    );
  });
});

describe("computeContributionStreaks", () => {
  it("computes longest and current streaks while ignoring future padded days", () => {
    const days = [
      { date: "2026-11-10", contributionCount: 2 },
      { date: "2026-11-11", contributionCount: 4 },
      { date: "2026-11-12", contributionCount: 1 },
      { date: "2026-11-13", contributionCount: 0 },
      { date: "2026-11-16", contributionCount: 3 },
      { date: "2026-11-17", contributionCount: 5 },
      { date: "2026-11-18", contributionCount: 0 }, // today not committed yet; yesterday active
      { date: "2026-11-19", contributionCount: 0 }, // future padded day
    ];
    expect(computeContributionStreaks(days, "2026-11-18")).toEqual({
      currentStreakDays: 2,
      longestStreakDays: 3,
    });
  });

  it("returns zero current streak when both today and yesterday have zero contributions", () => {
    const days = [
      { date: "2026-11-14", contributionCount: 5 },
      { date: "2026-11-15", contributionCount: 2 },
      { date: "2026-11-17", contributionCount: 0 },
      { date: "2026-11-18", contributionCount: 0 },
    ];
    expect(computeContributionStreaks(days, "2026-11-18")).toEqual({
      currentStreakDays: 0,
      longestStreakDays: 2,
    });
  });
});

describe("createHttpGithubProvider", () => {
  it("verifies token, sends required headers with redirect:manual, and flags high-risk scopes", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe("https://api.github.com/user");
      expect(init?.redirect).toBe("manual");
      const headers = init?.headers as Record<string, string>;
      expect(headers.Accept).toBe("application/vnd.github+json");
      expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
      expect(headers["User-Agent"]).toBe("Sydney-Personal-Agent");
      expect(headers.Authorization).toBe("Bearer ghp_testtoken123456");

      return jsonResponse(
        {
          id: 42,
          login: "octocat",
          name: "The Octocat",
          avatar_url: "https://avatars.githubusercontent.com/u/42",
          html_url: "https://github.com/octocat",
        },
        {
          headers: {
            "x-oauth-scopes": "repo, read:user, delete_repo, repo, workflow",
          },
        },
      );
    });

    const provider = createHttpGithubProvider({ fetchImpl });
    const verified = await provider.verifyToken("ghp_testtoken123456");
    expect(verified).toEqual({
      githubUserId: "42",
      login: "octocat",
      displayName: "The Octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/42",
      htmlUrl: "https://github.com/octocat",
      scopes: ["repo", "read:user", "delete_repo", "workflow"],
      highRiskScopes: ["delete_repo", "workflow"],
      rateLimit: {
        limit: 5000,
        remaining: 4990,
        resetAt: new Date(1795000000 * 1000).toISOString(),
      },
    });
  });

  it("rejects 3xx redirects so Authorization headers never follow redirects", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(null, {
        status: 302,
        headers: { location: "https://evil.example.test/steal" },
      });
    });
    const provider = createHttpGithubProvider({ fetchImpl });
    await expect(provider.verifyToken("ghp_secret123456")).rejects.toBeInstanceOf(
      GithubUpstreamError,
    );
  });

  it("maps 401, 403 scope, 403/429 rate-limit, and 404 errors while redacting tokens", async () => {
    const secretToken = "ghp_super_secret_pat_value_999";

    const makeProvider = (status: number, body: unknown, headers?: Record<string, string>) =>
      createHttpGithubProvider({
        fetchImpl: async () => jsonResponse(body, { status, headers }),
        now: () => new Date("2026-11-18T12:00:00.000Z"),
      });

    await expect(
      makeProvider(401, { message: `Bad credentials: ${secretToken}` }).verifyToken(secretToken),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(GithubAuthInvalidError);
      expect((err as Error).message).not.toContain(secretToken);
      return true;
    });

    await expect(
      makeProvider(
        403,
        { message: "API rate limit exceeded" },
        { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1795000000" },
      ).verifyToken(secretToken),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(GithubRateLimitedError);
      expect((err as GithubRateLimitedError).resetAt).toBe(
        new Date(1795000000 * 1000).toISOString(),
      );
      return true;
    });

    await expect(
      makeProvider(
        429,
        { message: "You have exceeded a secondary rate limit" },
        { "x-ratelimit-remaining": "4000", "x-ratelimit-reset": "", "retry-after": "60" },
      ).verifyToken(secretToken),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(GithubRateLimitedError);
      expect((err as GithubRateLimitedError).resetAt).toBe("2026-11-18T12:01:00.000Z");
      return true;
    });

    await expect(
      makeProvider(403, {
        message: "Resource not accessible by personal access token",
      }).verifyToken(secretToken),
    ).rejects.toBeInstanceOf(GithubScopeInsufficientError);

    await expect(
      makeProvider(404, { message: "Not Found" }).readRepoPath(secretToken, {
        owner: "octocat",
        repo: "missing",
      }),
    ).rejects.toBeInstanceOf(GithubNotFoundError);
  });

  it("enforces the 1 MiB response body limit", async () => {
    const oversizedChunk = new Uint8Array(1_048_577).fill(65);
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(oversizedChunk);
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    });

    const provider = createHttpGithubProvider({ fetchImpl });
    await expect(provider.verifyToken("ghp_valid_token_12345")).rejects.toThrow(/1 MiB limit/);
  });

  it("fetches GraphQL profile overview, caches by token+year, and supports forceRefresh & eviction", async () => {
    let calls = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      calls += 1;
      expect(String(input)).toBe("https://api.github.com/graphql");
      expect(init?.method).toBe("POST");
      const parsedBody = JSON.parse(String(init?.body));
      expect(parsedBody.variables).toEqual({
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-12-31T23:59:59.999Z",
      });

      return jsonResponse({
        data: {
          viewer: {
            id: "MDQ6VXNlcjE=",
            databaseId: 101,
            login: "sydney-dev",
            name: "Sydney Dev",
            avatarUrl: "https://avatars.githubusercontent.com/u/101",
            bio: "Builder",
            company: "@rakazo",
            location: "Sydney",
            websiteUrl: "https://sydney.dev",
            twitterUsername: null,
            url: "https://github.com/sydney-dev",
            createdAt: "2022-01-01T00:00:00Z",
            followers: { totalCount: 12 },
            following: { totalCount: 5 },
            publicRepos: { totalCount: 4 },
            privateRepos: { totalCount: 2 },
            contributionsCollection: {
              contributionYears: [2025, 2026],
              totalCommitContributions: 10,
              totalPullRequestContributions: 2,
              totalIssueContributions: 1,
              totalPullRequestReviewContributions: 0,
              restrictedContributionsCount: 3,
              contributionCalendar: {
                totalContributions: 16,
                weeks: [
                  {
                    contributionDays: [
                      {
                        date: "2026-11-17",
                        contributionCount: 4,
                        contributionLevel: "SECOND_QUARTILE",
                        weekday: 2,
                      },
                      {
                        date: "2026-11-18",
                        contributionCount: 6,
                        contributionLevel: "THIRD_QUARTILE",
                        weekday: 3,
                      },
                    ],
                  },
                ],
              },
            },
            pinnedItems: {
              nodes: [
                {
                  id: "R_1",
                  name: "demo",
                  nameWithOwner: "sydney-dev/demo",
                  description: "Pinned repo",
                  url: "https://github.com/sydney-dev/demo",
                  homepageUrl: null,
                  sshUrl: "git@github.com:sydney-dev/demo.git",
                  isPrivate: false,
                  isFork: false,
                  isArchived: false,
                  pushedAt: "2026-11-18T10:00:00Z",
                  updatedAt: "2026-11-18T10:00:00Z",
                  stargazerCount: 15,
                  forkCount: 1,
                  owner: { login: "sydney-dev", avatarUrl: null },
                  defaultBranchRef: { name: "main" },
                  primaryLanguage: { name: "TypeScript", color: "#3178c6" },
                  licenseInfo: { spdxId: "MIT" },
                  issues: { totalCount: 0 },
                  repositoryTopics: { nodes: [{ topic: { name: "agent" } }] },
                },
              ],
            },
            recentRepos: { nodes: [] },
          },
        },
      });
    });

    const provider = createHttpGithubProvider({
      fetchImpl,
      now: () => new Date("2026-11-18T12:00:00.000Z"),
    });

    const first = await provider.getProfileOverview("ghp_token_abc123", { year: 2026 });
    expect(GithubProfileOverviewSchema.parse(first).calendar.currentStreakDays).toBe(2);
    expect(calls).toBe(1);

    // Cached hit
    await provider.getProfileOverview("ghp_token_abc123", { year: 2026 });
    expect(calls).toBe(1);

    // Force refresh bypasses cache
    await provider.getProfileOverview("ghp_token_abc123", { year: 2026, forceRefresh: true });
    expect(calls).toBe(2);

    // Eviction clears cache
    provider.evictUserCache?.("101");
    await provider.getProfileOverview("ghp_token_abc123", { year: 2026 });
    expect(calls).toBe(3);
  });

  it("filters and sorts listMyRepos, decodes/truncates repo detail & files, and rejects NUL binary files", async () => {
    const longReadme = "R".repeat(70_000);
    const longFile = "F".repeat(35_000);

    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/user/repos") {
        expect(url.searchParams.get("affiliation")).toBe("owner,collaborator,organization_member");
        return jsonResponse([
          {
            id: 1,
            name: "alpha",
            full_name: "octo/alpha",
            owner: { login: "octo", avatar_url: null },
            description: "First repo",
            html_url: "https://github.com/octo/alpha",
            private: false,
            fork: true,
            archived: false,
            default_branch: "main",
            language: "TypeScript",
            stargazers_count: 10,
            forks_count: 1,
            open_issues_count: 0,
            topics: ["mcp"],
            pushed_at: "2026-11-10T00:00:00Z",
            updated_at: "2026-11-10T00:00:00Z",
          },
          {
            id: 2,
            name: "beta",
            full_name: "octo/beta",
            owner: { login: "octo", avatar_url: null },
            description: "Second MCP repo",
            html_url: "https://github.com/octo/beta",
            private: false,
            fork: true,
            archived: false,
            default_branch: "main",
            language: "TypeScript",
            stargazers_count: 99,
            forks_count: 4,
            open_issues_count: 2,
            topics: ["mcp"],
            pushed_at: "2026-11-12T00:00:00Z",
            updated_at: "2026-11-12T00:00:00Z",
          },
        ]);
      }

      if (url.pathname === "/repos/octo/beta") {
        return jsonResponse({
          id: 2,
          name: "beta",
          full_name: "octo/beta",
          owner: { login: "Octo", avatar_url: null },
          description: "Second MCP repo",
          html_url: "https://github.com/octo/beta",
          private: false,
          fork: false,
          archived: false,
          default_branch: "main",
          language: "TypeScript",
          stargazers_count: 99,
          forks_count: 4,
          open_issues_count: 2,
          topics: ["mcp"],
          pushed_at: "2026-11-12T00:00:00Z",
          updated_at: "2026-11-12T00:00:00Z",
        });
      }

      if (url.pathname === "/repos/octo/beta/readme") {
        return jsonResponse({
          path: "README.md",
          encoding: "base64",
          content: Buffer.from(longReadme, "utf8").toString("base64"),
        });
      }

      if (url.pathname === "/repos/octo/beta/commits") {
        return jsonResponse({ message: "Git Repository is empty." }, { status: 409 });
      }

      if (url.pathname === "/repos/octo/beta/releases/latest") {
        return jsonResponse({ message: "Not Found" }, { status: 404 });
      }

      if (url.pathname === "/repos/octo/beta/contents/src/large.ts") {
        return jsonResponse({
          type: "file",
          path: "src/large.ts",
          size: longFile.length,
          encoding: "base64",
          content: Buffer.from(longFile, "utf8").toString("base64"),
        });
      }

      if (url.pathname === "/repos/octo/beta/contents/assets/logo.png") {
        return jsonResponse({
          type: "file",
          path: "assets/logo.png",
          size: 8,
          encoding: "base64",
          content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a, 0x1a]).toString("base64"),
        });
      }

      return jsonResponse({ message: "Unexpected URL" }, { status: 500 });
    });

    const provider = createHttpGithubProvider({ fetchImpl });

    const page = await provider.listMyRepos("ghp_token_abc123", {
      affiliation: "all",
      visibility: "fork",
      language: "typescript",
      query: "mcp",
      sort: "stars",
      page: 1,
      perPage: 24,
    });
    expect(GithubRepoPageSchema.parse(page).items.map((r) => r.fullName)).toEqual([
      "octo/beta",
      "octo/alpha",
    ]);

    const detail = await provider.getRepoDetail(null, {
      owner: "octo",
      repo: "beta",
      viewerLogin: "octo",
    });
    const parsedDetail = GithubRepoDetailSchema.parse(detail);
    expect(parsedDetail.isViewerOwner).toBe(true);
    expect(parsedDetail.readme?.content.length).toBe(64_000);
    expect(parsedDetail.readme?.truncated).toBe(true);
    expect(parsedDetail.recentCommits).toEqual([]);
    expect(parsedDetail.latestRelease).toBeNull();

    const textFile = await provider.readRepoPath(null, {
      owner: "octo",
      repo: "beta",
      path: "src/large.ts",
    });
    const parsedFile = GithubRepoPathContentSchema.parse(textFile);
    expect(parsedFile.kind).toBe("file");
    if (parsedFile.kind === "file") {
      expect(parsedFile.content.length).toBe(32_000);
      expect(parsedFile.truncated).toBe(true);
    }

    await expect(
      provider.readRepoPath(null, {
        owner: "octo",
        repo: "beta",
        path: "assets/logo.png",
      }),
    ).rejects.toThrow("Binary files cannot be read as text");
  });
});

describe("createGithubEmulator", () => {
  it("handles special test tokens and returns contract-valid profile, repos, search, detail, and files", async () => {
    const emulator = createGithubEmulator();

    await expect(emulator.verifyToken("ghp_invalid_token_test")).rejects.toBeInstanceOf(
      GithubAuthInvalidError,
    );
    await expect(emulator.verifyToken("ghp_ratelimited_token_test")).rejects.toBeInstanceOf(
      GithubRateLimitedError,
    );

    const highRisk = await emulator.verifyToken("ghp_highrisk_token_test");
    expect(highRisk.highRiskScopes).toEqual(["delete_repo", "admin:org"]);

    const overview = GithubProfileOverviewSchema.parse(
      await emulator.getProfileOverview("ghp_valid_pat_12345", {}),
    );
    expect(overview.profile.login).toBe("sydney-dev");
    expect(overview.calendar.availableYears).toEqual([2026, 2025]);
    expect(overview.calendar.weeks.length).toBeGreaterThanOrEqual(52);
    expect(overview.calendar.currentStreakDays).toBeGreaterThan(0);

    const privateRepos = GithubRepoPageSchema.parse(
      await emulator.listMyRepos("ghp_valid_pat_12345", {
        affiliation: "all",
        visibility: "private",
        sort: "pushed",
        page: 1,
        perPage: 20,
      }),
    );
    expect(privateRepos.items.length).toBeGreaterThan(0);
    expect(privateRepos.items.every((repo) => repo.isPrivate)).toBe(true);

    const search = GithubSearchReposOutputSchema.parse(
      await emulator.searchRepos(null, {
        query: "",
        topic: "mcp",
        sort: "stars",
        page: 1,
        perPage: 10,
      }),
    );
    expect(search.authenticated).toBe(false);
    expect(search.items.some((repo) => repo.fullName === "anthropics/claude-code")).toBe(true);

    const detail = GithubRepoDetailSchema.parse(
      await emulator.getRepoDetail("ghp_valid_pat_12345", {
        owner: "sydney-dev",
        repo: "sydney-personal-agent",
        viewerLogin: "sydney-dev",
      }),
    );
    expect(detail.isViewerOwner).toBe(true);
    expect(detail.readme?.content).toContain("Sydney Personal Agent");

    const rootTree = GithubRepoPathContentSchema.parse(
      await emulator.readRepoPath("ghp_valid_pat_12345", {
        owner: "sydney-dev",
        repo: "sydney-personal-agent",
      }),
    );
    expect(rootTree.kind).toBe("directory");

    const readmeFile = GithubRepoPathContentSchema.parse(
      await emulator.readRepoPath("ghp_valid_pat_12345", {
        owner: "sydney-dev",
        repo: "sydney-personal-agent",
        path: "README.md",
      }),
    );
    expect(readmeFile.kind).toBe("file");
  });
});
