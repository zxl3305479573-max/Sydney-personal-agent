import * as z from "zod";
import { IsoDate } from "./ids.js";

export const PROJECT_WORKSPACE_NAME_MAX_LENGTH = 80;
export const PROJECT_WORKSPACE_ID_MAX_LENGTH = 128;

const ProjectWorkspaceId = z
  .string()
  .min(1)
  .max(PROJECT_WORKSPACE_ID_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_-]+(?![\s\S])/);
const ProjectWorkspaceName = z.string().trim().min(1).max(PROJECT_WORKSPACE_NAME_MAX_LENGTH);

export const ProjectWorkspaceLocationTypeSchema = z.enum(["cloud_computer", "local_device"]);
export type ProjectWorkspaceLocationType = z.infer<typeof ProjectWorkspaceLocationTypeSchema>;

export const ProjectWorkspaceConnectionStatusSchema = z.enum([
  "unknown",
  "connecting",
  "online",
  "offline",
  "unauthorized",
  "unavailable",
]);
export type ProjectWorkspaceConnectionStatus = z.infer<
  typeof ProjectWorkspaceConnectionStatusSchema
>;

export const ProjectWorkspaceSchema = z
  .object({
    id: ProjectWorkspaceId,
    name: ProjectWorkspaceName,
    locationType: ProjectWorkspaceLocationTypeSchema.nullable(),
    connectionStatus: ProjectWorkspaceConnectionStatusSchema,
    createdAt: IsoDate.max(40),
    updatedAt: IsoDate.max(40),
  })
  .strict()
  .refine(
    (workspace) => workspace.locationType !== null || workspace.connectionStatus === "unknown",
    {
      path: ["connectionStatus"],
      message: "An unbound workspace must have unknown connection status",
    },
  );
export type ProjectWorkspace = z.infer<typeof ProjectWorkspaceSchema>;

export const CreateProjectWorkspaceInput = z.object({
  id: z.string().uuid(),
  name: ProjectWorkspaceName,
}).strict();
export type CreateProjectWorkspaceInput = z.infer<typeof CreateProjectWorkspaceInput>;

export const RenameProjectWorkspaceInput = z
  .object({ id: ProjectWorkspaceId, name: ProjectWorkspaceName })
  .strict();
export type RenameProjectWorkspaceInput = z.infer<typeof RenameProjectWorkspaceInput>;

export const ProjectWorkspaceIdInput = z.object({ id: ProjectWorkspaceId }).strict();
export type ProjectWorkspaceIdInput = z.infer<typeof ProjectWorkspaceIdInput>;

export const DeleteProjectWorkspaceInput = z
  .object({ id: ProjectWorkspaceId, confirmRemoveAppData: z.literal(true) })
  .strict();
export type DeleteProjectWorkspaceInput = z.infer<typeof DeleteProjectWorkspaceInput>;

export const ProjectWorkspaceCursorSchema = z.object({
  createdAt: IsoDate.max(40),
  id: ProjectWorkspaceId,
}).strict();
export type ProjectWorkspaceCursor = z.infer<typeof ProjectWorkspaceCursorSchema>;

export const ListProjectWorkspacesInput = z.object({
  after: ProjectWorkspaceCursorSchema.optional(),
}).strict();

export const ProjectWorkspacePageSchema = z.object({
  items: z.array(ProjectWorkspaceSchema).max(100),
  nextCursor: ProjectWorkspaceCursorSchema.nullable(),
}).strict();

export const ProjectWorkspaceRosterInput = z.object({
  id: ProjectWorkspaceId,
  afterBotId: ProjectWorkspaceId.optional(),
  afterGroupId: ProjectWorkspaceId.optional(),
}).strict();

export const ProjectWorkspaceRosterSchema = z.object({
  bots: z.array(z.object({ id: ProjectWorkspaceId, name: z.string() }).strict()).max(100),
  groups: z.array(z.object({ id: ProjectWorkspaceId, name: z.string() }).strict()).max(100),
  nextBotId: ProjectWorkspaceId.nullable(),
  nextGroupId: ProjectWorkspaceId.nullable(),
}).strict();
