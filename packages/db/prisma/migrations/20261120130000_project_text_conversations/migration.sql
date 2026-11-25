BEGIN;

ALTER TABLE public.bots DROP CONSTRAINT bots_project_scope_disabled;
ALTER TABLE public.chat_groups DROP CONSTRAINT chat_groups_project_scope_disabled;
ALTER TABLE public.threads DROP CONSTRAINT threads_project_scope_disabled;
ALTER TABLE public.tasks DROP CONSTRAINT tasks_project_scope_disabled;
ALTER TABLE public.runs DROP CONSTRAINT runs_project_scope_disabled;

COMMIT;
