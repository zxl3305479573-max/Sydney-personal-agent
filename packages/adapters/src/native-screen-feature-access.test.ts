import type { AdapterContext } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { currentDbContext, runAsTenant } from "@rakazo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSandboxProvider } from "./fake-sandbox.js";
import { createRunSandbox } from "./host-aware-sandbox.js";
import { createSandboxProvider } from "./sandbox-factory.js";

vi.mock("./sandbox-factory.js", () => ({
  createSandboxProvider: vi.fn(async () => new FakeSandboxProvider()),
}));

const member: AdapterContext = {
  userId: "member",
  spaceId: "member-space",
  botId: "member-bot",
  operationId: "screen",
  traceId: "screen",
  signal: new AbortController().signal,
};

beforeEach(() => vi.clearAllMocks());

describe("explicit native shared screen access", () => {
  it.each([true, false, null, undefined])(
    "authorizes only explicit computer=true (%s)",
    async (computer) => {
      const findUnique = vi.fn(async () => {
        expect(currentDbContext()).toMatchObject({ kind: "tenant", userId: member.userId });
        return computer === undefined
          ? null
          : { computer, projects: null, github: null, integrations: null };
      });
      const prisma = { userFeatureAccess: { findUnique } } as unknown as PrismaClient;
      await createRunSandbox("native-linux", { prisma });
      const options = vi.mocked(createSandboxProvider).mock.calls[0]![1];
      const authorize = options.nativeLinuxScreenAuthorizeAdditionalViewer;
      expect(authorize).toBeTypeOf("function");
      await expect(runAsTenant(member, () => authorize!(member))).resolves.toBe(computer === true);
      expect(findUnique).toHaveBeenCalledWith({ where: { userId: member.userId } });
    },
  );

  it("reads current authorization again after a grant is revoked", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ computer: true })
      .mockResolvedValueOnce({ computer: false });
    await createRunSandbox("native-linux", {
      prisma: { userFeatureAccess: { findUnique } } as unknown as PrismaClient,
    });
    const authorize =
      vi.mocked(createSandboxProvider).mock.calls[0]![1]
        .nativeLinuxScreenAuthorizeAdditionalViewer!;
    await expect(authorize(member)).resolves.toBe(true);
    await expect(authorize(member)).resolves.toBe(false);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("denies access when authorization lookup fails", async () => {
    await createRunSandbox("native-linux", {
      prisma: {
        userFeatureAccess: { findUnique: vi.fn().mockRejectedValue(new Error("unavailable")) },
      } as unknown as PrismaClient,
    });
    const authorize =
      vi.mocked(createSandboxProvider).mock.calls[0]![1]
        .nativeLinuxScreenAuthorizeAdditionalViewer!;
    await expect(authorize(member)).rejects.toThrow("unavailable");
  });

  it("does not enable extra viewers without a database or on other providers", async () => {
    await createRunSandbox("native-linux", {});
    await createRunSandbox("fake", { prisma: {} as PrismaClient });
    for (const [, options] of vi.mocked(createSandboxProvider).mock.calls) {
      expect(options.nativeLinuxScreenAuthorizeAdditionalViewer).toBeUndefined();
    }
  });
});
