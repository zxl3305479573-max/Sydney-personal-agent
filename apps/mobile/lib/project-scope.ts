import {
  captureApiRequestContext,
  currentApiBase,
  isSpaceSelectionPending,
  selectedSpaceId,
  spaceSelectionSeq,
  subscribeApiBase,
  subscribeSpaceSelection,
} from "./api";
import { currentSessionGeneration, subscribeSessionGeneration } from "./session";

export function projectScopeKey() {
  return JSON.stringify([
    currentApiBase(),
    currentSessionGeneration(),
    selectedSpaceId(),
    spaceSelectionSeq(),
    isSpaceSelectionPending(),
  ]);
}

export async function projectRequestOptions(scope: string) {
  function requireScope() {
    if (scope !== projectScopeKey() || isSpaceSelectionPending())
      throw new Error("The project workspace changed. Reopen the project and try again.");
  }
  requireScope();
  const requestContext = await captureApiRequestContext();
  requireScope();
  return { requestContext, skipSpaceAuthRecovery: true as const };
}

export function subscribeProjectScope(listener: () => void) {
  const unsubscribes = [
    subscribeApiBase(listener),
    subscribeSessionGeneration(listener),
    subscribeSpaceSelection(listener),
  ];
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
