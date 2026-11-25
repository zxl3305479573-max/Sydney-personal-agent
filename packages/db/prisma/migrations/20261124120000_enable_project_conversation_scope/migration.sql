BEGIN;

ALTER TABLE public.bots
  DROP CONSTRAINT IF EXISTS "bots_project_scope_disabled";

ALTER TABLE public.chat_groups
  DROP CONSTRAINT IF EXISTS "chat_groups_project_scope_disabled";

ALTER TABLE public.threads
  DROP CONSTRAINT IF EXISTS "threads_project_scope_disabled";

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS "tasks_project_scope_disabled";

ALTER TABLE public.runs
  DROP CONSTRAINT IF EXISTS "runs_project_scope_disabled";

COMMIT;
