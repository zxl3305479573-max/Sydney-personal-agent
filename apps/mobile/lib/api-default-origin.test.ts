import * as SecureStore from "expo-secure-store";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./ai-consent", () => ({ promptAiConsent: vi.fn() }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock("./live-notifications.js", () => ({
  resumeLiveNotifications: vi.fn(async () => undefined),
  stopLiveNotifications: vi.fn(async () => undefined),
}));
vi.mock("./network-cache.js", () => ({ clearNetworkCache: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("default server startup protection", () => {
  it.each(["missing", "legacy", "ip", "foreign", "corrupt", "unreadable"])(
    "preserves the stored session while choosing the production default with %s scope",
    async (scope) => {
      vi.resetModules();
      vi.stubEnv("EXPO_PUBLIC_SYDNEY_SIDELOAD", "1");
      vi.stubEnv("EXPO_PUBLIC_API_URL", "https://124.221.182.39");
      const disk = new Map<string, string>([
        ["rakazo.session_token", "synthetic-token"],
        ["rakazo.space_id", "synthetic-space"],
      ]);
      if (scope !== "missing") {
        disk.set(
          "rakazo.integrations-scope",
          scope === "corrupt"
            ? "{"
            : JSON.stringify({
                token: "synthetic-token",
                apiBase:
                  scope === "legacy"
                    ? "https://pc.zxlup.xin"
                    : scope === "ip"
                      ? "https://124.221.182.39"
                      : "https://other.example",
                userId: "synthetic-user",
                spaceId: "synthetic-space",
                selectionId: null,
              }),
        );
      }
      vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => {
        if (scope === "unreadable" && key === "rakazo.integrations-scope")
          throw new Error("storage locked");
        return disk.get(key) ?? null;
      });
      vi.mocked(SecureStore.setItemAsync).mockClear();
      vi.mocked(SecureStore.deleteItemAsync).mockClear();
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const { loadApiBase, currentApiBase, authHeaders } = await import("./api");
      const { configureUnsentSends } = await import("./thread-feedback");
      const clearOutbox = vi.fn();
      configureUnsentSends({
        request: vi.fn(),
        scope: () => null,
        serverReachable: () => true,
        passwordChanging: () => false,
        disk: {
          admit: () => true,
          hydrate: async () => undefined,
          forget: vi.fn(),
          save: vi.fn(),
          load: () => [],
          clear: clearOutbox,
        },
        errorText: () => "",
        notDelivered: vi.fn(),
      });
      if (["foreign", "corrupt", "unreadable"].includes(scope)) {
        await expect(loadApiBase()).rejects.toThrow();
        await expect(authHeaders()).rejects.toThrow();
      } else {
        const expected = scope === "ip" ? "https://124.221.182.39" : "https://pc.zxlup.xin";
        await expect(loadApiBase()).resolves.toBe(expected);
        expect(currentApiBase()).toBe(expected);
        await expect(authHeaders()).resolves.toMatchObject({
          authorization: "Bearer synthetic-token",
        });
      }
      expect(fetch).not.toHaveBeenCalled();
      expect(disk.get("rakazo.session_token")).toBe("synthetic-token");
      expect(disk.get("rakazo.space_id")).toBe("synthetic-space");
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
      expect(clearOutbox).not.toHaveBeenCalled();
    },
  );

  it("uses the production IP on a fresh installation without credentials", async () => {
    vi.resetModules();
    vi.stubEnv("EXPO_PUBLIC_SYDNEY_SIDELOAD", "1");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://124.221.182.39");
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    const { loadApiBase } = await import("./api");
    await expect(loadApiBase()).resolves.toBe("https://124.221.182.39");
  });

  it("blocks an old session until its verified origin matches the selected default", async () => {
    vi.resetModules();
    vi.stubEnv("EXPO_PUBLIC_SYDNEY_SIDELOAD", "1");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://203.0.113.10");
    const disk = new Map<string, string>([
      ["rakazo.session_token", "synthetic-token"],
      ["rakazo.integrations-scope", JSON.stringify({
        token: "synthetic-token",
        apiBase: "https://pc.zxlup.xin",
        userId: "synthetic-user",
        spaceId: "synthetic-space",
        selectionId: null,
      })],
    ]);
    vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => disk.get(key) ?? null);
    vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
      disk.set(key, value);
    });
    vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
      disk.delete(key);
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { guardDefaultOrigin } = await import("./default-origin-guard");
    await expect(guardDefaultOrigin("https://203.0.113.10", false)).rejects.toThrow();
    await expect(guardDefaultOrigin("https://203.0.113.10", true)).resolves.toBeUndefined();
    await expect(guardDefaultOrigin("https://pc.zxlup.xin", false)).resolves.toBeUndefined();
    disk.delete("rakazo.integrations-scope");
    await expect(guardDefaultOrigin("https://pc.zxlup.xin", false)).resolves.toBeUndefined();
    vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => {
      if (key === "rakazo.integrations-scope") throw new Error("storage locked");
      return disk.get(key) ?? null;
    });
    await expect(guardDefaultOrigin("https://pc.zxlup.xin", false)).rejects.toThrow();
    vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => disk.get(key) ?? null);
    for (const invalid of ["", "{", JSON.stringify({ token: "other" })]) {
      disk.set("rakazo.integrations-scope", invalid);
      await expect(guardDefaultOrigin("https://pc.zxlup.xin", false)).rejects.toThrow();
    }
    disk.set("rakazo.integrations-scope", JSON.stringify({
      token: "synthetic-token",
      apiBase: "https://203.0.113.10",
      userId: "synthetic-user",
      spaceId: "synthetic-space",
      selectionId: null,
    }));
    await expect(guardDefaultOrigin("https://pc.zxlup.xin", false)).rejects.toThrow();
    disk.set("rakazo.integrations-scope", JSON.stringify({
      token: "synthetic-token",
      apiBase: "https://pc.zxlup.xin",
      userId: "synthetic-user",
      spaceId: "synthetic-space",
      selectionId: null,
    }));
    disk.delete("rakazo.session_token");
    await expect(guardDefaultOrigin("https://203.0.113.10", false)).resolves.toBeUndefined();
    disk.set("rakazo.session_token", "synthetic-token");
    vi.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error("storage locked"));
    await expect(guardDefaultOrigin("https://203.0.113.10", false)).rejects.toThrow();
    const api = await import("./api");
    await expect(api.authHeaders()).rejects.toThrow("Could not load server settings");
    await expect(api.fetchMobileJson("https://203.0.113.10/api/auth/get-session", {})).rejects.toThrow();
    vi.mocked(SecureStore.setItemAsync).mockClear();
    vi.mocked(SecureStore.deleteItemAsync).mockClear();
    await expect(api.loadApiBase()).rejects.toThrow("Could not verify the saved server session");
    await expect(api.authHeaders()).rejects.toThrow("Could not load server settings");
    expect(fetch).not.toHaveBeenCalled();
    expect(disk.get("rakazo.session_token")).toBe("synthetic-token");
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();

    disk.set("rakazo.integrations-scope", JSON.stringify({
      token: "another-synthetic-token",
      apiBase: "https://203.0.113.10",
      userId: "synthetic-user",
      spaceId: "synthetic-space",
      selectionId: null,
    }));
    await expect(api.loadApiBase()).rejects.toThrow("Could not verify the saved server session");
    disk.set("rakazo.integrations-scope", JSON.stringify({
      token: "synthetic-token",
      apiBase: "https://203.0.113.10",
      userId: "synthetic-user",
      spaceId: "synthetic-space",
      selectionId: null,
    }));
    await expect(api.loadApiBase()).resolves.toBe("https://203.0.113.10");
    await expect(api.authHeaders()).resolves.toMatchObject({
      authorization: "Bearer synthetic-token",
    });
  });
});
