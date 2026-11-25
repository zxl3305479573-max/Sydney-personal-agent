CREATE UNIQUE INDEX "user_devices_id_userId_key" ON "user_devices"("id", "userId");

CREATE TABLE "project_directory_bindings" (
  "projectId" TEXT NOT NULL PRIMARY KEY,
  "spaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "grantId" TEXT NOT NULL UNIQUE,
  "directoryName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_directory_bindings_project_fkey"
    FOREIGN KEY ("projectId", "spaceId", "userId")
    REFERENCES "project_workspaces" ("id", "spaceId", "userId")
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "project_directory_bindings_device_fkey"
    FOREIGN KEY ("deviceId", "userId") REFERENCES "user_devices" ("id", "userId")
    ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE INDEX "project_directory_bindings_spaceId_userId_idx"
  ON "project_directory_bindings"("spaceId", "userId");
CREATE UNIQUE INDEX "project_directory_bindings_projectId_spaceId_userId_key"
  ON "project_directory_bindings"("projectId", "spaceId", "userId");

ALTER TABLE "project_directory_bindings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_directory_bindings_tenant ON "project_directory_bindings"
  USING (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "projectId" = NULLIF(current_setting('app.project_workspace_id', true), '')
    AND EXISTS (
      SELECT 1 FROM "project_workspaces" w
      JOIN "spaces" s ON s."id" = w."spaceId"
      JOIN "space_members" m ON m."spaceId" = w."spaceId" AND m."userId" = w."userId"
      WHERE w."id" = "project_directory_bindings"."projectId"
        AND w."spaceId" = "project_directory_bindings"."spaceId"
        AND w."userId" = "project_directory_bindings"."userId"
        AND w."deletingAt" IS NULL AND s."deletingAt" IS NULL
    )
  ) WITH CHECK (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "projectId" = NULLIF(current_setting('app.project_workspace_id', true), '')
    AND EXISTS (
      SELECT 1 FROM "project_workspaces" w
      JOIN "spaces" s ON s."id" = w."spaceId"
      JOIN "space_members" m ON m."spaceId" = w."spaceId" AND m."userId" = w."userId"
      WHERE w."id" = "project_directory_bindings"."projectId"
        AND w."spaceId" = "project_directory_bindings"."spaceId"
        AND w."userId" = "project_directory_bindings"."userId"
        AND w."deletingAt" IS NULL AND s."deletingAt" IS NULL
    )
  );
CREATE POLICY project_directory_bindings_system ON "project_directory_bindings"
  USING ((SELECT app_rls_bypass())) WITH CHECK ((SELECT app_rls_bypass()));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rakazo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "project_directory_bindings" TO rakazo_app;
  END IF;
END $$;
