import { ORPCError } from "@orpc/server";
import type { AdapterContext, SandboxProvider } from "@rakazo/adapter-kit";
import type { TeachComputerInput } from "@rakazo/adapters";
import { applyTeachingDesktopInput, hasActiveComputerControl } from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";

export async function applyNativeComputerInput(
  deps: { prisma: PrismaClient; sandbox: SandboxProvider },
  actor: Actor,
  target: { computerId: string; botId: string; providerRef: string },
  leaseId: string | undefined,
  input: TeachComputerInput,
  context: AdapterContext,
): Promise<void> {
  if (!leaseId) throw new ORPCError("FORBIDDEN", { message: "请退出后重新接管电脑。" });
  await deps.prisma
    .$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM computers WHERE id = ${target.computerId} FOR UPDATE`;
        const bot = await tx.bot.findFirst({
          where: {
            id: target.botId,
            spaceId: actor.spaceId,
            computerId: target.computerId,
            archivedAt: null,
          },
          include: { computer: true },
        });
        const computer = bot?.computer ?? null;
        if (
          computer?.kind !== "native-linux" ||
          computer.providerRef !== target.providerRef ||
          computer.state !== "running" ||
          computer.maintenanceId ||
          !hasActiveComputerControl(computer) ||
          computer.controlBotId !== target.botId ||
          computer.controlLeaseId !== leaseId ||
          computer.controlFence < 1
        ) {
          throw new ORPCError("FORBIDDEN", { message: "电脑接管已结束，请重新接管后再操作。" });
        }
        const recording = await tx.taughtSkill.findFirst({
          where: { botId: target.botId, spaceId: actor.spaceId, status: "recording" },
          select: { id: true },
        });
        if (recording) {
          throw new ORPCError("CONFLICT", { message: "请先结束技能教学，再操作原生云电脑。" });
        }
        const otherControl = await tx.computer.findFirst({
          where: {
            id: { not: computer.id },
            kind: "native-linux",
            providerRef: target.providerRef,
            controlHolder: "user",
            controlLeaseExpiresAt: { gt: new Date() },
          },
          select: { id: true },
        });
        if (otherControl) {
          throw new ORPCError("CONFLICT", { message: "同一桌面的另一个接管尚未结束，请先退出。" });
        }
        const leases = await tx.computerExecutionLease.findMany({
          where: { computerId: computer.id, expiresAt: { gt: new Date() } },
          select: { runId: true },
        });
        const waiting = computer.controlRunId
          ? await tx.run.findUnique({
              where: { id: computer.controlRunId },
              select: { status: true },
            })
          : null;
        if (
          leases.some(
            (lease) =>
              lease.runId !== computer.controlRunId || waiting?.status !== "waiting_takeover",
          )
        ) {
          throw new ORPCError("CONFLICT", { message: "小伙伴仍在释放电脑，请稍后重新操作。" });
        }
        await applyTeachingDesktopInput(deps.sandbox, computer, input, {
          ...context,
          nativeRunLease: undefined,
          nativeControlLease: {
            leaseId,
            fence: computer.controlFence,
            validate: async () => {
              const current = await tx.computer.findUnique({ where: { id: computer.id } });
              return current &&
                current.controlLeaseId === leaseId &&
                current.controlBotId === target.botId &&
                current.controlHolder === "user" &&
                current.providerRef === target.providerRef &&
                current.state === "running" &&
                !current.maintenanceId
                ? (current.controlLeaseExpiresAt?.getTime() ?? null)
                : null;
            },
          },
        });
      },
      { timeout: 12_000, maxWait: 2_000 },
    )
    .catch((error: unknown) => {
      if (error instanceof ORPCError) throw error;
      if (error instanceof Error && error.message === "native_control_busy") {
        throw new ORPCError("CONFLICT", { message: "小伙伴仍在释放电脑，请稍后重新操作。" });
      }
      throw new ORPCError("CONFLICT", {
        message: "电脑输入未确认，请先查看画面，再退出并重新接管。系统不会自动重试。",
      });
    });
}
