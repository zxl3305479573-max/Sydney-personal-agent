import type { PrismaClient } from "@rakazo/db";
import { expect, it, vi } from "vitest";
import { activeControlLease, ensureNativeControlFence } from "./native-computer-control-fence.js";

function fixture(fence: number, overrides: Record<string, unknown> = {}) {
  const computer = {
    controlHolder: "user",
    controlBotId: "bot",
    controlLeaseId: "lease",
    controlLeaseExpiresAt: new Date(Date.now() + 60_000),
    controlFence: fence,
    ...overrides,
  };
  const update = vi.fn().mockResolvedValue(undefined);
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ controlFence: fence }]),
    computer: {
      findUnique: vi.fn().mockResolvedValue(computer),
      update,
    },
  };
  const prisma = { $transaction: vi.fn(async (task) => task(tx)) } as unknown as PrismaClient;
  return { prisma, tx, update };
}

it("recognizes only an active, fenced lease for the requested bot", () => {
  const computer = {
    controlHolder: "user",
    controlBotId: "bot",
    controlLeaseId: "lease",
    controlLeaseExpiresAt: new Date(Date.now() + 60_000),
    controlFence: 3,
  };
  expect(activeControlLease(computer, "bot")).toEqual({ leaseId: "lease", fence: 3 });
  expect(activeControlLease({ ...computer, controlFence: 0 }, "bot")).toBeNull();
  expect(activeControlLease(computer, "other")).toBeNull();
  expect(activeControlLease({ ...computer, controlHolder: "none" }, "bot")).toBeNull();
  expect(activeControlLease({ ...computer, controlLeaseExpiresAt: new Date(0) }, "bot")).toBeNull();
});

it("upgrades a legacy active lease and leaves a current fence unchanged", async () => {
  const legacy = fixture(0);
  await expect(ensureNativeControlFence(legacy.prisma, "computer", "bot", "lease")).resolves.toBe(
    1,
  );
  expect(legacy.tx.$queryRaw).toHaveBeenCalledOnce();
  expect(legacy.update).toHaveBeenCalledWith({
    where: { id: "computer" },
    data: { controlFence: 1 },
  });
  const current = fixture(7);
  await expect(ensureNativeControlFence(current.prisma, "computer", "bot", "lease")).resolves.toBe(
    7,
  );
  expect(current.update).not.toHaveBeenCalled();
});

it.each(["replacement", "expiry", "holder", "bot"])(
  "refuses to upgrade %s without the exact active lease",
  async (change) => {
    const value = fixture(0);
    if (change === "replacement")
      value.tx.computer.findUnique.mockResolvedValue({
        controlHolder: "user",
        controlBotId: "bot",
        controlLeaseId: "replacement",
        controlLeaseExpiresAt: new Date(Date.now() + 60_000),
      });
    if (change === "expiry")
      value.tx.computer.findUnique.mockResolvedValue({
        controlHolder: "user",
        controlBotId: "bot",
        controlLeaseId: "lease",
        controlLeaseExpiresAt: new Date(0),
      });
    if (change === "holder")
      value.tx.computer.findUnique.mockResolvedValue({
        controlHolder: "none",
        controlBotId: "bot",
        controlLeaseId: "lease",
        controlLeaseExpiresAt: new Date(Date.now() + 60_000),
      });
    if (change === "bot")
      value.tx.computer.findUnique.mockResolvedValue({
        controlHolder: "user",
        controlBotId: "other",
        controlLeaseId: "lease",
        controlLeaseExpiresAt: new Date(Date.now() + 60_000),
      });
    await expect(
      ensureNativeControlFence(value.prisma, "computer", "bot", "lease"),
    ).resolves.toBeNull();
    expect(value.update).not.toHaveBeenCalled();
  },
);
