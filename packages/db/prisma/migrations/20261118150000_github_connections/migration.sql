-- Additive: personal GitHub account connection metadata + SecretStore ciphertext pointer.
CREATE TABLE "github_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "authKind" TEXT NOT NULL DEFAULT 'pat',
    "status" TEXT NOT NULL,
    "githubUserId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "htmlUrl" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "highRiskScopes" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "ciphertext" TEXT NOT NULL,
    "invalidMessage" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "github_connections_userId_key" ON "github_connections"("userId");

ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- User-owned Row-Level Security matching payment_wallets and user_voice_credentials.
ALTER TABLE "github_connections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY github_connections_tenant ON "github_connections"
  USING ("userId" = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY github_connections_system ON "github_connections"
  USING (current_setting('app.rls_bypass', true) = 'on');
