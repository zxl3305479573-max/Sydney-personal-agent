import * as z from "zod";
import { IsoDate } from "./ids.js";

/** Read-only GitHub built-in tools exposed to bots when a user connects their GitHub account. */
export const GITHUB_TOOL_NAMES = [
  "github_get_profile",
  "github_list_my_repos",
  "github_search_repos",
  "github_read_repo",
] as const;

export type GithubToolName = (typeof GITHUB_TOOL_NAMES)[number];

/** Classic OAuth scopes that grant destructive or administrative privileges beyond read-only browsing. */
export const GITHUB_HIGH_RISK_SCOPES = [
  "delete_repo",
  "admin:org",
  "write:org",
  "admin:public_key",
  "write:public_key",
  "admin:repo_hook",
  "write:repo_hook",
  "admin:org_hook",
  "admin:gpg_key",
  "admin:ssh_signing_key",
  "workflow",
  "delete:packages",
  "write:packages",
] as const;

export const GithubOwnerSchema = z
  .string()
  .trim()
  .min(1)
  .max(39)
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,
    "Invalid GitHub owner or organization name",
  );

export const GithubRepoNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/, "Invalid GitHub repository name")
  .refine((name) => name !== "." && name !== "..", "Invalid GitHub repository name");

export const GithubRelativePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.endsWith("/") &&
      !value.includes("\\") &&
      !value.includes("\0") &&
      value
        .split("/")
        .every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
    "Use a clean repository-relative path without traversal segments",
  );

export const GithubRateLimitSchema = z.object({
  limit: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  resetAt: IsoDate.nullable(),
});
export type GithubRateLimit = z.infer<typeof GithubRateLimitSchema>;

export const GithubAuthKindSchema = z.enum(["pat", "oauth_device"]);
export type GithubAuthKind = z.infer<typeof GithubAuthKindSchema>;

export const GithubConnectionStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("disconnected") }),
  z.object({
    status: z.literal("connected"),
    authKind: GithubAuthKindSchema,
    githubUserId: z.string(),
    login: z.string(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    htmlUrl: z.string(),
    scopes: z.array(z.string()),
    highRiskScopes: z.array(z.string()),
    connectedAt: IsoDate,
    lastVerifiedAt: IsoDate.nullable(),
    rateLimit: GithubRateLimitSchema.nullable(),
  }),
  z.object({
    status: z.literal("invalid"),
    authKind: GithubAuthKindSchema,
    login: z.string(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    connectedAt: IsoDate,
    message: z.string(),
  }),
]);
export type GithubConnectionStatus = z.infer<typeof GithubConnectionStatusSchema>;

export const GithubConnectInputSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(10, "Enter a valid GitHub Personal Access Token")
      .max(512, "Token is too long")
      .refine((value) => !/\s/.test(value), "Token must not contain whitespace"),
  })
  .strict();
export type GithubConnectInput = z.infer<typeof GithubConnectInputSchema>;

export const GithubContributionLevelSchema = z.enum([
  "NONE",
  "FIRST_QUARTILE",
  "SECOND_QUARTILE",
  "THIRD_QUARTILE",
  "FOURTH_QUARTILE",
]);
export type GithubContributionLevel = z.infer<typeof GithubContributionLevelSchema>;

export const GithubContributionDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contributionCount: z.number().int().nonnegative(),
  contributionLevel: GithubContributionLevelSchema,
  weekday: z.number().int().min(0).max(6),
});
export type GithubContributionDay = z.infer<typeof GithubContributionDaySchema>;

export const GithubContributionWeekSchema = z.object({
  contributionDays: z.array(GithubContributionDaySchema),
});
export type GithubContributionWeek = z.infer<typeof GithubContributionWeekSchema>;

export const GithubContributionCalendarSchema = z.object({
  /** Null represents the rolling past 12 months; an integer represents a specific calendar year. */
  year: z.number().int().min(2008).max(2100).nullable(),
  from: IsoDate,
  to: IsoDate,
  availableYears: z.array(z.number().int().min(2008).max(2100)),
  totalContributions: z.number().int().nonnegative(),
  totalCommitContributions: z.number().int().nonnegative(),
  totalPullRequestContributions: z.number().int().nonnegative(),
  totalIssueContributions: z.number().int().nonnegative(),
  totalPullRequestReviewContributions: z.number().int().nonnegative(),
  restrictedContributionsCount: z.number().int().nonnegative(),
  currentStreakDays: z.number().int().nonnegative(),
  longestStreakDays: z.number().int().nonnegative(),
  weeks: z.array(GithubContributionWeekSchema),
});
export type GithubContributionCalendar = z.infer<typeof GithubContributionCalendarSchema>;

export const GithubProfileSchema = z.object({
  githubUserId: z.string(),
  login: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  blogUrl: z.string().nullable(),
  twitterUsername: z.string().nullable(),
  htmlUrl: z.string(),
  followers: z.number().int().nonnegative(),
  following: z.number().int().nonnegative(),
  publicRepos: z.number().int().nonnegative(),
  totalPrivateRepos: z.number().int().nonnegative().nullable(),
  createdAt: IsoDate,
});
export type GithubProfile = z.infer<typeof GithubProfileSchema>;

export const GithubLanguageBadgeSchema = z.object({
  name: z.string(),
  color: z.string().nullable(),
});
export type GithubLanguageBadge = z.infer<typeof GithubLanguageBadgeSchema>;

export const GithubRepoSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerLogin: z.string(),
  ownerAvatarUrl: z.string().nullable(),
  fullName: z.string(),
  description: z.string().nullable(),
  htmlUrl: z.string(),
  homepageUrl: z.string().nullable(),
  cloneUrl: z.string(),
  sshUrl: z.string(),
  isPrivate: z.boolean(),
  isFork: z.boolean(),
  isArchived: z.boolean(),
  defaultBranch: z.string(),
  primaryLanguage: GithubLanguageBadgeSchema.nullable(),
  stargazerCount: z.number().int().nonnegative(),
  forkCount: z.number().int().nonnegative(),
  openIssuesCount: z.number().int().nonnegative(),
  topics: z.array(z.string()),
  licenseSpdxId: z.string().nullable(),
  pushedAt: IsoDate.nullable(),
  updatedAt: IsoDate,
});
export type GithubRepoSummary = z.infer<typeof GithubRepoSummarySchema>;

export const GithubProfileOverviewInputSchema = z
  .object({
    year: z.number().int().min(2008).max(2100).optional(),
    forceRefresh: z.boolean().optional(),
  })
  .strict();
export type GithubProfileOverviewInput = z.infer<typeof GithubProfileOverviewInputSchema>;

export const GithubProfileOverviewSchema = z.object({
  profile: GithubProfileSchema,
  calendar: GithubContributionCalendarSchema,
  pinnedRepos: z.array(GithubRepoSummarySchema),
  recentRepos: z.array(GithubRepoSummarySchema),
  rateLimit: GithubRateLimitSchema.nullable(),
});
export type GithubProfileOverview = z.infer<typeof GithubProfileOverviewSchema>;

export const GithubRepoAffiliationSchema = z.enum([
  "all",
  "owner",
  "collaborator",
  "organization_member",
]);
export type GithubRepoAffiliation = z.infer<typeof GithubRepoAffiliationSchema>;

export const GithubRepoVisibilityFilterSchema = z.enum([
  "all",
  "public",
  "private",
  "fork",
  "archived",
]);
export type GithubRepoVisibilityFilter = z.infer<typeof GithubRepoVisibilityFilterSchema>;

export const GithubRepoSortSchema = z.enum(["pushed", "updated", "full_name", "stars"]);
export type GithubRepoSort = z.infer<typeof GithubRepoSortSchema>;

export const GithubListMyReposInputSchema = z
  .object({
    query: z.string().trim().max(120).optional(),
    affiliation: GithubRepoAffiliationSchema.default("all"),
    visibility: GithubRepoVisibilityFilterSchema.default("all"),
    language: z.string().trim().max(48).optional(),
    sort: GithubRepoSortSchema.default("pushed"),
    page: z.number().int().min(1).max(50).default(1),
    perPage: z.number().int().min(1).max(50).default(24),
    forceRefresh: z.boolean().optional(),
  })
  .strict();
export type GithubListMyReposInput = z.infer<typeof GithubListMyReposInputSchema>;

export const GithubRepoPageSchema = z.object({
  items: z.array(GithubRepoSummarySchema),
  page: z.number().int().min(1),
  perPage: z.number().int().min(1),
  hasNextPage: z.boolean(),
  totalCount: z.number().int().nonnegative().nullable(),
  rateLimit: GithubRateLimitSchema.nullable(),
});
export type GithubRepoPage = z.infer<typeof GithubRepoPageSchema>;

export const GithubSearchSortSchema = z.enum(["best-match", "stars", "forks", "updated"]);
export type GithubSearchSort = z.infer<typeof GithubSearchSortSchema>;

export const GithubSearchReposInputSchema = z
  .object({
    query: z.string().trim().max(200).default(""),
    language: z.string().trim().max(48).optional(),
    minStars: z.number().int().min(0).max(10_000_000).optional(),
    pushedWithinDays: z.number().int().min(1).max(3650).optional(),
    topic: z
      .string()
      .trim()
      .max(64)
      .regex(/^[A-Za-z0-9-]*$/, "Topics only allow letters, numbers, and hyphens")
      .optional(),
    sort: GithubSearchSortSchema.default("best-match"),
    page: z.number().int().min(1).max(20).default(1),
    perPage: z.number().int().min(1).max(50).default(20),
  })
  .strict();
export type GithubSearchReposInput = z.infer<typeof GithubSearchReposInputSchema>;

export const GithubSearchReposOutputSchema = z.object({
  items: z.array(GithubRepoSummarySchema),
  totalCount: z.number().int().nonnegative(),
  incompleteResults: z.boolean(),
  authenticated: z.boolean(),
  effectiveQuery: z.string(),
  page: z.number().int().min(1),
  perPage: z.number().int().min(1),
  hasNextPage: z.boolean(),
  rateLimit: GithubRateLimitSchema.nullable(),
});
export type GithubSearchReposOutput = z.infer<typeof GithubSearchReposOutputSchema>;

export const GithubRepoDetailInputSchema = z
  .object({
    owner: GithubOwnerSchema,
    repo: GithubRepoNameSchema,
    forceRefresh: z.boolean().optional(),
  })
  .strict();
export type GithubRepoDetailInput = z.infer<typeof GithubRepoDetailInputSchema>;

export const GithubCommitSummarySchema = z.object({
  sha: z.string(),
  shortSha: z.string(),
  message: z.string(),
  authorName: z.string(),
  authorLogin: z.string().nullable(),
  committedAt: IsoDate.nullable(),
  htmlUrl: z.string(),
});
export type GithubCommitSummary = z.infer<typeof GithubCommitSummarySchema>;

export const GithubReleaseSummarySchema = z.object({
  tagName: z.string(),
  name: z.string().nullable(),
  publishedAt: IsoDate.nullable(),
  prerelease: booleanSchema(),
  body: z.string(),
  truncated: z.boolean(),
  htmlUrl: z.string(),
});
export type GithubReleaseSummary = z.infer<typeof GithubReleaseSummarySchema>;

function booleanSchema() {
  return z.boolean();
}

export const GithubReadmePreviewSchema = z.object({
  path: z.string(),
  content: z.string(),
  truncated: z.boolean(),
});
export type GithubReadmePreview = z.infer<typeof GithubReadmePreviewSchema>;

export const GithubRepoDetailSchema = z.object({
  repo: GithubRepoSummarySchema,
  readme: GithubReadmePreviewSchema.nullable(),
  recentCommits: z.array(GithubCommitSummarySchema),
  latestRelease: GithubReleaseSummarySchema.nullable(),
  isViewerOwner: z.boolean(),
  rateLimit: GithubRateLimitSchema.nullable(),
});
export type GithubRepoDetail = z.infer<typeof GithubRepoDetailSchema>;

export const GithubReadRepoFileInputSchema = z
  .object({
    owner: GithubOwnerSchema,
    repo: GithubRepoNameSchema,
    path: GithubRelativePathSchema.optional(),
    ref: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._/-]+$/, "Invalid Git ref")
      .optional(),
  })
  .strict();
export type GithubReadRepoFileInput = z.infer<typeof GithubReadRepoFileInputSchema>;

export const GithubRepoDirectoryEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["file", "dir", "symlink", "submodule"]),
  size: z.number().int().nonnegative(),
});
export type GithubRepoDirectoryEntry = z.infer<typeof GithubRepoDirectoryEntrySchema>;

export const GithubRepoPathContentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("directory"),
    path: z.string(),
    entries: z.array(GithubRepoDirectoryEntrySchema),
    truncated: z.boolean(),
    rateLimit: GithubRateLimitSchema.nullable(),
  }),
  z.object({
    kind: z.literal("file"),
    path: z.string(),
    size: z.number().int().nonnegative(),
    content: z.string(),
    truncated: z.boolean(),
    rateLimit: GithubRateLimitSchema.nullable(),
  }),
]);
export type GithubRepoPathContent = z.infer<typeof GithubRepoPathContentSchema>;
