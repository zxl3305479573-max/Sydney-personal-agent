import type { PrismaClient } from "@rakazo/db";

type ControlLease = {
  controlHolder?: string | null;
  controlBotId?: string | null;
  controlLeaseId?: string | null;
  controlLeaseExpiresAt?: Date | null;
  controlFence?: number | null;
};

function isActiveControlLease(computer: ControlLease, botId: string, now = Date.now()) {
  return computer.controlHolder === "user" &&
    computer.controlBotId === botId &&
    computer.controlLeaseId &&
    computer.controlLeaseExpiresAt &&
    computer.controlLeaseExpiresAt.getTime() > now
    ? computer.controlLeaseId
    : null;
}

export function activeControlLease(computer: ControlLease, botId: string, now = Date.now()) {
  const leaseId = isActiveControlLease(computer, botId, now);
  return leaseId && (computer.controlFence ?? 0) >= 1
    ? { leaseId, fence: computer.controlFence! }
    : null;
}

export async function ensureNativeControlFence(
  prisma: PrismaClient,
  computerId: string,
  botId: string,
  leaseId: string,
): Promise<number | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ controlFence: number }>>`
      SELECT "controlFence" FROM computers WHERE id = ${computerId} FOR UPDATE`;
    const current = rows[0];
    if (!current) return null;
    const computer = await tx.computer.findUnique({
      where: { id: computerId },
      select: {
        controlHolder: true,
        controlBotId: true,
        controlLeaseId: true,
        controlLeaseExpiresAt: true,
        controlFence: true,
      },
    });
    if (!computer || computer.controlLeaseId !== leaseId) return null;
    if (!isActiveControlLease(computer, botId)) return null;
    const fence = Math.max(current.controlFence, 1);
    if (current.controlFence !== fence) {
      await tx.computer.update({
        where: { id: computerId },
        data: { controlFence: fence },
      });
    }
    return fence;
  });
}
