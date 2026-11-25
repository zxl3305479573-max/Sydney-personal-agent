import { describe, expect, it } from "vitest";
import {
  GITHUB_TOOL_NAMES,
  GithubConnectInputSchema,
  GithubOwnerSchema,
  GithubRelativePathSchema,
  GithubRepoNameSchema,
  GithubSearchReposInputSchema,
  isBuiltinToolName,
} from "./index.js";

describe("GitHub contract schemas", () => {
  it("registers all read-only GitHub tools in BUILTIN_TOOL_NAMES", () => {
    for (const name of GITHUB_TOOL_NAMES) {
      expect(isBuiltinToolName(name)).toBe(true);
    }
  });

  it("validates owner, repo, and relative paths against traversal or invalid segments", () => {
    expect(GithubOwnerSchema.safeParse("vercel").success).toBe(true);
    expect(GithubOwnerSchema.safeParse("sydney-ai").success).toBe(true);
    expect(GithubOwnerSchema.safeParse("-leading-hyphen").success).toBe(false);
    expect(GithubOwnerSchema.safeParse("owner/repo").success).toBe(false);

    expect(GithubRepoNameSchema.safeParse("next.js").success).toBe(true);
    expect(GithubRepoNameSchema.safeParse("..").success).toBe(false);
    expect(GithubRepoNameSchema.safeParse(".").success).toBe(false);
    expect(GithubRepoNameSchema.safeParse("bad/repo").success).toBe(false);

    expect(GithubRelativePathSchema.safeParse("packages/core/README.md").success).toBe(true);
    expect(GithubRelativePathSchema.safeParse("../etc/passwd").success).toBe(false);
    expect(GithubRelativePathSchema.safeParse("src/../secret.ts").success).toBe(false);
    expect(GithubRelativePathSchema.safeParse("/leading-slash.md").success).toBe(false);
  });

  it("rejects whitespace or overly short tokens in GithubConnectInputSchema", () => {
    expect(GithubConnectInputSchema.safeParse({ token: "ghp_1234567890abcdef" }).success).toBe(
      true,
    );
    expect(GithubConnectInputSchema.safeParse({ token: "short" }).success).toBe(false);
    expect(GithubConnectInputSchema.safeParse({ token: "ghp_has space1234" }).success).toBe(false);
  });

  it("validates open-source search filters", () => {
    const parsed = GithubSearchReposInputSchema.parse({
      query: "personal agent",
      language: "TypeScript",
      minStars: 100,
      pushedWithinDays: 90,
      topic: "ai-agent",
    });
    expect(parsed.sort).toBe("best-match");
    expect(parsed.page).toBe(1);
    expect(
      GithubSearchReposInputSchema.safeParse({
        query: "agent",
        topic: "invalid space topic",
      }).success,
    ).toBe(false);
  });
});
