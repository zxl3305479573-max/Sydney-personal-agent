import type { ColorTokens } from "@rakazo/ui-tokens";
import { useMemo, useSyncExternalStore } from "react";
import { Platform, PlatformColor } from "react-native";
import type { ResolvedAppearance } from "./appearance";
import {
  getCachedAppearancePreference,
  mobileTokens,
  resolveMobileAppearance,
  subscribeAppearance,
} from "./appearance";
import { translucentColor } from "./color";
import { useScopedTheme } from "./scoped-theme-context";
import { themeManager } from "./theme-state";
import { getActiveUiMode, getUiModeRevision } from "./ui-mode";

function nativeColors(tokens: ColorTokens, appearance: ResolvedAppearance, useSystem: boolean) {
  const systemColor = (name: string, fallback: string) =>
    useSystem ? PlatformColor(name) : fallback;
  return {
    page: tokens.background,
    fill: systemColor("tertiarySystemFill", tokens.muted),
    quietFill: systemColor("quaternarySystemFill", tokens.muted),
    fillPressed: systemColor("secondarySystemFill", tokens.accent),
    separator: tokens.border,
    label: systemColor("label", tokens.foreground),
    secondaryLabel:
      appearance === "light"
        ? tokens.mutedForeground
        : systemColor("secondaryLabel", tokens.mutedForeground),
    tertiaryLabel: tokens.faintForeground,
    systemTertiaryLabel: systemColor(
      "tertiaryLabel",
      translucentColor(tokens.mutedForeground, 0.3),
    ),
    groupedPage: tokens.background,
    groupedCell: tokens.card,
  };
}

export type NativeColors = ReturnType<typeof nativeColors>;

function usesSystemColors(policy: string) {
  return (
    Platform.OS === "ios" && getCachedAppearancePreference() === "system" && policy === "platform"
  );
}

function globalNativeColors() {
  const installed = themeManager.getSnapshot();
  const policy =
    Platform.OS === "ios" && installed.hydrated
      ? installed.assignments.globalPackId === "classic"
        ? "platform"
        : "tokens"
      : getActiveUiMode().systemColorPolicy;
  return nativeColors(mobileTokens(), resolveMobileAppearance(), usesSystemColors(policy));
}

export const native = {
  get page() {
    return globalNativeColors().page;
  },
  get fill() {
    return globalNativeColors().fill;
  },
  get quietFill() {
    return globalNativeColors().quietFill;
  },
  get fillPressed() {
    return globalNativeColors().fillPressed;
  },
  get separator() {
    return globalNativeColors().separator;
  },
  get label() {
    return globalNativeColors().label;
  },
  get secondaryLabel() {
    return globalNativeColors().secondaryLabel;
  },
  get tertiaryLabel() {
    return globalNativeColors().tertiaryLabel;
  },
  get systemTertiaryLabel() {
    return globalNativeColors().systemTertiaryLabel;
  },
  get groupedPage() {
    return globalNativeColors().groupedPage;
  },
  get groupedCell() {
    return globalNativeColors().groupedCell;
  },
};

export function systemGreen(scheme: ResolvedAppearance): string {
  return scheme === "dark" ? "#30D158" : "#34C759";
}

let appearanceRevision = 0;
subscribeAppearance(() => {
  appearanceRevision += 1;
});
const appearanceSnapshot = () => appearanceRevision;

export function useResolvedAppearance(): ResolvedAppearance {
  useSyncExternalStore(subscribeAppearance, appearanceSnapshot, () => 0);
  return useScopedTheme()?.appearance ?? resolveMobileAppearance();
}

export function useThemedStyles<T>(factory: (tokens: ColorTokens, colors: NativeColors) => T): T {
  const resolved = useResolvedAppearance();
  const preference = getCachedAppearancePreference();
  const modeRevision = getUiModeRevision();
  const scope = useScopedTheme();
  const revision = appearanceSnapshot();
  return useMemo(() => {
    const tokens = scope?.tokens ?? mobileTokens();
    const colors = scope
      ? nativeColors(tokens, resolved, usesSystemColors(scope.systemColorPolicy))
      : native;
    return factory(tokens, colors);
  }, [factory, scope, resolved, preference, modeRevision, revision]);
}

export function useMobileTokens() {
  const resolved = useResolvedAppearance();
  const modeRevision = getUiModeRevision();
  const scope = useScopedTheme();
  const revision = appearanceSnapshot();
  return useMemo(() => scope?.tokens ?? mobileTokens(), [scope, resolved, modeRevision, revision]);
}

export function useNativeColors(): NativeColors {
  const scope = useScopedTheme();
  const tokens = useMobileTokens();
  return scope
    ? nativeColors(tokens, scope.appearance, usesSystemColors(scope.systemColorPolicy))
    : native;
}
