import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { crossSpaceCommunicationAllowed } from "./cross-space-communication.js";

const sender = {
  id: "sender",
  spaceId: "space-a",
  userId: "user-a",
  projectWorkspaceId: null,
  crossSpaceCommunication: true,
  archivedAt: null,
};
const recipient = {
  id: "recipient",
  spaceId: "space-b",
  userId: "user-b",
  projectWorkspaceId: null,
  crossSpaceCommunication: true,
  archivedAt: null,
};

describe("cross-space bot communication", () => {
  it.each([
    { name: "both opted in", bots: [sender, recipient], allowed: true },
    {
      name: "sender off",
      bots: [{ ...sender, crossSpaceCommunication: false }, recipient],
      allowed: false,
    },
    {
      name: "recipient off",
      bots: [sender, { ...recipient, crossSpaceCommunication: false }],
      allowed: false,
    },
    {
      name: "missing permission",
      bots: [sender, { ...recipient, crossSpaceCommunication: undefined }],
      allowed: false,
    },
    { name: "missing bot", bots: [sender], allowed: false },
    {
      name: "archived bot",
      bots: [sender, { ...recipient, archivedAt: new Date() }],
      allowed: false,
    },
    {
      name: "same space",
      bots: [
        { ...sender, crossSpaceCommunication: false },
        { ...recipient, spaceId: sender.spaceId, crossSpaceCommunication: false },
      ],
      allowed: true,
    },
    {
      name: "same project and owner",
      bots: [
        { ...sender, projectWorkspaceId: "project-a", crossSpaceCommunication: false },
        {
          ...recipient,
          spaceId: sender.spaceId,
          userId: sender.userId,
          projectWorkspaceId: "project-a",
          crossSpaceCommunication: false,
        },
      ],
      allowed: true,
    },
    {
      name: "different projects in the same space",
      bots: [
        { ...sender, projectWorkspaceId: "project-a" },
        {
          ...recipient,
          spaceId: sender.spaceId,
          userId: sender.userId,
          projectWorkspaceId: "project-b",
        },
      ],
      allowed: false,
    },
    {
      name: "home sender cannot reach a project",
      bots: [sender, { ...recipient, spaceId: sender.spaceId, projectWorkspaceId: "project-a" }],
      allowed: false,
    },
    {
      name: "project sender cannot reach home",
      bots: [{ ...sender, projectWorkspaceId: "project-a" }, recipient],
      allowed: false,
    },
    {
      name: "project cannot be shared with another member",
      bots: [
        { ...sender, projectWorkspaceId: "project-a" },
        { ...recipient, spaceId: sender.spaceId, projectWorkspaceId: "project-a" },
      ],
      allowed: false,
    },
    {
      name: "project cannot be shared with another space",
      bots: [
        { ...sender, projectWorkspaceId: "project-a" },
        { ...recipient, userId: sender.userId, projectWorkspaceId: "project-a" },
      ],
      allowed: false,
    },
    {
      name: "unknown project is not home",
      bots: [sender, { ...recipient, projectWorkspaceId: undefined }],
      allowed: false,
    },
    {
      name: "missing owner",
      bots: [sender, { ...recipient, userId: undefined }],
      allowed: false,
    },
    {
      name: "query must return the requested pair",
      bots: [sender, { ...recipient, id: "unrelated" }],
      allowed: false,
    },
  ])("$name", async ({ bots, allowed }) => {
    const prisma = { $queryRaw: vi.fn(async () => bots) };
    expect(
      await crossSpaceCommunicationAllowed(
        prisma as unknown as PrismaClient,
        sender.id,
        recipient.id,
      ),
    ).toBe(allowed);
  });
});
