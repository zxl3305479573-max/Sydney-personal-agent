import { describe, expect, it } from "vitest";
import {
  BindProjectDirectoryInput,
  PROJECT_FILE_MAX_BYTES,
  ProjectDirectoryInput,
  ProjectFileRequestSchema,
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
});
