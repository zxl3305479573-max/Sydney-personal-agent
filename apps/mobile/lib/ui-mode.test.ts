import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  platform: { OS: "ios" },
  storage: new Map<string, string>(),
  system: "light" as "light" | "dark",
  override: null as "light" | "dark" | null,
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => runtime.storage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    runtime.storage.set(key, value);
  }),
}));
vi.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    exists = true;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
  },
  Paths: { document: "file://documents" },
}));
vi.mock("expo-image-picker", () => ({}));
vi.mock("react-native", () => ({
  Platform: runtime.platform,
  PlatformColor: (name: string) => `system:${name}`,
  StyleSheet: { create: <T>(styles: T) => styles, hairlineWidth: 1 },
  Appearance: {
    getColorScheme: () => runtime.override ?? runtime.system,
    setColorScheme: (scheme: "light" | "dark" | "unspecified") => {
      runtime.override = scheme === "unspecified" ? null : scheme;
    },
    addChangeListener: () => ({ remove: vi.fn() }),
  },
}));

async function setup() {
  const modes = await import("./ui-mode");
  const registry = await import("./ui-mode-registry");
  const { classicUiMode } = await import("../ui-modes/classic");
  const definition = {
    ...classicUiMode,
    id: "test-mode",
    name: "Test mode",
    order: 1,
    supportedPlatforms: ["ios"] as const,
    colorSchemeLock: "dark" as const,
    systemColorPolicy: "tokens" as const,
    chatAppearancePolicy: "suspend" as const,
    colors: { dark: { background: "#123456", foreground: "#ffffff" } },
  };
  registry.registerUiMode(definition);
  return { modes, registry, definition };
}

describe("mobile UI mode integration", () => {
  beforeEach(() => {
    vi.resetModules();
    runtime.storage.clear();
    runtime.platform.OS = "ios";
    runtime.system = "light";
    runtime.override = null;
  });

  it("registers the built-in iOS mode before hydration and restores the user's theme on reset", async () => {
    const modes = await import("./ui-mode");
    const registry = await import("./ui-mode-registry");
    const appearance = await import("./appearance");
    runtime.storage.set("rakazo.uiAppearance", "light");
    runtime.storage.set(
      "sydney.mobile.uiMode.v1",
      JSON.stringify({
        schemaVersion: 1,
        activeModeId: "midnight",
        lastAlternateModeId: "midnight",
      }),
    );
    await Promise.all([appearance.loadAppearancePreference(), modes.loadUiMode()]);
    expect(registry.listAvailableUiModes("ios").map((mode) => mode.id)).toEqual([
      "classic",
      "midnight",
    ]);
    expect(registry.listAvailableUiModes("android").map((mode) => mode.id)).toEqual(["classic"]);
    expect(appearance.mobileTokens()).toMatchObject({ background: "#0F172A", primary: "#93C5FD" });
    expect(runtime.override).toBe("dark");
    await modes.resetUiModeToClassic();
    expect(appearance.resolveMobileAppearance()).toBe("light");
    expect(runtime.storage.get("rakazo.uiAppearance")).toBe("light");
  });

  it("hydrates a saved mode and applies its theme without replacing the appearance preference", async () => {
    const { modes } = await setup();
    const appearance = await import("./appearance");
    runtime.storage.set("rakazo.uiAppearance", "light");
    runtime.storage.set(
      "sydney.mobile.uiMode.v1",
      JSON.stringify({
        schemaVersion: 1,
        activeModeId: "test-mode",
        lastAlternateModeId: "test-mode",
      }),
    );
    await Promise.all([appearance.loadAppearancePreference(), modes.loadUiMode()]);
    expect(appearance.getCachedAppearancePreference()).toBe("light");
    expect(appearance.resolveMobileAppearance()).toBe("dark");
    expect(appearance.mobileTokens().background).toBe("#123456");
    expect(runtime.override).toBe("dark");
    await modes.resetUiModeToClassic();
    expect(appearance.resolveMobileAppearance()).toBe("light");
    expect(runtime.override).toBe("light");
    expect(runtime.storage.get("rakazo.uiAppearance")).toBe("light");
  });

  it("previews and toggles modes while restoring native system colors", async () => {
    const { modes } = await setup();
    const appearance = await import("./appearance");
    const { native } = await import("./native");
    expect(native.label).toBe("system:label");
    modes.beginUiModePreview("test-mode");
    expect(native.label).toBe("#ffffff");
    expect(runtime.override).toBe("dark");
    expect(runtime.storage.has("sydney.mobile.uiMode.v1")).toBe(false);
    modes.cancelUiModePreview();
    expect(native.label).toBe("system:label");
    expect(runtime.override).toBeNull();
    await modes.toggleAlternateUiMode();
    expect(modes.getUiModeSnapshot().activeModeId).toBe("test-mode");
    await modes.toggleAlternateUiMode();
    expect(modes.getUiModeSnapshot().activeModeId).toBe("classic");
    expect(appearance.getCachedAppearancePreference()).toBe("system");
  });

  it("suspends rendered chat appearance while preserving editable settings and images", async () => {
    const { modes } = await setup();
    const chat = await import("./chat-appearance");
    await chat.saveMobileChatAppearance({
      ...chat.getMobileChatAppearance(),
      backgroundUri: "file://saved-background",
      bubble: chat.MOBILE_BUBBLE_PRESETS[1]!.value,
    });
    const saved = chat.getMobileChatAppearance();
    const stored = runtime.storage.get("rakazo.chatAppearance.mobile");
    const listener = vi.fn();
    const unsubscribe = chat.subscribeMobileChatAppearance(listener);
    await modes.setUiMode("test-mode");
    expect(chat.getEffectiveMobileChatAppearance().backgroundUri).toBeNull();
    expect(chat.getEffectiveMobileChatAppearance().bubble).toBeNull();
    expect(chat.getMobileChatAppearance()).toBe(saved);
    await modes.resetUiModeToClassic();
    expect(chat.getEffectiveMobileChatAppearance()).toBe(saved);
    expect(runtime.storage.get("rakazo.chatAppearance.mobile")).toBe(stored);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("propagates changes when an active definition is replaced without changing the mode ID", async () => {
    const { modes, registry, definition } = await setup();
    const appearance = await import("./appearance");
    await modes.setUiMode("test-mode");
    const snapshot = modes.getUiModeSnapshot();
    const revision = modes.getUiModeRevision();
    const listener = vi.fn();
    const unsubscribe = appearance.subscribeAppearance(listener);
    registry.registerUiMode(
      {
        ...definition,
        colors: { dark: { background: "#654321" } },
      },
      { replace: true },
    );
    expect(modes.getUiModeSnapshot()).toBe(snapshot);
    expect(modes.getUiModeRevision()).toBeGreaterThan(revision);
    expect(appearance.mobileTokens().background).toBe("#654321");
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("provides the active theme to application children and refreshes it on definition replacement", async () => {
    const { modes, registry, definition } = await setup();
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { UiModeProvider } = await import("./ui-mode-provider");
    const { useUiModeTheme } = await import("./ui-mode-slots");
    await modes.setUiMode("test-mode");

    function ThemeProbe() {
      const theme = useUiModeTheme();
      return createElement("span", null, theme.tokens.background);
    }

    function renderTheme() {
      return renderToStaticMarkup(createElement(UiModeProvider, null, createElement(ThemeProbe)));
    }

    expect(renderTheme()).toContain("#123456");
    registry.registerUiMode(
      { ...definition, colors: { dark: { background: "#654321" } } },
      { replace: true },
    );
    expect(renderTheme()).toContain("#654321");
  });

  it("falls back when a mode is removed and restores it when registered again", async () => {
    const { modes, registry, definition } = await setup();
    await modes.setUiMode("test-mode");
    registry.unregisterUiMode("test-mode");
    expect(modes.getUiModeSnapshot()).toMatchObject({
      savedModeId: "test-mode",
      activeModeId: "classic",
    });
    registry.registerUiMode(definition);
    expect(modes.getUiModeSnapshot().activeModeId).toBe("test-mode");
  });

  it("keeps an iOS-only saved choice inactive on Android", async () => {
    runtime.platform.OS = "android";
    const { modes } = await setup();
    runtime.storage.set(
      "sydney.mobile.uiMode.v1",
      JSON.stringify({
        schemaVersion: 1,
        activeModeId: "test-mode",
        lastAlternateModeId: "test-mode",
      }),
    );
    await modes.loadUiMode();
    expect(modes.getUiModeSnapshot()).toMatchObject({
      savedModeId: "test-mode",
      activeModeId: "classic",
      hydrated: true,
    });
    await expect(modes.setUiMode("test-mode")).rejects.toThrow("not available");
  });

  it("commits a preview and keeps the alternate choice across module reload", async () => {
    let { modes } = await setup();
    modes.beginUiModePreview("test-mode");
    await modes.commitUiModePreview();
    vi.resetModules();
    ({ modes } = await setup());
    await modes.loadUiMode();
    expect(modes.getUiModeSnapshot()).toMatchObject({
      activeModeId: "test-mode",
      lastAlternateModeId: "test-mode",
      previewModeId: null,
    });
  });
});
