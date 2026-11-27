import type { ColorTokens, ResolvedAppearance } from "@rakazo/ui-tokens";
import { darkTokens, tokensForAppearance } from "@rakazo/ui-tokens";
import { classicUiMode } from "../ui-modes/classic";
import { midnightUiMode } from "../ui-modes/midnight";
import type { ResolvedUiModeTheme, UiModeDefinition } from "../ui-modes/types";

export const THEME_SCOPES = [
  "inbox",
  "thread",
  "groupThread",
  "projects",
  "projectThread",
  "github",
  "computer",
  "settings",
  "auth",
  "search",
  "routines",
  "integrations",
  "artifacts",
  "profile",
  "other",
] as const;
export type ThemeScope = (typeof THEME_SCOPES)[number];
export type ThemeTarget = ThemeScope | "all";
export type ThemeLayout = "classic" | "cards";
export const THEME_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const THEME_IMAGE_MAX_EDGE = 4096;
export const THEME_ASSIGNMENTS_KEY = "sydney.mobile.themeAssignments.v1";

export type ThemeAppearance = {
  colors?: { light?: Partial<ColorTokens>; dark?: Partial<ColorTokens> };
  geometry?: Partial<
    Pick<UiModeDefinition["geometry"], "cardRadius" | "controlRadius" | "borderWidth">
  >;
  layout?: ThemeLayout;
  surface?: "flat" | "outlined" | "glass";
  background?: {
    light?: string;
    dark?: string;
    fit?: "cover" | "contain";
    opacity?: number;
    overlayOpacity?: number;
  };
};
export type ThemePackV1 = {
  schemaVersion: 1;
  id: string;
  name: string;
  author: string;
  version: string;
  coverage: "all" | ThemeScope[];
  defaults?: ThemeAppearance;
  pages?: Partial<Record<ThemeScope, ThemeAppearance>>;
  assets?: Record<string, string>;
};
export type ThemeAssignments = {
  schemaVersion: 1;
  globalPackId: string;
  pages: Partial<Record<ThemeScope, string>>;
};
export type ResolvedScopedTheme = ResolvedUiModeTheme & {
  pageBackgroundColor?: string;
  componentOpacity?: number;
  scope: ThemeScope;
  layout: ThemeLayout;
  surface: "flat" | "outlined" | "glass";
  background: {
    uri: string;
    fit: "cover" | "contain";
    opacity: number;
    overlayOpacity: number;
  } | null;
};

const COLOR_KEYS = new Set(Object.keys(darkTokens));
const ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;
const BUILTIN_IDS = new Set(["classic", "midnight"]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}: expected an object`);
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${label}: unsupported field ${key}`);
  }
}

function text(value: unknown, label: string, maxLength = 120): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength)
    throw new Error(`${label}: invalid text`);
}

function bounded(value: unknown, minimum: number, maximum: number, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label}: expected ${minimum}–${maximum}`);
  }
}

export function isThemeScope(value: string): value is ThemeScope {
  return (THEME_SCOPES as readonly string[]).includes(value);
}

export function themeCovers(pack: ThemePackV1, target: ThemeTarget): boolean {
  return pack.coverage === "all" || (target !== "all" && pack.coverage.includes(target));
}

function validateAppearance(input: unknown, assets: Record<string, unknown>, label: string) {
  const appearance = record(input, label);
  keys(appearance, ["colors", "geometry", "layout", "surface", "background"], label);
  if (appearance.colors !== undefined) {
    const variants = record(appearance.colors, `${label}.colors`);
    keys(variants, ["light", "dark"], `${label}.colors`);
    for (const [variant, value] of Object.entries(variants)) {
      const colors = record(value, `${label}.${variant}`);
      for (const [key, color] of Object.entries(colors)) {
        if (
          !COLOR_KEYS.has(key) ||
          typeof color !== "string" ||
          !/^#(?:[\da-f]{6}|[\da-f]{8})$/i.test(color)
        ) {
          throw new Error(`${label}: invalid color ${key}`);
        }
      }
    }
  }
  if (appearance.geometry !== undefined) {
    const geometry = record(appearance.geometry, `${label}.geometry`);
    keys(geometry, ["cardRadius", "controlRadius", "borderWidth"], `${label}.geometry`);
    for (const [key, value] of Object.entries(geometry))
      bounded(value, 0, key === "borderWidth" ? 3 : 32, key);
  }
  if (
    appearance.layout !== undefined &&
    appearance.layout !== "classic" &&
    appearance.layout !== "cards"
  )
    throw new Error(`${label}: invalid layout`);
  if (
    appearance.surface !== undefined &&
    !["flat", "outlined", "glass"].includes(String(appearance.surface))
  )
    throw new Error(`${label}: invalid surface`);
  if (appearance.background !== undefined) {
    const background = record(appearance.background, `${label}.background`);
    keys(background, ["light", "dark", "fit", "opacity", "overlayOpacity"], `${label}.background`);
    for (const variant of ["light", "dark"] as const) {
      if (
        background[variant] !== undefined &&
        (typeof background[variant] !== "string" ||
          !Object.hasOwn(assets, background[variant] as string))
      ) {
        throw new Error(`${label}: unknown background asset`);
      }
    }
    if (background.fit !== undefined && background.fit !== "cover" && background.fit !== "contain")
      throw new Error(`${label}: invalid background fit`);
    if (background.opacity !== undefined)
      bounded(background.opacity, 0, 0.6, `${label}.background.opacity`);
    if (background.overlayOpacity !== undefined)
      bounded(background.overlayOpacity, 0, 0.6, `${label}.background.overlayOpacity`);
  }
}

function decodeBase64(value: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = new Uint8Array(
    (value.length / 4) * 3 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0),
  );
  let accumulator = 0;
  let bits = 0;
  let offset = 0;
  for (const char of value) {
    if (char === "=") break;
    accumulator = (accumulator << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[offset++] = (accumulator >> bits) & 255;
    }
  }
  return bytes;
}

export function themeImageDimensions(dataUri: string): { width: number; height: number } {
  const match =
    /^data:image\/(png|jpeg);base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.exec(
      dataUri,
    );
  if (!match?.[2] || dataUri.length > THEME_FILE_MAX_BYTES)
    throw new Error("Invalid PNG/JPEG background");
  const bytes = decodeBase64(match[2]);
  let width = 0;
  let height = 0;
  if (match[1] === "png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
    if (bytes.length < 45 || signature.some((value, index) => bytes[index] !== value))
      throw new Error("Invalid PNG header");
    const view = new DataView(bytes.buffer);
    width = view.getUint32(16);
    height = view.getUint32(20);
    if (
      bytes[bytes.length - 8] !== 73 ||
      bytes[bytes.length - 7] !== 69 ||
      bytes[bytes.length - 6] !== 78 ||
      bytes[bytes.length - 5] !== 68
    )
      throw new Error("Incomplete PNG background");
  } else {
    if (
      bytes[0] !== 255 ||
      bytes[1] !== 216 ||
      bytes[bytes.length - 2] !== 255 ||
      bytes[bytes.length - 1] !== 217
    )
      throw new Error("Invalid JPEG header");
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218 || marker === 217) break;
      const length = (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker ?? -1)
      ) {
        height = (bytes[offset + 3] ?? 0) * 256 + (bytes[offset + 4] ?? 0);
        width = (bytes[offset + 5] ?? 0) * 256 + (bytes[offset + 6] ?? 0);
        break;
      }
      offset += length;
    }
  }
  if (width < 1 || height < 1 || width > THEME_IMAGE_MAX_EDGE || height > THEME_IMAGE_MAX_EDGE)
    throw new Error("Background dimensions must be 1–4096 pixels");
  return { width, height };
}

export function parseThemePack(input: string | unknown, allowBuiltIn = false): ThemePackV1 {
  if (
    typeof input === "string" &&
    (input.length > THEME_FILE_MAX_BYTES ||
      new TextEncoder().encode(input).length > THEME_FILE_MAX_BYTES)
  )
    throw new Error("Theme file exceeds 10 MiB");
  const value = record(typeof input === "string" ? JSON.parse(input) : input, "theme");
  keys(
    value,
    ["schemaVersion", "id", "name", "author", "version", "coverage", "defaults", "pages", "assets"],
    "theme",
  );
  if (value.schemaVersion !== 1) throw new Error("Unsupported theme schema version");
  text(value.id, "id", 48);
  if (!ID_PATTERN.test(value.id) || (!allowBuiltIn && BUILTIN_IDS.has(value.id)))
    throw new Error("Invalid or protected theme ID");
  text(value.name, "name");
  text(value.author, "author");
  text(value.version, "version", 40);
  if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(value.version))
    throw new Error("Invalid theme version");
  if (
    value.coverage !== "all" &&
    (!Array.isArray(value.coverage) ||
      !value.coverage.length ||
      value.coverage.some((scope) => typeof scope !== "string" || !isThemeScope(scope)) ||
      new Set(value.coverage).size !== value.coverage.length)
  )
    throw new Error("Invalid theme coverage");
  const assets = value.assets === undefined ? {} : record(value.assets, "assets");
  if (Object.keys(assets).length > 2)
    throw new Error("A theme may contain at most two backgrounds");
  for (const [key, image] of Object.entries(assets)) {
    if (!ID_PATTERN.test(key) || typeof image !== "string") throw new Error("Invalid asset ID");
    themeImageDimensions(image);
  }
  if (value.defaults !== undefined) validateAppearance(value.defaults, assets, "defaults");
  if (value.pages !== undefined) {
    const pages = record(value.pages, "pages");
    for (const [scope, appearance] of Object.entries(pages)) {
      if (
        !isThemeScope(scope) ||
        (value.coverage !== "all" && !(value.coverage as string[]).includes(scope))
      )
        throw new Error(`Unsupported page ${scope}`);
      validateAppearance(appearance, assets, `pages.${scope}`);
    }
  }
  return JSON.parse(JSON.stringify(value)) as ThemePackV1;
}

export const BUILTIN_THEME_PACKS: readonly ThemePackV1[] = [
  {
    schemaVersion: 1,
    id: "classic",
    name: "Classic",
    author: "Sydney",
    version: "1.0.0",
    coverage: "all",
  },
  {
    schemaVersion: 1,
    id: "midnight",
    name: "Midnight",
    author: "Sydney",
    version: "1.0.0",
    coverage: "all",
    defaults: { colors: midnightUiMode.colors, geometry: { cardRadius: 16 } },
  },
];

export function isBuiltInTheme(id: string) {
  return BUILTIN_IDS.has(id);
}

export function hasCustomThemeForScope(
  packs: readonly ThemePackV1[],
  assignments: ThemeAssignments,
  scope: ThemeScope,
): boolean {
  const localId = assignments.pages[scope];
  const globalId = assignments.globalPackId;
  return Boolean(
    (localId && packs.some((pack) => pack.id === localId && themeCovers(pack, scope))) ||
      (globalId &&
        !isBuiltInTheme(globalId) &&
        packs.some((pack) => pack.id === globalId && pack.coverage === "all")),
  );
}

export function resolveScopedTheme(
  packs: readonly ThemePackV1[],
  assignments: ThemeAssignments,
  scope: ThemeScope,
  userAppearance: ResolvedAppearance,
  platform = "ios",
): ResolvedScopedTheme {
  const global =
    platform === "ios"
      ? packs.find((pack) => pack.id === assignments.globalPackId && pack.coverage === "all")
      : undefined;
  const local =
    platform === "ios"
      ? packs.find((pack) => pack.id === assignments.pages[scope] && themeCovers(pack, scope))
      : undefined;
  const active = local ?? global;
  const appearance = active?.id === "midnight" ? "dark" : userAppearance;
  let mode: UiModeDefinition = {
    ...classicUiMode,
    colors: { [appearance]: { ...tokensForAppearance(appearance) } },
  };
  let layout: ThemeLayout = "classic";
  let surface: ResolvedScopedTheme["surface"] = "flat";
  let background: ResolvedScopedTheme["background"] = null;
  const layers = local?.id === "classic" ? [local] : [global, local];
  for (const pack of layers) {
    if (!pack) continue;
    for (const patch of [pack.defaults, pack.pages?.[scope]]) {
      if (!patch) continue;
      mode = {
        ...mode,
        colors: { [appearance]: { ...mode.colors?.[appearance], ...patch.colors?.[appearance] } },
        geometry: { ...mode.geometry, ...patch.geometry },
      };
      layout = patch.layout ?? layout;
      surface = patch.surface ?? surface;
      if (patch.background) {
        const asset = patch.background[appearance];
        if (asset && pack.assets?.[asset])
          background = {
            uri: pack.assets[asset],
            fit: patch.background.fit ?? "cover",
            opacity: patch.background.opacity ?? 0.18,
            overlayOpacity: patch.background.overlayOpacity ?? 0,
          };
      }
    }
  }
  mode = {
    ...mode,
    id: active?.id ?? "classic",
    name: active?.name ?? "Classic",
    colorSchemeLock: active?.id === "midnight" ? "dark" : "none",
    systemColorPolicy: active && active.id !== "classic" ? "tokens" : "platform",
    glassPolicy:
      active && active.id !== "classic"
        ? {
            mode: surface === "glass" ? "tinted-liquid" : "solid-fallback",
            defaultTint: mode.colors?.[appearance]?.card,
            defaultCornerRadius: mode.geometry.cardRadius,
          }
        : classicUiMode.glassPolicy,
  };
  return {
    mode,
    appearance,
    tokens: mode.colors?.[appearance] as ColorTokens,
    geometry: mode.geometry,
    typography: mode.typography,
    glassPolicy: mode.glassPolicy,
    systemColorPolicy: mode.systemColorPolicy,
    chatAppearancePolicy: "preserve",
    hapticProfile: mode.hapticProfile,
    scope,
    layout: ["inbox", "thread", "groupThread"].includes(scope) ? layout : "classic",
    surface,
    background,
  };
}

export function themeScopeForRoute(routeName: string): ThemeScope {
  const route = routeName
    .replace(/^\/+|\/+$/g, "")
    .replace(/^\(tabs\)\/?/, "")
    .replace(/^\(settings\)\/?/, "settings/");
  if (!route || route === "index" || route === "chats") return "inbox";
  if (route.startsWith("settings/") || route === "settings") return "settings";
  if (/^projects\/[^/]+\/chat$/.test(route)) return "projectThread";
  if (route === "projects" || route.startsWith("projects/")) return "projects";
  if (route === "group-thread") return "groupThread";
  if (
    route === "thread" ||
    route === "peer-chat" ||
    route === "thread-model" ||
    route === "companion-capture"
  )
    return "thread";
  if (route === "github" || route === "github-repo") return "github";
  if (route === "computer") return "computer";
  if (["sign-in", "server"].includes(route)) return "auth";
  if (route === "search") return "search";
  if (["routines", "routine", "board"].includes(route)) return "routines";
  if (["integrations", "integration-setup", "integration-detail"].includes(route))
    return "integrations";
  if (["artifact", "artifacts", "image", "share"].includes(route)) return "artifacts";
  if (
    [
      "bot-profile",
      "bot-settings",
      "bot-model",
      "group-settings",
      "new-group",
      "new-space",
    ].includes(route)
  )
    return "profile";
  if (
    [
      "settings-home",
      "about",
      "account",
      "ai-data-sharing",
      "approvals",
      "archived-bots",
      "billing",
      "change-password",
      "chat-appearance",
      "companion",
      "devices",
      "language",
      "messaging",
      "model-connection",
      "model-picker",
      "models",
      "plugin",
      "signup-survey",
      "skill",
      "skills",
      "space",
      "team-conversation",
      "ui-mode",
      "vault",
      "voice",
      "wallet",
      "finance",
      "paywall",
    ].includes(route)
  )
    return "settings";
  return "other";
}
