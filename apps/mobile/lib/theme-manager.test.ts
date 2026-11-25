import { describe, expect, it } from "vitest";
import {
  createThemeManager,
  effectiveThemeAssignments,
  listPackUsage,
  normalizeThemeAssignments,
} from "./theme-manager";
import type { ThemePackV1 } from "./theme-pack";

const globalPack: ThemePackV1 = {
  schemaVersion: 1,
  id: "ocean",
  name: "Ocean",
  author: "Test",
  version: "1.0.0",
  coverage: "all",
  defaults: { colors: { dark: { background: "#001122" } }, layout: "cards" },
};
const inboxPack: ThemePackV1 = {
  schemaVersion: 1,
  id: "inbox-only",
  name: "Inbox",
  author: "Test",
  version: "1.0.0",
  coverage: ["inbox"],
  defaults: { colors: { dark: { background: "#220011" } } },
};

function memoryRepository() {
  const packs = new Map<string, ThemePackV1>();
  return {
    list: async () => [...packs.values()],
    save: async (pack: ThemePackV1) => {
      packs.set(pack.id, pack);
    },
    remove: async (id: string) => {
      packs.delete(id);
    },
    packs,
  };
}

describe("theme manager", () => {
  it("imports, previews, applies and restores global and page assignments", async () => {
    const data = new Map<string, string>();
    const storage = {
      getItemAsync: async (key: string) => data.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => {
        data.set(key, value);
      },
    };
    const repository = memoryRepository();
    const manager = createThemeManager(storage);
    await manager.load(repository);
    await manager.install(globalPack);
    await manager.install(inboxPack);
    manager.preview("all", "ocean");
    expect(manager.getSnapshot().preview?.packId).toBe("ocean");
    await manager.commitPreview();
    await manager.assign("inbox", "inbox-only");
    expect(manager.getSnapshot().assignments).toEqual({
      schemaVersion: 1,
      globalPackId: "ocean",
      pages: { inbox: "inbox-only" },
    });
    await manager.recover("inbox");
    expect(manager.getSnapshot().assignments.pages).toEqual({});
  });

  it("drops invalid assignments and preserves classic as the fallback", () => {
    expect(
      normalizeThemeAssignments(
        {
          schemaVersion: 1,
          globalPackId: "missing",
          pages: { inbox: "missing", thread: "ocean" },
        },
        [globalPack],
      ),
    ).toEqual({ schemaVersion: 1, globalPackId: "classic", pages: { thread: "ocean" } });
  });

  it("supports previewing and committing follow-global clear and reports pack usage", async () => {
    const data = new Map<string, string>();
    const storage = {
      getItemAsync: async (key: string) => data.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => {
        data.set(key, value);
      },
    };
    const repository = memoryRepository();
    const manager = createThemeManager(storage);
    await manager.load(repository);
    await manager.install(globalPack);
    await manager.install(inboxPack);
    await manager.assign("all", "ocean");
    await manager.assign("inbox", "inbox-only");
    await manager.assign("thread", "ocean");

    expect(listPackUsage(manager.getSnapshot().assignments, "ocean")).toEqual(["all", "thread"]);
    expect(listPackUsage(manager.getSnapshot().assignments, "inbox-only")).toEqual(["inbox"]);

    manager.preview("inbox", null);
    expect(manager.getSnapshot().preview).toEqual({ target: "inbox", packId: null });
    expect(effectiveThemeAssignments(manager.getSnapshot()).pages).toEqual({ thread: "ocean" });

    // Re-selecting the already saved value cancels preview cleanly.
    manager.preview("inbox", "inbox-only");
    expect(manager.getSnapshot().preview).toBeNull();

    manager.preview("inbox", null);
    await manager.commitPreview();
    expect(manager.getSnapshot().assignments).toEqual({
      schemaVersion: 1,
      globalPackId: "ocean",
      pages: { thread: "ocean" },
    });
  });
});
