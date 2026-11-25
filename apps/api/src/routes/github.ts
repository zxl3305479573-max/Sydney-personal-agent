import { ORPCError } from "@orpc/server";
import {
  GithubAuthInvalidError,
  GithubNotFoundError,
  GithubRateLimitedError,
  GithubScopeInsufficientError,
  GithubUpstreamError,
} from "@rakazo/adapter-kit";
import { GithubListMyReposInputSchema } from "@rakazo/contracts";
import type { RouterContext } from "./context.js";

const GITHUB_DISABLED_MESSAGE = "GitHub integration is not enabled.";

function sanitize(message: string): string {
  return message
    .replace(/github_pat_[A-Za-z0-9_]+/g, "[REDACTED]")
    .replace(/ghp_[A-Za-z0-9_]+/g, "[REDACTED]")
    .replace(/gh[ousr]_[A-Za-z0-9_]+/g, "[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

function mapGithubError(error: unknown): never {
  if (error instanceof ORPCError) throw error;
  if (error instanceof GithubAuthInvalidError) {
    throw new ORPCError("BAD_REQUEST", { message: sanitize(error.message) });
  }
  if (error instanceof GithubScopeInsufficientError) {
    throw new ORPCError("FORBIDDEN", { message: sanitize(error.message) });
  }
  if (error instanceof GithubNotFoundError) {
    throw new ORPCError("NOT_FOUND", { message: sanitize(error.message) });
  }
  if (error instanceof GithubRateLimitedError) {
    throw new ORPCError("TOO_MANY_REQUESTS", { message: sanitize(error.message) });
  }
  if (error instanceof GithubUpstreamError) {
    throw new ORPCError("BAD_GATEWAY", { message: sanitize(error.message) });
  }
  throw error;
}

async function runGithub<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return mapGithubError(error);
  }
}

export function githubRoutes(ctx: RouterContext) {
  const { deps, authed } = ctx;
  const requireGithub = () => {
    if (!deps.github) {
      throw new ORPCError("NOT_FOUND", { message: GITHUB_DISABLED_MESSAGE });
    }
    return deps.github;
  };

  return {
    github: {
      status: authed.github.status.handler(({ context, input }) => {
        if (!deps.github) return { status: "disconnected" as const };
        const github = deps.github;
        return runGithub(() =>
          github.getStatus(context.actor, { verifyRemote: input?.verifyRemote }),
        );
      }),
      connect: authed.github.connect.handler(({ context, input }) => {
        const github = requireGithub();
        return runGithub(() => github.connect(context.actor, input.token));
      }),
      disconnect: authed.github.disconnect.handler(({ context }) => {
        if (!deps.github) return { status: "disconnected" as const };
        const github = deps.github;
        return runGithub(() => github.disconnect(context.actor));
      }),
      profileOverview: authed.github.profileOverview.handler(({ context, input }) => {
        const github = requireGithub();
        return runGithub(() => github.getProfileOverview(context.actor, input ?? {}));
      }),
      listMyRepos: authed.github.listMyRepos.handler(({ context, input }) => {
        const github = requireGithub();
        return runGithub(() =>
          github.listMyRepos(context.actor, GithubListMyReposInputSchema.parse(input ?? {})),
        );
      }),
      searchRepos: authed.github.searchRepos.handler(({ context, input }) => {
        const github = requireGithub();
        return runGithub(() => github.searchRepos(context.actor, input));
      }),
      repoDetail: authed.github.repoDetail.handler(({ context, input }) => {
        const github = requireGithub();
        return runGithub(() => github.getRepoDetail(context.actor, input));
      }),
    },
  };
}
