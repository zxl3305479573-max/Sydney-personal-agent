import type { PersistedUiModeState, UiModeSnapshot } from "../ui-modes/types";
import { CLASSIC_UI_MODE_ID, UI_MODE_SCHEMA_VERSION, UI_MODE_STORAGE_KEY } from "../ui-modes/types";

export type UiModeStorageAdapter = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
};

export type UiModeStoreOptions = {
  storage?: UiModeStorageAdapter;
  storageKey?: string;
  /** Returns true if `modeId` is currently registered and supported on the runtime platform. */
  isModeAvailable: (modeId: string) => boolean;
  /** Lists available non-classic mode IDs in display order (used when toggling from classic with no prior alternate). */
  listAlternateModeIds?: () => readonly string[];
  /** Optional callback whenever the effective activeModeId changes (e.g. to sync native color scheme). */
  onEffectiveModeChange?: (activeModeId: string) => void;
};

export type UiModeStore = {
  getSnapshot: () => UiModeSnapshot;
  subscribe: (listener: () => void) => () => void;
  reconcileRegistryChange: () => void;
  load: () => Promise<UiModeSnapshot>;
  setMode: (modeId: string) => Promise<UiModeSnapshot>;
  toggleAlternateMode: () => Promise<UiModeSnapshot>;
  beginPreview: (modeId: string) => UiModeSnapshot;
  cancelPreview: () => UiModeSnapshot;
  commitPreview: () => Promise<UiModeSnapshot>;
  resetToClassic: () => Promise<UiModeSnapshot>;
};

const defaultStorageAdapter: UiModeStorageAdapter = {
  getItemAsync: async (key) => (await import("expo-secure-store")).getItemAsync(key),
  setItemAsync: async (key, value) => (await import("expo-secure-store")).setItemAsync(key, value),
};

function createDefaultPersistedState(): PersistedUiModeState {
  return {
    schemaVersion: UI_MODE_SCHEMA_VERSION,
    activeModeId: CLASSIC_UI_MODE_ID,
    lastAlternateModeId: null,
  };
}

function isNonEmptyModeId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parsePersistedUiModeState(raw: string | null): PersistedUiModeState {
  if (typeof raw !== "string" || raw.length === 0) {
    return createDefaultPersistedState();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createDefaultPersistedState();
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return createDefaultPersistedState();
  }

  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== UI_MODE_SCHEMA_VERSION) {
    return createDefaultPersistedState();
  }

  const activeModeId = isNonEmptyModeId(record.activeModeId)
    ? record.activeModeId
    : CLASSIC_UI_MODE_ID;
  const lastAlternateModeId =
    isNonEmptyModeId(record.lastAlternateModeId) &&
    record.lastAlternateModeId !== CLASSIC_UI_MODE_ID
      ? record.lastAlternateModeId
      : null;

  return {
    schemaVersion: UI_MODE_SCHEMA_VERSION,
    activeModeId,
    lastAlternateModeId,
  };
}

export function serializePersistedUiModeState(state: PersistedUiModeState): string {
  return JSON.stringify({
    schemaVersion: UI_MODE_SCHEMA_VERSION,
    activeModeId: state.activeModeId,
    lastAlternateModeId:
      state.lastAlternateModeId === CLASSIC_UI_MODE_ID ? null : state.lastAlternateModeId,
  });
}

function snapshotsEqual(a: UiModeSnapshot, b: UiModeSnapshot): boolean {
  return (
    a.activeModeId === b.activeModeId &&
    a.savedModeId === b.savedModeId &&
    a.previewModeId === b.previewModeId &&
    a.lastAlternateModeId === b.lastAlternateModeId &&
    a.isClassic === b.isClassic &&
    a.hydrated === b.hydrated
  );
}

export function createUiModeStore(options: UiModeStoreOptions): UiModeStore {
  const storage = options.storage ?? defaultStorageAdapter;
  const storageKey = options.storageKey ?? UI_MODE_STORAGE_KEY;

  let savedModeId: string = CLASSIC_UI_MODE_ID;
  let lastAlternateModeId: string | null = null;
  let previewModeId: string | null = null;
  let hydrated = false;

  let writeGeneration = 0;
  let persistedGeneration = 0;
  let inFlightLoad: Promise<UiModeSnapshot> | null = null;
  let activePersistLoop: Promise<void> | null = null;

  const listeners = new Set<() => void>();

  function isSelectableMode(modeId: string): boolean {
    if (!isNonEmptyModeId(modeId)) {
      return false;
    }
    if (modeId === CLASSIC_UI_MODE_ID) {
      return true;
    }
    return options.isModeAvailable(modeId);
  }

  function resolveEffectiveModeId(candidate: string): string {
    if (candidate === CLASSIC_UI_MODE_ID) {
      return CLASSIC_UI_MODE_ID;
    }
    return options.isModeAvailable(candidate) ? candidate : CLASSIC_UI_MODE_ID;
  }

  function buildSnapshot(): UiModeSnapshot {
    const candidate = previewModeId ?? savedModeId;
    const activeModeId = resolveEffectiveModeId(candidate);
    return Object.freeze({
      activeModeId,
      savedModeId,
      previewModeId,
      lastAlternateModeId,
      isClassic: activeModeId === CLASSIC_UI_MODE_ID,
      hydrated,
    });
  }

  let currentSnapshot: UiModeSnapshot = buildSnapshot();

  function notifyListeners(): void {
    for (const listener of [...listeners]) {
      if (listeners.has(listener)) {
        listener();
      }
    }
  }

  function recomputeAndNotify(): void {
    const next = buildSnapshot();
    if (snapshotsEqual(currentSnapshot, next)) {
      return;
    }
    const previousActiveModeId = currentSnapshot.activeModeId;
    currentSnapshot = next;
    if (currentSnapshot.activeModeId !== previousActiveModeId) {
      options.onEffectiveModeChange?.(currentSnapshot.activeModeId);
    }
    notifyListeners();
  }

  function flushPersistence(): Promise<void> {
    if (activePersistLoop) {
      return activePersistLoop;
    }

    let settled = false;
    const pending = (async (): Promise<void> => {
      try {
        while (persistedGeneration < writeGeneration) {
          const targetGeneration = writeGeneration;
          const payload = serializePersistedUiModeState({
            schemaVersion: UI_MODE_SCHEMA_VERSION,
            activeModeId: savedModeId,
            lastAlternateModeId,
          });
          try {
            await storage.setItemAsync(storageKey, payload);
          } catch {
            // Keep the in-memory UI mode choice when SecureStore is unavailable.
          }
          persistedGeneration = targetGeneration;
        }
      } finally {
        settled = true;
        activePersistLoop = null;
      }
    })();

    if (!settled) {
      activePersistLoop = pending;
    }
    return pending;
  }

  function getSnapshot(): UiModeSnapshot {
    return currentSnapshot;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function reconcileRegistryChange(): void {
    recomputeAndNotify();
  }

  function load(): Promise<UiModeSnapshot> {
    if (inFlightLoad) {
      return inFlightLoad;
    }

    let settled = false;
    const pending = (async (): Promise<UiModeSnapshot> => {
      try {
        let raw: string | null = null;
        try {
          raw = await storage.getItemAsync(storageKey);
        } catch {
          raw = null;
        }

        if (writeGeneration === 0) {
          const persisted = parsePersistedUiModeState(raw);
          savedModeId = persisted.activeModeId;
          lastAlternateModeId = persisted.lastAlternateModeId;
        }

        hydrated = true;
        recomputeAndNotify();
        return currentSnapshot;
      } finally {
        settled = true;
        inFlightLoad = null;
      }
    })();

    if (!settled) {
      inFlightLoad = pending;
    }
    return pending;
  }

  async function setMode(modeId: string): Promise<UiModeSnapshot> {
    if (!isSelectableMode(modeId)) {
      throw new Error(`UI mode is not available: ${modeId}`);
    }

    previewModeId = null;
    savedModeId = modeId;
    if (modeId !== CLASSIC_UI_MODE_ID) {
      lastAlternateModeId = modeId;
    }

    writeGeneration += 1;
    recomputeAndNotify();
    await flushPersistence();
    return currentSnapshot;
  }

  async function toggleAlternateMode(): Promise<UiModeSnapshot> {
    if (currentSnapshot.activeModeId !== CLASSIC_UI_MODE_ID) {
      return setMode(CLASSIC_UI_MODE_ID);
    }

    if (
      lastAlternateModeId !== null &&
      lastAlternateModeId !== CLASSIC_UI_MODE_ID &&
      options.isModeAvailable(lastAlternateModeId)
    ) {
      return setMode(lastAlternateModeId);
    }

    const candidates = options.listAlternateModeIds?.() ?? [];
    const firstAvailable = candidates.find(
      (id) => isNonEmptyModeId(id) && id !== CLASSIC_UI_MODE_ID && options.isModeAvailable(id),
    );
    if (firstAvailable) {
      return setMode(firstAvailable);
    }

    return currentSnapshot;
  }

  function beginPreview(modeId: string): UiModeSnapshot {
    if (!isSelectableMode(modeId)) {
      throw new Error(`UI mode is not available: ${modeId}`);
    }

    previewModeId = modeId;
    recomputeAndNotify();
    return currentSnapshot;
  }

  function cancelPreview(): UiModeSnapshot {
    previewModeId = null;
    recomputeAndNotify();
    return currentSnapshot;
  }

  async function commitPreview(): Promise<UiModeSnapshot> {
    if (previewModeId !== null) {
      return setMode(previewModeId);
    }
    return currentSnapshot;
  }

  async function resetToClassic(): Promise<UiModeSnapshot> {
    previewModeId = null;
    savedModeId = CLASSIC_UI_MODE_ID;
    writeGeneration += 1;
    recomputeAndNotify();
    await flushPersistence();
    return currentSnapshot;
  }

  return {
    getSnapshot,
    subscribe,
    reconcileRegistryChange,
    load,
    setMode,
    toggleAlternateMode,
    beginPreview,
    cancelPreview,
    commitPreview,
    resetToClassic,
  };
}
