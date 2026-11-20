import * as z from "zod";
import { ProjectWorkspaceIdInput } from "./project-workspace.js";

export const PROJECT_DIRECTORY_PATH = "/api/devices/project-directory";
export const PROJECT_FILE_MAX_BYTES = 64 * 1024;

const ScopedId = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => value.trim() === value && !value.includes("\0"));
export const ProjectDirectoryInput = z
  .object({
    spaceId: ScopedId,
    projectId: ProjectWorkspaceIdInput.shape.id,
  })
  .strict();
export type ProjectDirectoryInput = z.infer<typeof ProjectDirectoryInput>;

export const ProjectDirectoryScopeSchema = ProjectDirectoryInput.extend({
  userId: ScopedId,
  deviceId: ScopedId,
  projectName: z.string().min(1).max(80),
}).strict();
export type ProjectDirectoryScope = z.infer<typeof ProjectDirectoryScopeSchema>;

export const ProjectDirectoryIntentSchema = z.enum(["read-only", "read-write"]);
export type ProjectDirectoryIntent = z.infer<typeof ProjectDirectoryIntentSchema>;

export const ProjectDirectoryGrantSchema = z
  .object({
    grantId: z.string().uuid(),
    directoryName: z
      .string()
      .min(1)
      .max(255)
      .refine((value) =>
        Array.from(value).every(
          (character) =>
            character !== "/" &&
            character !== "\\" &&
            character.charCodeAt(0) >= 32 &&
            character.charCodeAt(0) !== 127,
        ),
      ),
    intent: ProjectDirectoryIntentSchema,
  })
  .strict();
export type ProjectDirectoryGrant = z.infer<typeof ProjectDirectoryGrantSchema>;

export const BindProjectDirectoryInput = ProjectDirectoryInput.extend(
  ProjectDirectoryGrantSchema.shape,
).strict();

export const ProjectDirectoryBindingSchema = ProjectDirectoryGrantSchema.extend({
  deviceId: ScopedId,
}).strict();
export type ProjectDirectoryBinding = z.infer<typeof ProjectDirectoryBindingSchema>;

export const WorkspaceGrantRequestSchema = z
  .object({
    method: z.literal("workspaceGrant"),
    operation: z.enum(["status", "revoke"]),
    spaceId: ScopedId,
    projectId: ProjectWorkspaceIdInput.shape.id,
    grantId: z.string().uuid(),
  })
  .strict();
export type WorkspaceGrantRequest = z.infer<typeof WorkspaceGrantRequestSchema>;
export const WorkspaceGrantResultSchema = z
  .object({
    state: z.enum(["authorized", "unauthorized", "unavailable"]),
  })
  .strict();
export type WorkspaceGrantResult = z.infer<typeof WorkspaceGrantResultSchema>;

const ProjectFilePath = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) =>
    value.split("/").every((segment) =>
      segment.length > 0 &&
      segment.length <= 255 &&
      segment !== "." &&
      segment !== ".." &&
      Array.from(segment).every((character) =>
        character !== "\\" && character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      ),
    ),
  );

export const ProjectCloudFolderSchema = z
  .object({
    path: ProjectFilePath,
    device: z.string().regex(/^\d{1,20}$/),
    inode: z.string().regex(/^\d{1,20}$/),
  })
  .strict();
export type ProjectCloudFolder = z.infer<typeof ProjectCloudFolderSchema>;

export const BindProjectCloudDirectoryInput = ProjectDirectoryInput.pick({ projectId: true }).extend({
  computerId: ScopedId,
  path: ProjectFilePath,
  intent: ProjectDirectoryIntentSchema,
}).strict();

export const ProjectCloudDirectoryStatusSchema = z.object({
  available: z.boolean(),
  computers: z.array(z.object({ id: ScopedId, name: z.string() })),
  binding: z.object({
    grantId: z.string().uuid(),
    computerId: ScopedId,
    path: ProjectFilePath,
    intent: ProjectDirectoryIntentSchema,
  }).nullable(),
  status: z.enum(["unbound", "online", "unavailable"]),
}).strict();
export type ProjectCloudDirectoryStatus = z.infer<typeof ProjectCloudDirectoryStatusSchema>;

const ProjectFileText = z
  .string()
  .max(PROJECT_FILE_MAX_BYTES)
  .refine((value) => new TextEncoder().encode(value).byteLength <= PROJECT_FILE_MAX_BYTES);

export const ProjectFileOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("read"), path: ProjectFilePath }).strict(),
  z.object({
    operation: z.literal("create"),
    path: ProjectFilePath.refine((value) => value.toLowerCase().endsWith(".md")),
    text: ProjectFileText,
  }).strict(),
]);
export type ProjectFileOperation = z.infer<typeof ProjectFileOperationSchema>;

export const ProjectFileRequestSchema = ProjectDirectoryInput.extend({
  method: z.literal("projectFile"),
  grantId: z.string().uuid(),
  file: ProjectFileOperationSchema,
}).strict();
export type ProjectFileRequest = z.infer<typeof ProjectFileRequestSchema>;

export const ProjectFileResultSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("read"), text: ProjectFileText }).strict(),
  z.object({
    operation: z.literal("create"),
    bytes: z.number().int().min(0).max(PROJECT_FILE_MAX_BYTES),
  }).strict(),
]);
export type ProjectFileResult = z.infer<typeof ProjectFileResultSchema>;

export const PROJECT_WINDOWS_DIAGNOSTICS = ["ver", "chcp"] as const;
export const ProjectWindowsDiagnosticSchema = z.enum(PROJECT_WINDOWS_DIAGNOSTICS);

export const ProjectWindowsTerminalRequestSchema = ProjectDirectoryInput.extend({
  method: z.literal("projectWindowsTerminal"),
  runId: ScopedId,
  projectName: z.string().min(1).max(200),
  command: ProjectWindowsDiagnosticSchema,
}).strict();
export type ProjectWindowsTerminalRequest = z.infer<typeof ProjectWindowsTerminalRequestSchema>;

export const ProjectWindowsTerminalResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("declined") }).strict(),
  z.object({ status: z.literal("completed"), stdout: z.string().min(1).max(4096) }).strict(),
]);
export type ProjectWindowsTerminalResult = z.infer<typeof ProjectWindowsTerminalResultSchema>;

export const ProjectDirectorySnapshotSchema = z
  .object({
    binding: ProjectDirectoryBindingSchema.nullable(),
    deviceName: z.string().nullable(),
    status: z.enum(["unknown", "online", "offline", "unauthorized", "unavailable"]),
  })
  .strict();
export type ProjectDirectorySnapshot = z.infer<typeof ProjectDirectorySnapshotSchema>;

export const UnbindProjectDirectoryInput = ProjectWorkspaceIdInput.extend({
  grantId: z.string().uuid(),
}).strict();
export const UnbindProjectDirectoryResultSchema = z
  .object({
    removed: z.literal(true),
    localRevocation: z.enum(["confirmed", "pending"]),
  })
  .strict();
