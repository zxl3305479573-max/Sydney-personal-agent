import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLASSIC_UI_MODE_ID, UI_MODE_SCHEMA_VERSION, UI_MODE_STORAGE_KEY } from "../ui-modes/types";
import type { UiModeStorageAdapter } from "./ui-mode-store";

const defaultSecureStoreMap = vi.hoisted(() => new Map<string, string>());

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => defaultSecureStoreMap.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    defaultSecureStoreMap.set(key, value);
  }),
}));

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createMemoryStorage(initial?: Record<string, string>) {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  const adapter: UiModeStorageAdapter = {
    getItemAsync: vi.fn(async (key: string) => data.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
  };
  return { data, adapter };
}

describe("ui-mode-store", () => {
  beforeEach(() => {
    defaultSecureStoreMap.clear();
    vi.clearAllMocks();
  });

  describe("parsePersistedUiModeState", () => {
    it("normalizes null, corrupt JSON, wrong schemaVersion, invalid fields, and classic alternate safely", async () => {
      const { parsePersistedUiModeState } = await import("./ui-mode-store");

      const expectedDefault = {
        schemaVersion: UI_MODE_SCHEMA_VERSION,
        activeModeId: CLASSIC_UI_MODE_ID,
        lastAlternateModeId: null,
      };

      expect(parsePersistedUiModeState(null)).toEqual(expectedDefault);
      expect(parsePersistedUiModeState("")).toEqual(expectedDefault);
      expect(parsePersistedUiModeState("{corrupt-json")).toEqual(expectedDefault);
      expect(parsePersistedUiModeState("[]")).toEqual(expectedDefault);
      expect(parsePersistedUiModeState('"titanium"')).toEqual(expectedDefault);
      expect(
        parsePersistedUiModeState(
          JSON.stringify({
            schemaVersion: 2,
            activeModeId: "titanium",
            lastAlternateModeId: "titanium",
          }),
        ),
      ).toEqual(expectedDefault);
      expect(
        parsePersistedUiModeState(
          JSON.stringify({
            schemaVersion: UI_MODE_SCHEMA_VERSION,
            activeModeId: 42,
            lastAlternateModeId: true,
          }),
        ),
      ).toEqual(expectedDefault);
      expect(
        parsePersistedUiModeState(
          JSON.stringify({
            schemaVersion: UI_MODE_SCHEMA_VERSION,
            activeModeId: "   ",
            lastAlternateModeId: CLASSIC_UI_MODE_ID,
          }),
        ),
      ).toEqual(expectedDefault);
      expect(
        parsePersistedUiModeState(
          JSON.stringify({
            schemaVersion: UI_MODE_SCHEMA_VERSION,
            activeModeId: "titanium",
            lastAlternateModeId: CLASSIC_UI_MODE_ID,
          }),
        ),
      ).toEqual({
        schemaVersion: UI_MODE_SCHEMA_VERSION,
        activeModeId: "titanium",
        lastAlternateModeId: null,
      });
    });
  });

  describe("getSnapshot referential stability & subscription", () => {
    it("returns the exact same frozen snapshot reference across repeated reads when unchanged", async () => {
      const { createUiModeStore } = await import("./ui-mode-store");
      const { adapter } = createMemoryStorage();
      const onEffectiveModeChange = vi.fn();
      const listener = vi.fn();

      const store = createUiModeStore({
        storage: adapter,
        isModeAvailable: (id) => id === "titanium",
        onEffectiveModeChange,
      });
      const unsubscribe = store.subscribe(listener);

      const first = store.getSnapshot();
      const second = store.getSnapshot();
      expect(first).toBe(second);
      expect(Object.isFrozen(first)).toBe(true);
      expect(first).toEqual({
        activeModeId: "classic",
        savedModeId: "classic",
        previewModeId: null,
        lastAlternateModeId: null,
        isClassic: true,
        hydrated: false,
      });

      // No-op cancelPreview and reconcileRegistryChange keep snapshot reference identical
      expect(store.cancelPreview()).toBe(first);
      store.reconcileRegistryChange();
      expect(store.getSnapshot()).toBe(first);
      expect(listener).not.toHaveBeenCalled();
      expect(onEffectiveModeChange).not.toHaveBeenCalled();

      await store.load();
      const afterLoad1 = store.getSnapshot();
      const afterLoad2 = store.getSnapshot();
      expect(afterLoad1).not.toBe(first);
      expect(afterLoad1).toBe(afterLoad2);
      expect(afterLoad1.hydrated).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
      // Effective mode remained "classic", so onEffectiveModeChange is not spuriously triggered
      expect(onEffectiveModeChange).not.toHaveBeenCalled();

      unsubscribe();
      await store.setMode("titanium");
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("cold load() & SecureStore integration", () => {
    it("uses expo-secure-store and UI_MODE_STORAGE_KEY by default and hydrates valid state", async () => {
      const SecureStore = await import("expo-secure-store");
      const { createUiModeStore } = await import("./ui-mode-store");

      defaultSecureStoreMap.set(
        UI_MODE_STORAGE_KEY,
        JSON.stringify({
          schemaVersion: UI_MODE_SCHEMA_VERSION,
          activeModeId: "titanium",
          lastAlternateModeId: "titanium",
        }),
      );

      const callOrder: string[] = [];
      const store = createUiModeStore({
        isModeAvailable: (id) => id === "titanium",
        onEffectiveModeChange: (modeId) => {
          callOrder.push(`effective:${modeId}:${store.getSnapshot().activeModeId}`);
        },
      });
      store.subscribe(() => {
        callOrder.push(`listener:${store.getSnapshot().activeModeId}`);
      });

      const snapshot = await store.load();
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(UI_MODE_STORAGE_KEY);
      expect(snapshot).toEqual({
        activeModeId: "titanium",
        savedModeId: "titanium",
        previewModeId: null,
        lastAlternateModeId: "titanium",
        isClassic: false,
        hydrated: true,
      });
      expect(callOrder).toEqual(["effective:titanium:titanium", "listener:titanium"]);
    });

    it("deduplicates concurrent load() calls and handles corrupt JSON, wrong schemaVersion, and SecureStore read rejection", async () => {
      const { createUiModeStore } = await import("./ui-mode-store");

      // 1. Concurrent load deduplication
      const readGate = createDeferred<string | null>();
      const dedupAdapter: UiModeStorageAdapter = {
        getItemAsync: vi.fn(() => readGate.promise),
        setItemAsync: vi.fn(async () => {}),
      };
      const dedupStore = createUiModeStore({
        storage: dedupAdapter,
        isModeAvailable: (id) => id === "titanium",
      });

      const p1 = dedupStore.load();
      const p2 = dedupStore.load();
      expect(dedupAdapter.getItemAsync).toHaveBeenCalledTimes(1);

      readGate.resolve(
        JSON.stringify({
          schemaVersion: UI_MODE_SCHEMA_VERSION,
          activeModeId: "classic",
          lastAlternateModeId: "titanium",
        }),
      );
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(r2);
      expect(r1).toEqual({
        activeModeId: "classic",
        savedModeId: "classic",
        previewModeId: null,
        lastAlternateModeId: "titanium",
        isClassic: true,
        hydrated: true,
      });

      // 2. Corrupt JSON
      const corrupt = createMemoryStorage({ [UI_MODE_STORAGE_KEY]: "{bad json" });
      const corruptStore = createUiModeStore({
        storage: corrupt.adapter,
        isModeAvailable: () => true,
      });
      expect(await corruptStore.load()).toMatchObject({
        activeModeId: "classic",
        savedModeId: "classic",
        lastAlternateModeId: null,
        hydrated: true,
      });

      // 3. Wrong schemaVersion
      const wrongSchema = createMemoryStorage({
        [UI_MODE_STORAGE_KEY]: JSON.stringify({
          schemaVersion: 999,
          activeModeId: "titanium",
          lastAlternateModeId: "titanium",
        }),
      });
      const wrongSchemaStore = createUiModeStore({
        storage: wrongSchema.adapter,
        isModeAvailable: () => true,
      });
      expect(await wrongSchemaStore.load()).toMatchObject({
        activeModeId: "classic",
        savedModeId: "classic",
        lastAlternateModeId: null,
        hydrated: true,
      });

      // 4. SecureStore read rejection
      const failingReadAdapter: UiModeStorageAdapter = {
        getItemAsync: vi.fn(async () => {
          throw new Error("Keychain read failed");
        }),
        setItemAsync: vi.fn(async () => {}),
      };
      const failingReadStore = createUiModeStore({
        storage: failingReadAdapter,
        isModeAvailable: () => true,
      });
      await expect(failingReadStore.load()).resolves.toEqual({
        activeModeId: "classic",
        savedModeId: "classic",
        previewModeId: null,
        lastAlternateModeId: null,
        isClassic: true,
        hydrated: true,
      });
    });

    it("never clobbers a newer setMode() that happened while load() was awaiting getItemAsync", async () => {
      const { createUiModeStore } = await import("./ui-mode-store");
      const readGate = createDeferred<string | null>();
      const persistedWrites: string[] = [];

      const adapter: UiModeStorageAdapter = {
        getItemAsync: vi.fn(() => readGate.promise),
        setItemAsync: vi.fn(async (_key, value) => {
          persistedWrites.push(value);
        }),
      };

      const onEffectiveModeChange = vi.fn();
      const store = createUiModeStore({
        storage: adapter,
        isModeAvailable: (id) => id === "titanium" || id === "dot-matrix",
        onEffectiveModeChange,
      });

      const loadPromise = store.load();
      expect(adapter.getItemAsync).toHaveBeenCalledTimes(1);

      // User selects "titanium" before getItemAsync resolves
      const setPromise = store.setMode("titanium");
      // Optimistic 0ms update before async persistence finishes
      expect(store.getSnapshot()).toMatchObject({
        activeModeId: "titanium",
        savedModeId: "titanium",
        lastAlternateModeId: "titanium",
        hydrated: false,
      });
      expect(onEffectiveModeChange).toHaveBeenCalledWith("titanium");
      await setPromise;

      // Late getItemAsync resolves with stale "dot-matrix"
      readGate.resolve(
        JSON.stringify({
          schemaVersion: UI_MODE_SCHEMA_VERSION,
          activeModeId: "dot-matrix",
          lastAlternateModeId: "dot-matrix",
        }),
      );

      const loadedSnapshot = await loadPromise;
      expect(loadedSnapshot).toEqual({
        activeModeId: "titanium",
        savedModeId: "titanium",
        previewModeId: null,
        lastAlternateModeId: "titanium",
        isClassic: false,
        hydrated: true,
      });
      expect(onEffectiveModeChange).toHaveBeenCalledTimes(1);
      expect(JSON.parse(persistedWrites.at(-1)!)).toEqual({
        schemaVersion: UI_MODE_SCHEMA_VERSION,
        activeModeId: "titanium",
        lastAlternateModeId: "titanium",
      });
    });
  });

  describe("setMode validation, writeGeneration coalescing & write failure handling", () => {
    it("throws on unavailable mode IDs without mutating state or persisting", async () => {
      const { createUiModeStore } = await import("./ui-mode-store");
      const { adapter } = createMemoryStorage();
      const listener = vi.fn();

      const store = createUiModeStore({
        storage: adapter,
        isModeAvailable: (id) => id === "titanium",
      });
      store.subscribe(listener);
      const before = store.getSnapshot();

      await expect(store.setMode("cyberdeck")).rejects.toThrow(
        "UI mode is not available: cyberdeck",
      );
      await expect(store.setMode("   ")).rejects.toThrow("UI mode is not available:");
      expect(store.getSnapshot()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
      expect(adapter.setItemAsync).not.toHaveBeenCalled();
    });

    it("serializes and coalesces concurrent setMode writes so SecureStore keeps the latest mode", async () => {
      const { createUiModeStore } = await import("./ui-mode-store");
      const firstWriteGate = createDeferred<void>();
      const stored = new Map<string, string>();
      const writePayloads: string[] = [];
      let inFlightWrites = 0;
      let maxConcurrentWrites = 0;

      const adapter: UiModeStorageAdapter = {
        getItemAsync: vi.fn(async (key) => stored.get(key) ?? null),
        setItemAsync: vi.fn(async (key, value) => {
          inFlightWrites += 1;
          maxConcurrentWrites = Math.max(maxConcurrentWrites, inFlightWrites);
          writePayloads.push(value);
          try {
            if (writePayloads.length === 1) {
              await firstWriteGate.promise;
            }
            stored.set(key, value);
          } finally {
            inFlightWrites -= 1;
          }
        }),
      };

      const store = createUiModeStore({
        storage: adapter,
        isModeAvailable: (id) => id === "a" || id === "b" || id === "c",
      });

      const writeA = store.setMode("a");
      expect(store.getSnapshot().activeModeId).toBe("a");

      const writeB = store.setMode("b");
      expect(store.getSnapshot().activeModeId).toBe("b");

      const writeC = store.setMode("c");
      expect(store.getSnapshot().activeModeId).toBe("c");

      // Only "a" has started writing while firstWriteGate is blocked
      expect(writePayloads).toHaveLength(1);

      firstWriteGate.resolve();
      await Promise.all([writeA, writeB, writeC]);

      expect(maxConcurrentWrites).toBe(1);
      // "b" was coalesced into "c", so only 2 physical writes occurred ("a" then "c")
      expect(writePayloads).toHaveLength(2);
      expect(JSON.parse(stored.get(UI_MODE_STORAGE_KEY)!)).toEqual({
        schemaVersion: UI_MODE_SCHEMA_VERSION,
        activeModeId: "c",
        lastAlternateModeId: "c",
      });
      expect(store.getSnapshot()).toMatchObject({
        activeModeId: "c",
        savedModeId: "c",
        lastAlternateModeId: "c",
      });
    });

    it("swallows SecureStore write errors gracefully while preserving in-memory state", async () => {
      const { createUiModeStore } = await import("./ui-mode-store");
      const failingAdapter: UiModeStorageAdapter = {
        getItemAsync: vi.fn(async () => null),
        setItemAsync: vi.fn(async () => {
          throw new Error("Disk full");
        }),
      };

      const store = createUiModeStore({
        storage: failingAdapter,
        isModeAvailable: (id) => id === "titanium",
      });

      await expect(store.setMode("titanium")).resolves.toMatchObject({
        activeModeId: "titanium",
        savedModeId: "titanium",
        lastAlternateModeId: "titanium",
      });
    });
  });

  describe("toggleAlternateMode()", () => {
    it("toggles classic -> first available -> classic -> remembered lastAlternateModeId and falls back when unavailable", async () => {
      const { createUiModeStore } = await import("./ui-mode-store");
      const { data, adapter } = createMemoryStorage();
      const available = new Set(["dot-matrix", "titanium"]);

      const store = createUiModeStore({
        storage: adapter,
        isModeAvailable: (id) => available.has(id),
        listAlternateModeIds: () => ["dot-matrix", "titanium"],
      });

      await store.load();
      expect(store.getSnapshot().activeModeId).toBe("classic");

      // 1. No prior alternate -> picks first available ("dot-matrix")
      const firstToggle = await store.toggleAlternateMode();
      expect(firstToggle).toMatchObject({
        activeModeId: "dot-matrix",
        savedModeId: "dot-matrix",
        lastAlternateModeId: "dot-matrix",
      });

      // 2. Toggle from custom -> returns to "classic" while preserving lastAlternateModeId
      const backToClassic = await store.toggleAlternateMode();
      expect(backToClassic).toMatchObject({
        activeModeId: "classic",
        savedModeId: "classic",
        lastAlternateModeId: "dot-matrix",
      });
      expect(JSON.parse(data.get(UI_MODE_STORAGE_KEY)!)).toEqual({
        schemaVersion: UI_MODE_SCHEMA_VERSION,
        activeModeId: "classic",
        lastAlternateModeId: "dot-matrix",
      });

      // 3. Explicit switch to "titanium", back to "classic", then toggle remembers "titanium"
      await store.setMode("titanium");
      await store.setMode("classic");
      expect((await store.toggleAlternateMode()).activeModeId).toBe("titanium");

      // 4. Return to "classic", unregister "titanium" -> toggle falls back to "dot-matrix"
      await store.toggleAlternateMode();
      expect(store.getSnapshot().activeModeId).toBe("classic");
      available.delete("titanium");

      const fallbackToggle = await store.toggleAlternateMode();
      expect(fallbackToggle).toMatchObject({
        activeModeId: "dot-matrix",
        savedModeId: "dot-matrix",
        lastAlternateModeId: "dot-matrix",
      });

      // 5. Return to "classic", remove all alternate modes -> stays on "classic" cleanly without writing
      await store.toggleAlternateMode();
      available.clear();
      vi.mocked(adapter.setItemAsync).mockClear();

      const beforeNoop = store.getSnapshot();
      const noopResult = await store.toggleAlternateMode();
      expect(noopResult).toBe(beforeNoop);
      expect(noopResult.activeModeId).toBe("classic");
      expect(adapter.setItemAsync).not.toHaveBeenCalled();
    });
  });

  describe("transient preview lifecycle", () => {
    it("previews modes with zero SecureStore writes on cancelPreview and persists on commitPreview", async () => {
      const { createUiModeStore } = await import("./ui-mode-store");
      const { data, adapter } = createMemoryStorage();
      const effectiveChanges: string[] = [];

      const store = createUiModeStore({
        storage: adapter,
        isModeAvailable: (id) => id === "titanium" || id === "dot-matrix",
        onEffectiveModeChange: (id) => effectiveChanges.push(id),
      });

      await store.load();
      expect(() => store.beginPreview("missing")).toThrow("UI mode is not available: missing");

      // Preview "titanium" -> zero storage writes
      const previewSnap = store.beginPreview("titanium");
      expect(previewSnap).toEqual({
        activeModeId: "titanium",
        savedModeId: "classic",
        previewModeId: "titanium",
        lastAlternateModeId: null,
        isClassic: false,
        hydrated: true,
      });
      expect(adapter.setItemAsync).not.toHaveBeenCalled();
      expect(effectiveChanges).toEqual(["titanium"]);

      // Switch preview to "dot-matrix" -> still zero storage writes
      store.beginPreview("dot-matrix");
      expect(store.getSnapshot().activeModeId).toBe("dot-matrix");
      expect(adapter.setItemAsync).not.toHaveBeenCalled();
      expect(effectiveChanges).toEqual(["titanium", "dot-matrix"]);

      // Cancel preview -> restores savedModeId ("classic"), still zero storage writes
      const cancelledSnap = store.cancelPreview();
      expect(cancelledSnap).toEqual({
        activeModeId: "classic",
        savedModeId: "classic",
        previewModeId: null,
        lastAlternateModeId: null,
        isClassic: true,
        hydrated: true,
      });
      expect(adapter.setItemAsync).not.toHaveBeenCalled();
      expect(effectiveChanges).toEqual(["titanium", "dot-matrix", "classic"]);

      // commitPreview when not previewing is a no-op with zero writes
      expect(await store.commitPreview()).toBe(cancelledSnap);
      expect(adapter.setItemAsync).not.toHaveBeenCalled();

      // Begin preview again and commit -> persists to storage
      store.beginPreview("titanium");
      effectiveChanges.length = 0;

      const committedSnap = await store.commitPreview();
      expect(committedSnap).toEqual({
        activeModeId: "titanium",
        savedModeId: "titanium",
        previewModeId: null,
        lastAlternateModeId: "titanium",
        isClassic: false,
        hydrated: true,
      });
      // Effective mode was already "titanium" during preview, so commit does not double-fire
      expect(effectiveChanges).toEqual([]);
      expect(adapter.setItemAsync).toHaveBeenCalledTimes(1);
      expect(JSON.parse(data.get(UI_MODE_STORAGE_KEY)!)).toEqual({
        schemaVersion: UI_MODE_SCHEMA_VERSION,
        activeModeId: "titanium",
        lastAlternateModeId: "titanium",
      });

      // Previewing "classic" while savedModeId is "titanium" temporarily restores classic
      const previewClassic = store.beginPreview("classic");
      expect(previewClassic).toMatchObject({
        activeModeId: "classic",
        savedModeId: "titanium",
        previewModeId: "classic",
        isClassic: true,
      });
      expect(store.cancelPreview()).toMatchObject({
        activeModeId: "titanium",
        savedModeId: "titanium",
        previewModeId: null,
        isClassic: false,
      });
    });
  });

  describe("platform/registry fallback & reconcileRegistryChange()", () => {
    it("falls back to classic without erasing savedModeId when unavailable, and activates once registered", async () => {
      const { createUiModeStore } = await import("./ui-mode-store");
      const rawPersisted = JSON.stringify({
        schemaVersion: UI_MODE_SCHEMA_VERSION,
        activeModeId: "titanium",
        lastAlternateModeId: "titanium",
      });
      const { data, adapter } = createMemoryStorage({
        [UI_MODE_STORAGE_KEY]: rawPersisted,
      });

      const registered = new Set<string>();
      const effectiveChanges: string[] = [];
      const listener = vi.fn();

      const store = createUiModeStore({
        storage: adapter,
        isModeAvailable: (id) => registered.has(id),
        onEffectiveModeChange: (id) => effectiveChanges.push(id),
      });
      store.subscribe(listener);

      // Boot when "titanium" is not yet registered (or unsupported on Android)
      const fallbackSnap = await store.load();
      expect(fallbackSnap).toEqual({
        activeModeId: "classic",
        savedModeId: "titanium",
        previewModeId: null,
        lastAlternateModeId: "titanium",
        isClassic: true,
        hydrated: true,
      });
      // Saved choice on disk is untouched
      expect(adapter.setItemAsync).not.toHaveBeenCalled();
      expect(data.get(UI_MODE_STORAGE_KEY)).toBe(rawPersisted);
      expect(effectiveChanges).toEqual([]);

      // Dynamically register "titanium" and reconcile
      listener.mockClear();
      registered.add("titanium");
      store.reconcileRegistryChange();

      expect(store.getSnapshot()).toEqual({
        activeModeId: "titanium",
        savedModeId: "titanium",
        previewModeId: null,
        lastAlternateModeId: "titanium",
        isClassic: false,
        hydrated: true,
      });
      expect(effectiveChanges).toEqual(["titanium"]);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(adapter.setItemAsync).not.toHaveBeenCalled();

      // Dynamically unregister "titanium" and reconcile -> safely falls back to classic
      registered.delete("titanium");
      store.reconcileRegistryChange();
      expect(store.getSnapshot()).toMatchObject({
        activeModeId: "classic",
        savedModeId: "titanium",
        isClassic: true,
      });
      expect(effectiveChanges).toEqual(["titanium", "classic"]);
    });
  });

  describe("resetToClassic() crash recovery", () => {
    it("clears previewModeId, sets savedModeId to classic, and persists so crashing mode does not reload", async () => {
      const { createUiModeStore } = await import("./ui-mode-store");
      const { data, adapter } = createMemoryStorage();
      const effectiveChanges: string[] = [];

      const store = createUiModeStore({
        storage: adapter,
        isModeAvailable: (id) => id === "broken-skin" || id === "preview-skin",
        onEffectiveModeChange: (id) => effectiveChanges.push(id),
      });

      await store.setMode("broken-skin");
      store.beginPreview("preview-skin");
      effectiveChanges.length = 0;

      const resetPromise = store.resetToClassic();
      // Immediate synchronous recovery before storage write settles
      expect(store.getSnapshot()).toEqual({
        activeModeId: "classic",
        savedModeId: "classic",
        previewModeId: null,
        lastAlternateModeId: "broken-skin",
        isClassic: true,
        hydrated: false,
      });
      expect(effectiveChanges).toEqual(["classic"]);

      await resetPromise;
      expect(JSON.parse(data.get(UI_MODE_STORAGE_KEY)!)).toEqual({
        schemaVersion: UI_MODE_SCHEMA_VERSION,
        activeModeId: "classic",
        lastAlternateModeId: "broken-skin",
      });

      // Next app launch boots into "classic" instead of the broken skin
      const nextLaunchStore = createUiModeStore({
        storage: adapter,
        isModeAvailable: (id) => id === "broken-skin",
      });
      expect(await nextLaunchStore.load()).toEqual({
        activeModeId: "classic",
        savedModeId: "classic",
        previewModeId: null,
        lastAlternateModeId: "broken-skin",
        isClassic: true,
        hydrated: true,
      });
    });
  });
});
