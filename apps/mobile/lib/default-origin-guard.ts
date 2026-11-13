import * as SecureStore from "expo-secure-store";
import {
  currentSessionGeneration,
  loadVerifiedIntegrationsScopeForStartup,
  snapshotSessionToken,
} from "./session";

const LEGACY_ORIGIN = "https://pc.zxlup.xin";
const PRODUCTION_IP_ORIGIN = "https://124.221.182.39";
const SESSION_KEY = "rakazo.session_token";

export function isSydneySideload(): boolean {
  return process.env.EXPO_PUBLIC_SYDNEY_SIDELOAD === "1";
}

export async function compatibleDefaultOrigin(
  origin: string,
  hasCustomOrigin: boolean,
): Promise<string> {
  if (!isSydneySideload() || hasCustomOrigin || origin !== PRODUCTION_IP_ORIGIN) return origin;
  const generation = currentSessionGeneration();
  const stored = await SecureStore.getItemAsync(SESSION_KEY);
  const session = await snapshotSessionToken();
  if (!session.ok || generation !== currentSessionGeneration() || (stored && !session.value)) {
    throw new Error("Could not verify the saved server session");
  }
  if (!session.value) return origin;
  const verified = await loadVerifiedIntegrationsScopeForStartup();
  if (generation !== currentSessionGeneration()) {
    throw new Error("Could not verify the saved server session");
  }
  return !verified || verified.apiBase === LEGACY_ORIGIN ? LEGACY_ORIGIN : origin;
}

export async function guardDefaultOrigin(origin: string, hasCustomOrigin: boolean): Promise<void> {
  if (!isSydneySideload() || hasCustomOrigin) return;
  const generation = currentSessionGeneration();
  const stored = await SecureStore.getItemAsync(SESSION_KEY);
  const session = await snapshotSessionToken();
  if (!session.ok || generation !== currentSessionGeneration() || (stored && !session.value)) {
    throw new Error("Could not verify the saved server session");
  }
  if (!session.value) return;
  const verified = await loadVerifiedIntegrationsScopeForStartup();
  if (
    generation !== currentSessionGeneration() ||
    (verified ? verified.apiBase !== origin : origin !== LEGACY_ORIGIN)
  ) {
    throw new Error("Could not verify the saved server session");
  }
}
