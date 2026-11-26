import {
  ackUserMobileBridgeAction,
  getUserMobileBridge,
  recordAuditEvent,
  syncUserMobileBridgeSnapshot,
  updateUserMobileBridgePermissions,
} from "@rakazo/db";
import type { RouterContext } from "./context.js";

export function mobileBridgeRoutes(ctx: RouterContext) {
  const { deps, authed } = ctx;
  return {
    mobileBridge: {
      get: authed.mobileBridge.get.handler(({ context }) =>
        getUserMobileBridge(deps.prisma, context.actor.userId),
      ),
      updatePermissions: authed.mobileBridge.updatePermissions.handler(
        async ({ context, input }) => {
          const updated = await updateUserMobileBridgePermissions(
            deps.prisma,
            context.actor.userId,
            input,
          );
          await recordAuditEvent({
            action: "mobile_bridge.permissions_updated",
            actor: { type: "user", id: context.actor.userId },
            spaceId: context.actor.spaceId,
            target: { type: "user_mobile_bridge", id: context.actor.userId },
            metadata: {
              enabled: updated.permissions.enabled,
              foregroundAutoExecute: updated.permissions.foregroundAutoExecute,
            },
          });
          return updated;
        },
      ),
      syncSnapshot: authed.mobileBridge.syncSnapshot.handler(({ context, input }) =>
        syncUserMobileBridgeSnapshot(deps.prisma, context.actor.userId, input),
      ),
      ackAction: authed.mobileBridge.ackAction.handler(async ({ context, input }) => {
        await ackUserMobileBridgeAction(deps.prisma, context.actor.userId, input.actionId);
        await recordAuditEvent({
          action: "mobile_bridge.action_acknowledged",
          actor: { type: "user", id: context.actor.userId },
          spaceId: context.actor.spaceId,
          target: { type: "mobile_app_action", id: input.actionId },
          metadata: { status: input.status, detail: input.detail ?? null },
        });
        return { ok: true as const };
      }),
    },
  };
}
