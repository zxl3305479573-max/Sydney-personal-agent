BEGIN;

ALTER TABLE "bots"
  ADD COLUMN "projectWorkspaceId" TEXT,
  ADD CONSTRAINT "bots_project_workspace_owner_fkey"
    FOREIGN KEY ("projectWorkspaceId", "spaceId", "userId")
    REFERENCES "project_workspaces" ("id", "spaceId", "userId")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "bots_project_scope_disabled"
    CHECK ("projectWorkspaceId" IS NULL);

ALTER TABLE "chat_groups"
  ADD COLUMN "projectWorkspaceId" TEXT,
  ADD CONSTRAINT "chat_groups_project_workspace_owner_fkey"
    FOREIGN KEY ("projectWorkspaceId", "spaceId", "userId")
    REFERENCES "project_workspaces" ("id", "spaceId", "userId")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "chat_groups_project_scope_disabled"
    CHECK ("projectWorkspaceId" IS NULL);

ALTER TABLE "threads"
  ADD COLUMN "projectWorkspaceId" TEXT,
  ADD CONSTRAINT "threads_project_workspace_owner_fkey"
    FOREIGN KEY ("projectWorkspaceId", "spaceId", "userId")
    REFERENCES "project_workspaces" ("id", "spaceId", "userId")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "threads_project_scope_disabled"
    CHECK ("projectWorkspaceId" IS NULL);

ALTER TABLE "tasks"
  ADD COLUMN "projectWorkspaceId" TEXT,
  ADD CONSTRAINT "tasks_project_workspace_owner_fkey"
    FOREIGN KEY ("projectWorkspaceId", "spaceId", "userId")
    REFERENCES "project_workspaces" ("id", "spaceId", "userId")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "tasks_project_scope_disabled"
    CHECK ("projectWorkspaceId" IS NULL);

ALTER TABLE "runs"
  ADD COLUMN "projectWorkspaceId" TEXT,
  ADD CONSTRAINT "runs_project_workspace_owner_fkey"
    FOREIGN KEY ("projectWorkspaceId", "spaceId", "userId")
    REFERENCES "project_workspaces" ("id", "spaceId", "userId")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "runs_project_scope_disabled"
    CHECK ("projectWorkspaceId" IS NULL);

CREATE INDEX "bots_project_scope_idx"
  ON "bots" ("spaceId", "userId", "projectWorkspaceId", "archivedAt", "updatedAt");
CREATE INDEX "chat_groups_project_scope_idx"
  ON "chat_groups" ("spaceId", "userId", "projectWorkspaceId", "archivedAt", "updatedAt");
CREATE INDEX "threads_project_scope_idx"
  ON "threads" ("spaceId", "userId", "projectWorkspaceId");
CREATE INDEX "tasks_project_scope_idx"
  ON "tasks" ("spaceId", "userId", "projectWorkspaceId", "createdAt");
CREATE INDEX "runs_project_scope_idx"
  ON "runs" ("spaceId", "userId", "projectWorkspaceId", "createdAt");

COMMIT;
