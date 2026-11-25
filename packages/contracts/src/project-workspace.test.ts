import { describe, expect, it } from "vitest";
import { ProjectWorkspaceSchema as PublicProjectWorkspaceSchema } from "./index.js";
import { appContract } from "./rpc.js";
import {
  CreateProjectWorkspaceInput,
  DeleteProjectWorkspaceInput,
  ListProjectWorkspacesInput,
  PROJECT_WORKSPACE_ID_MAX_LENGTH,
  PROJECT_WORKSPACE_NAME_MAX_LENGTH,
  ProjectWorkspaceConnectionStatusSchema,
  ProjectWorkspaceIdInput,
  ProjectWorkspaceLocationTypeSchema,
  ProjectWorkspaceRosterSchema,
  ProjectWorkspaceSchema,
  ProjectWorkspacePageSchema,
  RenameProjectWorkspaceInput,
} from "./project-workspace.js";

describe("project workspace contracts", () => {
  const creationId = "f68bcf5d-39fc-41fe-88dc-f3e465c1977f";
  const workspace = {
    id: "workspace-1",
    name: "Project",
    locationType: null,
    connectionStatus: "unknown",
    createdAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
  };

  it("accepts only scoped text sends with a nonce and exactly one conversation target", () => {
    const schema = appContract.projectWorkspaces.sendText["~orpc"].inputSchema!;
    const valid = { projectId: "project-a", botId: "bot-a", text: "hello", clientNonce: "nonce-a" };
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, groupId: "group-a" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, botId: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...valid, clientNonce: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...valid, text: " " }).success).toBe(false);
    expect(schema.safeParse({ ...valid, artifactIds: ["file-a"] }).success).toBe(false);
  });

  it("enforces strict scoped targets on project threadHead, messages, stop, markRead, and rename", () => {
    const target = { projectId: "project-a", botId: "bot-a" };
    for (const proc of ["threadHead", "messages", "stop", "markRead"] as const) {
      const schema = appContract.projectWorkspaces[proc]["~orpc"].inputSchema!;
      expect(schema.safeParse(target).success).toBe(true);
      expect(schema.safeParse({ projectId: "project-a", groupId: "group-a" }).success).toBe(true);
      expect(schema.safeParse({ ...target, groupId: "group-a" }).success).toBe(false);
      expect(schema.safeParse({ projectId: "project-a" }).success).toBe(false);
      expect(schema.safeParse({ ...target, userId: "forged" }).success).toBe(false);
    }
    const messagesSchema = appContract.projectWorkspaces.messages["~orpc"].inputSchema!;
    expect(messagesSchema.safeParse({ ...target, before: 10 }).success).toBe(true);
    expect(messagesSchema.safeParse({ ...target, before: -1 }).success).toBe(false);
    const renameSchema = appContract.projectWorkspaces.rename["~orpc"].inputSchema!;
    expect(renameSchema.safeParse({ id: "project-a", name: "Renamed" }).success).toBe(true);
    expect(renameSchema.safeParse({ id: "project-a", name: " ", userId: "forged" }).success).toBe(false);
    const removeSchema = appContract.projectWorkspaces.remove["~orpc"].inputSchema!;
    expect(removeSchema.safeParse({ id: "project-a", confirmRemoveAppData: true }).success).toBe(true);
    expect(removeSchema.safeParse({ id: "project-a", confirmRemoveAppData: false }).success).toBe(false);
    expect(removeSchema.safeParse({ id: "project-a", confirmRemoveAppData: true, deleteLocalFiles: true }).success).toBe(false);
    const capabilitiesOutput = appContract.projectWorkspaces.capabilities["~orpc"].outputSchema!;
    expect(capabilitiesOutput.safeParse({ create: true, removeEmpty: true, remove: true }).success).toBe(true);
    expect(capabilitiesOutput.safeParse({ create: true, removeEmpty: true }).success).toBe(false);
  });

  it("exports the schema through the package entry", () => {
    expect(PublicProjectWorkspaceSchema).toBe(ProjectWorkspaceSchema);
  });

  it("accepts name-only rosters from older backends", () => {
    const roster = {
      bots: [{ id: "bot-a", name: "Bot" }],
      groups: [{ id: "group-a", name: "Group" }],
      nextBotId: null,
      nextGroupId: null,
    };
    expect(ProjectWorkspaceRosterSchema.parse(roster)).toEqual(roster);
  });

  it("allows project Bot profile edits while rejecting home-only settings", () => {
    const schema = appContract.projectWorkspaces.updateBot["~orpc"].inputSchema!;
    const bot = { botId: "bot-a", name: "Project Bot", color: "#4361ee", avatarSet: "rakazo" };
    const input = { projectId: "project-a", bot };
    expect(schema.safeParse(input).success).toBe(true);
    expect(schema.safeParse({ ...input, bot: { ...bot, modelProvider: "openai" } }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...input, bot: { ...bot, computerMode: "team" } }).success).toBe(
      false,
    );
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
    expect(CreateProjectWorkspaceInput.parse({ id: creationId, name: "  Project  " }))
      .toEqual({ id: creationId, name: "Project" });
    expect(RenameProjectWorkspaceInput.parse({ id: "workspace-1", name: " New " }).name).toBe(
      "New",
    );
    for (const name of [" ", "x".repeat(PROJECT_WORKSPACE_NAME_MAX_LENGTH + 1)]) {
      expect(CreateProjectWorkspaceInput.safeParse({ id: creationId, name }).success).toBe(false);
      expect(RenameProjectWorkspaceInput.safeParse({ id: "workspace-1", name }).success).toBe(
        false,
      );
    }
    expect(
      CreateProjectWorkspaceInput.safeParse({ id: creationId, name: "x".repeat(PROJECT_WORKSPACE_NAME_MAX_LENGTH) })
        .success,
    ).toBe(true);
  });

  it("requires a stable UUID for a project creation attempt", () => {
    expect(CreateProjectWorkspaceInput.safeParse({ name: "Project" }).success).toBe(false);
    expect(CreateProjectWorkspaceInput.safeParse({ id: "workspace-1", name: "Project" }).success)
      .toBe(false);
    expect(CreateProjectWorkspaceInput.safeParse({ id: creationId, name: "Project" }).success)
      .toBe(true);
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
      [CreateProjectWorkspaceInput, { id: creationId, name: "Project" }],
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

  it("keeps paginated reads bounded and rejects forged ownership", () => {
    expect(ListProjectWorkspacesInput.parse({})).toEqual({});
    expect(ListProjectWorkspacesInput.safeParse({ userId: "another-user" }).success).toBe(false);
    expect(ListProjectWorkspacesInput.safeParse({ after: { id: "../project", createdAt: workspace.createdAt } }).success).toBe(false);
    expect(ProjectWorkspacePageSchema.safeParse({ items: [workspace], nextCursor: null }).success).toBe(true);
    expect(ProjectWorkspacePageSchema.safeParse({ items: Array.from({ length: 101 }, () => workspace), nextCursor: null }).success).toBe(false);
  });
});
