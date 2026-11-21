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

export const ProjectRunDirectoryPinSchema = z.object({
  kind: z.enum(["windows", "cloud"]),
  targetId: ScopedId,
  grantId: ProjectDirectoryGrantSchema.shape.grantId,
  intent: ProjectDirectoryIntentSchema,
}).strict();

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

const ProjectDirectoryPath = z.string().max(1024).refine(
  (value) => value === "" || ProjectFilePath.safeParse(value).success,
);
export const ProjectFileOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("list"), path: ProjectDirectoryPath.default("") }).strict(),
  z.object({ operation: z.literal("read"), path: ProjectFilePath }).strict(),
  z.object({
    operation: z.literal("create"),
    path: ProjectFilePath.refine((value) => value.toLowerCase().endsWith(".md")),
    text: ProjectFileText,
  }).strict(),
  z.object({
    operation: z.literal("update"),
    path: ProjectFilePath,
    expectedSha256: z.string().regex(/^[a-f0-9]{64}$/u),
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
  z.object({
    operation: z.literal("list"),
    entries: z.array(z.object({ path: ProjectFilePath, kind: z.enum(["directory", "file"]) }).strict()).max(500),
    truncated: z.boolean(),
  }).strict(),
  z.object({
    operation: z.literal("read"),
    text: ProjectFileText,
    sha256: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  }).strict(),
  z.object({
    operation: z.literal("create"),
    bytes: z.number().int().min(0).max(PROJECT_FILE_MAX_BYTES),
  }).strict(),
  z.object({ operation: z.literal("update"), bytes: z.number().int().min(0).max(PROJECT_FILE_MAX_BYTES), sha256: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
  z.object({ operation: z.literal("conflict"), sha256: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
]);
export type ProjectFileResult = z.infer<typeof ProjectFileResultSchema>;

export const ProjectCloudCommandSchema = z.object({
  argv: z.array(
    z.string().max(1024).refine(
      (arg) => !arg.includes("\0") && new TextEncoder().encode(arg).byteLength <= 1024,
    ),
  ).min(1).max(32).refine(
    (argv) => argv[0] !== "" && argv.reduce((total, arg) => total + new TextEncoder().encode(arg).byteLength, 0) <= 4096,
  ),
  inputFiles: z.array(ProjectFilePath).max(16).refine(
    (paths) => new Set(paths).size === paths.length,
  ),
  timeoutMs: z.number().int().min(1).max(7000),
}).strict();
export type ProjectCloudCommand = z.infer<typeof ProjectCloudCommandSchema>;

export const ProjectCloudCommandResultSchema = z.object({
  stdout: z.string().refine((value) => new TextEncoder().encode(value).byteLength <= PROJECT_FILE_MAX_BYTES),
  stderr: z.string().refine((value) => new TextEncoder().encode(value).byteLength <= PROJECT_FILE_MAX_BYTES),
  code: z.number().int().min(-64).max(255),
}).strict().refine(
  (result) => new TextEncoder().encode(result.stdout).byteLength + new TextEncoder().encode(result.stderr).byteLength <= PROJECT_FILE_MAX_BYTES,
);
export type ProjectCloudCommandResult = z.infer<typeof ProjectCloudCommandResultSchema>;

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

export const ProjectWindowsCommandSchema = z.object({
  argv: z.array(
    z.string().max(1024).refine(
      (arg) => !arg.includes("\0") && new TextEncoder().encode(arg).byteLength <= 1024,
    ),
  ).min(1).max(32).refine(
    (argv) => argv[0] !== "" && argv.reduce((total, arg) => total + new TextEncoder().encode(arg).byteLength, 0) <= 4096,
  ),
  inputFiles: z.array(ProjectFilePath).max(16).refine(
    (paths) => new Set(paths).size === paths.length,
  ).refine((paths) => paths.every((path, index) =>
    !paths.some((other, otherIndex) => otherIndex !== index && other.startsWith(`${path}/`)),
  )),
  timeoutMs: z.number().int().min(1).max(7000),
}).strict();
export type ProjectWindowsCommand = z.infer<typeof ProjectWindowsCommandSchema>;

export const ProjectWindowsCommandRequestSchema = ProjectDirectoryInput.extend({
  method: z.literal("projectWindowsCommand"),
  grantId: z.string().uuid(),
  projectName: z.string().min(1).max(200),
  runId: ScopedId,
  command: ProjectWindowsCommandSchema,
}).strict();
export type ProjectWindowsCommandRequest = z.infer<typeof ProjectWindowsCommandRequestSchema>;

export const ProjectWindowsCommandStatusRequestSchema = ProjectDirectoryInput.extend({
  method: z.literal("projectWindowsCommandStatus"),
  grantId: z.string().uuid(),
  runId: ScopedId,
}).strict();
export type ProjectWindowsCommandStatusRequest = z.infer<typeof ProjectWindowsCommandStatusRequestSchema>;
export const ProjectWindowsCommandStatusResultSchema = z.object({ available: z.boolean() }).strict();
export type ProjectWindowsCommandStatusResult = z.infer<typeof ProjectWindowsCommandStatusResultSchema>;

export const ProjectWindowsCommandResultSchema = z.object({
  stdout: z.string().refine((value) => new TextEncoder().encode(value).byteLength <= PROJECT_FILE_MAX_BYTES),
  stderr: z.string().refine((value) => new TextEncoder().encode(value).byteLength <= PROJECT_FILE_MAX_BYTES),
  code: z.number().int().min(-64).max(255),
}).strict().refine(
  (result) => new TextEncoder().encode(result.stdout).byteLength + new TextEncoder().encode(result.stderr).byteLength <= PROJECT_FILE_MAX_BYTES,
);
export type ProjectWindowsCommandResult = z.infer<typeof ProjectWindowsCommandResultSchema>;

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
