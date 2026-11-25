import type { ColorTokens, ResolvedAppearance } from "@rakazo/ui-tokens";
import type { ThemeAssignments, ThemePackV1, ThemeScope } from "./theme-pack";
import { isThemeScope, resolveScopedTheme, THEME_SCOPES } from "./theme-pack";

export const CONTRAST_WARNING_THRESHOLD = 4.5;
export const CONTRAST_SEVERE_THRESHOLD = 3.0;

export type ContrastPairId = "text" | "card" | "primary" | "chatUser";
export type ContrastSeverity = "warning" | "severe";

export type ThemeContrastIssue = {
  pair: ContrastPairId;
  foreground: string;
  background: string;
  ratio: number;
  severity: ContrastSeverity;
};

export type PackContrastIssue = ThemeContrastIssue & {
  appearance: ResolvedAppearance;
  scope: ThemeScope;
};

export type PackContrastReport = {
  light: PackContrastIssue[];
  dark: PackContrastIssue[];
  issues: PackContrastIssue[];
  hasSevere: boolean;
};

type RGB = { r: number; g: number; b: number };
type RGBA = RGB & { a: number };

const HEX_PATTERN = /^#([\da-f]{6}|[\da-f]{8})$/i;

function parseHexColor(hex: string): RGBA | null {
  const match = HEX_PATTERN.exec(hex.trim());
  if (!match?.[1]) return null;
  const raw = match[1];
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const a = raw.length === 8 ? Number.parseInt(raw.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function compositeOver(foreground: RGBA, background: RGB): RGB {
  const alpha = foreground.a;
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
  };
}

function linearizeChannel(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: RGB): number {
  return (
    0.2126 * linearizeChannel(rgb.r) +
    0.7152 * linearizeChannel(rgb.g) +
    0.0722 * linearizeChannel(rgb.b)
  );
}

/**
 * Computes WCAG 2.1 contrast ratio (1..21) between `#RRGGBB` / `#RRGGBBAA` colors.
 * Semi-transparent foregrounds are composited over `backgroundHex` (and semi-transparent
 * backgrounds over optional `backdropHex` when supplied).
 */
export function contrastRatio(
  foregroundHex: string,
  backgroundHex: string,
  backdropHex?: string,
): number | null {
  const fg = parseHexColor(foregroundHex);
  const bg = parseHexColor(backgroundHex);
  if (!fg || !bg) return null;
  const backdrop = backdropHex ? parseHexColor(backdropHex) : null;
  const resolvedBg: RGB = bg.a < 1 && backdrop ? compositeOver(bg, backdrop) : bg;
  const resolvedFg: RGB = fg.a < 1 ? compositeOver(fg, resolvedBg) : fg;
  const l1 = relativeLuminance(resolvedFg);
  const l2 = relativeLuminance(resolvedBg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function evaluateThemeContrast(tokens: ColorTokens): ThemeContrastIssue[] {
  const pairs: ReadonlyArray<{
    pair: ContrastPairId;
    foreground: string;
    background: string;
    backdrop?: string;
  }> = [
    { pair: "text", foreground: tokens.foreground, background: tokens.background },
    {
      pair: "card",
      foreground: tokens.cardForeground,
      background: tokens.card,
      backdrop: tokens.background,
    },
    {
      pair: "primary",
      foreground: tokens.primaryForeground,
      background: tokens.primary,
      backdrop: tokens.background,
    },
    {
      pair: "chatUser",
      foreground: tokens.chatUserForeground,
      background: tokens.chatUser,
      backdrop: tokens.background,
    },
  ];

  const issues: ThemeContrastIssue[] = [];
  for (const { pair, foreground, background, backdrop } of pairs) {
    const ratio = contrastRatio(foreground, background, backdrop);
    if (ratio === null || ratio >= CONTRAST_WARNING_THRESHOLD) continue;
    issues.push({
      pair,
      foreground,
      background,
      ratio,
      severity: ratio < CONTRAST_SEVERE_THRESHOLD ? "severe" : "warning",
    });
  }
  return issues;
}

function scopesToInspect(pack: ThemePackV1): ThemeScope[] {
  const pageScopes = Object.keys(pack.pages ?? {}).filter(isThemeScope);
  const scopes = new Set<ThemeScope>(pageScopes);
  const covered: readonly ThemeScope[] = pack.coverage === "all" ? THEME_SCOPES : pack.coverage;
  const fallbackScope = covered.find((scope) => !scopes.has(scope));
  if (fallbackScope) scopes.add(fallbackScope);
  if (scopes.size === 0) scopes.add("inbox");
  return [...scopes];
}

export function evaluatePackContrast(pack: ThemePackV1): PackContrastReport {
  const scopes = scopesToInspect(pack);
  const light: PackContrastIssue[] = [];
  const dark: PackContrastIssue[] = [];

  for (const appearance of ["light", "dark"] as const) {
    const target = appearance === "light" ? light : dark;
    const seen = new Set<string>();
    for (const scope of scopes) {
      const assignments: ThemeAssignments =
        pack.coverage === "all"
          ? { schemaVersion: 1, globalPackId: pack.id, pages: {} }
          : { schemaVersion: 1, globalPackId: "classic", pages: { [scope]: pack.id } };
      const resolved = resolveScopedTheme([pack], assignments, scope, appearance, "ios");
      for (const issue of evaluateThemeContrast(resolved.tokens)) {
        const key = `${issue.pair}:${issue.foreground.toLowerCase()}:${issue.background.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        target.push({ ...issue, appearance, scope });
      }
    }
  }

  const issues = [...light, ...dark];
  return {
    light,
    dark,
    issues,
    hasSevere: issues.some((issue) => issue.severity === "severe"),
  };
}
