CREATE TABLE "personality_presets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "selections" JSONB NOT NULL DEFAULT '[]',
    "instructions" TEXT NOT NULL,
    "customInstructions" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'custom',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personality_presets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "personality_presets_userId_name_key"
ON "personality_presets"("userId", "name");

CREATE INDEX "personality_presets_userId_updatedAt_idx"
ON "personality_presets"("userId", "updatedAt");

ALTER TABLE "personality_presets"
ADD CONSTRAINT "personality_presets_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "personality_presets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY personality_presets_tenant ON "personality_presets"
  USING ("userId" = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK ("userId" = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY personality_presets_system ON "personality_presets"
  USING (current_setting('app.rls_bypass', true) = 'on');
