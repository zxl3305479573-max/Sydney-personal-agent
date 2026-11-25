BEGIN;

CREATE UNIQUE INDEX computers_project_owner_key ON public.computers ("id", "spaceId", "userId");

CREATE TABLE public.project_cloud_directory_bindings (
  "projectId" TEXT PRIMARY KEY,
  "spaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "computerId" TEXT NOT NULL,
  "grantId" TEXT NOT NULL UNIQUE,
  "providerRef" TEXT NOT NULL,
  "folder" JSONB NOT NULL,
  "intent" TEXT NOT NULL CHECK ("intent" IN ('read-only', 'read-write')),
  CONSTRAINT project_cloud_directory_project_fkey FOREIGN KEY ("projectId", "spaceId", "userId")
    REFERENCES public.project_workspaces ("id", "spaceId", "userId") ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT project_cloud_directory_computer_fkey FOREIGN KEY ("computerId", "spaceId", "userId")
    REFERENCES public.computers ("id", "spaceId", "userId") ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX project_cloud_directory_project_owner_key
  ON public.project_cloud_directory_bindings ("projectId", "spaceId", "userId");

ALTER TABLE public.project_cloud_directory_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_cloud_directory_owner ON public.project_cloud_directory_bindings
  USING (
    (SELECT app_rls_bypass()) OR (
      "spaceId" = NULLIF(current_setting('app.space_id', true), '')
      AND "userId" = NULLIF(current_setting('app.user_id', true), '')
      AND "projectId" = NULLIF(current_setting('app.project_workspace_id', true), '')
      AND EXISTS (
        SELECT 1 FROM public.project_workspaces w
        JOIN public.spaces s ON s."id" = w."spaceId"
        JOIN public.space_members m ON m."spaceId" = w."spaceId" AND m."userId" = w."userId"
        WHERE (w."id", w."spaceId", w."userId") =
          (project_cloud_directory_bindings."projectId", project_cloud_directory_bindings."spaceId",
           project_cloud_directory_bindings."userId")
          AND w."deletingAt" IS NULL AND s."deletingAt" IS NULL
      )
    )
  );

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rakazo_app') THEN
    GRANT SELECT, INSERT, DELETE ON TABLE public.project_cloud_directory_bindings TO rakazo_app;
  END IF;
END $$;

COMMIT;
