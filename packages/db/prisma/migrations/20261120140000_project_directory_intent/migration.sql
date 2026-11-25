BEGIN;

ALTER TABLE public.project_directory_bindings
  ADD COLUMN intent TEXT NOT NULL DEFAULT 'read-only',
  ADD CONSTRAINT project_directory_bindings_intent_check CHECK (intent IN ('read-only', 'read-write'));

COMMIT;
