import type { ColorTokens, ResolvedAppearance } from "@rakazo/ui-tokens";
import { darkTokens, tokensForAppearance } from "@rakazo/ui-tokens";
import { classicUiMode } from "../ui-modes/classic";
import type {
  ModeApprovalContainerSlotProps,
  ModeCardSlotProps,
  ModeCodeContainerSlotProps,
  ModeTelemetryBannerSlotProps,
  ModeTriggerSlotProps,
  ResolvedUiModeTheme,
  UiModeChatAppearancePolicy,
  UiModeColorSchemeLock,
  UiModeDefinition,
  UiModeGlassPolicy,
  UiModeHapticProfile,
  UiModePlatform,
  UiModePrimitiveSlots,
  UiModeScreenSlotKey,
  UiModeSystemColorPolicy,
} from "../ui-modes/types";
import { CLASSIC_UI_MODE_ID } from "../ui-modes/types";

export { classicUiMode } from "../ui-modes/classic";

export type RegisterUiModeOptions = {
  replace?: boolean;
};

export type ResolveUiModeThemeOptions = {
  platform: string;
  userAppearance: ResolvedAppearance;
};

export type UiModeRegistry = {
  register: (definition: UiModeDefinition, options?: RegisterUiModeOptions) => UiModeDefinition;
  unregister: (modeId: string) => boolean;
  get: (modeId: string) => UiModeDefinition | undefined;
  has: (modeId: string) => boolean;
  resolve: (modeId: string | null | undefined, platform: string) => UiModeDefinition;
  listAvailable: (platform: string) => UiModeDefinition[];
  listAll: () => UiModeDefinition[];
  resolveTheme: (
    modeId: string | null | undefined,
    options: ResolveUiModeThemeOptions,
  ) => ResolvedUiModeTheme;
  subscribe: (listener: () => void) => () => void;
  getRevision: () => number;
};

const DEFAULT_CUSTOM_MODE_ORDER = 100;
const MODE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HEX_COLOR_PATTERN = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;
const RGB_FN_PATTERN = /^(rgb|rgba)\(([^)]+)\)$/i;
const HSL_FN_PATTERN = /^(hsl|hsla)\(([^)]+)\)$/i;
const DECIMAL_CHANNEL_PATTERN = /^\d{1,3}(?:\.\d+)?$/;
const ALPHA_VALUE_PATTERN = /^(?:0|1|1\.0+|0?\.\d+)$/;
const HUE_VALUE_PATTERN = /^-?\d+(?:\.\d+)?(?:deg)?$/i;
const PERCENT_VALUE_PATTERN = /^\d+(?:\.\d+)?%$/;

const VALID_PLATFORMS = new Set<UiModePlatform>(["ios", "android", "web"]);
const VALID_COLOR_SCHEME_LOCKS = new Set<UiModeColorSchemeLock>(["none", "dark", "light"]);
const VALID_SYSTEM_COLOR_POLICIES = new Set<UiModeSystemColorPolicy>(["platform", "tokens"]);
const VALID_GLASS_MODES = new Set<UiModeGlassPolicy["mode"]>([
  "liquid",
  "tinted-liquid",
  "solid-fallback",
]);
const VALID_CHAT_APPEARANCE_POLICIES = new Set<UiModeChatAppearancePolicy>(["preserve", "suspend"]);
const VALID_HAPTIC_PROFILES = new Set<UiModeHapticProfile>(["none", "subtle", "tactile"]);
const VALID_CORNER_SHAPES = new Set<UiModeDefinition["geometry"]["cornerShape"]>([
  "continuous",
  "sharp",
  "chamfered",
]);
const COLOR_TOKEN_KEYS = Object.keys(darkTokens) as Array<keyof ColorTokens>;
const VALID_COLOR_TOKEN_KEYS = new Set<string>(COLOR_TOKEN_KEYS);
const VALID_PRIMITIVE_KEYS = new Set<keyof UiModePrimitiveSlots>([
  "Card",
  "Trigger",
  "CodeContainer",
  "ApprovalContainer",
  "TelemetryBanner",
]);
const VALID_SCREEN_KEYS = new Set<UiModeScreenSlotKey>([
  "inbox",
  "thread",
  "groupThread",
  "computer",
]);

export type UiModeAnySlotProps =
  | ModeCardSlotProps
  | ModeTriggerSlotProps
  | ModeCodeContainerSlotProps
  | ModeApprovalContainerSlotProps
  | ModeTelemetryBannerSlotProps;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isReactComponentLike(value: unknown): boolean {
  return (
    typeof value === "function" ||
    (typeof value === "object" && value !== null && "$$typeof" in value)
  );
}

function isValidAlphaChannel(raw: string): boolean {
  if (!ALPHA_VALUE_PATTERN.test(raw)) return false;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1;
}

function isValidColorString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (trimmed === "transparent") return true;
  if (HEX_COLOR_PATTERN.test(trimmed)) return true;

  const rgbMatch = RGB_FN_PATTERN.exec(trimmed);
  if (rgbMatch) {
    const fn = rgbMatch[1]?.toLowerCase();
    const argsBody = rgbMatch[2];
    if (!fn || argsBody === undefined) return false;
    const parts = argsBody.split(",").map((part) => part.trim());
    const expectedLength = fn === "rgba" ? 4 : 3;
    if (parts.length !== expectedLength) return false;
    for (let i = 0; i < 3; i += 1) {
      const channel = parts[i];
      if (channel === undefined || !DECIMAL_CHANNEL_PATTERN.test(channel)) return false;
      const numeric = Number(channel);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 255) return false;
    }
    if (expectedLength === 4) {
      const alpha = parts[3];
      if (alpha === undefined || !isValidAlphaChannel(alpha)) return false;
    }
    return true;
  }

  const hslMatch = HSL_FN_PATTERN.exec(trimmed);
  if (hslMatch) {
    const fn = hslMatch[1]?.toLowerCase();
    const argsBody = hslMatch[2];
    if (!fn || argsBody === undefined) return false;
    const parts = argsBody.split(",").map((part) => part.trim());
    const expectedLength = fn === "hsla" ? 4 : 3;
    if (parts.length !== expectedLength) return false;
    const hue = parts[0];
    const sat = parts[1];
    const light = parts[2];
    if (hue === undefined || sat === undefined || light === undefined) return false;
    if (!HUE_VALUE_PATTERN.test(hue)) return false;
    for (const pct of [sat, light]) {
      if (!PERCENT_VALUE_PATTERN.test(pct)) return false;
      const numeric = Number(pct.slice(0, -1));
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return false;
    }
    if (expectedLength === 4) {
      const alpha = parts[3];
      if (alpha === undefined || !isValidAlphaChannel(alpha)) return false;
    }
    return true;
  }

  return false;
}

function validateColorPaletteOverrides(
  palette: unknown,
  scheme: ResolvedAppearance,
  modeId: string,
): void {
  if (palette === undefined) return;
  if (!isPlainRecord(palette)) {
    throw new Error(`Invalid UI mode "${modeId}": colors.${scheme} must be an object.`);
  }
  for (const [tokenKey, tokenValue] of Object.entries(palette)) {
    if (!VALID_COLOR_TOKEN_KEYS.has(tokenKey)) {
      throw new Error(
        `Invalid UI mode "${modeId}": unknown color token "${tokenKey}" in colors.${scheme}.`,
      );
    }
    if (tokenValue === undefined) continue;
    if (!isValidColorString(tokenValue)) {
      throw new Error(
        `Invalid UI mode "${modeId}": colors.${scheme}.${tokenKey} must be a valid hex, rgb/rgba, hsl/hsla, or "transparent" color string.`,
      );
    }
  }
}

export function validateUiModeDefinition(definition: unknown): UiModeDefinition {
  if (!isPlainRecord(definition)) {
    throw new Error("Invalid UI mode definition: expected a non-null object.");
  }

  const { id, name, description, version, order, supportedPlatforms } = definition;
  if (typeof id !== "string" || !MODE_ID_PATTERN.test(id)) {
    throw new Error(`Invalid UI mode id "${String(id)}": must match /^[a-z0-9][a-z0-9-]{0,63}$/.`);
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error(`Invalid UI mode "${id}": name must be a non-empty string.`);
  }
  if (typeof description !== "string") {
    throw new Error(`Invalid UI mode "${id}": description must be a string.`);
  }
  if (typeof version !== "string" || version.trim().length === 0) {
    throw new Error(`Invalid UI mode "${id}": version must be a non-empty string.`);
  }
  if (order !== undefined && (typeof order !== "number" || !Number.isFinite(order))) {
    throw new Error(`Invalid UI mode "${id}": order must be a finite number when provided.`);
  }

  if (!Array.isArray(supportedPlatforms) || supportedPlatforms.length === 0) {
    throw new Error(
      `Invalid UI mode "${id}": supportedPlatforms must be a non-empty array of platforms.`,
    );
  }
  for (const platform of supportedPlatforms) {
    if (typeof platform !== "string" || !VALID_PLATFORMS.has(platform as UiModePlatform)) {
      throw new Error(
        `Invalid UI mode "${id}": unsupported platform "${String(platform)}" in supportedPlatforms.`,
      );
    }
  }

  if (
    typeof definition.colorSchemeLock !== "string" ||
    !VALID_COLOR_SCHEME_LOCKS.has(definition.colorSchemeLock as UiModeColorSchemeLock)
  ) {
    throw new Error(`Invalid UI mode "${id}": colorSchemeLock must be "none", "dark", or "light".`);
  }

  if (
    typeof definition.systemColorPolicy !== "string" ||
    !VALID_SYSTEM_COLOR_POLICIES.has(definition.systemColorPolicy as UiModeSystemColorPolicy)
  ) {
    throw new Error(`Invalid UI mode "${id}": systemColorPolicy must be "platform" or "tokens".`);
  }

  const { glassPolicy } = definition;
  if (!isPlainRecord(glassPolicy)) {
    throw new Error(`Invalid UI mode "${id}": glassPolicy must be an object.`);
  }
  if (
    typeof glassPolicy.mode !== "string" ||
    !VALID_GLASS_MODES.has(glassPolicy.mode as UiModeGlassPolicy["mode"])
  ) {
    throw new Error(
      `Invalid UI mode "${id}": glassPolicy.mode must be "liquid", "tinted-liquid", or "solid-fallback".`,
    );
  }
  if (
    glassPolicy.defaultCornerRadius !== undefined &&
    !isNonNegativeFiniteNumber(glassPolicy.defaultCornerRadius)
  ) {
    throw new Error(
      `Invalid UI mode "${id}": glassPolicy.defaultCornerRadius must be a non-negative finite number.`,
    );
  }
  if (glassPolicy.defaultTint !== undefined && !isValidColorString(glassPolicy.defaultTint)) {
    throw new Error(
      `Invalid UI mode "${id}": glassPolicy.defaultTint must be a valid color string.`,
    );
  }

  if (
    typeof definition.chatAppearancePolicy !== "string" ||
    !VALID_CHAT_APPEARANCE_POLICIES.has(
      definition.chatAppearancePolicy as UiModeChatAppearancePolicy,
    )
  ) {
    throw new Error(
      `Invalid UI mode "${id}": chatAppearancePolicy must be "preserve" or "suspend".`,
    );
  }

  if (
    typeof definition.hapticProfile !== "string" ||
    !VALID_HAPTIC_PROFILES.has(definition.hapticProfile as UiModeHapticProfile)
  ) {
    throw new Error(
      `Invalid UI mode "${id}": hapticProfile must be "none", "subtle", or "tactile".`,
    );
  }

  const { geometry } = definition;
  if (!isPlainRecord(geometry)) {
    throw new Error(`Invalid UI mode "${id}": geometry must be an object.`);
  }
  for (const numericField of [
    "cardRadius",
    "controlRadius",
    "pillRadius",
    "borderWidth",
    "chamferSize",
  ] as const) {
    if (!isNonNegativeFiniteNumber(geometry[numericField])) {
      throw new Error(
        `Invalid UI mode "${id}": geometry.${numericField} must be a non-negative finite number.`,
      );
    }
  }
  if (
    typeof geometry.cornerShape !== "string" ||
    !VALID_CORNER_SHAPES.has(geometry.cornerShape as UiModeDefinition["geometry"]["cornerShape"])
  ) {
    throw new Error(
      `Invalid UI mode "${id}": geometry.cornerShape must be "continuous", "sharp", or "chamfered".`,
    );
  }
  if (
    geometry.topSpecularHighlight !== null &&
    !isValidColorString(geometry.topSpecularHighlight)
  ) {
    throw new Error(
      `Invalid UI mode "${id}": geometry.topSpecularHighlight must be null or a valid color string.`,
    );
  }

  const { typography } = definition;
  if (!isPlainRecord(typography)) {
    throw new Error(`Invalid UI mode "${id}": typography must be an object.`);
  }
  if (typeof typography.uppercaseLabels !== "boolean") {
    throw new Error(`Invalid UI mode "${id}": typography.uppercaseLabels must be a boolean.`);
  }
  if (!isNonNegativeFiniteNumber(typography.letterSpacingScale)) {
    throw new Error(
      `Invalid UI mode "${id}": typography.letterSpacingScale must be a non-negative finite number.`,
    );
  }
  for (const familyField of ["displayFamily", "bodyFamily", "monoFamily"] as const) {
    const family = typography[familyField];
    if (family !== undefined && (typeof family !== "string" || family.trim().length === 0)) {
      throw new Error(
        `Invalid UI mode "${id}": typography.${familyField} must be a non-empty string when provided.`,
      );
    }
  }

  const { colors } = definition;
  if (colors !== undefined) {
    if (!isPlainRecord(colors)) {
      throw new Error(`Invalid UI mode "${id}": colors must be an object.`);
    }
    for (const schemeKey of Object.keys(colors)) {
      if (schemeKey !== "light" && schemeKey !== "dark") {
        throw new Error(
          `Invalid UI mode "${id}": unsupported colors key "${schemeKey}" (expected "light" or "dark").`,
        );
      }
    }
    validateColorPaletteOverrides(colors.light, "light", id);
    validateColorPaletteOverrides(colors.dark, "dark", id);
  }

  const { previewBadge } = definition;
  if (previewBadge !== undefined) {
    if (!isPlainRecord(previewBadge)) {
      throw new Error(`Invalid UI mode "${id}": previewBadge must be an object.`);
    }
    for (const colorField of ["accentColor", "backgroundColor", "foregroundColor"] as const) {
      if (!isValidColorString(previewBadge[colorField])) {
        throw new Error(
          `Invalid UI mode "${id}": previewBadge.${colorField} must be a valid color string.`,
        );
      }
    }
    if (previewBadge.tag !== undefined && typeof previewBadge.tag !== "string") {
      throw new Error(`Invalid UI mode "${id}": previewBadge.tag must be a string when provided.`);
    }
  }

  const { primitives } = definition;
  if (primitives !== undefined) {
    if (!isPlainRecord(primitives)) {
      throw new Error(`Invalid UI mode "${id}": primitives must be an object.`);
    }
    for (const [slotKey, slotValue] of Object.entries(primitives)) {
      if (!VALID_PRIMITIVE_KEYS.has(slotKey as keyof UiModePrimitiveSlots)) {
        throw new Error(`Invalid UI mode "${id}": unknown primitive slot "${slotKey}".`);
      }
      if (slotValue !== undefined && !isReactComponentLike(slotValue)) {
        throw new Error(
          `Invalid UI mode "${id}": primitives.${slotKey} must be a React component.`,
        );
      }
    }
  }

  const { screens } = definition;
  if (screens !== undefined) {
    if (!isPlainRecord(screens)) {
      throw new Error(`Invalid UI mode "${id}": screens must be an object.`);
    }
    for (const [screenKey, screenValue] of Object.entries(screens)) {
      if (!VALID_SCREEN_KEYS.has(screenKey as UiModeScreenSlotKey)) {
        throw new Error(`Invalid UI mode "${id}": unknown screen slot "${screenKey}".`);
      }
      if (screenValue !== undefined && !isReactComponentLike(screenValue)) {
        throw new Error(`Invalid UI mode "${id}": screens.${screenKey} must be a React component.`);
      }
    }
  }

  return definition as UiModeDefinition;
}

export function isUiModeSupportedOnPlatform(
  definition: UiModeDefinition,
  platform: string,
): boolean {
  if (definition.id === CLASSIC_UI_MODE_ID) {
    return true;
  }
  if (!VALID_PLATFORMS.has(platform as UiModePlatform)) {
    return false;
  }
  return definition.supportedPlatforms.includes(platform as UiModePlatform);
}

export function resolveUiModeAppearance(
  mode: UiModeDefinition,
  userResolvedAppearance: ResolvedAppearance,
): ResolvedAppearance {
  if (mode.colorSchemeLock === "dark") return "dark";
  if (mode.colorSchemeLock === "light") return "light";
  return userResolvedAppearance;
}

function mergeColorTokens(baseTokens: ColorTokens, overrides?: Partial<ColorTokens>): ColorTokens {
  if (!overrides) return baseTokens;
  let merged: ColorTokens | null = null;
  for (const key of COLOR_TOKEN_KEYS) {
    const override = overrides[key];
    if (typeof override === "string") {
      if (merged === null) {
        merged = { ...baseTokens };
      }
      merged[key] = override;
    }
  }
  return merged ?? baseTokens;
}

function compareUiModes(a: UiModeDefinition, b: UiModeDefinition): number {
  if (a.id === b.id) return 0;
  if (a.id === CLASSIC_UI_MODE_ID) return -1;
  if (b.id === CLASSIC_UI_MODE_ID) return 1;
  const orderA = a.order ?? DEFAULT_CUSTOM_MODE_ORDER;
  const orderB = b.order ?? DEFAULT_CUSTOM_MODE_ORDER;
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  return a.id < b.id ? -1 : 1;
}

export function createUiModeRegistry(initialModes?: readonly UiModeDefinition[]): UiModeRegistry {
  const validatedClassic = validateUiModeDefinition(classicUiMode);
  const modes = new Map<string, UiModeDefinition>([[CLASSIC_UI_MODE_ID, validatedClassic]]);
  const listeners = new Set<() => void>();
  let revision = 0;

  const notify = () => {
    revision += 1;
    for (const listener of [...listeners]) {
      listener();
    }
  };

  const register = (
    definition: UiModeDefinition,
    options?: RegisterUiModeOptions,
  ): UiModeDefinition => {
    const validated = validateUiModeDefinition(definition);
    if (validated.id === CLASSIC_UI_MODE_ID) {
      throw new Error(
        `Built-in UI mode "${CLASSIC_UI_MODE_ID}" is immutable and cannot be registered or replaced.`,
      );
    }
    if (modes.has(validated.id) && options?.replace !== true) {
      throw new Error(
        `UI mode "${validated.id}" is already registered. Pass { replace: true } to replace it.`,
      );
    }
    modes.set(validated.id, validated);
    notify();
    return validated;
  };

  const unregister = (modeId: string): boolean => {
    if (modeId === CLASSIC_UI_MODE_ID) {
      return false;
    }
    const deleted = modes.delete(modeId);
    if (deleted) {
      notify();
    }
    return deleted;
  };

  const get = (modeId: string): UiModeDefinition | undefined => modes.get(modeId);

  const has = (modeId: string): boolean => modes.has(modeId);

  const resolve = (modeId: string | null | undefined, platform: string): UiModeDefinition => {
    if (!modeId) {
      return validatedClassic;
    }
    const found = modes.get(modeId);
    if (!found || !isUiModeSupportedOnPlatform(found, platform)) {
      return validatedClassic;
    }
    return found;
  };

  const listAvailable = (platform: string): UiModeDefinition[] => {
    const available: UiModeDefinition[] = [];
    for (const mode of modes.values()) {
      if (isUiModeSupportedOnPlatform(mode, platform)) {
        available.push(mode);
      }
    }
    return available.sort(compareUiModes);
  };

  const listAll = (): UiModeDefinition[] => Array.from(modes.values()).sort(compareUiModes);

  const resolveTheme = (
    modeId: string | null | undefined,
    options: ResolveUiModeThemeOptions,
  ): ResolvedUiModeTheme => {
    const mode = resolve(modeId, options.platform);
    const appearance = resolveUiModeAppearance(mode, options.userAppearance);
    const baseTokens = tokensForAppearance(appearance);
    const tokens = mergeColorTokens(baseTokens, mode.colors?.[appearance]);
    return {
      mode,
      appearance,
      tokens,
      geometry: mode.geometry,
      typography: mode.typography,
      glassPolicy: mode.glassPolicy,
      systemColorPolicy: mode.systemColorPolicy,
      chatAppearancePolicy: mode.chatAppearancePolicy,
      hapticProfile: mode.hapticProfile,
    };
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const getRevision = (): number => revision;

  if (initialModes) {
    for (const mode of initialModes) {
      if (mode === classicUiMode) continue;
      register(mode);
    }
    revision = 0;
  }

  return {
    register,
    unregister,
    get,
    has,
    resolve,
    listAvailable,
    listAll,
    resolveTheme,
    subscribe,
    getRevision,
  };
}

const defaultUiModeRegistry = createUiModeRegistry();

export function registerUiMode(
  definition: UiModeDefinition,
  options?: RegisterUiModeOptions,
): UiModeDefinition {
  return defaultUiModeRegistry.register(definition, options);
}

export function unregisterUiMode(modeId: string): boolean {
  return defaultUiModeRegistry.unregister(modeId);
}

export function getUiModeDefinition(modeId: string): UiModeDefinition | undefined {
  return defaultUiModeRegistry.get(modeId);
}

export function resolveUiModeDefinition(
  modeId: string | null | undefined,
  platform: string,
): UiModeDefinition {
  return defaultUiModeRegistry.resolve(modeId, platform);
}

export function listAvailableUiModes(platform: string): UiModeDefinition[] {
  return defaultUiModeRegistry.listAvailable(platform);
}

export function listRegisteredUiModes(): UiModeDefinition[] {
  return defaultUiModeRegistry.listAll();
}

export function resolveUiModeTheme(
  modeId: string | null | undefined,
  options: ResolveUiModeThemeOptions,
): ResolvedUiModeTheme {
  return defaultUiModeRegistry.resolveTheme(modeId, options);
}

export function subscribeUiModeRegistry(listener: () => void): () => void {
  return defaultUiModeRegistry.subscribe(listener);
}

export function getUiModeRegistryRevision(): number {
  return defaultUiModeRegistry.getRevision();
}
