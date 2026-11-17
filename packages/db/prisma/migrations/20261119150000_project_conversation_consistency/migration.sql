BEGIN;

CREATE FUNCTION public.conversation_binding_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  binding TEXT;
BEGIN
  FOREACH binding IN ARRAY TG_ARGV LOOP
    IF (to_jsonb(NEW) -> binding) IS DISTINCT FROM (to_jsonb(OLD) -> binding) THEN
      RAISE EXCEPTION 'Conversation identity and target are immutable'
        USING ERRCODE = '23514', CONSTRAINT = TG_NAME;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DO $$
DECLARE
  protected TEXT;
BEGIN
  FOREACH protected IN ARRAY ARRAY['bots', 'chat_groups', 'threads', 'tasks', 'runs'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OF "id", "spaceId", "userId", "projectWorkspaceId"
       ON public.%I FOR EACH ROW EXECUTE FUNCTION public.conversation_binding_immutable(
         ''id'', ''spaceId'', ''userId'', ''projectWorkspaceId'')',
      protected || '_identity_immutable', protected
    );
  END LOOP;
END $$;

CREATE TRIGGER project_workspaces_identity_immutable
  BEFORE UPDATE OF "id", "spaceId", "userId" ON public.project_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.conversation_binding_immutable('id', 'spaceId', 'userId');

CREATE TRIGGER threads_binding_immutable
  BEFORE UPDATE OF "botId", "groupId", "externalConversationId" ON public.threads
  FOR EACH ROW EXECUTE FUNCTION public.conversation_binding_immutable('botId', 'groupId', 'externalConversationId');

CREATE TRIGGER tasks_binding_immutable
  BEFORE UPDATE OF "botId", "threadId" ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.conversation_binding_immutable('botId', 'threadId');

CREATE TRIGGER runs_binding_immutable
  BEFORE UPDATE OF "botId", "threadId", "taskId" ON public.runs
  FOR EACH ROW EXECUTE FUNCTION public.conversation_binding_immutable('botId', 'threadId', 'taskId');

CREATE TRIGGER external_conversations_identity_immutable
  BEFORE UPDATE OF "id", "spaceId", "userId", "botId" ON public.external_conversations
  FOR EACH ROW EXECUTE FUNCTION public.conversation_binding_immutable('id', 'spaceId', 'userId', 'botId');

CREATE FUNCTION public.ensure_bot_parent_project_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW."parentBotId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.bots parent
    WHERE parent."id" = NEW."parentBotId"
      AND parent."spaceId" = NEW."spaceId" AND parent."userId" = NEW."userId"
      AND parent."projectWorkspaceId" IS NOT DISTINCT FROM NEW."projectWorkspaceId"
  ) THEN
    RAISE EXCEPTION 'Bot parent scope does not match'
      USING ERRCODE = '23514', CONSTRAINT = 'bots_parent_project_scope';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER bots_parent_project_scope
  BEFORE INSERT OR UPDATE OF "parentBotId", "spaceId", "userId", "projectWorkspaceId" ON public.bots
  FOR EACH ROW EXECUTE FUNCTION public.ensure_bot_parent_project_scope();

CREATE FUNCTION public.ensure_group_member_project_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_groups chat_group
    JOIN public.bots member ON member."id" = NEW."botId"
      AND member."spaceId" = chat_group."spaceId" AND member."userId" = chat_group."userId"
      AND member."projectWorkspaceId" IS NOT DISTINCT FROM chat_group."projectWorkspaceId"
    WHERE chat_group."id" = NEW."groupId"
  ) THEN
    RAISE EXCEPTION 'Group member scope does not match'
      USING ERRCODE = '23514', CONSTRAINT = 'chat_group_members_project_scope';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER chat_group_members_project_scope
  BEFORE INSERT OR UPDATE OF "groupId", "botId" ON public.chat_group_members
  FOR EACH ROW EXECUTE FUNCTION public.ensure_group_member_project_scope();

CREATE FUNCTION public.ensure_thread_parent_project_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  matches BOOLEAN := false;
BEGIN
  IF NEW."botId" IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.bots parent
      WHERE parent."id" = NEW."botId"
        AND parent."spaceId" = NEW."spaceId" AND parent."userId" = NEW."userId"
        AND parent."projectWorkspaceId" IS NOT DISTINCT FROM NEW."projectWorkspaceId"
    ) INTO matches;
  ELSIF NEW."groupId" IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.chat_groups parent
      WHERE parent."id" = NEW."groupId"
        AND parent."spaceId" = NEW."spaceId" AND parent."userId" = NEW."userId"
        AND parent."projectWorkspaceId" IS NOT DISTINCT FROM NEW."projectWorkspaceId"
    ) INTO matches;
  ELSIF NEW."externalConversationId" IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.external_conversations parent
      JOIN public.bots bot ON bot."id" = parent."botId"
        AND bot."spaceId" = parent."spaceId" AND bot."userId" = parent."userId"
      WHERE parent."id" = NEW."externalConversationId"
        AND parent."spaceId" = NEW."spaceId" AND parent."userId" = NEW."userId"
        AND bot."projectWorkspaceId" IS NOT DISTINCT FROM NEW."projectWorkspaceId"
    ) INTO matches;
  END IF;
  IF NOT matches THEN
    RAISE EXCEPTION 'Thread parent scope does not match'
      USING ERRCODE = '23514', CONSTRAINT = 'threads_parent_project_scope';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER threads_parent_project_scope
  BEFORE INSERT OR UPDATE OF "botId", "groupId", "externalConversationId", "spaceId", "userId", "projectWorkspaceId"
  ON public.threads FOR EACH ROW EXECUTE FUNCTION public.ensure_thread_parent_project_scope();

CREATE FUNCTION public.ensure_task_parent_project_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.threads conversation
    JOIN public.bots bot ON bot."id" = NEW."botId"
      AND bot."spaceId" = conversation."spaceId" AND bot."userId" = conversation."userId"
      AND bot."projectWorkspaceId" IS NOT DISTINCT FROM conversation."projectWorkspaceId"
    WHERE conversation."id" = NEW."threadId"
      AND conversation."spaceId" = NEW."spaceId" AND conversation."userId" = NEW."userId"
      AND conversation."projectWorkspaceId" IS NOT DISTINCT FROM NEW."projectWorkspaceId"
      AND (
        conversation."botId" = bot."id"
        OR (conversation."groupId" IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.chat_groups chat_group
          JOIN public.chat_group_members member ON member."groupId" = chat_group."id"
            AND member."botId" = bot."id"
          WHERE chat_group."id" = conversation."groupId"
            AND chat_group."spaceId" = conversation."spaceId" AND chat_group."userId" = conversation."userId"
            AND chat_group."projectWorkspaceId" IS NOT DISTINCT FROM conversation."projectWorkspaceId"
        ))
        OR (conversation."externalConversationId" IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.external_conversations external_conversation
          WHERE external_conversation."id" = conversation."externalConversationId" AND external_conversation."botId" = bot."id"
            AND external_conversation."spaceId" = conversation."spaceId" AND external_conversation."userId" = conversation."userId"
        ))
      )
  ) THEN
    RAISE EXCEPTION 'Task parent scope does not match'
      USING ERRCODE = '23514', CONSTRAINT = 'tasks_parent_project_scope';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tasks_parent_project_scope
  BEFORE INSERT OR UPDATE OF "botId", "threadId", "spaceId", "userId", "projectWorkspaceId" ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.ensure_task_parent_project_scope();

CREATE FUNCTION public.ensure_run_parent_project_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tasks parent
    WHERE parent."id" = NEW."taskId"
      AND parent."botId" = NEW."botId" AND parent."threadId" = NEW."threadId"
      AND parent."spaceId" = NEW."spaceId" AND parent."userId" = NEW."userId"
      AND parent."projectWorkspaceId" IS NOT DISTINCT FROM NEW."projectWorkspaceId"
  ) THEN
    RAISE EXCEPTION 'Run parent scope does not match'
      USING ERRCODE = '23514', CONSTRAINT = 'runs_parent_project_scope';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER runs_parent_project_scope
  BEFORE INSERT OR UPDATE OF "taskId", "botId", "threadId", "spaceId", "userId", "projectWorkspaceId" ON public.runs
  FOR EACH ROW EXECUTE FUNCTION public.ensure_run_parent_project_scope();

COMMIT;
