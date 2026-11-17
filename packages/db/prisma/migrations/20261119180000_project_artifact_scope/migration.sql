BEGIN;

ALTER TABLE public.artifacts
  ADD COLUMN "projectWorkspaceId" TEXT,
  ADD CONSTRAINT artifacts_project_workspace_owner_fkey
    FOREIGN KEY ("projectWorkspaceId", "spaceId", "userId")
    REFERENCES public.project_workspaces ("id", "spaceId", "userId")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT artifacts_project_scope_disabled
    CHECK ("projectWorkspaceId" IS NULL);

CREATE INDEX artifacts_project_scope_idx
  ON public.artifacts ("spaceId", "userId", "projectWorkspaceId", "createdAt", "id");

CREATE POLICY artifacts_project_scope ON public.artifacts AS RESTRICTIVE
  USING (
    (SELECT app_rls_bypass())
    OR (
      "projectWorkspaceId" IS NOT DISTINCT FROM
        NULLIF(current_setting('app.project_workspace_id', true), '')
      AND (
        "projectWorkspaceId" IS NULL
        OR (
          "spaceId" = NULLIF(current_setting('app.space_id', true), '')
          AND "userId" = NULLIF(current_setting('app.user_id', true), '')
          AND EXISTS (
            SELECT 1 FROM public.project_workspaces w
            JOIN public.space_members m ON m."spaceId" = w."spaceId" AND m."userId" = w."userId"
            JOIN public.spaces s ON s."id" = w."spaceId"
            WHERE w."id" = artifacts."projectWorkspaceId"
              AND w."spaceId" = artifacts."spaceId" AND w."userId" = artifacts."userId"
              AND w."deletingAt" IS NULL AND s."deletingAt" IS NULL
          )
        )
      )
    )
  );

COMMIT;
