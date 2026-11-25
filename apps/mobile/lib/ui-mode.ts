import * as ReactNative from "react-native";
import { midnightUiMode } from "../ui-modes/midnight";
import { CLASSIC_UI_MODE_ID } from "../ui-modes/types";
import {
  listAvailableUiModes,
  registerUiMode,
  resolveUiModeDefinition,
  subscribeUiModeRegistry,
} from "./ui-mode-registry";
import { createUiModeStore } from "./ui-mode-store";

function platformOs(): string {
  try {
    return ReactNative.Platform?.OS ?? "ios";
  } catch {
    return "ios";
  }
}

registerUiMode(midnightUiMode);

const listeners = new Set<() => void>();
let revision = 0;

const store = createUiModeStore({
  isModeAvailable: (modeId) => resolveUiModeDefinition(modeId, platformOs()).id === modeId,
  listAlternateModeIds: () =>
    listAvailableUiModes(platformOs())
      .filter((mode) => mode.id !== CLASSIC_UI_MODE_ID)
      .map((mode) => mode.id),
});

function notify() {
  revision += 1;
  for (const listener of [...listeners]) listener();
}

store.subscribe(notify);
subscribeUiModeRegistry(() => {
  store.reconcileRegistryChange();
  notify();
});

export const getUiModeSnapshot = store.getSnapshot;
export const loadUiMode = store.load;
export const setUiMode = store.setMode;
export const toggleAlternateUiMode = store.toggleAlternateMode;
export const beginUiModePreview = store.beginPreview;
export const cancelUiModePreview = store.cancelPreview;
export const commitUiModePreview = store.commitPreview;
export const resetUiModeToClassic = store.resetToClassic;

export function getActiveUiMode() {
  return resolveUiModeDefinition(store.getSnapshot().activeModeId, platformOs());
}

export function getUiModeRevision(): number {
  return revision;
}

export function subscribeUiMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
