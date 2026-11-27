import type { FeatureAccessFlags, Me, UserFeatureKey } from "@rakazo/contracts";
import { ALL_FEATURES_ENABLED } from "@rakazo/contracts";
import { useSyncExternalStore } from "react";
import { queryClient } from "./query-client";

export type AccountFeatureAccess = FeatureAccessFlags & {
  isAdmin: boolean;
};

type MeFeatureCarrier = Pick<Me, "isAdmin" | "featureAccess"> | Partial<Me> | null | undefined;

const DEFAULT_ACCESS: AccountFeatureAccess = {
  ...ALL_FEATURES_ENABLED,
  isAdmin: false,
};

let cachedMeRef: MeFeatureCarrier | undefined;
let cachedAccess: AccountFeatureAccess = DEFAULT_ACCESS;

function readCachedMe(): MeFeatureCarrier {
  const queries = queryClient.getQueryCache().getAll();
  let latest: { data: MeFeatureCarrier; updatedAt: number } | null = null;
  for (const query of queries) {
    const key = query.queryKey;
    if (Array.isArray(key) && key.length >= 3 && key[2] === "me" && query.state.data) {
      const updatedAt = query.state.dataUpdatedAt;
      if (!latest || updatedAt >= latest.updatedAt) {
        latest = { data: query.state.data as MeFeatureCarrier, updatedAt };
      }
    }
  }
  return latest?.data;
}

export function resolveMobileFeatureAccess(me: MeFeatureCarrier): AccountFeatureAccess {
  const flags = me?.featureAccess;
  return {
    computer: flags ? flags.computer : ALL_FEATURES_ENABLED.computer,
    projects: flags ? flags.projects : ALL_FEATURES_ENABLED.projects,
    github: flags ? flags.github : ALL_FEATURES_ENABLED.github,
    integrations: flags ? flags.integrations : ALL_FEATURES_ENABLED.integrations,
    isAdmin: me?.isAdmin === true,
  };
}

function getCachedFeatureAccessSnapshot(): AccountFeatureAccess {
  const me = readCachedMe();
  if (me === cachedMeRef) return cachedAccess;
  cachedMeRef = me;
  const next = resolveMobileFeatureAccess(me);
  if (
    next.computer === cachedAccess.computer &&
    next.projects === cachedAccess.projects &&
    next.github === cachedAccess.github &&
    next.integrations === cachedAccess.integrations &&
    next.isAdmin === cachedAccess.isAdmin
  ) {
    return cachedAccess;
  }
  cachedAccess = next;
  return cachedAccess;
}

function subscribeFeatureAccess(listener: () => void): () => void {
  return queryClient.getQueryCache().subscribe(() => {
    listener();
  });
}

export function hasFeatureAccess(me: MeFeatureCarrier, feature: UserFeatureKey): boolean {
  return resolveMobileFeatureAccess(me)[feature];
}

export function useFeatureAccess(): AccountFeatureAccess {
  return useSyncExternalStore(
    subscribeFeatureAccess,
    getCachedFeatureAccessSnapshot,
    getCachedFeatureAccessSnapshot,
  );
}
