import { describe, expect, it } from "vitest";
import { MeSchema } from "./domain.js";
import {
  ALL_FEATURES_DISABLED,
  ALL_FEATURES_ENABLED,
  isFeatureAccessRestrictedByDefault,
  normalizeFeatureAccessOverrides,
  resolveFeatureAccess,
} from "./feature-access.js";

describe("feature access policy contracts", () => {
  it("defaults native-linux with configured admins to restricted mode for non-admins", () => {
    expect(
      isFeatureAccessRestrictedByDefault({
        sandboxProvider: "native-linux",
        adminEmails: ["owner@example.test"],
      }),
    ).toBe(true);
    expect(
      isFeatureAccessRestrictedByDefault({
        sandboxProvider: "native-linux",
        adminEmails: [],
      }),
    ).toBe(false);
    expect(
      isFeatureAccessRestrictedByDefault({
        sandboxProvider: "docker",
        adminEmails: ["owner@example.test"],
      }),
    ).toBe(false);
    expect(
      isFeatureAccessRestrictedByDefault({
        sandboxProvider: "docker",
        adminEmails: ["owner@example.test"],
        featureAccessRestricted: true,
      }),
    ).toBe(true);
    expect(
      isFeatureAccessRestrictedByDefault({
        sandboxProvider: "native-linux",
        adminEmails: ["owner@example.test"],
        featureAccessRestricted: false,
      }),
    ).toBe(false);
  });

  it("keeps admin accounts fully enabled regardless of restriction or overrides", () => {
    expect(
      resolveFeatureAccess({
        isAdmin: true,
        restrictNonAdmins: true,
        overrides: { computer: false, projects: false, github: false, integrations: false },
      }),
    ).toEqual(ALL_FEATURES_ENABLED);
  });

  it("applies role defaults and per-user overrides for non-admin accounts", () => {
    expect(
      resolveFeatureAccess({
        isAdmin: false,
        restrictNonAdmins: true,
        overrides: null,
      }),
    ).toEqual(ALL_FEATURES_DISABLED);

    expect(
      resolveFeatureAccess({
        isAdmin: false,
        restrictNonAdmins: true,
        overrides: { projects: true, github: null, integrations: true, computer: false },
      }),
    ).toEqual({
      computer: false,
      projects: true,
      github: false,
      integrations: true,
    });

    expect(
      resolveFeatureAccess({
        isAdmin: false,
        restrictNonAdmins: false,
        overrides: { computer: false },
      }),
    ).toEqual({
      computer: false,
      projects: true,
      github: true,
      integrations: true,
    });
  });

  it("normalizes partial overrides to explicit booleans or null", () => {
    expect(normalizeFeatureAccessOverrides({ computer: true, github: undefined })).toEqual({
      computer: true,
      projects: null,
      github: null,
      integrations: null,
    });
  });

  it("accepts Me payloads both with and without featureAccess for backward compatibility", () => {
    const base = {
      ticketBoardEnabled: false,
      userId: "user-1",
      email: "friend@example.test",
      name: "Friend",
      spaceId: "space-1",
      isDeploymentOwner: false,
      needsModel: false,
      defaultProvider: "openrouter",
      defaultModel: "model-1",
      hostCredentialProvider: null,
      hostCredentialSource: null,
      computerHost: null,
      canChooseHostComputer: false,
      sandboxProvider: "native-linux",
      avatarStyle: "organic" as const,
      billingEnabled: false,
    };
    expect(MeSchema.parse(base).featureAccess).toBeUndefined();
    expect(
      MeSchema.parse({
        ...base,
        featureAccess: { computer: false, projects: true, github: false, integrations: false },
      }).featureAccess,
    ).toEqual({ computer: false, projects: true, github: false, integrations: false });
  });
});
