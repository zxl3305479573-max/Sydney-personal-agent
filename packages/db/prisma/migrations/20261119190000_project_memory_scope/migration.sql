BEGIN;

CREATE POLICY memory_documents_project_scope ON public.memory_documents AS RESTRICTIVE
  USING (
    (SELECT app_rls_bypass())
    OR (
      "botId" IS NULL
      AND NULLIF(current_setting('app.project_workspace_id', true), '') IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.bots b
      WHERE b."id" = memory_documents."botId"
        AND b."spaceId" = memory_documents."spaceId"
        AND b."userId" = memory_documents."userId"
        AND b."projectWorkspaceId" IS NOT DISTINCT FROM
          NULLIF(current_setting('app.project_workspace_id', true), '')
    )
  );

CREATE POLICY memory_revisions_project_scope ON public.memory_revisions AS RESTRICTIVE
  USING (
    (SELECT app_rls_bypass())
    OR EXISTS (
      SELECT 1 FROM public.memory_documents d
      WHERE d."id" = memory_revisions."documentId"
    )
  );

COMMIT;
