import { createContext, useContext } from "react";
import type { ResolvedScopedTheme } from "./theme-pack";

export const ScopedThemeContext = createContext<ResolvedScopedTheme | null>(null);

export function useScopedTheme() {
  return useContext(ScopedThemeContext);
}
