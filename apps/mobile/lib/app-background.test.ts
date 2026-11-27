import { beforeEach, expect, it, vi } from "vitest";

const device = vi.hoisted(() => ({
  stored: null as string | null,
  failSave: false,
  files: new Set<string>(),
  picker: { canceled: false, assets: [{ uri: "file://photos/source.jpg" }] },
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => device.stored,
  setItemAsync: async (_key: string, value: string) => {
    if (device.failSave) throw new Error("storage unavailable");
    device.stored = value;
  },
}));
vi.mock("expo-file-system", () => ({
  Paths: { document: "file://documents" },
  File: class {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
    get exists() {
      return device.files.has(this.uri);
    }
    copy(destination: { uri: string }) {
      if (!this.exists) throw new Error("source missing");
      device.files.add(destination.uri);
    }
    delete() {
      device.files.delete(this.uri);
    }
  },
}));
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: async () => device.picker,
}));

beforeEach(() => {
  vi.resetModules();
  device.stored = null;
  device.failSave = false;
  device.files = new Set(["file://photos/source.jpg"]);
  device.picker = { canceled: false, assets: [{ uri: "file://photos/source.jpg" }] };
});

it("copies the selected photo to permanent storage and restores display options after restart", async () => {
  const initial = await import("./app-background");
  await initial.chooseAppBackground();
  const uri = initial.getAppBackground().imageUri;
  expect(uri).toMatch(/^file:\/\/documents\/sydney-app-background-/);
  await initial.updateAppBackground({
    palette: "mint",
    fit: "contain",
    opacity: 0.5,
    overlayOpacity: 0.6,
    componentOpacity: 0.5,
  });
  vi.resetModules();
  const restored = await import("./app-background");
  await restored.loadAppBackground();
  expect(restored.getAppBackground()).toEqual({
    palette: "mint",
    imageUri: uri,
    fit: "contain",
    opacity: 0.5,
    overlayOpacity: 0.6,
    componentOpacity: 0.5,
  });
  expect(device.files.has("file://photos/source.jpg")).toBe(true);
});

it("leaves the current photo and preferences untouched when the picker is canceled", async () => {
  const store = await import("./app-background");
  await store.chooseAppBackground();
  const previous = store.getAppBackground();
  device.picker = { canceled: true, assets: [] };
  await store.chooseAppBackground();
  expect(store.getAppBackground()).toBe(previous);
  expect(device.files.size).toBe(2);
});

it("keeps the saved photo on persistence failure and cleans up the unsuccessful replacement", async () => {
  const store = await import("./app-background");
  await store.chooseAppBackground();
  const previous = store.getAppBackground();
  const stored = device.stored;
  const files = [...device.files];
  const listener = vi.fn();
  store.subscribeAppBackground(listener);
  device.failSave = true;
  await expect(store.chooseAppBackground()).rejects.toThrow("storage unavailable");
  expect(store.getAppBackground()).toBe(previous);
  expect(device.stored).toBe(stored);
  expect([...device.files]).toEqual(files);
  expect(listener).not.toHaveBeenCalled();
});

it("serializes concurrent edits without dropping other controls and deletes only the replaced owned photo", async () => {
  const store = await import("./app-background");
  await store.chooseAppBackground();
  const previous = store.getAppBackground().imageUri!;
  await Promise.all([
    store.updateAppBackground({ palette: "ocean" }),
    store.updateAppBackground({ opacity: 0.75 }),
    store.updateAppBackground({ fit: "contain" }),
  ]);
  expect(store.getAppBackground()).toMatchObject({
    palette: "ocean",
    opacity: 0.75,
    fit: "contain",
  });
  await store.chooseAppBackground();
  expect(device.files.has(previous)).toBe(false);
  await store.updateAppBackground(store.DEFAULT_APP_BACKGROUND);
  expect(store.getAppBackground()).toEqual(store.DEFAULT_APP_BACKGROUND);
  expect([...device.files]).toEqual(["file://photos/source.jpg"]);
});

it("does not delete a source outside the app-owned background directory", async () => {
  device.stored = JSON.stringify({ imageUri: "file://photos/source.jpg" });
  const store = await import("./app-background");
  await store.loadAppBackground();
  await store.updateAppBackground(store.DEFAULT_APP_BACKGROUND);
  expect(device.files.has("file://photos/source.jpg")).toBe(true);
});

it("falls back from a missing file and bounds stored image controls", async () => {
  device.stored = JSON.stringify({
    imageUri: "file://documents/missing",
    palette: "unknown",
    fit: "invalid",
    opacity: -2,
    overlayOpacity: 9,
  });
  const store = await import("./app-background");
  await store.loadAppBackground();
  expect(store.getAppBackground()).toEqual({
    imageUri: null,
    palette: null,
    fit: "cover",
    opacity: 0,
    overlayOpacity: 0.8,
    componentOpacity: 1,
  });
});

it("recovers from malformed stored preferences", async () => {
  device.stored = "{";
  const store = await import("./app-background");
  await store.loadAppBackground();
  expect(store.getAppBackground()).toEqual(store.DEFAULT_APP_BACKGROUND);
  await store.updateAppBackground({ palette: "lavender" });
  expect(JSON.parse(device.stored!).palette).toBe("lavender");
});

it("restores legacy preferences with default component opacity and bounds new values", async () => {
  device.stored = JSON.stringify({ palette: "ocean", opacity: 0.5 });
  const store = await import("./app-background");
  await store.loadAppBackground();
  expect(store.getAppBackground()).toMatchObject({
    palette: "ocean",
    opacity: 0.5,
    componentOpacity: 1,
  });
  await store.updateAppBackground({ componentOpacity: -1 });
  expect(store.getAppBackground().componentOpacity).toBe(0);
  await store.updateAppBackground({ componentOpacity: 9 });
  expect(store.getAppBackground().componentOpacity).toBe(1);
});
