import { darkTokens, lightTokens } from "@rakazo/ui-tokens";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UiModeDefinition } from "../ui-modes";
import { CLASSIC_UI_MODE_ID, classicUiMode, defineUiModeScreenSlot } from "../ui-modes";
import {
  createUiModeRegistry,
  getUiModeDefinition,
  getUiModeRegistryRevision,
  isUiModeSupportedOnPlatform,
  listAvailableUiModes,
  listRegisteredUiModes,
  registerUiMode,
  resolveUiModeAppearance,
  resolveUiModeDefinition,
  resolveUiModeTheme,
  subscribeUiModeRegistry,
  unregisterUiMode,
  validateUiModeDefinition,
} from "./ui-mode-registry";

function makeCustomMode(overrides: Partial<UiModeDefinition> = {}): UiModeDefinition {
  return {
    id: "black-titanium",
    name: "Black Titanium",
    description: "Machined matte dark titanium skin",
    version: "1.0.0",
    supportedPlatforms: ["ios"],
    colorSchemeLock: "dark",
    systemColorPolicy: "tokens",
    glassPolicy: {
      mode: "solid-fallback",
      defaultCornerRadius: 14,
    },
    chatAppearancePolicy: "suspend",
    hapticProfile: "tactile",
    geometry: {
      cardRadius: 14,
      controlRadius: 8,
      pillRadius: 999,
      borderWidth: 1,
      cornerShape: "chamfered",
      chamferSize: 6,
      topSpecularHighlight: "rgba(255, 255, 255, 0.14)",
    },
    typography: {
      uppercaseLabels: true,
      letterSpacingScale: 1.08,
    },
    previewBadge: {
      accentColor: "#FF6B00",
      backgroundColor: "#0B0B0D",
      foregroundColor: "#F5F5F7",
      tag: "Pro",
    },
    ...overrides,
  };
}

describe("ui-mode-registry and classic baseline preset", () => {
  afterEach(() => {
    for (const mode of listRegisteredUiModes()) {
      if (mode.id !== CLASSIC_UI_MODE_ID) {
        unregisterUiMode(mode.id);
      }
    }
  });

  it("exports a valid, frozen classicUiMode baseline matching native Liquid Glass defaults", () => {
    expect(classicUiMode.id).toBe("classic");
    expect(classicUiMode.name).toBe("Classic");
    expect(classicUiMode.description).toBe("Default native interface");
    expect(classicUiMode.version).toBe("1.0.0");
    expect(classicUiMode.order).toBe(0);
    expect(classicUiMode.supportedPlatforms).toEqual(["ios", "android", "web"]);
    expect(classicUiMode.colorSchemeLock).toBe("none");
    expect(classicUiMode.systemColorPolicy).toBe("platform");
    expect(classicUiMode.glassPolicy).toEqual({
      mode: "liquid",
      defaultCornerRadius: 22,
    });
    expect(classicUiMode.chatAppearancePolicy).toBe("preserve");
    expect(classicUiMode.hapticProfile).toBe("subtle");
    expect(classicUiMode.geometry).toEqual({
      cardRadius: 22,
      controlRadius: 12,
      pillRadius: 999,
      borderWidth: 1,
      cornerShape: "continuous",
      chamferSize: 0,
      topSpecularHighlight: null,
    });
    expect(classicUiMode.typography).toEqual({
      uppercaseLabels: false,
      letterSpacingScale: 1,
    });
    expect(classicUiMode.previewBadge).toBeDefined();
    expect(Object.isFrozen(classicUiMode)).toBe(true);
    expect(validateUiModeDefinition(classicUiMode)).toBe(classicUiMode);
  });

  it("enforces classic mode immutability against overwrite and unregistration", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUiModeRegistry(listener);

    expect(getUiModeDefinition("classic")).toBe(classicUiMode);
    expect(() => registerUiMode({ ...classicUiMode, name: "Modified Classic" })).toThrow(
      /classic.*immutable/i,
    );
    expect(() =>
      registerUiMode({ ...classicUiMode, name: "Replaced Classic" }, { replace: true }),
    ).toThrow(/classic.*immutable/i);

    expect(unregisterUiMode("classic")).toBe(false);
    expect(getUiModeDefinition("classic")).toBe(classicUiMode);
    expect(listener).not.toHaveBeenCalled();

    expect(() => createUiModeRegistry([{ ...classicUiMode, description: "Tampered" }])).toThrow(
      /classic.*immutable/i,
    );

    const seeded = createUiModeRegistry([classicUiMode, makeCustomMode({ id: "dot-matrix" })]);
    expect(seeded.get("classic")).toBe(classicUiMode);
    expect(seeded.get("dot-matrix")?.id).toBe("dot-matrix");

    unsubscribe();
  });

  it("rejects duplicate custom IDs unless replace is true", () => {
    const registry = createUiModeRegistry();
    const v1 = makeCustomMode({ id: "tactical-deck", version: "1.0.0" });
    const v2 = makeCustomMode({ id: "tactical-deck", version: "2.0.0" });

    expect(registry.register(v1)).toBe(v1);
    expect(() => registry.register(v2)).toThrow(/already registered/i);
    expect(registry.get("tactical-deck")).toBe(v1);

    expect(registry.register(v2, { replace: true })).toBe(v2);
    expect(registry.get("tactical-deck")).toBe(v2);
  });

  it("sorts available modes deterministically: classic first, ascending order ?? 100, then alphabetical id", () => {
    registerUiMode(makeCustomMode({ id: "zeta-hud" }));
    registerUiMode(makeCustomMode({ id: "alpha-grid" }));
    registerUiMode(makeCustomMode({ id: "negative-order", order: -10 }));
    registerUiMode(makeCustomMode({ id: "zero-order", order: 0 }));
    registerUiMode(makeCustomMode({ id: "early- priority".replace(" ", ""), order: 10 }));
    registerUiMode(makeCustomMode({ id: "late-archive", order: 250 }));

    const iosModes = listAvailableUiModes("ios").map((mode) => mode.id);
    expect(iosModes).toEqual([
      "classic",
      "negative-order",
      "zero-order",
      "early-priority",
      "alpha-grid",
      "zeta-hud",
      "late-archive",
    ]);
  });

  it("enforces strict platform gating and falls back to classic on unsupported platforms", () => {
    const iosOnly = registerUiMode(
      makeCustomMode({
        id: "ios-cyber-deck",
        supportedPlatforms: ["ios"],
      }),
    );
    const mobileAndWeb = registerUiMode(
      makeCustomMode({
        id: "universal-skin",
        order: 20,
        supportedPlatforms: ["ios", "android", "web"],
      }),
    );

    expect(isUiModeSupportedOnPlatform(classicUiMode, "ios")).toBe(true);
    expect(isUiModeSupportedOnPlatform(classicUiMode, "android")).toBe(true);
    expect(isUiModeSupportedOnPlatform(classicUiMode, "web")).toBe(true);
    expect(isUiModeSupportedOnPlatform(classicUiMode, "macos")).toBe(true);

    expect(isUiModeSupportedOnPlatform(iosOnly, "ios")).toBe(true);
    expect(isUiModeSupportedOnPlatform(iosOnly, "IOS")).toBe(false);
    expect(isUiModeSupportedOnPlatform(iosOnly, "android")).toBe(false);
    expect(isUiModeSupportedOnPlatform(iosOnly, "web")).toBe(false);
    expect(isUiModeSupportedOnPlatform(iosOnly, "windows")).toBe(false);

    expect(resolveUiModeDefinition("ios-cyber-deck", "ios")).toBe(iosOnly);
    expect(resolveUiModeDefinition("ios-cyber-deck", "android")).toBe(classicUiMode);
    expect(resolveUiModeDefinition("ios-cyber-deck", "web")).toBe(classicUiMode);
    expect(resolveUiModeDefinition("unknown-mode", "ios")).toBe(classicUiMode);
    expect(resolveUiModeDefinition(null, "ios")).toBe(classicUiMode);
    expect(resolveUiModeDefinition(undefined, "ios")).toBe(classicUiMode);

    expect(listAvailableUiModes("android").map((mode) => mode.id)).toEqual([
      "classic",
      mobileAndWeb.id,
    ]);
    expect(listAvailableUiModes("unknown-os").map((mode) => mode.id)).toEqual(["classic"]);
  });

  it("applies colorSchemeLock overrides for dark and light while respecting user appearance on none", () => {
    const darkLocked = registerUiMode(
      makeCustomMode({
        id: "obsidian-dark",
        colorSchemeLock: "dark",
        colors: {
          dark: { background: "#050507" },
          light: { background: "#FAFAFC" },
        },
      }),
    );
    const lightLocked = registerUiMode(
      makeCustomMode({
        id: "paper-daylight",
        colorSchemeLock: "light",
        colors: {
          light: { background: "#F7F4EC" },
          dark: { background: "#121212" },
        },
      }),
    );
    const adaptive = registerUiMode(
      makeCustomMode({
        id: "adaptive-glass",
        colorSchemeLock: "none",
        colors: {
          light: { primary: "#0055FF" },
          dark: { primary: "#66AAFF" },
        },
      }),
    );

    expect(resolveUiModeAppearance(darkLocked, "light")).toBe("dark");
    expect(resolveUiModeAppearance(darkLocked, "dark")).toBe("dark");
    expect(resolveUiModeAppearance(lightLocked, "dark")).toBe("light");
    expect(resolveUiModeAppearance(lightLocked, "light")).toBe("light");
    expect(resolveUiModeAppearance(adaptive, "light")).toBe("light");
    expect(resolveUiModeAppearance(adaptive, "dark")).toBe("dark");

    const darkThemeOnLightUser = resolveUiModeTheme("obsidian-dark", {
      platform: "ios",
      userAppearance: "light",
    });
    expect(darkThemeOnLightUser.appearance).toBe("dark");
    expect(darkThemeOnLightUser.tokens.background).toBe("#050507");
    expect(darkThemeOnLightUser.tokens.foreground).toBe(darkTokens.foreground);

    const lightThemeOnDarkUser = resolveUiModeTheme("paper-daylight", {
      platform: "ios",
      userAppearance: "dark",
    });
    expect(lightThemeOnDarkUser.appearance).toBe("light");
    expect(lightThemeOnDarkUser.tokens.background).toBe("#F7F4EC");
    expect(lightThemeOnDarkUser.tokens.foreground).toBe(lightTokens.foreground);

    const adaptiveLight = resolveUiModeTheme("adaptive-glass", {
      platform: "ios",
      userAppearance: "light",
    });
    expect(adaptiveLight.appearance).toBe("light");
    expect(adaptiveLight.tokens.primary).toBe("#0055FF");

    const adaptiveDark = resolveUiModeTheme("adaptive-glass", {
      platform: "ios",
      userAppearance: "dark",
    });
    expect(adaptiveDark.appearance).toBe("dark");
    expect(adaptiveDark.tokens.primary).toBe("#66AAFF");

    // Unsupported platform falls back to classic and preserves user's light appearance
    const androidFallback = resolveUiModeTheme("obsidian-dark", {
      platform: "android",
      userAppearance: "light",
    });
    expect(androidFallback.mode).toBe(classicUiMode);
    expect(androidFallback.appearance).toBe("light");
    expect(androidFallback.tokens).toEqual(lightTokens);
  });

  it("merges partial ColorTokens overrides without losing base tokens or clobbering with undefined", () => {
    registerUiMode(
      makeCustomMode({
        id: "partial-tokens",
        colorSchemeLock: "dark",
        colors: {
          dark: {
            background: "#090A0F",
            primary: "rgba(255, 107, 0, 0.95)",
            overlay: "hsla(220, 20%, 5%, 0.65)",
            glassFill: "transparent",
            card: undefined,
          },
        },
      }),
    );

    const resolved = resolveUiModeTheme("partial-tokens", {
      platform: "ios",
      userAppearance: "dark",
    });

    expect(resolved.tokens.background).toBe("#090A0F");
    expect(resolved.tokens.primary).toBe("rgba(255, 107, 0, 0.95)");
    expect(resolved.tokens.overlay).toBe("hsla(220, 20%, 5%, 0.65)");
    expect(resolved.tokens.glassFill).toBe("transparent");
    expect(resolved.tokens.card).toBe(darkTokens.card);

    for (const key of Object.keys(darkTokens) as Array<keyof typeof darkTokens>) {
      expect(typeof resolved.tokens[key]).toBe("string");
      expect(resolved.tokens[key].length).toBeGreaterThan(0);
    }
  });

  it("accepts valid primitive and screen slot components while rejecting invalid definitions", () => {
    const DummyCard = () => null;
    const DummyInbox = defineUiModeScreenSlot<{ count: number }>(() => null);
    const ExoticTrigger = { $$typeof: Symbol.for("react.memo"), type: () => null };

    const withSlots = makeCustomMode({
      id: "slotted-mode-1",
      primitives: {
        Card: DummyCard,
        Trigger: ExoticTrigger as unknown as NonNullable<UiModeDefinition["primitives"]>["Trigger"],
      },
      screens: {
        inbox: DummyInbox,
      },
    });
    expect(validateUiModeDefinition(withSlots)).toBe(withSlots);

    const invalidCases: Array<[string, unknown]> = [
      ["null definition", null],
      ["array definition", []],
      ["empty id", makeCustomMode({ id: "" })],
      ["uppercase id", makeCustomMode({ id: "BlackTitanium" })],
      ["leading hyphen id", makeCustomMode({ id: "-titanium" })],
      ["underscore id", makeCustomMode({ id: "black_titanium" })],
      ["too-long id (>64)", makeCustomMode({ id: `a${"b".repeat(64)}` })],
      ["whitespace name", makeCustomMode({ name: "   " })],
      ["empty version", makeCustomMode({ version: "" })],
      ["NaN order", makeCustomMode({ order: Number.NaN })],
      ["empty supportedPlatforms", makeCustomMode({ supportedPlatforms: [] })],
      [
        "invalid platform",
        makeCustomMode({
          supportedPlatforms: ["macos" as unknown as "ios"],
        }),
      ],
      [
        "negative cardRadius",
        makeCustomMode({ geometry: { ...classicUiMode.geometry, cardRadius: -1 } }),
      ],
      [
        "NaN borderWidth",
        makeCustomMode({ geometry: { ...classicUiMode.geometry, borderWidth: Number.NaN } }),
      ],
      [
        "invalid cornerShape",
        makeCustomMode({
          geometry: {
            ...classicUiMode.geometry,
            cornerShape: "beveled" as unknown as "continuous",
          },
        }),
      ],
      ["invalid colorSchemeLock", makeCustomMode({ colorSchemeLock: "auto" as unknown as "none" })],
      [
        "invalid systemColorPolicy",
        makeCustomMode({ systemColorPolicy: "native" as unknown as "platform" }),
      ],
      [
        "invalid glassPolicy.mode",
        makeCustomMode({ glassPolicy: { mode: "frosted" as unknown as "liquid" } }),
      ],
      [
        "negative glassPolicy.defaultCornerRadius",
        makeCustomMode({ glassPolicy: { mode: "liquid", defaultCornerRadius: -4 } }),
      ],
      [
        "invalid chatAppearancePolicy",
        makeCustomMode({ chatAppearancePolicy: "clear" as unknown as "preserve" }),
      ],
      ["invalid hapticProfile", makeCustomMode({ hapticProfile: "heavy" as unknown as "subtle" })],
      [
        "non-string color override",
        makeCustomMode({
          colors: { dark: { background: 12345 as unknown as string } },
        }),
      ],
      [
        "malformed hex color override",
        makeCustomMode({
          colors: { dark: { background: "#12G45Z" } },
        }),
      ],
      [
        "out-of-range rgba override",
        makeCustomMode({
          colors: { dark: { background: "rgba(300, 10, 10, 0.5)" } },
        }),
      ],
      [
        "out-of-range rgba alpha override",
        makeCustomMode({
          colors: { dark: { background: "rgba(10, 10, 10, 1.5)" } },
        }),
      ],
      [
        "unknown color token key",
        makeCustomMode({
          colors: { dark: { unknownSlot: "#000000" } as unknown as Partial<typeof darkTokens> },
        }),
      ],
      [
        "invalid primitive component",
        makeCustomMode({
          primitives: { Card: "not-a-component" as unknown as typeof DummyCard },
        }),
      ],
      [
        "unknown screen slot key",
        makeCustomMode({
          screens: { settings: DummyInbox } as unknown as UiModeDefinition["screens"],
        }),
      ],
    ];

    for (const [label, candidate] of invalidCases) {
      expect(() => validateUiModeDefinition(candidate), label).toThrow(Error);
    }
  });

  it("notifies subscribers on register, replace, and unregister without firing on no-ops or errors", () => {
    const startRevision = getUiModeRegistryRevision();
    const listener = vi.fn();
    const selfRemoving = vi.fn(() => {
      unsubscribeSelf();
    });
    const unsubscribe = subscribeUiModeRegistry(listener);
    const unsubscribeSelf = subscribeUiModeRegistry(selfRemoving);

    const modeV1 = makeCustomMode({ id: "reactive-mode", version: "1.0.0" });
    registerUiMode(modeV1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(selfRemoving).toHaveBeenCalledTimes(1);
    expect(getUiModeRegistryRevision()).toBe(startRevision + 1);

    // Duplicate without replace throws and does not notify
    expect(() => registerUiMode(modeV1)).toThrow();
    expect(listener).toHaveBeenCalledTimes(1);

    // Replace notifies active subscribers; selfRemoving stays at 1
    const modeV2 = makeCustomMode({ id: "reactive-mode", version: "1.1.0" });
    registerUiMode(modeV2, { replace: true });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(selfRemoving).toHaveBeenCalledTimes(1);

    // Unregistering unknown or classic does not notify
    expect(unregisterUiMode("does-not-exist")).toBe(false);
    expect(unregisterUiMode("classic")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    // Unregistering existing custom mode notifies
    expect(unregisterUiMode("reactive-mode")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    registerUiMode(modeV1);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
