-- Add task execution state columns
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "executionState" JSONB;
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "taskMandate" JSONB;
