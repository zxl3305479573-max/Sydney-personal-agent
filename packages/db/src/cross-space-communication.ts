import type { Prisma, PrismaClient } from "./client.js";

/** Call within the delivery transaction to serialize against disabling either bot. */
export async function crossSpaceCommunicationAllowed(
  prisma: Pick<PrismaClient | Prisma.TransactionClient, "$queryRaw">,
  senderBotId: string,
  targetBotId: string,
): Promise<boolean> {
  const bots = await prisma.$queryRaw<
    Array<{
      id: string;
      spaceId: string;
      userId: string;
      projectWorkspaceId: string | null;
      crossSpaceCommunication: boolean;
      archivedAt: Date | null;
    }>
  >`
    SELECT id, "spaceId", "userId", "projectWorkspaceId", "crossSpaceCommunication", "archivedAt" FROM bots
    WHERE id = ${senderBotId} OR id = ${targetBotId}
    ORDER BY id FOR NO KEY UPDATE
  `;
  if (bots.length !== 2 || bots.some((bot) => bot.archivedAt)) return false;
  const sender = bots.find((bot) => bot.id === senderBotId);
  const target = bots.find((bot) => bot.id === targetBotId);
  if (
    !sender ||
    !target ||
    sender.id === target.id ||
    bots.some(
      (bot) =>
        !bot.spaceId ||
        !bot.userId ||
        (bot.projectWorkspaceId !== null &&
          (typeof bot.projectWorkspaceId !== "string" || !bot.projectWorkspaceId)),
    ) ||
    sender.projectWorkspaceId !== target.projectWorkspaceId
  )
    return false;
  if (sender.projectWorkspaceId !== null) {
    return sender.spaceId === target.spaceId && sender.userId === target.userId;
  }
  return (
    sender.spaceId === target.spaceId || bots.every((bot) => bot.crossSpaceCommunication === true)
  );
}

export class CrossSpaceCommunicationBlockedError extends Error {
  constructor() {
    super("Cross-space bot communication is disabled.");
    this.name = "CrossSpaceCommunicationBlockedError";
  }
}
