import { createContext, useContext } from "react";
import type { ColorValue } from "react-native";
import type { ResolvedScopedTheme } from "./theme-pack";

export const ScopedThemeContext = createContext<ResolvedScopedTheme | null>(null);

export function useScopedTheme() {
  return useContext(ScopedThemeContext);
}

/**
 * Returns `"transparent"` when the active screen scope has a theme background image so the
 * screen container does not paint an opaque solid fill over `ScopedThemeBackground`.
 */
export function useScreenBackground<T extends ColorValue>(fallback: T): T | string {
  const scope = useScopedTheme();
  return scope?.background ? "transparent" : (scope?.pageBackgroundColor ?? fallback);
}
