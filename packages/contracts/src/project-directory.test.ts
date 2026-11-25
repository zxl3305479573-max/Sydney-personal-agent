import { describe, expect, it } from "vitest";
import {
  BindProjectDirectoryInput,
  PROJECT_FILE_MAX_BYTES,
  ProjectDirectoryInput,
  ProjectCloudCommandResultSchema,
  ProjectCloudCommandSchema,
  ProjectFileRequestSchema,
  ProjectFileResultSchema,
  WorkspaceGrantRequestSchema,
} from "./project-directory.js";

describe("project directory contracts", () => {
  const input = { spaceId: "space-a", projectId: "project-a" };
  const grantId = "746acaf1-0a4f-477d-822d-7357e7e8fe72";
  it.each(["origin", "userId", "deviceId", "path"])(
    "does not accept a renderer-supplied %s",
    (field) => {
      expect(ProjectDirectoryInput.safeParse({ ...input, [field]: "forged" }).success).toBe(false);
    },
  );
  it.each(["C:\\private\\example", "/private/example", "folder\nname", "folder\n"])(
    "does not transmit a path-like label: %s",
    (directoryName) => {
      expect(
        BindProjectDirectoryInput.safeParse({
          ...input,
          grantId,
          directoryName,
          intent: "read-only",
        }).success,
      ).toBe(false);
    },
  );
  it("limits the device protocol to status and revoke without file arguments", () => {
    const request = { ...input, grantId, method: "workspaceGrant", operation: "status" };
    expect(WorkspaceGrantRequestSchema.safeParse(request).success).toBe(true);
    expect(WorkspaceGrantRequestSchema.safeParse({ ...request, operation: "read" }).success).toBe(
      false,
    );
    expect(WorkspaceGrantRequestSchema.safeParse({ ...request, path: "private" }).success).toBe(
      false,
    );
  });

  it("requires a separate scoped request with a relative path and bounded UTF-8 text", () => {
    const request = { ...input, grantId, method: "projectFile" };
    const create = { operation: "create", path: "notes/output.md", text: "结果" };
    expect(ProjectFileRequestSchema.safeParse({ ...request, file: create }).success).toBe(true);
    for (const file of [
      { ...create, path: "/notes/output.md" },
      { ...create, path: "../output.md" },
      { ...create, path: "notes\\output.md" },
      { ...create, path: "notes/output.txt" },
      { ...create, text: "字".repeat(PROJECT_FILE_MAX_BYTES / 2) },
      { ...create, argv: ["shell"] },
    ]) {
      expect(ProjectFileRequestSchema.safeParse({ ...request, file }).success).toBe(false);
    }
  });

  it("limits project listings to relative folders and bounded names-only results", () => {
    const request = { ...input, grantId, method: "projectFile" };
    expect(ProjectFileRequestSchema.safeParse({
      ...request,
      file: { operation: "list" },
    }).success).toBe(true);
    expect(ProjectFileRequestSchema.safeParse({
      ...request,
      file: { operation: "list", path: "src" },
    }).success).toBe(true);
    for (const path of ["../private", "/private", "a\\b", "a//b"]) {
      expect(ProjectFileRequestSchema.safeParse({
        ...request,
        file: { operation: "list", path },
      }).success).toBe(false);
    }
  });

  it("validates bounded project directory search requests and results", () => {
    const request = { ...input, grantId, method: "projectFile" };
    expect(ProjectFileRequestSchema.safeParse({
      ...request,
      file: { operation: "search", query: "TODO" },
    }).success).toBe(true);
    expect(ProjectFileRequestSchema.safeParse({
      ...request,
      file: { operation: "search", path: "src", query: "hello", caseSensitive: true },
    }).success).toBe(true);
    for (const file of [
      { operation: "search", query: "" },
      { operation: "search", query: "a\nb" },
      { operation: "search", query: "x".repeat(201) },
      { operation: "search", path: "../private", query: "ok" },
      { operation: "search", path: "/private", query: "ok" },
    ]) {
      expect(ProjectFileRequestSchema.safeParse({ ...request, file }).success).toBe(false);
    }
    expect(ProjectFileResultSchema.safeParse({
      operation: "search",
      matches: [{ path: "src/app.ts", line: 3, text: "const x = 1;" }],
      truncated: false,
    }).success).toBe(true);
    expect(ProjectFileResultSchema.safeParse({
      operation: "search",
      matches: [{ path: "src/app.ts", line: 0, text: "bad line" }],
      truncated: false,
    }).success).toBe(false);
  });

  it("requires the last-read SHA-256 before replacing an existing text file", () => {
    const request = { ...input, grantId, method: "projectFile" };
    const update = {
      operation: "update",
      path: "src/app.ts",
      expectedSha256: "a".repeat(64),
      text: "export const ready = true;",
    };
    expect(ProjectFileRequestSchema.safeParse({ ...request, file: update }).success).toBe(true);
    expect(ProjectFileRequestSchema.safeParse({
      ...request,
      file: { ...update, expectedSha256: "wrong" },
    }).success).toBe(false);
    expect(ProjectFileRequestSchema.safeParse({ ...request, file: { ...update, argv: ["shell"] } }).success).toBe(false);
  });

  it("bounds cloud commands and their UTF-8 result", () => {
    const command = {
      argv: ["python3", "-c", "print('ok')"],
      inputFiles: ["src/app.ts"],
      timeoutMs: 1000,
    };
    expect(ProjectCloudCommandSchema.safeParse(command).success).toBe(true);
    expect(ProjectCloudCommandSchema.safeParse({
      ...command,
      argv: ["python3", "x".repeat(4090)],
    }).success).toBe(false);
    expect(ProjectCloudCommandSchema.safeParse({
      ...command,
      inputFiles: ["src/app.ts", "src/app.ts"],
    }).success).toBe(false);
    expect(ProjectCloudCommandResultSchema.safeParse({
      stdout: "结果",
      stderr: "",
      code: 0,
    }).success).toBe(true);
    expect(ProjectCloudCommandResultSchema.safeParse({
      stdout: "x".repeat(PROJECT_FILE_MAX_BYTES),
      stderr: "y",
      code: 0,
    }).success).toBe(false);
  });
});
