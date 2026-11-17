BEGIN;

DO $$
DECLARE
  protected TEXT;
BEGIN
  FOREACH protected IN ARRAY ARRAY['bots', 'chat_groups', 'threads', 'tasks', 'runs'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE
       USING (
         (SELECT app_rls_bypass())
         OR (
           "projectWorkspaceId" IS NOT DISTINCT FROM
             NULLIF(current_setting(''app.project_workspace_id'', true), '''')
           AND (
             "projectWorkspaceId" IS NULL
             OR (
               "spaceId" = NULLIF(current_setting(''app.space_id'', true), '''')
               AND "userId" = NULLIF(current_setting(''app.user_id'', true), '''')
               AND EXISTS (
                 SELECT 1 FROM "project_workspaces" w
                 JOIN "space_members" m ON m."spaceId" = w."spaceId" AND m."userId" = w."userId"
                 JOIN "spaces" s ON s."id" = w."spaceId"
                 WHERE w."id" = %I."projectWorkspaceId"
                   AND w."spaceId" = %I."spaceId" AND w."userId" = %I."userId"
                   AND w."deletingAt" IS NULL AND s."deletingAt" IS NULL
               )
             )
           )
         )
       )',
      protected || '_project_scope', protected, protected, protected, protected
    );
  END LOOP;
END $$;

ALTER TABLE "chat_groups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_groups_tenant ON "chat_groups"
  USING (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    AND "userId" = NULLIF(current_setting('app.user_id', true), '')
  );
CREATE POLICY chat_groups_system ON "chat_groups"
  USING ((SELECT app_rls_bypass()));

ALTER TABLE "chat_group_members" ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_group_members_tenant ON "chat_group_members"
  USING (
    EXISTS (
      SELECT 1 FROM "chat_groups" g JOIN "bots" b
        ON b."id" = "chat_group_members"."botId"
      WHERE g."id" = "chat_group_members"."groupId"
        AND g."spaceId" = NULLIF(current_setting('app.space_id', true), '')
        AND g."userId" = NULLIF(current_setting('app.user_id', true), '')
        AND b."spaceId" = g."spaceId" AND b."userId" = g."userId"
        AND b."projectWorkspaceId" IS NOT DISTINCT FROM g."projectWorkspaceId"
    )
  );
CREATE POLICY chat_group_members_system ON "chat_group_members"
  USING ((SELECT app_rls_bypass()));

CREATE POLICY events_project_scope ON "events" AS RESTRICTIVE
  USING (
    (SELECT app_rls_bypass())
    OR EXISTS (
      SELECT 1 FROM "threads" t
      WHERE t."id" = "events"."threadId" AND t."spaceId" = "events"."spaceId"
    )
  );

COMMIT;
