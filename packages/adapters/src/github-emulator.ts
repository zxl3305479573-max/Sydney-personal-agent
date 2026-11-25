import type { AdapterContext, GithubProvider, GithubVerifiedIdentity } from "@rakazo/adapter-kit";
import {
  GithubAuthInvalidError,
  GithubNotFoundError,
  GithubRateLimitedError,
} from "@rakazo/adapter-kit";
import type {
  GithubContributionDay,
  GithubContributionLevel,
  GithubContributionWeek,
  GithubListMyReposInput,
  GithubProfileOverview,
  GithubProfileOverviewInput,
  GithubRateLimit,
  GithubReadRepoFileInput,
  GithubRepoAffiliation,
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
  GithubListMyReposInputSchema,
  GithubProfileOverviewInputSchema,
  GithubReadRepoFileInputSchema,
  GithubRepoDetailInputSchema,
  GithubSearchReposInputSchema,
} from "@rakazo/contracts";
import { buildGithubSearchQuery, computeContributionStreaks } from "./github-client.js";

const DAY_MS = 86_400_000;
const EMULATOR_REFERENCE_DATE = new Date("2026-11-18T12:00:00.000Z");

const EMULATOR_RATE_LIMIT: GithubRateLimit = {
  limit: 5_000,
  remaining: 4_988,
  resetAt: "2026-11-18T13:00:00.000Z",
};

const ANONYMOUS_RATE_LIMIT: GithubRateLimit = {
  limit: 60,
  remaining: 57,
  resetAt: "2026-11-18T13:00:00.000Z",
};

type EmulatorRepoFixture = {
  summary: GithubRepoSummary;
  affiliation?: Exclude<GithubRepoAffiliation, "all">;
  pinned?: boolean;
  readme: string;
  release: {
    tagName: string;
    name: string;
    publishedAt: string;
    prerelease: boolean;
    body: string;
  } | null;
  files: Record<string, string>;
  directories: Record<string, GithubRepoDirectoryEntry[]>;
};

const REPO_FIXTURES: readonly EmulatorRepoFixture[] = [
  {
    affiliation: "owner",
    pinned: true,
    summary: {
      id: "R_sydney_agent_1",
      name: "sydney-personal-agent",
      ownerLogin: "sydney-dev",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1024001?v=4",
      fullName: "sydney-dev/sydney-personal-agent",
      description: "Personal AI agent desktop & runtime with strict permission boundaries.",
      htmlUrl: "https://github.com/sydney-dev/sydney-personal-agent",
      homepageUrl: "https://sydney.dev",
      cloneUrl: "https://github.com/sydney-dev/sydney-personal-agent.git",
      sshUrl: "git@github.com:sydney-dev/sydney-personal-agent.git",
      isPrivate: false,
      isFork: false,
      isArchived: false,
      defaultBranch: "main",
      primaryLanguage: { name: "TypeScript", color: "#3178c6" },
      stargazerCount: 420,
      forkCount: 38,
      openIssuesCount: 6,
      topics: ["ai-agent", "typescript", "mcp", "desktop"],
      licenseSpdxId: "MIT",
      pushedAt: "2026-11-18T06:45:00.000Z",
      updatedAt: "2026-11-18T06:45:00.000Z",
    },
    readme:
      "# Sydney Personal Agent\n\nOffline-first personal AI agent built in TypeScript with explicit provider boundaries and auditable tool execution.\n\n## Highlights\n\n- Encrypted credential storage\n- Read-only GitHub browsing & repository search\n- Strict sandbox isolation\n",
    release: {
      tagName: "v0.9.0",
      name: "Sydney Personal Agent 0.9.0",
      publishedAt: "2026-11-10T10:00:00.000Z",
      prerelease: false,
      body: "### Added\n- GitHub profile heatmap and repository explorer\n- Read-only agent tools for GitHub inspection\n",
    },
    directories: {
      "": [
        { name: "src", path: "src", type: "dir", size: 0 },
        { name: "README.md", path: "README.md", type: "file", size: 268 },
        { name: "package.json", path: "package.json", type: "file", size: 156 },
      ],
      src: [{ name: "index.ts", path: "src/index.ts", type: "file", size: 94 }],
    },
    files: {
      "README.md":
        "# Sydney Personal Agent\n\nOffline-first personal AI agent built in TypeScript with explicit provider boundaries and auditable tool execution.\n",
      "package.json":
        '{\n  "name": "sydney-personal-agent",\n  "version": "0.9.0",\n  "private": true\n}\n',
      "src/index.ts": 'export const VERSION = "0.9.0";\n',
    },
  },
  {
    affiliation: "owner",
    pinned: true,
    summary: {
      id: "R_sydney_mcp_2",
      name: "mcp-toolkit",
      ownerLogin: "sydney-dev",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1024001?v=4",
      fullName: "sydney-dev/mcp-toolkit",
      description: "Lightweight schema-validated MCP server helpers for TypeScript.",
      htmlUrl: "https://github.com/sydney-dev/mcp-toolkit",
      homepageUrl: null,
      cloneUrl: "https://github.com/sydney-dev/mcp-toolkit.git",
      sshUrl: "git@github.com:sydney-dev/mcp-toolkit.git",
      isPrivate: false,
      isFork: false,
      isArchived: false,
      defaultBranch: "main",
      primaryLanguage: { name: "TypeScript", color: "#3178c6" },
      stargazerCount: 195,
      forkCount: 19,
      openIssuesCount: 2,
      topics: ["mcp", "typescript", "sdk"],
      licenseSpdxId: "Apache-2.0",
      pushedAt: "2026-11-15T14:20:00.000Z",
      updatedAt: "2026-11-15T14:20:00.000Z",
    },
    readme:
      "# MCP Toolkit\n\nZero-dependency utilities for building Model Context Protocol servers.\n",
    release: {
      tagName: "v1.2.1",
      name: "v1.2.1",
      publishedAt: "2026-11-01T09:00:00.000Z",
      prerelease: false,
      body: "Bug fixes for streaming JSON-RPC framing.",
    },
    directories: {
      "": [
        { name: "src", path: "src", type: "dir", size: 0 },
        { name: "README.md", path: "README.md", type: "file", size: 88 },
      ],
      src: [{ name: "index.ts", path: "src/index.ts", type: "file", size: 42 }],
    },
    files: {
      "README.md":
        "# MCP Toolkit\n\nZero-dependency utilities for building Model Context Protocol servers.\n",
      "src/index.ts": "export function createToolkit() {}\n",
    },
  },
  {
    affiliation: "owner",
    pinned: true,
    summary: {
      id: "R_sydney_private_3",
      name: "private-ops-runbook",
      ownerLogin: "sydney-dev",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1024001?v=4",
      fullName: "sydney-dev/private-ops-runbook",
      description: "Private infrastructure runbooks and incident playbooks.",
      htmlUrl: "https://github.com/sydney-dev/private-ops-runbook",
      homepageUrl: null,
      cloneUrl: "https://github.com/sydney-dev/private-ops-runbook.git",
      sshUrl: "git@github.com:sydney-dev/private-ops-runbook.git",
      isPrivate: true,
      isFork: false,
      isArchived: false,
      defaultBranch: "main",
      primaryLanguage: { name: "Python", color: "#3572A5" },
      stargazerCount: 8,
      forkCount: 0,
      openIssuesCount: 1,
      topics: ["runbook", "ops"],
      licenseSpdxId: null,
      pushedAt: "2026-11-16T18:00:00.000Z",
      updatedAt: "2026-11-16T18:00:00.000Z",
    },
    readme: "# Private Ops Runbook\n\nInternal deployment and backup verification notes.\n",
    release: null,
    directories: {
      "": [{ name: "README.md", path: "README.md", type: "file", size: 75 }],
    },
    files: {
      "README.md": "# Private Ops Runbook\n\nInternal deployment and backup verification notes.\n",
    },
  },
  {
    affiliation: "owner",
    pinned: true,
    summary: {
      id: "R_sydney_rust_4",
      name: "rust-kv-engine",
      ownerLogin: "sydney-dev",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1024001?v=4",
      fullName: "sydney-dev/rust-kv-engine",
      description: "Embedded LSM-tree key-value storage engine in Rust.",
      htmlUrl: "https://github.com/sydney-dev/rust-kv-engine",
      homepageUrl: null,
      cloneUrl: "https://github.com/sydney-dev/rust-kv-engine.git",
      sshUrl: "git@github.com:sydney-dev/rust-kv-engine.git",
      isPrivate: false,
      isFork: false,
      isArchived: false,
      defaultBranch: "main",
      primaryLanguage: { name: "Rust", color: "#dea584" },
      stargazerCount: 89,
      forkCount: 7,
      openIssuesCount: 3,
      topics: ["rust", "database", "lsm-tree"],
      licenseSpdxId: "MIT",
      pushedAt: "2026-11-05T11:30:00.000Z",
      updatedAt: "2026-11-05T11:30:00.000Z",
    },
    readme: "# Rust KV Engine\n\nCompact embedded key-value store with crash-safe WAL.\n",
    release: null,
    directories: {
      "": [{ name: "README.md", path: "README.md", type: "file", size: 73 }],
    },
    files: {
      "README.md": "# Rust KV Engine\n\nCompact embedded key-value store with crash-safe WAL.\n",
    },
  },
  {
    affiliation: "owner",
    pinned: false,
    summary: {
      id: "R_sydney_fork_5",
      name: "servers-fork",
      ownerLogin: "sydney-dev",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1024001?v=4",
      fullName: "sydney-dev/servers-fork",
      description: "Fork of reference MCP servers with local patches.",
      htmlUrl: "https://github.com/sydney-dev/servers-fork",
      homepageUrl: null,
      cloneUrl: "https://github.com/sydney-dev/servers-fork.git",
      sshUrl: "git@github.com:sydney-dev/servers-fork.git",
      isPrivate: false,
      isFork: true,
      isArchived: false,
      defaultBranch: "main",
      primaryLanguage: { name: "TypeScript", color: "#3178c6" },
      stargazerCount: 12,
      forkCount: 1,
      openIssuesCount: 0,
      topics: ["mcp"],
      licenseSpdxId: "MIT",
      pushedAt: "2026-10-28T09:15:00.000Z",
      updatedAt: "2026-10-28T09:15:00.000Z",
    },
    readme: "# MCP Servers (Fork)\n\nExperimental fork for local testing.\n",
    release: null,
    directories: {
      "": [{ name: "README.md", path: "README.md", type: "file", size: 59 }],
    },
    files: {
      "README.md": "# MCP Servers (Fork)\n\nExperimental fork for local testing.\n",
    },
  },
  {
    affiliation: "owner",
    pinned: false,
    summary: {
      id: "R_sydney_archived_6",
      name: "legacy-dotfiles-2023",
      ownerLogin: "sydney-dev",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1024001?v=4",
      fullName: "sydney-dev/legacy-dotfiles-2023",
      description: "Archived shell configuration and neovim setup from 2023.",
      htmlUrl: "https://github.com/sydney-dev/legacy-dotfiles-2023",
      homepageUrl: null,
      cloneUrl: "https://github.com/sydney-dev/legacy-dotfiles-2023.git",
      sshUrl: "git@github.com:sydney-dev/legacy-dotfiles-2023.git",
      isPrivate: false,
      isFork: false,
      isArchived: true,
      defaultBranch: "main",
      primaryLanguage: { name: "Shell", color: "#89e051" },
      stargazerCount: 4,
      forkCount: 0,
      openIssuesCount: 0,
      topics: ["dotfiles"],
      licenseSpdxId: "MIT",
      pushedAt: "2023-12-19T20:00:00.000Z",
      updatedAt: "2024-01-02T10:00:00.000Z",
    },
    readme: "# Legacy Dotfiles (Archived)\n\nSuperseded by nix-home.\n",
    release: null,
    directories: {
      "": [{ name: "README.md", path: "README.md", type: "file", size: 54 }],
    },
    files: {
      "README.md": "# Legacy Dotfiles (Archived)\n\nSuperseded by nix-home.\n",
    },
  },
  {
    affiliation: "organization_member",
    pinned: false,
    summary: {
      id: "R_rakazo_sdk_7",
      name: "adapter-sdk",
      ownerLogin: "rakazo-labs",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/2048002?v=4",
      fullName: "rakazo-labs/adapter-sdk",
      description: "Provider contract interfaces and test harnesses for Rakazo adapters.",
      htmlUrl: "https://github.com/rakazo-labs/adapter-sdk",
      homepageUrl: "https://rakazo.dev",
      cloneUrl: "https://github.com/rakazo-labs/adapter-sdk.git",
      sshUrl: "git@github.com:rakazo-labs/adapter-sdk.git",
      isPrivate: false,
      isFork: false,
      isArchived: false,
      defaultBranch: "main",
      primaryLanguage: { name: "TypeScript", color: "#3178c6" },
      stargazerCount: 310,
      forkCount: 24,
      openIssuesCount: 5,
      topics: ["adapters", "typescript", "testing"],
      licenseSpdxId: "MIT",
      pushedAt: "2026-11-17T15:10:00.000Z",
      updatedAt: "2026-11-17T15:10:00.000Z",
    },
    readme: "# Rakazo Adapter SDK\n\nProvider contracts and deterministic emulators.\n",
    release: {
      tagName: "v2.1.0",
      name: "Adapter SDK 2.1.0",
      publishedAt: "2026-11-12T12:00:00.000Z",
      prerelease: false,
      body: "Added GitHub provider contract and error hierarchy.",
    },
    directories: {
      "": [{ name: "README.md", path: "README.md", type: "file", size: 71 }],
    },
    files: {
      "README.md": "# Rakazo Adapter SDK\n\nProvider contracts and deterministic emulators.\n",
    },
  },
  {
    affiliation: "collaborator",
    pinned: false,
    summary: {
      id: "R_collab_evals_8",
      name: "agent-evals",
      ownerLogin: "alex-chen",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/3072003?v=4",
      fullName: "alex-chen/agent-evals",
      description: "Private evaluation benchmarks for tool-using agents.",
      htmlUrl: "https://github.com/alex-chen/agent-evals",
      homepageUrl: null,
      cloneUrl: "https://github.com/alex-chen/agent-evals.git",
      sshUrl: "git@github.com:alex-chen/agent-evals.git",
      isPrivate: true,
      isFork: false,
      isArchived: false,
      defaultBranch: "main",
      primaryLanguage: { name: "Python", color: "#3572A5" },
      stargazerCount: 27,
      forkCount: 3,
      openIssuesCount: 4,
      topics: ["evals", "benchmarks", "agents"],
      licenseSpdxId: null,
      pushedAt: "2026-11-14T08:00:00.000Z",
      updatedAt: "2026-11-14T08:00:00.000Z",
    },
    readme: "# Agent Evals\n\nOffline reproducible task suites.\n",
    release: null,
    directories: {
      "": [{ name: "README.md", path: "README.md", type: "file", size: 49 }],
    },
    files: {
      "README.md": "# Agent Evals\n\nOffline reproducible task suites.\n",
    },
  },
  // Open-source search catalog fixtures
  {
    summary: {
      id: "R_oss_nextjs",
      name: "next.js",
      ownerLogin: "vercel",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/14985020?v=4",
      fullName: "vercel/next.js",
      description: "The React Framework for the Web.",
      htmlUrl: "https://github.com/vercel/next.js",
      homepageUrl: "https://nextjs.org",
      cloneUrl: "https://github.com/vercel/next.js.git",
      sshUrl: "git@github.com:vercel/next.js.git",
      isPrivate: false,
      isFork: false,
      isArchived: false,
      defaultBranch: "canary",
      primaryLanguage: { name: "TypeScript", color: "#3178c6" },
      stargazerCount: 132_400,
      forkCount: 28_500,
      openIssuesCount: 2_840,
      topics: ["react", "nextjs", "web", "SSR"],
      licenseSpdxId: "MIT",
      pushedAt: "2026-11-18T11:20:00.000Z",
      updatedAt: "2026-11-18T11:20:00.000Z",
    },
    readme: "# Next.js\n\nThe React Framework for production web applications.\n",
    release: {
      tagName: "v16.1.0",
      name: "v16.1.0",
      publishedAt: "2026-11-08T16:00:00.000Z",
      prerelease: false,
      body: "Improved Turbopack incremental compilation and server actions.",
    },
    directories: {
      "": [
        { name: "packages", path: "packages", type: "dir", size: 0 },
        { name: "README.md", path: "README.md", type: "file", size: 65 },
      ],
    },
    files: {
      "README.md": "# Next.js\n\nThe React Framework for production web applications.\n",
    },
  },
  {
    summary: {
      id: "R_oss_claude_code",
      name: "claude-code",
      ownerLogin: "anthropics",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/76263028?v=4",
      fullName: "anthropics/claude-code",
      description: "Agentic coding tool that lives in your terminal and understands your codebase.",
      htmlUrl: "https://github.com/anthropics/claude-code",
      homepageUrl: "https://docs.anthropic.com",
      cloneUrl: "https://github.com/anthropics/claude-code.git",
      sshUrl: "git@github.com:anthropics/claude-code.git",
      isPrivate: false,
      isFork: false,
      isArchived: false,
      defaultBranch: "main",
      primaryLanguage: { name: "TypeScript", color: "#3178c6" },
      stargazerCount: 48_900,
      forkCount: 3_400,
      openIssuesCount: 410,
      topics: ["ai-agent", "cli", "coding", "mcp"],
      licenseSpdxId: "MIT",
      pushedAt: "2026-11-18T04:10:00.000Z",
      updatedAt: "2026-11-18T04:10:00.000Z",
    },
    readme: "# Claude Code\n\nTerminal-native agentic coding assistant.\n",
    release: {
      tagName: "v1.4.0",
      name: "v1.4.0",
      publishedAt: "2026-11-14T18:00:00.000Z",
      prerelease: false,
      body: "Enhanced MCP tool streaming and permission prompts.",
    },
    directories: {
      "": [{ name: "README.md", path: "README.md", type: "file", size: 58 }],
    },
    files: {
      "README.md": "# Claude Code\n\nTerminal-native agentic coding assistant.\n",
    },
  },
  {
    summary: {
      id: "R_oss_mcp_servers",
      name: "servers",
      ownerLogin: "modelcontextprotocol",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/182288589?v=4",
      fullName: "modelcontextprotocol/servers",
      description: "Model Context Protocol reference servers for filesystems, Git, and APIs.",
      htmlUrl: "https://github.com/modelcontextprotocol/servers",
      homepageUrl: "https://modelcontextprotocol.io",
      cloneUrl: "https://github.com/modelcontextprotocol/servers.git",
      sshUrl: "git@github.com:modelcontextprotocol/servers.git",
      isPrivate: false,
      isFork: false,
      isArchived: false,
      defaultBranch: "main",
      primaryLanguage: { name: "TypeScript", color: "#3178c6" },
      stargazerCount: 39_200,
      forkCount: 4_850,
      openIssuesCount: 195,
      topics: ["mcp", "ai-agent", "typescript", "python"],
      licenseSpdxId: "MIT",
      pushedAt: "2026-11-17T21:30:00.000Z",
      updatedAt: "2026-11-17T21:30:00.000Z",
    },
    readme: "# Model Context Protocol Servers\n\nReference implementations for MCP.\n",
    release: {
      tagName: "v2026.11.1",
      name: "2026.11.1",
      publishedAt: "2026-11-05T15:00:00.000Z",
      prerelease: false,
      body: "Updated reference servers for latest MCP specification.",
    },
    directories: {
      "": [
        { name: "src", path: "src", type: "dir", size: 0 },
        { name: "README.md", path: "README.md", type: "file", size: 70 },
      ],
    },
    files: {
      "README.md": "# Model Context Protocol Servers\n\nReference implementations for MCP.\n",
    },
  },
];

function assertEmulatorToken(token: string | null, requireAuth: boolean): string | null {
  const trimmed = token?.trim() ?? "";
  if (!trimmed) {
    if (requireAuth) {
      throw new GithubAuthInvalidError();
    }
    return null;
  }
  if (trimmed === "ghp_invalid_token_test") {
    throw new GithubAuthInvalidError("GitHub Personal Access Token is invalid or expired");
  }
  if (trimmed === "ghp_ratelimited_token_test") {
    throw new GithubRateLimitedError("GitHub API rate limit exceeded", "2026-11-18T16:00:00.000Z");
  }
  return trimmed;
}

function buildDeterministicCalendar(year: number | undefined): GithubProfileOverview["calendar"] {
  const todayStr = EMULATOR_REFERENCE_DATE.toISOString().slice(0, 10);
  let startEpoch: number;
  let endEpoch: number;
  let fromIso: string;
  let toIso: string;

  if (year !== undefined) {
    startEpoch = Date.UTC(year, 0, 1);
    endEpoch = Date.UTC(year, 11, 31);
    fromIso = `${year}-01-01T00:00:00.000Z`;
    toIso = `${year}-12-31T23:59:59.999Z`;
  } else {
    endEpoch = Date.UTC(2026, 10, 18);
    startEpoch = endEpoch - 364 * DAY_MS;
    fromIso = new Date(startEpoch).toISOString();
    toIso = "2026-11-18T23:59:59.999Z";
  }

  // Align start of grid to Sunday so 53 weeks render naturally like GitHub's contributionCalendar
  const firstDayWeekday = new Date(startEpoch).getUTCDay();
  const gridStartEpoch = startEpoch - firstDayWeekday * DAY_MS;

  const weeks: GithubContributionWeek[] = [];
  const allDaysInRange: GithubContributionDay[] = [];
  let totalContributions = 0;

  let cursor = gridStartEpoch;
  while (cursor <= endEpoch) {
    const contributionDays: GithubContributionDay[] = [];
    for (let dow = 0; dow < 7; dow += 1) {
      const dayEpoch = cursor + dow * DAY_MS;
      if (dayEpoch >= startEpoch && dayEpoch <= endEpoch) {
        const dateObj = new Date(dayEpoch);
        const dateStr = dateObj.toISOString().slice(0, 10);
        const dayIndex = Math.round((dayEpoch - startEpoch) / DAY_MS);
        const isFuture = dateStr > todayStr;

        // Ensure an active 9-day streak leading up to 2026-11-18 plus realistic activity
        let count = 0;
        if (!isFuture) {
          const daysBeforeRef = Math.round((Date.UTC(2026, 10, 18) - dayEpoch) / DAY_MS);
          if (daysBeforeRef >= 0 && daysBeforeRef < 9) {
            count = 3 + (daysBeforeRef % 6);
          } else if ((dayIndex + 3) % 5 !== 0) {
            count = (dayIndex * 7 + 2) % 11;
          }
        }

        totalContributions += count;
        const dayEntry: GithubContributionDay = {
          date: dateStr,
          contributionCount: count,
          contributionLevel: levelForCount(count),
          weekday: dateObj.getUTCDay(),
        };
        contributionDays.push(dayEntry);
        allDaysInRange.push(dayEntry);
      }
    }
    if (contributionDays.length > 0) {
      weeks.push({ contributionDays });
    }
    cursor += 7 * DAY_MS;
  }

  const { currentStreakDays, longestStreakDays } = computeContributionStreaks(
    allDaysInRange,
    todayStr,
  );

  const commitShare = Math.round(totalContributions * 0.72);
  const prShare = Math.round(totalContributions * 0.14);
  const reviewShare = Math.round(totalContributions * 0.08);
  const issueShare = Math.max(0, totalContributions - commitShare - prShare - reviewShare);

  return {
    year: year ?? null,
    from: fromIso,
    to: toIso,
    availableYears: [2026, 2025],
    totalContributions,
    totalCommitContributions: commitShare,
    totalPullRequestContributions: prShare,
    totalIssueContributions: issueShare,
    totalPullRequestReviewContributions: reviewShare,
    restrictedContributionsCount: 24,
    currentStreakDays,
    longestStreakDays,
    weeks,
  };
}

function levelForCount(count: number): GithubContributionLevel {
  if (count <= 0) return "NONE";
  if (count <= 2) return "FIRST_QUARTILE";
  if (count <= 5) return "SECOND_QUARTILE";
  if (count <= 8) return "THIRD_QUARTILE";
  return "FOURTH_QUARTILE";
}

export function createGithubEmulator(): GithubProvider {
  return {
    describe() {
      return { id: "emulator", displayName: "GitHub Emulator" };
    },

    evictUserCache(_userId: string) {
      // Deterministic stateless emulator needs no cache eviction.
    },

    async verifyToken(token: string, ctx?: AdapterContext): Promise<GithubVerifiedIdentity> {
      ctx?.signal?.throwIfAborted();
      const cleanToken = assertEmulatorToken(token, true)!;
      const isHighRisk = cleanToken === "ghp_highrisk_token_test";
      const scopes = isHighRisk
        ? ["repo", "read:user", "read:org", "delete_repo", "admin:org"]
        : ["repo", "read:user", "read:org"];
      const highRiskScopes = isHighRisk ? ["delete_repo", "admin:org"] : [];

      return {
        githubUserId: "1024001",
        login: "sydney-dev",
        displayName: "Sydney Developer",
        avatarUrl: "https://avatars.githubusercontent.com/u/1024001?v=4",
        htmlUrl: "https://github.com/sydney-dev",
        scopes,
        highRiskScopes,
        rateLimit: EMULATOR_RATE_LIMIT,
      };
    },

    async getProfileOverview(
      token: string,
      input: GithubProfileOverviewInput,
      ctx?: AdapterContext,
    ): Promise<GithubProfileOverview> {
      ctx?.signal?.throwIfAborted();
      assertEmulatorToken(token, true);
      const parsed = GithubProfileOverviewInputSchema.parse(input);

      const userRepos = REPO_FIXTURES.filter((fixture) => fixture.affiliation !== undefined);
      const pinnedRepos = userRepos
        .filter((fixture) => fixture.pinned)
        .slice(0, 6)
        .map((fixture) => fixture.summary);
      const recentRepos = [...userRepos]
        .sort((a, b) => (b.summary.pushedAt ?? "").localeCompare(a.summary.pushedAt ?? ""))
        .slice(0, 6)
        .map((fixture) => fixture.summary);

      return {
        profile: {
          githubUserId: "1024001",
          login: "sydney-dev",
          name: "Sydney Developer",
          avatarUrl: "https://avatars.githubusercontent.com/u/1024001?v=4",
          bio: "Personal agent systems, TypeScript runtimes, and developer workflows.",
          company: "@rakazo",
          location: "Sydney, Australia",
          blogUrl: "https://sydney.dev",
          twitterUsername: "sydney_dev",
          htmlUrl: "https://github.com/sydney-dev",
          followers: 184,
          following: 42,
          publicRepos: 14,
          totalPrivateRepos: 6,
          createdAt: "2021-03-15T08:30:00.000Z",
        },
        calendar: buildDeterministicCalendar(parsed.year),
        pinnedRepos,
        recentRepos,
        rateLimit: EMULATOR_RATE_LIMIT,
      };
    },

    async listMyRepos(
      token: string,
      input: GithubListMyReposInput,
      ctx?: AdapterContext,
    ): Promise<GithubRepoPage> {
      ctx?.signal?.throwIfAborted();
      assertEmulatorToken(token, true);
      const parsed = GithubListMyReposInputSchema.parse(input);

      const languageLower = parsed.language?.trim().toLowerCase();
      const queryLower = parsed.query?.trim().toLowerCase();

      const matching = REPO_FIXTURES.filter((fixture) => {
        if (!fixture.affiliation) return false;
        if (parsed.affiliation !== "all" && fixture.affiliation !== parsed.affiliation) {
          return false;
        }
        const repo = fixture.summary;
        if (parsed.visibility === "public" && repo.isPrivate) return false;
        if (parsed.visibility === "private" && !repo.isPrivate) return false;
        if (parsed.visibility === "fork" && !repo.isFork) return false;
        if (parsed.visibility === "archived" && !repo.isArchived) return false;

        if (languageLower) {
          if ((repo.primaryLanguage?.name.toLowerCase() ?? "") !== languageLower) return false;
        }
        if (queryLower) {
          const hit =
            repo.fullName.toLowerCase().includes(queryLower) ||
            (repo.description ?? "").toLowerCase().includes(queryLower) ||
            repo.topics.some((topic) => topic.toLowerCase().includes(queryLower));
          if (!hit) return false;
        }
        return true;
      }).map((fixture) => fixture.summary);

      const sorted = [...matching].sort((a, b) => {
        switch (parsed.sort) {
          case "stars":
            return b.stargazerCount - a.stargazerCount || a.fullName.localeCompare(b.fullName);
          case "full_name":
            return a.fullName.localeCompare(b.fullName);
          case "updated":
            return b.updatedAt.localeCompare(a.updatedAt);
          default:
            return (b.pushedAt ?? "").localeCompare(a.pushedAt ?? "");
        }
      });

      const start = (parsed.page - 1) * parsed.perPage;
      const items = sorted.slice(start, start + parsed.perPage);

      return {
        items,
        page: parsed.page,
        perPage: parsed.perPage,
        hasNextPage: start + parsed.perPage < sorted.length,
        totalCount: sorted.length,
        rateLimit: EMULATOR_RATE_LIMIT,
      };
    },

    async searchRepos(
      token: string | null,
      input: GithubSearchReposInput,
      ctx?: AdapterContext,
    ): Promise<GithubSearchReposOutput> {
      ctx?.signal?.throwIfAborted();
      const cleanToken = assertEmulatorToken(token, false);
      const parsed = GithubSearchReposInputSchema.parse(input);
      const effectiveQuery = buildGithubSearchQuery(parsed, EMULATOR_REFERENCE_DATE);

      const keywords = parsed.query
        .toLowerCase()
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length > 0);
      const languageLower = parsed.language?.trim().toLowerCase();
      const topicLower = parsed.topic?.trim().toLowerCase();
      const cutoffIso =
        parsed.pushedWithinDays !== undefined
          ? new Date(
              EMULATOR_REFERENCE_DATE.getTime() - parsed.pushedWithinDays * DAY_MS,
            ).toISOString()
          : null;

      const publicRepos = REPO_FIXTURES.map((fixture) => fixture.summary).filter(
        (repo) => !repo.isPrivate,
      );

      const matched = publicRepos.filter((repo) => {
        if (languageLower && (repo.primaryLanguage?.name.toLowerCase() ?? "") !== languageLower) {
          return false;
        }
        if (parsed.minStars !== undefined && repo.stargazerCount < parsed.minStars) {
          return false;
        }
        if (cutoffIso && (!repo.pushedAt || repo.pushedAt < cutoffIso)) {
          return false;
        }
        if (topicLower && !repo.topics.some((t) => t.toLowerCase() === topicLower)) {
          return false;
        }
        if (keywords.length > 0) {
          const searchable = [
            repo.fullName,
            repo.description ?? "",
            repo.primaryLanguage?.name ?? "",
            ...repo.topics,
          ]
            .join(" ")
            .toLowerCase();
          if (!keywords.every((kw) => searchable.includes(kw))) {
            return false;
          }
        } else if (
          !languageLower &&
          parsed.minStars === undefined &&
          !cutoffIso &&
          !topicLower &&
          repo.stargazerCount < 100
        ) {
          return false;
        }
        return true;
      });

      const sorted = [...matched].sort((a, b) => {
        switch (parsed.sort) {
          case "forks":
            return b.forkCount - a.forkCount;
          case "updated":
            return b.updatedAt.localeCompare(a.updatedAt);
          default:
            return b.stargazerCount - a.stargazerCount;
        }
      });

      const start = (parsed.page - 1) * parsed.perPage;
      const items = sorted.slice(start, start + parsed.perPage);

      return {
        items,
        totalCount: sorted.length,
        incompleteResults: false,
        authenticated: Boolean(cleanToken),
        effectiveQuery,
        page: parsed.page,
        perPage: parsed.perPage,
        hasNextPage: start + parsed.perPage < sorted.length,
        rateLimit: cleanToken ? EMULATOR_RATE_LIMIT : ANONYMOUS_RATE_LIMIT,
      };
    },

    async getRepoDetail(
      token: string | null,
      input: GithubRepoDetailInput & { viewerLogin?: string | null },
      ctx?: AdapterContext,
    ): Promise<GithubRepoDetail> {
      ctx?.signal?.throwIfAborted();
      const cleanToken = assertEmulatorToken(token, false);
      const parsed = GithubRepoDetailInputSchema.parse({
        owner: input.owner,
        repo: input.repo,
        ...(input.forceRefresh !== undefined ? { forceRefresh: input.forceRefresh } : {}),
      });

      const targetFullName = `${parsed.owner}/${parsed.repo}`.toLowerCase();
      const fixture = REPO_FIXTURES.find(
        (candidate) => candidate.summary.fullName.toLowerCase() === targetFullName,
      );
      if (!fixture || (fixture.summary.isPrivate && !cleanToken)) {
        throw new GithubNotFoundError(`Repository ${parsed.owner}/${parsed.repo} not found`);
      }

      const viewerLogin = input.viewerLogin ?? (cleanToken ? "sydney-dev" : null);
      const isViewerOwner = Boolean(
        viewerLogin &&
          fixture.summary.ownerLogin.toLowerCase() === viewerLogin.trim().toLowerCase(),
      );

      return {
        repo: fixture.summary,
        readme: {
          path: "README.md",
          content: fixture.readme,
          truncated: false,
        },
        recentCommits: [
          {
            sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
            shortSha: "a1b2c3d",
            message: `feat(${fixture.summary.name}): refine TypeScript contract validation`,
            authorName: "Sydney Developer",
            authorLogin: fixture.summary.ownerLogin,
            committedAt: fixture.summary.pushedAt,
            htmlUrl: `${fixture.summary.htmlUrl}/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678`,
          },
          {
            sha: "b2c3d4e5f60718293a4b5c6d7e8f90123456789a",
            shortSha: "b2c3d4e",
            message: "test: add deterministic offline emulator coverage",
            authorName: "Sydney Developer",
            authorLogin: fixture.summary.ownerLogin,
            committedAt: "2026-11-12T09:30:00.000Z",
            htmlUrl: `${fixture.summary.htmlUrl}/commit/b2c3d4e5f60718293a4b5c6d7e8f90123456789a`,
          },
        ],
        latestRelease: fixture.release
          ? {
              tagName: fixture.release.tagName,
              name: fixture.release.name,
              publishedAt: fixture.release.publishedAt,
              prerelease: fixture.release.prerelease,
              body: fixture.release.body,
              truncated: false,
              htmlUrl: `${fixture.summary.htmlUrl}/releases/tag/${fixture.release.tagName}`,
            }
          : null,
        isViewerOwner,
        rateLimit: cleanToken ? EMULATOR_RATE_LIMIT : ANONYMOUS_RATE_LIMIT,
      };
    },

    async readRepoPath(
      token: string | null,
      input: GithubReadRepoFileInput,
      ctx?: AdapterContext,
    ): Promise<GithubRepoPathContent> {
      ctx?.signal?.throwIfAborted();
      const cleanToken = assertEmulatorToken(token, false);
      const parsed = GithubReadRepoFileInputSchema.parse(input);

      const targetFullName = `${parsed.owner}/${parsed.repo}`.toLowerCase();
      const fixture = REPO_FIXTURES.find(
        (candidate) => candidate.summary.fullName.toLowerCase() === targetFullName,
      );
      if (!fixture || (fixture.summary.isPrivate && !cleanToken)) {
        throw new GithubNotFoundError(`Repository ${parsed.owner}/${parsed.repo} not found`);
      }

      const rateLimit = cleanToken ? EMULATOR_RATE_LIMIT : ANONYMOUS_RATE_LIMIT;
      const relPath = parsed.path ?? "";

      const directoryEntries = fixture.directories[relPath];
      if (directoryEntries) {
        return {
          kind: "directory",
          path: relPath,
          entries: directoryEntries,
          truncated: false,
          rateLimit,
        };
      }

      const fileContent = fixture.files[relPath];
      if (fileContent !== undefined) {
        return {
          kind: "file",
          path: relPath,
          size: Buffer.byteLength(fileContent, "utf8"),
          content: fileContent,
          truncated: false,
          rateLimit,
        };
      }

      throw new GithubNotFoundError(
        `Path "${relPath || "/"}" not found in ${fixture.summary.fullName}`,
      );
    },
  };
}
