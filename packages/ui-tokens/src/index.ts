export const APPEARANCE_PREFERENCES = ["system", "light", "dark"] as const;

export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number];

export type ResolvedAppearance = "light" | "dark";

export const UI_APPEARANCE_STORAGE_KEY = "rakazo.uiAppearance";

/**
 * Semantic palette shared by web, Electron, and Expo. Names follow the shadcn
 * convention so the same slot means the same thing on every surface: a `border`
 * is always a border and never a fill.
 */
export type ColorTokens = {
  background: string;
  /** Modals: a step lighter than the page so they read as raised above it. */
  dialog: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  /** Fill and hairline where native Liquid Glass is unavailable (Android, iOS before 26). */
  glassFill: string;
  glassStroke: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  chatUser: string;
  /** White in both themes: the user bubble is a solid fill (light grey in dark, near-black in light). */
  chatUserForeground: string;
  muted: string;
  mutedForeground: string;
  /** Tertiary text: placeholders, list markers, quote bars, timestamps. */
  faintForeground: string;
  accent: string;
  accentForeground: string;
  /** Destructive text and outlines. */
  destructive: string;
  /** Solid destructive fill (Hang up, a filled Delete); its text is `destructiveForeground`. */
  destructiveFill: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarBorder: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  link: string;
  /** Backing behind a link's site icon. White in both themes so dark logos stay visible on any bubble. */
  faviconPlate: string;
  success: string;
  warning: string;
  statusWorking: string;
  /** Unread dot. The one blue in the inbox, in both themes. */
  unread: string;
  /** Working dot on a busy bot's avatar. The one green, in both themes. */
  workingDot: string;
  overlay: string;
  scrollbar: string;
  scrollbarHover: string;
};

export const darkTokens = {
  background: "#15171C",
  dialog: "#1E222A",
  foreground: "#F5F4F0",
  card: "#20242C",
  cardForeground: "#F5F4F0",
  popover: "#20242C",
  popoverForeground: "#F5F4F0",
  glassFill: "#272C36",
  glassStroke: "#F5F4F021",
  primary: "#F5F4F0",
  primaryForeground: "#15171C",
  secondary: "#8E939E36",
  secondaryForeground: "#F5F4F0",
  chatUser: "#2E3646",
  chatUserForeground: "#FFFFFF",
  muted: "#20242C",
  mutedForeground: "#EAE8E1B0",
  faintForeground: "#EAE8E182",
  accent: "#8E939E42",
  accentForeground: "#F5F4F0",
  destructive: "#FF8F8C",
  destructiveFill: "#E5484D",
  destructiveForeground: "#FFFFFF",
  border: "#F5F4F014",
  input: "#6B707B99",
  ring: "#5C9DFF",
  sidebar: "#191C22",
  sidebarForeground: "#F5F4F0",
  sidebarBorder: "#F5F4F012",
  sidebarAccent: "#282D37",
  sidebarAccentForeground: "#F5F4F0",
  link: "#63A3FF",
  faviconPlate: "#FFFFFF",
  success: "#46BD7B",
  warning: "#E89E30",
  statusWorking: "#63A3FF",
  unread: "#0A68EB",
  workingDot: "#3FA266",
  overlay: "rgba(8, 10, 14, 0.40)",
  scrollbar: "#2B303B",
  scrollbarHover: "#3D4352",
} as const satisfies ColorTokens;

export const lightTokens = {
  background: "#F3F1EC",
  dialog: "#FFFFFF",
  foreground: "#26231F",
  card: "#FFFFFF",
  cardForeground: "#26231F",
  popover: "#FFFFFF",
  popoverForeground: "#26231F",
  glassFill: "#FFFFFF",
  glassStroke: "#26231F10",
  primary: "#2B2823",
  primaryForeground: "#FFFFFF",
  secondary: "#6E675D17",
  secondaryForeground: "#26231F",
  chatUser: "#2E3440",
  chatUserForeground: "#FFFFFF",
  muted: "#EDEAE3",
  mutedForeground: "#332E28B8",
  faintForeground: "#332E2894",
  accent: "#6E675D21",
  accentForeground: "#26231F",
  destructive: "#C4272D",
  destructiveFill: "#E5484D",
  destructiveForeground: "#FFFFFF",
  border: "#26231F10",
  input: "#332E283D",
  ring: "#175CD3",
  sidebar: "#EFECE6",
  sidebarForeground: "#26231F",
  sidebarBorder: "#26231F10",
  sidebarAccent: "#FFFFFF",
  sidebarAccentForeground: "#26231F",
  link: "#1557C0",
  faviconPlate: "#FFFFFF",
  success: "#006B3D",
  warning: "#7D5005",
  statusWorking: "#1557C0",
  unread: "#0A68EB",
  workingDot: "#3FA266",
  overlay: "rgba(24, 22, 18, 0.20)",
  scrollbar: "#CFCAC0",
  scrollbarHover: "#B0AA9E",
} as const satisfies ColorTokens;

/** Web and Electron only: the primary fill's hover and disabled states. Mobile has no hover. */
export type WebColorTokens = ColorTokens & {
  primaryHover: string;
  primaryDisabled: string;
};

/**
 * Web and Electron values for the tokens they draw differently from the palettes above, which
 * follow the iOS system design for mobile. Mobile reads `darkTokens` / `lightTokens`; web reads
 * `tokens.css`, rendered from these merged palettes. Surfaces are opaque; text, borders, hover
 * and selection are the ink at an opacity, so they read the same on every surface.
 */
export const webDarkOverrides = {
  background: "#131519",
  dialog: "#1C1F26",
  foreground: "#F3F2EE",
  card: "#1C1F26",
  cardForeground: "#F3F2EE",
  popover: "#1C1F26",
  popoverForeground: "#F3F2EE",
  primary: "#F3F2EE",
  primaryHover: "#DFDDD6",
  primaryDisabled: "#F3F2EE24",
  primaryForeground: "#121317",
  secondary: "#F3F2EE0D",
  secondaryForeground: "#F3F2EE",
  chatUser: "#28303F",
  chatUserForeground: "#F5F4F0",
  muted: "#1C1F26",
  mutedForeground: "#EAE8E1AD",
  faintForeground: "#EAE8E18A",
  accent: "#F3F2EE12",
  accentForeground: "#F3F2EE",
  destructive: "#FF6B6A",
  destructiveFill: "#CF2B35",
  border: "#F3F2EE1A",
  input: "#F3F2EE36",
  ring: "#4F94FF",
  sidebar: "#0E1014",
  sidebarForeground: "#F3F2EE",
  sidebarBorder: "#F3F2EE17",
  sidebarAccent: "#F3F2EE14",
  sidebarAccentForeground: "#F3F2EE",
  link: "#599DFF",
  success: "#22C37A",
  warning: "#E5941A",
  statusWorking: "#599DFF",
  unread: "#599DFF",
  workingDot: "#12A862",
  overlay: "#07080CB8",
  scrollbar: "#F3F2EE33",
  scrollbarHover: "#F3F2EE7A",
} as const satisfies Partial<WebColorTokens>;

export const webLightOverrides = {
  background: "#F4F1EB",
  foreground: "#1D1B18",
  card: "#FFFFFF",
  cardForeground: "#1D1B18",
  popoverForeground: "#1D1B18",
  primary: "#1D1B18",
  primaryHover: "#33302B",
  primaryDisabled: "#1D1B1826",
  primaryForeground: "#FAF8F4",
  secondary: "#1D1B180F",
  secondaryForeground: "#1D1B18",
  chatUser: "#232730",
  muted: "#EAE6DE",
  mutedForeground: "#28241EBA",
  faintForeground: "#28241E94",
  accent: "#1D1B1812",
  accentForeground: "#1D1B18",
  destructive: "#C42530",
  destructiveFill: "#E02D3C",
  border: "#1D1B1818",
  input: "#1D1B1836",
  ring: "#175CD3",
  sidebar: "#ECE8E0",
  sidebarForeground: "#1D1B18",
  sidebarBorder: "#1D1B1816",
  sidebarAccent: "#1D1B1810",
  sidebarAccentForeground: "#1D1B18",
  link: "#1557C0",
  success: "#007542",
  warning: "#8F5200",
  statusWorking: "#1557C0",
  unread: "#1557C0",
  workingDot: "#12A862",
  overlay: "#14120F7A",
  scrollbar: "#1D1B1833",
  scrollbarHover: "#1D1B1878",
} as const satisfies Partial<WebColorTokens>;

export const webDarkTokens: WebColorTokens = { ...darkTokens, ...webDarkOverrides };
export const webLightTokens: WebColorTokens = { ...lightTokens, ...webLightOverrides };

/** Dark palette. Prefer `tokensForAppearance` when theme-aware. */
export const tokens = darkTokens;

export const RADIUS = "0.75rem";

export const fontWeight = { regular: "400", medium: "500", semibold: "600" } as const;

/**
 * Native text styles on the system font, in points: iOS body text is 17/22. Titles use the
 * font's own line spacing, written out so they don't inherit a smaller body line height.
 */
export const typeScale = {
  title: { fontSize: 22, lineHeight: 26, fontWeight: fontWeight.semibold },
  headline: { fontSize: 19, lineHeight: 23, fontWeight: fontWeight.semibold },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: fontWeight.medium },
  body: { fontSize: 17, lineHeight: 22 },
  secondary: { fontSize: 15, lineHeight: 19 },
  caption: { fontSize: 14, lineHeight: 18 },
  footnote: { fontSize: 12, lineHeight: 16 },
} as const;

/**
 * Text grows with the iOS text size until body text reaches 23pt, the xxxLarge size. Larger
 * accessibility sizes keep that size, so message bubbles, rows and cards keep their layout.
 */
export const MAX_FONT_SCALE = 23 / typeScale.body.fontSize;

/** The ink of a drawn bot's eyes, the same on every body colour and in both themes. */
export const botEyeColor = "#101014";

export const botColors = [
  "#3EC5A8",
  "#F5A03C",
  "#6A6BF5",
  "#9B5CF6",
  "#3B82F6",
  "#F2622A",
  "#D9508A",
] as const;

export function isAppearancePreference(
  value: string | null | undefined,
): value is AppearancePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function normalizeAppearancePreference(
  raw: string | null | undefined,
): AppearancePreference {
  return isAppearancePreference(raw) ? raw : "system";
}

export type ResolveAppearancePreferenceOptions = {
  stored?: string | null;
  storage?: Pick<Storage, "getItem"> | null;
};

function getLocalStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function resolveAppearancePreference(
  options: ResolveAppearancePreferenceOptions = {},
): AppearancePreference {
  const stored =
    options.stored !== undefined
      ? options.stored
      : readStoredAppearance(options.storage ?? getLocalStorage());
  return normalizeAppearancePreference(stored);
}

export function persistAppearancePreference(
  preference: AppearancePreference,
  storage: Pick<Storage, "setItem"> | null = getLocalStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(UI_APPEARANCE_STORAGE_KEY, preference);
  } catch {
    // Ignore quota / private-mode failures; in-memory preference still applies.
  }
}

export function resolveAppearance(
  preference: AppearancePreference,
  system: ResolvedAppearance = "dark",
): ResolvedAppearance {
  if (preference === "system") return system;
  return preference;
}

export function tokensForAppearance(appearance: ResolvedAppearance): ColorTokens {
  return appearance === "light" ? lightTokens : darkTokens;
}

/** The web and Electron palette; `tokensForAppearance` is the mobile one. */
export function webTokensForAppearance(appearance: ResolvedAppearance): WebColorTokens {
  return appearance === "light" ? webLightTokens : webDarkTokens;
}

function readStoredAppearance(storage: Pick<Storage, "getItem"> | null | undefined): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(UI_APPEARANCE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** `cardForeground` -> `--card-foreground` */
export function cssVariableName(token: keyof WebColorTokens): string {
  return `--${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function renderBlock(selector: string, colorScheme: ResolvedAppearance, palette: WebColorTokens) {
  const lines = (Object.keys(palette) as (keyof WebColorTokens)[]).map(
    (token) => `  ${cssVariableName(token)}: ${palette[token].toLowerCase()};`,
  );
  return `${selector} {\n  color-scheme: ${colorScheme};\n${lines.join("\n")}\n  --radius: ${RADIUS};\n}`;
}

/** The CSS in `tokens.css` (web and Electron). Generated from the web palettes so both stay in sync. */
export function renderTokensCss(): string {
  return `${[
    "/* Generated by `pnpm --filter @rakazo/ui-tokens generate`. Edit src/index.ts instead. */",
    renderBlock(':root,\n[data-theme="dark"]', "dark", webDarkTokens),
    renderBlock('[data-theme="light"]', "light", webLightTokens),
  ].join("\n\n")}\n`;
}
