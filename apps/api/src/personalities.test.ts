import { createRouterClient } from "@orpc/server";
import type { Actor } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import type { RouterDeps } from "./router.js";
import { createRouter } from "./router.js";

describe("personality RPC ownership", () => {
  it("scopes reads and writes to the authenticated user and rejects foreign IDs", async () => {
    const presets = {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: "saved",
        createdAt: new Date(0),
        updatedAt: new Date(0),
      })),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const deps = {
      prisma: { personalityPreset: presets },
      env: { agentRuntime: "scripted", defaultProvider: "", defaultModel: "" },
    } as unknown as RouterDeps;
    const actor = {
      userId: "owner-1",
      spaceId: "space-1",
      email: "test@example.invalid",
      isDeploymentOwner: false,
    } satisfies Actor;
    const client = createRouterClient(createRouter(deps), { context: { actor } as never });
    await expect(client.personalities.list()).resolves.toEqual([]);
    expect(presets.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: actor.userId } }),
    );
    const created = await client.personalities.create({
      name: "助手",
      description: "",
      instructions: "请耐心回答",
      selections: [{ attributeId: "personality/intellectual", weight: "mild" }],
    });
    expect(created.instructions).toContain("请耐心回答");
    expect(created.instructions).toContain("轻度");
    expect(presets.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: actor.userId }) }),
    );
    await expect(
      client.personalities.create({
        name: "冲突",
        description: "",
        instructions: "",
        selections: [
          { attributeId: "personality/intellectual", weight: "mild" },
          { attributeId: "personality/airhead", weight: "strong" },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(presets.create).toHaveBeenCalledTimes(1);
    presets.create.mockRejectedValueOnce({ code: "P2002" });
    await expect(
      client.personalities.create({
        name: "助手",
        description: "",
        instructions: "请耐心回答",
        selections: [],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      client.personalities.update({
        personalityId: "other-users-id",
        name: "test",
        description: "",
        instructions: "Be kind",
        selections: [],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(presets.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "other-users-id", userId: actor.userId },
      }),
    );
    await expect(
      client.personalities.remove({ personalityId: "other-users-id" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(presets.deleteMany).toHaveBeenCalledWith({
      where: { id: "other-users-id", userId: actor.userId },
    });
    const anonymous = createRouterClient(createRouter(deps), { context: {} as never });
    await expect(anonymous.personalities.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
