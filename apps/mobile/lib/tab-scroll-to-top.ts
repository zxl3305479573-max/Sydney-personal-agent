import type { MainNavigationRoute } from "./main-navigation";

type ScrollToTopHandler = () => void;

const listeners = new Map<MainNavigationRoute, Set<ScrollToTopHandler>>();

/**
 * Registers a scroll-to-top callback for a primary bottom-tab route.
 * Re-tapping the active tab triggers all registered handlers for that route.
 */
export function registerTabScrollToTop(
  route: MainNavigationRoute,
  handler: ScrollToTopHandler,
): () => void {
  let handlers = listeners.get(route);
  if (!handlers) {
    handlers = new Set();
    listeners.set(route, handlers);
  }
  handlers.add(handler);
  return () => {
    handlers?.delete(handler);
    if (handlers && handlers.size === 0) listeners.delete(route);
  };
}

/** Triggers scroll-to-top for the active tab route. Returns true when at least one handler ran. */
export function triggerTabScrollToTop(route: MainNavigationRoute): boolean {
  const handlers = listeners.get(route);
  if (!handlers || handlers.size === 0) return false;
  for (const handler of [...handlers]) handler();
  return true;
}
