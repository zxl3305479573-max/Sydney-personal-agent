import type { ThemeAssignments, ThemePackV1, ThemeScope, ThemeTarget } from "./theme-pack";
import {
  BUILTIN_THEME_PACKS,
  isBuiltInTheme,
  isThemeScope,
  parseThemePack,
  THEME_ASSIGNMENTS_KEY,
  themeCovers,
} from "./theme-pack";

export type ThemeRepository = {
  list: () => Promise<ThemePackV1[]>;
  save: (pack: ThemePackV1) => Promise<void>;
  remove: (id: string) => Promise<void>;
};
type ThemeStorage = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
};
export type ThemeManagerSnapshot = {
  hydrated: boolean;
  packs: readonly ThemePackV1[];
  assignments: ThemeAssignments;
  preview: { packId: string; target: ThemeTarget } | null;
  warning: string | null;
};

export function emptyThemeAssignments(): ThemeAssignments {
  return { schemaVersion: 1, globalPackId: "classic", pages: {} };
}

export function normalizeThemeAssignments(
  value: unknown,
  packs: readonly ThemePackV1[],
): ThemeAssignments {
  const normalized = emptyThemeAssignments();
  if (
    !value ||
    typeof value !== "object" ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1
  )
    return normalized;
  const record = value as Record<string, unknown>;
  if (
    typeof record.globalPackId === "string" &&
    packs.some((pack) => pack.id === record.globalPackId && pack.coverage === "all")
  )
    normalized.globalPackId = record.globalPackId;
  if (record.pages && typeof record.pages === "object" && !Array.isArray(record.pages)) {
    for (const [scope, id] of Object.entries(record.pages)) {
      if (
        isThemeScope(scope) &&
        typeof id === "string" &&
        packs.some((pack) => pack.id === id && themeCovers(pack, scope))
      )
        normalized.pages[scope] = id;
    }
  }
  return normalized;
}

export function effectiveThemeAssignments(snapshot: ThemeManagerSnapshot): ThemeAssignments {
  if (!snapshot.preview) return snapshot.assignments;
  const { target, packId } = snapshot.preview;
  return target === "all"
    ? { ...snapshot.assignments, globalPackId: packId }
    : { ...snapshot.assignments, pages: { ...snapshot.assignments.pages, [target]: packId } };
}

export function createThemeManager(storage: ThemeStorage, platform = "ios") {
  let repository: ThemeRepository | null = null;
  let snapshot: ThemeManagerSnapshot = {
    hydrated: false,
    packs: BUILTIN_THEME_PACKS,
    assignments: emptyThemeAssignments(),
    preview: null,
    warning: null,
  };
  let loadPromise: Promise<void> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let activeScope: ThemeScope = "other";
  const listeners = new Set<() => void>();

  function emit(next: Partial<ThemeManagerSnapshot>) {
    snapshot = { ...snapshot, ...next };
    for (const listener of [...listeners]) listener();
  }

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = queue.then(operation);
    queue = next.catch(() => undefined);
    return next;
  }

  function checkTarget(packId: string, target: ThemeTarget) {
    if (platform !== "ios") throw new Error("Theme packs are available on iPhone only");
    const pack = snapshot.packs.find((item) => item.id === packId);
    if (!pack || !themeCovers(pack, target))
      throw new Error("This theme does not support the selected page");
    return pack;
  }

  async function persist(assignments: ThemeAssignments) {
    await storage.setItemAsync(THEME_ASSIGNMENTS_KEY, JSON.stringify(assignments));
    emit({ assignments, preview: null, warning: null });
  }

  function load(source: ThemeRepository): Promise<void> {
    if (loadPromise) return loadPromise;
    repository = source;
    loadPromise = serialize(async () => {
      if (platform !== "ios") {
        emit({ hydrated: true });
        return;
      }
      let packs: readonly ThemePackV1[] = BUILTIN_THEME_PACKS;
      let warning: string | null = null;
      try {
        packs = [
          ...BUILTIN_THEME_PACKS,
          ...(await source.list()).map((pack) => parseThemePack(pack)),
        ];
      } catch {
        warning = "Some theme files could not be loaded. Built-in themes remain available.";
      }
      let assignments = emptyThemeAssignments();
      try {
        const raw = await storage.getItemAsync(THEME_ASSIGNMENTS_KEY);
        if (raw !== null) {
          assignments = normalizeThemeAssignments(JSON.parse(raw), packs);
        } else {
          const legacy = await storage.getItemAsync("sydney.mobile.uiMode.v1");
          const old: unknown = legacy ? JSON.parse(legacy) : null;
          const oldId =
            old &&
            typeof old === "object" &&
            (old as { schemaVersion?: unknown }).schemaVersion === 1
              ? (old as { activeModeId?: unknown }).activeModeId
              : null;
          if (
            typeof oldId === "string" &&
            packs.some((pack) => pack.id === oldId && pack.coverage === "all")
          )
            assignments.globalPackId = oldId;
          await storage.setItemAsync(THEME_ASSIGNMENTS_KEY, JSON.stringify(assignments));
        }
      } catch {
        warning =
          "Theme settings could not be read or saved. Check your selection before restarting.";
      }
      emit({ hydrated: true, packs, assignments, warning });
    });
    return loadPromise;
  }

  function assign(target: ThemeTarget, packId: string | null): Promise<void> {
    return serialize(async () => {
      if (!snapshot.hydrated) throw new Error("Theme settings are still loading");
      if (packId !== null) checkTarget(packId, target);
      const assignments = structuredClone(snapshot.assignments);
      if (target === "all") assignments.globalPackId = packId ?? "classic";
      else if (packId === null) delete assignments.pages[target];
      else assignments.pages[target] = packId;
      await persist(assignments);
    });
  }

  function preview(target: ThemeTarget, packId: string) {
    if (!snapshot.hydrated) throw new Error("Theme settings are still loading");
    checkTarget(packId, target);
    emit({ preview: { target, packId } });
  }

  function install(input: unknown, replace = false): Promise<void> {
    return serialize(async () => {
      if (platform !== "ios" || !repository || !snapshot.hydrated)
        throw new Error("Theme library is not available");
      const pack = parseThemePack(input);
      const old = snapshot.packs.find((item) => item.id === pack.id);
      if (old && !replace) throw new Error("This theme is already installed; confirm replacement");
      const packs = [...snapshot.packs.filter((item) => item.id !== pack.id), pack];
      const assignments = normalizeThemeAssignments(snapshot.assignments, packs);
      await repository.save(pack);
      try {
        await storage.setItemAsync(THEME_ASSIGNMENTS_KEY, JSON.stringify(assignments));
      } catch (error) {
        if (old) await repository.save(old);
        else await repository.remove(pack.id);
        throw error;
      }
      emit({ packs, assignments, preview: null, warning: null });
    });
  }

  function uninstall(id: string): Promise<void> {
    return serialize(async () => {
      if (!repository || isBuiltInTheme(id)) throw new Error("Built-in themes cannot be removed");
      const oldPack = snapshot.packs.find((pack) => pack.id === id);
      if (!oldPack) return;
      const packs = snapshot.packs.filter((pack) => pack.id !== id);
      const assignments = normalizeThemeAssignments(snapshot.assignments, packs);
      await repository.remove(id);
      try {
        await storage.setItemAsync(THEME_ASSIGNMENTS_KEY, JSON.stringify(assignments));
      } catch (error) {
        await repository.save(oldPack);
        throw error;
      }
      emit({ packs, assignments, preview: null, warning: null });
    });
  }

  function recover(target: ThemeTarget): Promise<void> {
    const assignments = structuredClone(snapshot.assignments);
    if (target === "all") assignments.globalPackId = "classic";
    else delete assignments.pages[target];
    emit({ assignments, preview: null });
    return serialize(() => persist(assignments));
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    assign,
    preview,
    install,
    uninstall,
    recover,
    setActiveScope: (scope: ThemeScope) => {
      if (activeScope === scope) return;
      activeScope = scope;
      for (const listener of [...listeners]) listener();
    },
    getActiveScope: () => activeScope,
    cancelPreview: () => {
      if (snapshot.preview) emit({ preview: null });
    },
    commitPreview: async () => {
      if (snapshot.preview) await assign(snapshot.preview.target, snapshot.preview.packId);
    },
    reset: () => serialize(() => persist(emptyThemeAssignments())),
  };
}

export type ThemeManager = ReturnType<typeof createThemeManager>;
