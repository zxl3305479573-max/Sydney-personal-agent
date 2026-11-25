import { useFocusEffect } from "expo-router";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useState } from "react";

export const MAIN_NAVIGATION_ROUTES = ["/", "/chats", "/projects"] as const;
export type MainNavigationRoute = (typeof MAIN_NAVIGATION_ROUTES)[number];

export function showsMainNavigation(pathname: string): boolean {
  return MAIN_NAVIGATION_ROUTES.some((route) => route === pathname);
}

export function openMainNavigation(
  router: {
    push(route: MainNavigationRoute): void;
    replace(route: MainNavigationRoute): void;
    dismissTo(route: "/"): void;
  },
  pathname: string,
  target: MainNavigationRoute,
): void {
  if (pathname === target) return;
  if (target === "/") router.dismissTo("/");
  else if (pathname === "/") router.push(target);
  else router.replace(target);
}

const MainNavigationContext = createContext({
  hidden: false,
  setHidden: (_hidden: boolean) => {},
});

export function MainNavigationProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  return (
    <MainNavigationContext.Provider value={{ hidden, setHidden }}>
      {children}
    </MainNavigationContext.Provider>
  );
}

export function useMainNavigationHidden(): boolean {
  return useContext(MainNavigationContext).hidden;
}

export function useHideMainNavigation(hidden: boolean): void {
  const { setHidden } = useContext(MainNavigationContext);
  useFocusEffect(
    useCallback(() => {
      setHidden(hidden);
      return () => setHidden(false);
    }, [hidden, setHidden]),
  );
}
