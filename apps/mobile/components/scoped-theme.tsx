import { useIsFocused } from "expo-router";
import { DarkTheme, ThemeProvider } from "expo-router/react-navigation";
import type { PropsWithChildren } from "react";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import { applyAppBackground, useAppBackground } from "../lib/app-background";
import { resolveUserMobileAppearance } from "../lib/appearance";
import { reportMobileError } from "../lib/monitoring";
import { useResolvedAppearance } from "../lib/native";
import { ScopedThemeContext, useScopedTheme } from "../lib/scoped-theme-context";
import { effectiveThemeAssignments } from "../lib/theme-manager";
import type { ResolvedScopedTheme, ThemeScope } from "../lib/theme-pack";
import { hasCustomThemeForScope, resolveScopedTheme, themeScopeForRoute } from "../lib/theme-pack";
import { themeManager } from "../lib/theme-state";
import { getActiveUiMode, getUiModeRevision, subscribeUiMode } from "../lib/ui-mode";
import { resolveUiModeTheme } from "../lib/ui-mode-registry";
import { UiModeCrashBoundary, UiModeRuntimeProvider, useUiModeRuntime } from "../lib/ui-mode-slots";

export function useThemeManagerSnapshot() {
  return useSyncExternalStore(
    themeManager.subscribe,
    themeManager.getSnapshot,
    themeManager.getSnapshot,
  );
}

export function useThemeForScope(scope: ThemeScope, preview = true): ResolvedScopedTheme | null {
  const snapshot = useThemeManagerSnapshot();
  useResolvedAppearance();
  const appearance = resolveUserMobileAppearance();
  return useMemo(
    () =>
      Platform.OS === "ios" &&
      snapshot.hydrated &&
      hasCustomThemeForScope(
        snapshot.packs,
        preview ? effectiveThemeAssignments(snapshot) : snapshot.assignments,
        scope,
      )
        ? resolveScopedTheme(
            snapshot.packs,
            preview ? effectiveThemeAssignments(snapshot) : snapshot.assignments,
            scope,
            appearance,
          )
        : null,
    [appearance, preview, scope, snapshot],
  );
}

export function ScopedThemeBackground({ children }: PropsWithChildren) {
  const theme = useScopedTheme();
  const background = theme?.background;
  return (
    <>
      {theme && background ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image
            source={{ uri: background.uri }}
            resizeMode={background.fit}
            accessible={false}
            style={{ width: "100%", height: "100%", opacity: background.opacity }}
          />
          {background.overlayOpacity > 0 ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: theme.appearance === "dark" ? "#000000" : "#FFFFFF",
                  opacity: background.overlayOpacity,
                },
              ]}
            />
          ) : null}
        </View>
      ) : null}
      {children}
    </>
  );
}

function ScopedThemeContent({
  theme,
  children,
}: PropsWithChildren<{ theme: ResolvedScopedTheme | null }>) {
  const runtime = useUiModeRuntime();
  if (!theme) return children;
  const navigationTheme = {
    ...DarkTheme,
    dark: theme.appearance === "dark",
    colors: {
      ...DarkTheme.colors,
      background: theme.tokens.background,
      card: theme.tokens.card,
      text: theme.tokens.foreground,
      border: theme.tokens.border,
      primary: theme.tokens.primary,
    },
  };
  return (
    <ScopedThemeContext.Provider value={theme}>
      <UiModeRuntimeProvider value={{ ...runtime, theme }}>
        <ThemeProvider value={navigationTheme}>
          <View style={{ flex: 1, backgroundColor: theme.tokens.background }}>
            <ScopedThemeBackground>{children}</ScopedThemeBackground>
          </View>
        </ThemeProvider>
      </UiModeRuntimeProvider>
    </ScopedThemeContext.Provider>
  );
}

export function ScopedThemeScreen({ scope, children }: PropsWithChildren<{ scope: ThemeScope }>) {
  const snapshot = useThemeManagerSnapshot();
  const theme = useThemeForScope(scope);
  const background = useAppBackground();
  const appearance = resolveUserMobileAppearance();
  const modeRevision = useSyncExternalStore(subscribeUiMode, getUiModeRevision, getUiModeRevision);
  const assignments = effectiveThemeAssignments(snapshot);
  const modeId =
    Platform.OS === "ios" && assignments.globalPackId === "midnight"
      ? "midnight"
      : getActiveUiMode().id;
  const effectiveTheme = useMemo(() => {
    if (!background.imageUri && !background.palette) return theme;
    const base = theme ?? {
      ...resolveUiModeTheme(modeId, { platform: Platform.OS, userAppearance: appearance }),
      scope,
      layout: "classic" as const,
      surface: "flat" as const,
      background: null,
    };
    return applyAppBackground(base, background);
  }, [appearance, background, scope, theme, modeId, modeRevision]);
  const packId = assignments.pages[scope] ?? assignments.globalPackId;
  const fallback = resolveScopedTheme(
    snapshot.packs,
    { schemaVersion: 1, globalPackId: "classic", pages: {} },
    scope,
    resolveUserMobileAppearance(),
  );
  if (!effectiveTheme) return children;
  return (
    <UiModeCrashBoundary
      modeId={packId}
      fallback={<ScopedThemeContent theme={fallback}>{children}</ScopedThemeContent>}
      onModeError={(error) => {
        reportMobileError(error, "react.render");
        if (snapshot.preview) themeManager.cancelPreview();
        else
          void themeManager
            .recover(assignments.pages[scope] ? scope : "all")
            .catch(() => undefined);
      }}
    >
      <ScopedThemeContent theme={effectiveTheme}>{children}</ScopedThemeContent>
    </UiModeCrashBoundary>
  );
}

export function ScopedThemeRoute({
  routeName,
  children,
}: PropsWithChildren<{ routeName: string }>) {
  const focused = useIsFocused();
  const scope = themeScopeForRoute(routeName);
  useEffect(() => {
    if (focused) themeManager.setActiveScope(scope);
  }, [focused, scope]);
  return <ScopedThemeScreen scope={scope}>{children}</ScopedThemeScreen>;
}
