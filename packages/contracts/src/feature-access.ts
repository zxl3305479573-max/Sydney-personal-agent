import * as z from "zod";
import { Id } from "./ids.js";

export const USER_FEATURE_KEYS = ["computer", "projects", "github", "integrations"] as const;
export type UserFeatureKey = (typeof USER_FEATURE_KEYS)[number];

export const FeatureAccessFlagsSchema = z.object({
  computer: z.boolean(),
  projects: z.boolean(),
  github: z.boolean(),
  integrations: z.boolean(),
});
export type FeatureAccessFlags = z.infer<typeof FeatureAccessFlagsSchema>;

export const FeatureAccessOverridesSchema = z.object({
  computer: z.boolean().nullable(),
  projects: z.boolean().nullable(),
  github: z.boolean().nullable(),
  integrations: z.boolean().nullable(),
});
export type FeatureAccessOverrides = z.infer<typeof FeatureAccessOverridesSchema>;

export const FeatureAccessOverridesPatchSchema = z.object({
  computer: z.boolean().nullable().optional(),
  projects: z.boolean().nullable().optional(),
  github: z.boolean().nullable().optional(),
  integrations: z.boolean().nullable().optional(),
});
export type FeatureAccessOverridesPatch = z.infer<typeof FeatureAccessOverridesPatchSchema>;

export const AdminUserFeatureAccessSchema = z.object({
  userId: Id,
  email: z.string().email(),
  name: z.string(),
  image: z.string().nullable().optional(),
  emailVerified: z.boolean(),
  isAdmin: z.boolean(),
  createdAt: z.string(),
  overrides: FeatureAccessOverridesSchema,
  effective: FeatureAccessFlagsSchema,
});
export type AdminUserFeatureAccess = z.infer<typeof AdminUserFeatureAccessSchema>;

export const AdminFeatureAccessListOutputSchema = z.object({
  restrictNonAdmins: z.boolean(),
  users: z.array(AdminUserFeatureAccessSchema),
});
export type AdminFeatureAccessListOutput = z.infer<typeof AdminFeatureAccessListOutputSchema>;

export const UpdateUserFeatureAccessInputSchema = FeatureAccessOverridesPatchSchema.extend({
  userId: Id,
});
export type UpdateUserFeatureAccessInput = z.infer<typeof UpdateUserFeatureAccessInputSchema>;

export const ALL_FEATURES_ENABLED: FeatureAccessFlags = {
  computer: true,
  projects: true,
  github: true,
  integrations: true,
};

export const ALL_FEATURES_DISABLED: FeatureAccessFlags = {
  computer: false,
  projects: false,
  github: false,
  integrations: false,
};

export const EMPTY_FEATURE_OVERRIDES: FeatureAccessOverrides = {
  computer: null,
  projects: null,
  github: null,
  integrations: null,
};

export const USER_FEATURE_DENIED_MESSAGES: Record<UserFeatureKey, string> = {
  computer: "Cloud computer access is disabled for this account.",
  projects: "Project workspaces are disabled for this account.",
  github: "GitHub access is disabled for this account.",
  integrations: "Connected apps and MCP plugins are disabled for this account.",
};

export function normalizeFeatureAccessOverrides(
  raw?: Partial<Record<UserFeatureKey, boolean | null | undefined>> | null,
): FeatureAccessOverrides {
  return {
    computer: typeof raw?.computer === "boolean" ? raw.computer : null,
    projects: typeof raw?.projects === "boolean" ? raw.projects : null,
    github: typeof raw?.github === "boolean" ? raw.github : null,
    integrations: typeof raw?.integrations === "boolean" ? raw.integrations : null,
  };
}

/**
 * Non-admin accounts default to restricted mode when explicitly enabled via
 * SYDNEY_FEATURE_ACCESS_RESTRICTED=true, or automatically on single-host
 * native-linux deployments once RAKAZO_ADMIN_EMAILS is configured.
 */
export function isFeatureAccessRestrictedByDefault(env: {
  sandboxProvider?: string;
  adminEmails?: readonly string[];
  featureAccessRestricted?: boolean;
}): boolean {
  if (typeof env.featureAccessRestricted === "boolean") {
    return env.featureAccessRestricted;
  }
  return env.sandboxProvider === "native-linux" && (env.adminEmails?.length ?? 0) > 0;
}

export function resolveFeatureAccess(options: {
  isAdmin: boolean;
  restrictNonAdmins: boolean;
  overrides?: Partial<Record<UserFeatureKey, boolean | null | undefined>> | null;
}): FeatureAccessFlags {
  if (options.isAdmin) return { ...ALL_FEATURES_ENABLED };
  const fallback = !options.restrictNonAdmins;
  const overrides = normalizeFeatureAccessOverrides(options.overrides);
  return {
    computer: overrides.computer ?? fallback,
    projects: overrides.projects ?? fallback,
    github: overrides.github ?? fallback,
    integrations: overrides.integrations ?? fallback,
  };
}
