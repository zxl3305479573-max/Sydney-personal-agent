BEGIN;

ALTER TABLE public.cloud_agents
  ADD COLUMN "projectWorkspaceId" TEXT,
  ADD CONSTRAINT cloud_agents_project_scope_disabled CHECK ("projectWorkspaceId" IS NULL);

ALTER TABLE public.purchases
  ADD COLUMN "projectWorkspaceId" TEXT,
  ADD CONSTRAINT purchases_project_scope_disabled CHECK ("projectWorkspaceId" IS NULL);

CREATE INDEX cloud_agents_project_scope_idx
  ON public.cloud_agents ("spaceId", "userId", "projectWorkspaceId", "id");
CREATE INDEX purchases_project_scope_idx
  ON public.purchases ("spaceId", "userId", "projectWorkspaceId", "createdAt");

ALTER TABLE public.cloud_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY cloud_agents_tenant ON public.cloud_agents
  USING (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND "userId" = NULLIF(current_setting('app.user_id', true), '')
  );
CREATE POLICY cloud_agents_system ON public.cloud_agents
  USING ((SELECT app_rls_bypass()));

DO $$
DECLARE
  protected TEXT;
BEGIN
  FOREACH protected IN ARRAY ARRAY['cloud_agents', 'purchases'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE
       USING (
         (SELECT app_rls_bypass())
         OR (
           "spaceId" = NULLIF(current_setting(''app.space_id'', true), '''')
           AND "userId" = NULLIF(current_setting(''app.user_id'', true), '''')
           AND "projectWorkspaceId" IS NOT DISTINCT FROM
             NULLIF(current_setting(''app.project_workspace_id'', true), '''')
         )
       )',
      protected || '_project_scope', protected
    );
  END LOOP;
END $$;

CREATE TRIGGER cloud_agents_identity_immutable
  BEFORE UPDATE OF "id", "operationKey", "providerKey", "spaceId", "userId", "projectWorkspaceId", "botId", "threadId"
  ON public.cloud_agents FOR EACH ROW EXECUTE FUNCTION public.conversation_binding_immutable(
    'id', 'operationKey', 'providerKey', 'spaceId', 'userId', 'projectWorkspaceId', 'botId', 'threadId');

CREATE TRIGGER purchases_identity_immutable
  BEFORE UPDATE OF "id", "operationKey", "provider", "spaceId", "userId", "projectWorkspaceId", "botId", "threadId", "threadGeneration"
  ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.conversation_binding_immutable(
    'id', 'operationKey', 'provider', 'spaceId', 'userId', 'projectWorkspaceId', 'botId', 'threadId', 'threadGeneration');

COMMIT;
