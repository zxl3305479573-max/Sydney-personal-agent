import { describe, expect, it } from "vitest";
import { ProjectWorkspaceSchema as PublicProjectWorkspaceSchema } from "./index.js";
import {
  CreateProjectWorkspaceInput,
  DeleteProjectWorkspaceInput,
  PROJECT_WORKSPACE_ID_MAX_LENGTH,
  PROJECT_WORKSPACE_NAME_MAX_LENGTH,
  ProjectWorkspaceConnectionStatusSchema,
  ProjectWorkspaceIdInput,
  ProjectWorkspaceLocationTypeSchema,
  ProjectWorkspaceSchema,
  RenameProjectWorkspaceInput,
} from "./project-workspace.js";

describe("project workspace contracts", () => {
  const workspace = {
    id: "workspace-1",
    name: "Project",
    locationType: null,
    connectionStatus: "unknown",
    createdAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
  };

  it("exports the schema through the package entry", () => {
    expect(PublicProjectWorkspaceSchema).toBe(ProjectWorkspaceSchema);
  });

  it("validates public metadata without exposing extra fields", () => {
    expect(ProjectWorkspaceSchema.parse(workspace)).toEqual(workspace);
    for (const field of ["path", "localPath", "token", "userId", "spaceId"]) {
      expect(ProjectWorkspaceSchema.safeParse({ ...workspace, [field]: "private" }).success).toBe(
        false,
      );
    }
    expect(ProjectWorkspaceSchema.safeParse({ ...workspace, createdAt: "yesterday" }).success).toBe(
      false,
    );
  });

  it("requires explicit known connection states and location types", () => {
    for (const status of [
      "unknown",
      "connecting",
      "online",
      "offline",
      "unauthorized",
      "unavailable",
    ]) {
      expect(ProjectWorkspaceConnectionStatusSchema.safeParse(status).success).toBe(true);
    }
    for (const location of ["cloud_computer", "local_device"]) {
      expect(ProjectWorkspaceLocationTypeSchema.safeParse(location).success).toBe(true);
    }
    expect(
      ProjectWorkspaceSchema.safeParse({ ...workspace, connectionStatus: undefined }).success,
    ).toBe(false);
    expect(
      ProjectWorkspaceSchema.safeParse({ ...workspace, connectionStatus: "ready" }).success,
    ).toBe(false);
    expect(ProjectWorkspaceSchema.safeParse({ ...workspace, locationType: "git" }).success).toBe(
      false,
    );
  });

  it("only permits unknown connection status without a location", () => {
    for (const status of ["connecting", "online", "offline", "unauthorized", "unavailable"]) {
      expect(
        ProjectWorkspaceSchema.safeParse({ ...workspace, connectionStatus: status }).success,
      ).toBe(false);
    }
    for (const locationType of ["cloud_computer", "local_device"]) {
      for (const connectionStatus of [
        "unknown",
        "connecting",
        "online",
        "offline",
        "unauthorized",
        "unavailable",
      ]) {
        expect(
          ProjectWorkspaceSchema.safeParse({ ...workspace, locationType, connectionStatus })
            .success,
        ).toBe(true);
      }
    }
  });

  it("trims names and enforces length limits", () => {
    expect(CreateProjectWorkspaceInput.parse({ name: "  Project  " })).toEqual({ name: "Project" });
    expect(RenameProjectWorkspaceInput.parse({ id: "workspace-1", name: " New " }).name).toBe(
      "New",
    );
    for (const name of [" ", "x".repeat(PROJECT_WORKSPACE_NAME_MAX_LENGTH + 1)]) {
      expect(CreateProjectWorkspaceInput.safeParse({ name }).success).toBe(false);
      expect(RenameProjectWorkspaceInput.safeParse({ id: "workspace-1", name }).success).toBe(
        false,
      );
    }
    expect(
      CreateProjectWorkspaceInput.safeParse({ name: "x".repeat(PROJECT_WORKSPACE_NAME_MAX_LENGTH) })
        .success,
    ).toBe(true);
  });

  it("requires bounded IDs using only safe characters", () => {
    for (const id of [
      "",
      " ",
      " id ",
      "x".repeat(PROJECT_WORKSPACE_ID_MAX_LENGTH + 1),
      "../folder",
      "folder/file",
      "C:\\folder",
      "id\n",
      "id\u0000",
      "id\u007f",
      "id.1",
    ]) {
      expect(ProjectWorkspaceIdInput.safeParse({ id }).success).toBe(false);
      expect(ProjectWorkspaceSchema.safeParse({ ...workspace, id }).success).toBe(false);
      expect(RenameProjectWorkspaceInput.safeParse({ id, name: "Project" }).success).toBe(false);
      expect(
        DeleteProjectWorkspaceInput.safeParse({ id, confirmRemoveAppData: true }).success,
      ).toBe(false);
    }
    expect(ProjectWorkspaceIdInput.safeParse({ id: "aZ09_-" }).success).toBe(true);
    expect(
      ProjectWorkspaceIdInput.safeParse({ id: "x".repeat(PROJECT_WORKSPACE_ID_MAX_LENGTH) })
        .success,
    ).toBe(true);
  });

  it("rejects forged ownership, binding, and other extra request fields", () => {
    const requests = [
      [CreateProjectWorkspaceInput, { name: "Project" }],
      [RenameProjectWorkspaceInput, { id: "workspace-1", name: "Project" }],
      [ProjectWorkspaceIdInput, { id: "workspace-1" }],
      [DeleteProjectWorkspaceInput, { id: "workspace-1", confirmRemoveAppData: true }],
    ] as const;
    for (const [schema, input] of requests) {
      expect(schema.safeParse(input).success).toBe(true);
      for (const field of ["userId", "spaceId", "path", "token", "deleteFiles"]) {
        expect(schema.safeParse({ ...input, [field]: "forged" }).success).toBe(false);
      }
    }
  });

  it("requires explicit confirmation of removing application data", () => {
    expect(DeleteProjectWorkspaceInput.safeParse({ id: "workspace-1" }).success).toBe(false);
    expect(
      DeleteProjectWorkspaceInput.safeParse({ id: "workspace-1", confirmRemoveAppData: false })
        .success,
    ).toBe(false);
    expect(
      DeleteProjectWorkspaceInput.safeParse({
        id: "workspace-1",
        confirmRemoveAppData: true,
        deleteFiles: true,
      }).success,
    ).toBe(false);
  });
});
