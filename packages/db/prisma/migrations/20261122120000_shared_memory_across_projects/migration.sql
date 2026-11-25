BEGIN;

DROP POLICY IF EXISTS memory_documents_project_scope ON public.memory_documents;
CREATE POLICY memory_documents_project_scope ON public.memory_documents AS RESTRICTIVE
  USING (
    (SELECT app_rls_bypass())
    OR (
      "spaceId" = NULLIF(current_setting('app.space_id', true), '')
      AND "userId" = NULLIF(current_setting('app.user_id', true), '')
      AND (
        "botId" IS NULL
        OR EXISTS (
          SELECT 1 FROM public.bots b
          WHERE b."id" = memory_documents."botId"
            AND b."spaceId" = memory_documents."spaceId"
            AND b."userId" = memory_documents."userId"
        )
      )
    )
  );

COMMIT;
