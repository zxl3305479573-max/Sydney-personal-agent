import type {
  AdapterContext,
  GithubAccountActor,
  GithubAccountService,
  GithubProvider,
  SecretStore,
} from "@rakazo/adapter-kit";
import {
  GithubAuthInvalidError,
  GithubUpstreamError,
  SecretStoreUnavailableError,
} from "@rakazo/adapter-kit";
import type {
  GithubAuthKind,
  GithubConnectionStatus,
  GithubListMyReposInput,
  GithubProfileOverview,
  GithubProfileOverviewInput,
  GithubRateLimit,
  GithubRepoDetail,
  GithubRepoDetailInput,
  GithubRepoPage,
  GithubSearchReposInput,
  GithubSearchReposOutput,
} from "@rakazo/contracts";
import { GithubAuthKindSchema, GithubConnectInputSchema } from "@rakazo/contracts";
import type { GithubConnection, Prisma, PrismaClient } from "@rakazo/db";
import { createHttpGithubProvider, redactGithubSecrets } from "./github-client.js";
import { createGithubEmulator } from "./github-emulator.js";
import { deleteSecretBestEffort, holdSecretNotifications } from "./secret-store-factory.js";

export interface GithubAccountDeps {
  prisma: PrismaClient;
  secretStore: SecretStore;
  github: GithubProvider | null | undefined;
}

type GithubSecretMaterial = {
  token: string;
};

const PROVIDER_TIMEOUT_MS = 20_000;
const DISCONNECTED_STATUS: GithubConnectionStatus = { status: "disconnected" };

export function createGithubProvider(
  env: { GITHUB_PROVIDER?: string; fetchImpl?: typeof fetch } = process.env,
): GithubProvider | null {
  const requested = env?.GITHUB_PROVIDER?.trim().toLowerCase();
  if (requested === "none") return null;
  if (requested === "emulator") return createGithubEmulator();
  if (!requested || requested === "github") {
    return createHttpGithubProvider({ fetchImpl: env?.fetchImpl });
  }
  throw new Error(`Unknown GitHub provider "${requested}"`);
}

function recordId(userId: string): string {
  return `github-connection:${userId}`;
}

function providerContext(actor: GithubAccountActor, operation: string): AdapterContext {
  return {
    operationId: `github-connection.${operation}`,
    traceId: `github-connection.${operation}`,
    spaceId: actor.spaceId,
    userId: actor.userId,
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  };
}

function lockGithubConnection(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('github-connection'), hashtext(${userId}))`;
}

async function storeMaterial(
  deps: GithubAccountDeps,
  actor: GithubAccountActor,
  material: GithubSecretMaterial,
): Promise<string> {
  const stored = await deps.secretStore.put(
    JSON.stringify(material),
    providerContext(actor, "persist"),
    { recordId: recordId(actor.userId) },
  );
  return stored.ciphertext;
}

async function readMaterial(
  deps: GithubAccountDeps,
  row: Pick<GithubConnection, "userId" | "ciphertext">,
): Promise<GithubSecretMaterial | null> {
  if (!row.ciphertext) return null;
  try {
    const raw = await deps.secretStore.load(row.ciphertext, {
      recordId: recordId(row.userId),
    });
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Record<string, unknown>).token === "string" &&
      ((parsed as Record<string, unknown>).token as string).trim().length > 0
    ) {
      return { token: ((parsed as Record<string, unknown>).token as string).trim() };
    }
    return null;
  } catch (error) {
    if (error instanceof SecretStoreUnavailableError) throw error;
    return null;
  }
}

function dropSecret(deps: GithubAccountDeps, userId: string, ciphertext: string): Promise<void> {
  if (!ciphertext) return Promise.resolve();
  return deleteSecretBestEffort(deps.secretStore, ciphertext, recordId(userId));
}

async function currentConnection(
  deps: GithubAccountDeps,
  userId: string,
): Promise<GithubConnection | null> {
  if (!deps.github || !deps.prisma.githubConnection?.findUnique) return null;
  const row = await deps.prisma.githubConnection.findUnique({ where: { userId } });
  return row && row.provider === deps.github.describe().id ? row : null;
}

function normalizeAuthKind(raw: string): GithubAuthKind {
  const parsed = GithubAuthKindSchema.safeParse(raw);
  return parsed.success ? parsed.data : "pat";
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

function statusFromRow(
  row: GithubConnection | null,
  rateLimit: GithubRateLimit | null = null,
): GithubConnectionStatus {
  if (!row) return DISCONNECTED_STATUS;

  if (row.status === "connected") {
    return {
      status: "connected",
      authKind: normalizeAuthKind(row.authKind),
      githubUserId: row.githubUserId,
      login: row.login,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      htmlUrl: row.htmlUrl,
      scopes: parseStringArray(row.scopes),
      highRiskScopes: parseStringArray(row.highRiskScopes),
      connectedAt: row.connectedAt.toISOString(),
      lastVerifiedAt: row.lastVerifiedAt ? row.lastVerifiedAt.toISOString() : null,
      rateLimit,
    };
  }

  if (row.status === "invalid") {
    return {
      status: "invalid",
      authKind: normalizeAuthKind(row.authKind),
      login: row.login,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      connectedAt: row.connectedAt.toISOString(),
      message: row.invalidMessage ?? "GitHub Personal Access Token is invalid or expired",
    };
  }

  return DISCONNECTED_STATUS;
}

export async function markGithubConnectionInvalid(
  deps: GithubAccountDeps,
  row: Pick<GithubConnection, "id" | "userId" | "ciphertext">,
  error: GithubAuthInvalidError,
  rejectedToken?: string | null,
): Promise<void> {
  if (!row.ciphertext) return;
  const safeMessage =
    redactGithubSecrets(error.message, rejectedToken).trim() ||
    "GitHub Personal Access Token is invalid or expired";

  const updated = await deps.prisma.$transaction(async (tx) => {
    await lockGithubConnection(tx, row.userId);
    return tx.githubConnection.updateMany({
      where: { id: row.id, ciphertext: row.ciphertext },
      data: {
        status: "invalid",
        invalidMessage: safeMessage,
        ciphertext: "",
      },
    });
  });

  if (updated.count > 0) {
    await dropSecret(deps, row.userId, row.ciphertext);
    deps.github?.evictUserCache?.(row.userId);
  }
}

export async function hasConnectedGithubAccount(
  deps: GithubAccountDeps,
  userId: string,
): Promise<boolean> {
  const row = await currentConnection(deps, userId);
  return row?.status === "connected";
}

export async function loadConnectedGithubAuthWithRow(
  deps: GithubAccountDeps,
  actor: GithubAccountActor,
): Promise<{
  token: string;
  login: string;
  row: GithubConnection;
} | null> {
  const row = await currentConnection(deps, actor.userId);
  if (row?.status !== "connected") return null;

  const material = await readMaterial(deps, row);
  if (!material) {
    await markGithubConnectionInvalid(
      deps,
      row,
      new GithubAuthInvalidError("Stored GitHub credential could not be decrypted"),
    );
    return null;
  }

  return { token: material.token, login: row.login, row };
}

export async function loadConnectedGithubAuth(
  deps: GithubAccountDeps,
  actor: GithubAccountActor,
): Promise<{ token: string; login: string } | null> {
  const loaded = await loadConnectedGithubAuthWithRow(deps, actor);
  if (!loaded) return null;
  return { token: loaded.token, login: loaded.login };
}

function requireProvider(deps: GithubAccountDeps): GithubProvider {
  if (!deps.github) {
    throw new GithubUpstreamError("GitHub integration is disabled");
  }
  return deps.github;
}

export function createGithubAccountService(deps: GithubAccountDeps): GithubAccountService {
  return {
    async getStatus(
      actor: GithubAccountActor,
      options?: { verifyRemote?: boolean },
    ): Promise<GithubConnectionStatus> {
      const provider = deps.github;
      const row = await currentConnection(deps, actor.userId);
      if (!provider || !row) return DISCONNECTED_STATUS;

      if (row.status !== "connected" || !options?.verifyRemote) {
        return statusFromRow(row);
      }

      const material = await readMaterial(deps, row);
      if (!material) {
        const invalidErr = new GithubAuthInvalidError(
          "Stored GitHub credential could not be decrypted",
        );
        await markGithubConnectionInvalid(deps, row, invalidErr);
        return statusFromRow(await currentConnection(deps, actor.userId));
      }

      try {
        const verified = await provider.verifyToken(
          material.token,
          providerContext(actor, "verify"),
        );
        const verifiedAt = new Date();
        await deps.prisma.githubConnection.updateMany({
          where: { id: row.id, ciphertext: row.ciphertext },
          data: {
            githubUserId: verified.githubUserId,
            login: verified.login,
            displayName: verified.displayName,
            avatarUrl: verified.avatarUrl,
            htmlUrl: verified.htmlUrl,
            scopes: verified.scopes,
            highRiskScopes: verified.highRiskScopes,
            lastVerifiedAt: verifiedAt,
            invalidMessage: null,
          },
        });
        const latest = await currentConnection(deps, actor.userId);
        return statusFromRow(latest, verified.rateLimit);
      } catch (error) {
        if (error instanceof GithubAuthInvalidError) {
          await markGithubConnectionInvalid(deps, row, error, material.token);
          return statusFromRow(await currentConnection(deps, actor.userId));
        }
        throw error;
      }
    },

    async connect(actor: GithubAccountActor, rawToken: string): Promise<GithubConnectionStatus> {
      const provider = requireProvider(deps);
      let token: string;
      const parsedInput = GithubConnectInputSchema.safeParse({ token: rawToken });
      if (!parsedInput.success) {
        const firstIssue = parsedInput.error.issues[0]?.message;
        throw new GithubAuthInvalidError(
          firstIssue ?? "Enter a valid GitHub Personal Access Token",
        );
      }
      token = parsedInput.data.token;

      const identity = await provider.verifyToken(token, providerContext(actor, "connect"));
      const now = new Date();

      const saved = await holdSecretNotifications(async () => {
        const ciphertext = await storeMaterial(deps, actor, { token });
        const fields = {
          provider: provider.describe().id,
          authKind: "pat",
          status: "connected",
          githubUserId: identity.githubUserId,
          login: identity.login,
          displayName: identity.displayName,
          avatarUrl: identity.avatarUrl,
          htmlUrl: identity.htmlUrl,
          scopes: identity.scopes,
          highRiskScopes: identity.highRiskScopes,
          ciphertext,
          invalidMessage: null,
          connectedAt: now,
          lastVerifiedAt: now,
        };

        try {
          return await deps.prisma.$transaction(async (tx) => {
            await lockGithubConnection(tx, actor.userId);
            const previous = await tx.githubConnection.findUnique({
              where: { userId: actor.userId },
            });
            const row = await tx.githubConnection.upsert({
              where: { userId: actor.userId },
              create: { userId: actor.userId, ...fields },
              update: fields,
            });
            return { row, previousCiphertext: previous?.ciphertext ?? null, ciphertext };
          });
        } catch (error) {
          await dropSecret(deps, actor.userId, ciphertext);
          throw error;
        }
      });

      if (saved.previousCiphertext && saved.previousCiphertext !== saved.ciphertext) {
        await dropSecret(deps, actor.userId, saved.previousCiphertext);
      }
      provider.evictUserCache?.(actor.userId);

      return statusFromRow(saved.row, identity.rateLimit);
    },

    async disconnect(actor: GithubAccountActor): Promise<GithubConnectionStatus> {
      const previous = await deps.prisma.$transaction(async (tx) => {
        await lockGithubConnection(tx, actor.userId);
        const existing = await tx.githubConnection.findUnique({
          where: { userId: actor.userId },
        });
        await tx.githubConnection.deleteMany({ where: { userId: actor.userId } });
        return existing;
      });

      if (previous?.ciphertext) {
        await dropSecret(deps, actor.userId, previous.ciphertext);
      }
      deps.github?.evictUserCache?.(actor.userId);
      return DISCONNECTED_STATUS;
    },

    async getProfileOverview(
      actor: GithubAccountActor,
      input: GithubProfileOverviewInput,
    ): Promise<GithubProfileOverview> {
      const provider = requireProvider(deps);
      const auth = await loadConnectedGithubAuthWithRow(deps, actor);
      if (!auth) {
        throw new GithubAuthInvalidError("Connect your GitHub account first");
      }

      try {
        return await provider.getProfileOverview(
          auth.token,
          input,
          providerContext(actor, "profile"),
        );
      } catch (error) {
        if (error instanceof GithubAuthInvalidError) {
          await markGithubConnectionInvalid(deps, auth.row, error, auth.token);
        }
        throw error;
      }
    },

    async listMyRepos(
      actor: GithubAccountActor,
      input: GithubListMyReposInput,
    ): Promise<GithubRepoPage> {
      const provider = requireProvider(deps);
      const auth = await loadConnectedGithubAuthWithRow(deps, actor);
      if (!auth) {
        throw new GithubAuthInvalidError("Connect your GitHub account first");
      }

      try {
        return await provider.listMyRepos(auth.token, input, providerContext(actor, "repos"));
      } catch (error) {
        if (error instanceof GithubAuthInvalidError) {
          await markGithubConnectionInvalid(deps, auth.row, error, auth.token);
        }
        throw error;
      }
    },

    async searchRepos(
      actor: GithubAccountActor,
      input: GithubSearchReposInput,
    ): Promise<GithubSearchReposOutput> {
      const provider = requireProvider(deps);
      const ctx = providerContext(actor, "search");
      const auth = await loadConnectedGithubAuthWithRow(deps, actor);

      if (!auth) {
        return provider.searchRepos(null, input, ctx);
      }

      try {
        return await provider.searchRepos(auth.token, input, ctx);
      } catch (error) {
        if (error instanceof GithubAuthInvalidError) {
          await markGithubConnectionInvalid(deps, auth.row, error, auth.token);
          return provider.searchRepos(null, input, ctx);
        }
        throw error;
      }
    },

    async getRepoDetail(
      actor: GithubAccountActor,
      input: GithubRepoDetailInput,
    ): Promise<GithubRepoDetail> {
      const provider = requireProvider(deps);
      const ctx = providerContext(actor, "repo-detail");
      const auth = await loadConnectedGithubAuthWithRow(deps, actor);

      if (!auth) {
        return provider.getRepoDetail(null, { ...input, viewerLogin: null }, ctx);
      }

      try {
        return await provider.getRepoDetail(auth.token, { ...input, viewerLogin: auth.login }, ctx);
      } catch (error) {
        if (error instanceof GithubAuthInvalidError) {
          await markGithubConnectionInvalid(deps, auth.row, error, auth.token);
        }
        throw error;
      }
    },
  };
}
