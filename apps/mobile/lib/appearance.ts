import type { AppearancePreference, ResolvedAppearance } from "@rakazo/ui-tokens";
import {
  normalizeAppearancePreference,
  resolveAppearance,
  UI_APPEARANCE_STORAGE_KEY,
} from "@rakazo/ui-tokens";
import * as SecureStore from "expo-secure-store";
import type { ColorSchemeName } from "react-native";
import { Appearance, Platform } from "react-native";
import { effectiveThemeAssignments } from "./theme-manager";
import { hasCustomThemeForScope, resolveScopedTheme } from "./theme-pack";
import { themeManager } from "./theme-state";
import { getActiveUiMode, subscribeUiMode } from "./ui-mode";
import { resolveUiModeTheme } from "./ui-mode-registry";

export type { AppearancePreference, ResolvedAppearance };

let memoryPreference: AppearancePreference | null = null;
let writeGeneration = 0;
const listeners = new Set<() => void>();

function systemAppearance(scheme?: ColorSchemeName | null): ResolvedAppearance {
  return (scheme ?? Appearance.getColorScheme()) === "light" ? "light" : "dark";
}

export function getCachedAppearancePreference(): AppearancePreference {
  return memoryPreference ?? "system";
}

export async function loadAppearancePreference(): Promise<AppearancePreference> {
  try {
    const stored = await SecureStore.getItemAsync(UI_APPEARANCE_STORAGE_KEY);
    memoryPreference = normalizeAppearancePreference(stored);
  } catch {
    memoryPreference = memoryPreference ?? "system";
  }
  applyNativeColorScheme(memoryPreference);
  notify();
  return memoryPreference;
}

export async function setAppearancePreference(
  preference: AppearancePreference,
): Promise<AppearancePreference> {
  memoryPreference = preference;
  const generation = ++writeGeneration;
  applyNativeColorScheme(preference);
  notify();
  await persistAppearancePreference(preference, generation);
  return preference;
}

export function resolveMobileAppearance(
  preference: AppearancePreference = getCachedAppearancePreference(),
  scheme?: ColorSchemeName | null,
): ResolvedAppearance {
  const installed = themeManager.getSnapshot();
  if (Platform.OS === "ios" && installed.hydrated) {
    const assignments = effectiveThemeAssignments(installed);
    const scope = themeManager.getActiveScope();
    if (hasCustomThemeForScope(installed.packs, assignments, scope)) {
      return resolveScopedTheme(
        installed.packs,
        assignments,
        scope,
        resolveUserMobileAppearance(preference, scheme),
      ).appearance;
    }
    if (assignments.globalPackId === "midnight") return "dark";
  }
  const lock = getActiveUiMode().colorSchemeLock;
  if (lock !== "none") return lock;
  return resolveUserMobileAppearance(preference, scheme);
}

export function resolveUserMobileAppearance(
  preference: AppearancePreference = getCachedAppearancePreference(),
  scheme?: ColorSchemeName | null,
): ResolvedAppearance {
  return resolveAppearance(preference, systemAppearance(scheme));
}

export function mobileTokens(
  preference: AppearancePreference = getCachedAppearancePreference(),
  scheme?: ColorSchemeName | null,
) {
  const installed = themeManager.getSnapshot();
  if (Platform.OS === "ios" && installed.hydrated) {
    const assignments = effectiveThemeAssignments(installed);
    const scope = themeManager.getActiveScope();
    if (hasCustomThemeForScope(installed.packs, assignments, scope)) {
      return resolveScopedTheme(
        installed.packs,
        assignments,
        scope,
        resolveUserMobileAppearance(preference, scheme),
      ).tokens;
    }
    const modeId = assignments.globalPackId === "midnight" ? "midnight" : getActiveUiMode().id;
    return resolveUiModeTheme(modeId, {
      platform: Platform.OS,
      userAppearance: resolveUserMobileAppearance(preference, scheme),
    }).tokens;
  }
  const mode = getActiveUiMode();
  return resolveUiModeTheme(mode.id, {
    platform: Platform.OS,
    userAppearance: resolveMobileAppearance(preference, scheme),
  }).tokens;
}

export function subscribeAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

async function persistAppearancePreference(
  preference: AppearancePreference,
  generation: number,
): Promise<void> {
  try {
    await SecureStore.setItemAsync(UI_APPEARANCE_STORAGE_KEY, preference);
  } catch {
    // Keep the in-memory preference when SecureStore is unavailable.
    return;
  }
  if (generation === writeGeneration) return;
  const latest = memoryPreference;
  if (latest === null) return;
  await persistAppearancePreference(latest, writeGeneration);
}

// Native surfaces (alerts, action sheets, the keyboard, iOS platform colors) follow the
// window's scheme, so an explicit app choice overrides it and System hands it back to the OS.
function applyNativeColorScheme(preference: AppearancePreference) {
  const installed = themeManager.getSnapshot();
  const lock =
    Platform.OS === "ios" && installed.hydrated
      ? effectiveThemeAssignments(installed).globalPackId === "midnight"
        ? "dark"
        : "none"
      : getActiveUiMode().colorSchemeLock;
  Appearance.setColorScheme(
    lock !== "none" ? lock : preference === "system" ? "unspecified" : preference,
  );
}

subscribeUiMode(() => {
  applyNativeColorScheme(getCachedAppearancePreference());
  notify();
});

themeManager.subscribe(() => {
  applyNativeColorScheme(getCachedAppearancePreference());
  notify();
});

Appearance.addChangeListener(() => {
  if (getCachedAppearancePreference() === "system") notify();
});
