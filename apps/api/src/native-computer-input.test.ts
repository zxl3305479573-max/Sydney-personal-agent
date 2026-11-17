import type { PrismaClient } from "@rakazo/db";
import { expect, it, vi } from "vitest";
import { applyNativeComputerInput } from "./native-computer-input.js";

function fixture() {
  const computer = {
    id: "computer",
    homeKey: "bot",
    kind: "native-linux",
    providerRef: "native:0123456789abcdef",
    state: "running",
    maintenanceId: null,
    controlHolder: "user",
    controlBotId: "bot",
    controlLeaseId: "lease",
    controlFence: 3,
    controlLeaseExpiresAt: new Date(Date.now() + 60_000),
    controlRunId: null,
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    bot: { findFirst: vi.fn().mockResolvedValue({ computer }) },
    computer: {
      findUnique: vi.fn(async () => computer),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    taughtSkill: { findFirst: vi.fn().mockResolvedValue(null) },
    computerExecutionLease: { findMany: vi.fn().mockResolvedValue([]) },
    run: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const prisma = { $transaction: vi.fn(async (task) => task(tx)) } as unknown as PrismaClient;
  const sendInput = vi.fn().mockResolvedValue(undefined);
  const target = { computerId: "computer", botId: "bot", providerRef: computer.providerRef };
  const invoke = (leaseId: string | undefined = "lease") =>
    applyNativeComputerInput(
      { prisma, sandbox: { sendInput } as never },
      { userId: "user", spaceId: "space" } as never,
      target,
      leaseId,
      { kind: "pointer", x: 1, y: 2, type: "click" },
      { signal: new AbortController().signal } as never,
    );
  return { computer, tx, prisma, sendInput, invoke };
}

it("uses a locked, current human lease without inventing a Run lease", async () => {
  const fixtureValue = fixture();
  await fixtureValue.invoke();
  expect(fixtureValue.tx.$queryRaw).toHaveBeenCalledOnce();
  expect(fixtureValue.sendInput).toHaveBeenCalledOnce();
  const context = fixtureValue.sendInput.mock.calls[0]![3];
  expect(context.nativeRunLease).toBeUndefined();
  expect(context.nativeControlLease).toMatchObject({ leaseId: "lease", fence: 3 });
  expect(await context.nativeControlLease.validate()).toBeGreaterThan(Date.now());
  fixtureValue.computer.controlLeaseId = "replacement";
  expect(await context.nativeControlLease.validate()).toBeNull();
});

it.each(["release", "replacement", "expiry", "generation", "bot", "maintenance", "stopped"])(
  "refuses input after %s before reaching the driver",
  async (change) => {
    const value = fixture();
    if (change === "release") value.computer.controlHolder = "none";
    if (change === "replacement") value.computer.controlLeaseId = "new";
    if (change === "expiry") value.computer.controlLeaseExpiresAt = new Date(0);
    if (change === "generation") value.computer.providerRef = "native:new";
    if (change === "bot") value.computer.controlBotId = "other";
    if (change === "maintenance") Object.assign(value.computer, { maintenanceId: "maintenance" });
    if (change === "stopped") value.computer.state = "stopped";
    await expect(value.invoke()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(value.sendInput).not.toHaveBeenCalled();
  },
);

it("rejects missing lease, archived bot, active execution and a competing control", async () => {
  const missing = fixture();
  await expect(missing.invoke("")).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(missing.prisma.$transaction).not.toHaveBeenCalled();
  const archived = fixture();
  archived.tx.bot.findFirst.mockResolvedValue(null);
  await expect(archived.invoke()).rejects.toMatchObject({ code: "FORBIDDEN" });
  const running = fixture();
  running.tx.computerExecutionLease.findMany.mockResolvedValue([{ runId: "run" }]);
  await expect(running.invoke()).rejects.toMatchObject({ code: "CONFLICT" });
  expect(running.sendInput).not.toHaveBeenCalled();
  const competing = fixture();
  competing.tx.computer.findFirst.mockResolvedValue({ id: "other" });
  await expect(competing.invoke()).rejects.toMatchObject({ code: "CONFLICT" });
  expect(competing.sendInput).not.toHaveBeenCalled();
});

it("reports unknown input outcomes without replaying the command", async () => {
  const value = fixture();
  value.sendInput.mockRejectedValue(new Error("native_driver_disconnected_result_unknown"));
  await expect(value.invoke()).rejects.toMatchObject({
    message: expect.stringContaining("不会自动重试"),
  });
  expect(value.sendInput).toHaveBeenCalledOnce();
});
