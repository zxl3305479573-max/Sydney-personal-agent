import { ORPCError } from "@orpc/server";
import {
  FeatureAccessAdminLockedError,
  FeatureAccessUserNotFoundError,
  listUsersFeatureAccess,
  recordSecurityEvent,
  upsertUserFeatureAccess,
} from "@rakazo/db";
import { requireAdmin } from "../admins.js";
import {
  adminEmailsForFeatureAccess,
  isFeatureAccessRestrictedForDeps,
} from "../feature-access.js";
import type { RouterContext } from "./context.js";

export function featureAccessRoutes(ctx: RouterContext) {
  const { deps, authed } = ctx;
  return {
    featureAccess: {
      listUsers: authed.featureAccess.listUsers.handler(async ({ context }) => {
        await requireAdmin(deps, context.actor.userId);
        const restrictNonAdmins = isFeatureAccessRestrictedForDeps(deps);
        const users = await listUsersFeatureAccess(deps.prisma, {
          adminEmails: adminEmailsForFeatureAccess(deps),
          restrictNonAdmins,
        });
        return { restrictNonAdmins, users };
      }),
      updateUser: authed.featureAccess.updateUser.handler(async ({ context, input }) => {
        await requireAdmin(deps, context.actor.userId);
        const restrictNonAdmins = isFeatureAccessRestrictedForDeps(deps);
        const { userId, ...patch } = input;
        try {
          const updated = await upsertUserFeatureAccess(deps.prisma, {
            userId,
            updatedById: context.actor.userId,
            patch,
            adminEmails: adminEmailsForFeatureAccess(deps),
            restrictNonAdmins,
          });
          await recordSecurityEvent({
            type: "admin.feature_access.updated",
            userId: context.actor.userId,
            spaceId: context.actor.spaceId,
            metadata: {
              targetUserId: userId,
              computer: updated.effective.computer,
              projects: updated.effective.projects,
              github: updated.effective.github,
              integrations: updated.effective.integrations,
            },
          }).catch(() => undefined);
          return updated;
        } catch (error) {
          if (error instanceof FeatureAccessUserNotFoundError) {
            throw new ORPCError("NOT_FOUND", { message: error.message });
          }
          if (error instanceof FeatureAccessAdminLockedError) {
            throw new ORPCError("BAD_REQUEST", { message: error.message });
          }
          throw error;
        }
      }),
    },
  };
}
