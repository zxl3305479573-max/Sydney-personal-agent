import { ORPCError } from "@orpc/server";
import type { FeatureAccessFlags, UserFeatureKey } from "@rakazo/contracts";
import {
  isFeatureAccessRestrictedByDefault,
  USER_FEATURE_DENIED_MESSAGES,
} from "@rakazo/contracts";
import { resolveUserFeatureAccess } from "@rakazo/db";
import type { RouterDeps } from "./router.js";

type FeatureAccessDeps = Pick<RouterDeps, "prisma" | "env">;

export function adminEmailsForFeatureAccess(deps: FeatureAccessDeps): string[] {
  return deps.env?.adminEmails ?? [];
}

export function isFeatureAccessRestrictedForDeps(deps: FeatureAccessDeps): boolean {
  return isFeatureAccessRestrictedByDefault({
    sandboxProvider: deps.env?.sandboxProvider,
    adminEmails: deps.env?.adminEmails,
    featureAccessRestricted: deps.env?.featureAccessRestricted,
  });
}

export async function getActorFeatureAccess(
  deps: FeatureAccessDeps,
  userId: string,
): Promise<{ isAdmin: boolean; effective: FeatureAccessFlags }> {
  const resolved = await resolveUserFeatureAccess(deps.prisma, {
    userId,
    adminEmails: adminEmailsForFeatureAccess(deps),
    restrictNonAdmins: isFeatureAccessRestrictedForDeps(deps),
  });
  return {
    isAdmin: resolved.isAdmin,
    effective: resolved.effective,
  };
}

export async function requireFeatureAccess(
  deps: FeatureAccessDeps,
  userId: string,
  feature: UserFeatureKey,
): Promise<void> {
  const { effective } = await getActorFeatureAccess(deps, userId);
  if (!effective[feature]) {
    throw new ORPCError("FORBIDDEN", {
      message: USER_FEATURE_DENIED_MESSAGES[feature],
    });
  }
}
