CREATE TABLE "project_workspaces" (
  "id" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "deletingAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_workspaces_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_workspaces_owner_fkey"
    FOREIGN KEY ("spaceId", "userId")
    REFERENCES "space_members" ("spaceId", "userId")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "project_workspaces_id_spaceId_userId_key"
  ON "project_workspaces"("id", "spaceId", "userId");
CREATE INDEX "project_workspaces_spaceId_userId_createdAt_id_idx"
  ON "project_workspaces"("spaceId", "userId", "createdAt", "id");

ALTER TABLE "project_workspaces" ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_workspaces_tenant ON "project_workspaces"
  USING (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND "userId" = NULLIF(current_setting('app.user_id', true), '')
  )
  WITH CHECK (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND "userId" = NULLIF(current_setting('app.user_id', true), '')
  );
CREATE POLICY project_workspaces_system ON "project_workspaces"
  USING ((SELECT app_rls_bypass()))
  WITH CHECK ((SELECT app_rls_bypass()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rakazo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "project_workspaces" TO rakazo_app;
  END IF;
END $$;
