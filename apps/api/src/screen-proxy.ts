import { timingSafeEqual } from "node:crypto";
import type { SandboxProvider } from "@rakazo/adapter-kit";
import { hasActiveComputerControl, toComputerRef } from "@rakazo/adapters";
import { openScreenCapability, SCREEN_TARGET_ENDPOINT } from "@rakazo/core/node/screen-capability";
import type { PrismaClient } from "@rakazo/db";
import { runAsSystem } from "@rakazo/db";
import type { Hono } from "hono";
import { requestBodyLimit } from "./request-body-limit.js";

export function mountScreenTarget(
  app: Hono,
  prisma: PrismaClient,
  secret: string,
  sandbox?: SandboxProvider,
) {
  app.post(SCREEN_TARGET_ENDPOINT, requestBodyLimit(16 * 1024), async (c) => {
    c.header("cache-control", "no-store");
    const supplied = Buffer.from(c.req.header("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return c.body(null, 403);
    const body = await c.req.json().catch(() => null);
    if (typeof body?.path !== "string") return c.body(null, 403);
    const capability = openScreenCapability(body.path, secret);
    if (!capability) return c.body(null, 403);
    const { scope, target } = capability;
    // The sealed capability, not a session, names the bot and computer.
    const bot = await runAsSystem("check a screen proxy capability", () =>
      prisma.bot.findFirst({
        where: {
          id: scope.botId,
          computerId: scope.computerId,
          archivedAt: null,
          screenGeneration: scope.botGeneration,
        },
        select: {
          userId: true,
          spaceId: true,
          computer: {
            select: {
              homeKey: true,
              kind: true,
              screenGeneration: true,
              providerRef: true,
              state: true,
              controlHolder: true,
              controlLeaseId: true,
              controlBotId: true,
              controlLeaseExpiresAt: true,
            },
          },
        },
      }),
    );
    const computer = bot?.computer;
    if (
      !computer ||
      computer.screenGeneration !== scope.computerGeneration ||
      !computer.providerRef ||
      !["running", "booting"].includes(computer.state) ||
      (target.interactive &&
        (!hasActiveComputerControl(computer) ||
          !scope.controlLeaseId ||
          computer.controlLeaseId !== scope.controlLeaseId ||
          computer.controlBotId !== scope.botId))
    )
      return c.body(null, 403);
    if (computer.kind === "native-linux") {
      if (!sandbox || target.interactive) return c.body(null, 403);
      try {
        const session = await sandbox.connectScreen(
          toComputerRef(computer),
          { view: "stream", interactive: false },
          {
            operationId: "screen-recheck",
            traceId: "screen-recheck",
            userId: bot.userId,
            spaceId: bot.spaceId,
            botId: scope.botId,
            signal: AbortSignal.timeout(1000),
          },
        );
        if (!session.url) return c.body(null, 403);
        const current = new URL(session.url);
        if (
          current.protocol !== target.protocol ||
          current.hostname !== target.hostname ||
          Number(current.port || (current.protocol === "https:" ? 443 : 80)) !== target.port
        ) return c.body(null, 403);
      } catch {
        return c.body(null, 403);
      }
    }
    return c.json(target);
  });
}
