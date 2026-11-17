import {
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
