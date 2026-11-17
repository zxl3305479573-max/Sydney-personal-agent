import * as SecureStore from "expo-secure-store";
import {
  currentSessionGeneration,
  loadVerifiedIntegrationsScopeForStartup,
  saveVerifiedIntegrationsScope,
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
  _hasCustomOrigin: boolean,
): Promise<string> {
  return origin;
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
  let verified = await loadVerifiedIntegrationsScopeForStartup();
  if (generation !== currentSessionGeneration()) {
    throw new Error("Could not verify the saved server session");
  }
  if (!verified) {
    if (origin === PRODUCTION_IP_ORIGIN) return;
    throw new Error("Could not verify the saved server session");
  }
  if (verified.apiBase === origin) return;
  if (verified.apiBase !== LEGACY_ORIGIN || origin !== PRODUCTION_IP_ORIGIN) {
    throw new Error("Could not verify the saved server session");
  }
  await saveVerifiedIntegrationsScope(generation, { ...verified, apiBase: origin });
  if (generation !== currentSessionGeneration()) {
    throw new Error("Could not verify the saved server session");
  }
  verified = await loadVerifiedIntegrationsScopeForStartup();
  if (generation !== currentSessionGeneration() || verified?.apiBase !== origin) {
    throw new Error("Could not verify the saved server session");
  }
}
