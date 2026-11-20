import { Platform } from "react-native";
import { midnightUiMode } from "../ui-modes/midnight";
import { CLASSIC_UI_MODE_ID } from "../ui-modes/types";
import {
  listAvailableUiModes,
  registerUiMode,
  resolveUiModeDefinition,
  subscribeUiModeRegistry,
} from "./ui-mode-registry";
import { createUiModeStore } from "./ui-mode-store";

registerUiMode(midnightUiMode);

const listeners = new Set<() => void>();
let revision = 0;

const store = createUiModeStore({
  isModeAvailable: (modeId) => resolveUiModeDefinition(modeId, Platform.OS).id === modeId,
  listAlternateModeIds: () =>
    listAvailableUiModes(Platform.OS)
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
  return resolveUiModeDefinition(store.getSnapshot().activeModeId, Platform.OS);
}

export function getUiModeRevision(): number {
  return revision;
}

export function subscribeUiMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
