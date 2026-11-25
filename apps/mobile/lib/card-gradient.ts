export type CardGradientTone =
  | "pearl"
  | "champagne"
  | "slate"
  | "sage"
  | "rose"
  | "lavender"
  | "spotlight";

const UNIFIED_LIGHT_CARD = [
  "radial-gradient(circle at 86% 18%, rgba(186, 176, 160, 0.12), transparent 58%)",
  "radial-gradient(circle at 14% 88%, rgba(164, 154, 140, 0.07), transparent 54%)",
  "linear-gradient(145deg, #FFFEFC 0%, #F7F4EE 100%)",
].join(", ");

const UNIFIED_LIGHT_SPOTLIGHT = [
  "radial-gradient(circle at 80% 18%, rgba(246, 242, 234, 0.16), transparent 46%)",
  "radial-gradient(circle at 16% 88%, rgba(214, 206, 194, 0.12), transparent 50%)",
  "linear-gradient(135deg, #3A3732 0%, #2E2B27 58%, #252320 100%)",
].join(", ");

const UNIFIED_DARK_CARD = [
  "radial-gradient(circle at 86% 18%, rgba(214, 210, 202, 0.07), transparent 58%)",
  "radial-gradient(circle at 14% 88%, rgba(186, 182, 174, 0.045), transparent 54%)",
  "linear-gradient(145deg, #252830 0%, #1E2128 100%)",
].join(", ");

const UNIFIED_DARK_SPOTLIGHT = [
  "radial-gradient(circle at 80% 18%, rgba(235, 231, 224, 0.12), transparent 46%)",
  "radial-gradient(circle at 16% 88%, rgba(196, 192, 186, 0.09), transparent 50%)",
  "linear-gradient(135deg, #2F333C 0%, #252830 58%, #1E2128 100%)",
].join(", ");

const LIGHT_SURFACES: Record<CardGradientTone, string> = {
  pearl: UNIFIED_LIGHT_CARD,
  champagne: UNIFIED_LIGHT_CARD,
  slate: UNIFIED_LIGHT_CARD,
  sage: UNIFIED_LIGHT_CARD,
  rose: UNIFIED_LIGHT_CARD,
  lavender: UNIFIED_LIGHT_CARD,
  spotlight: UNIFIED_LIGHT_SPOTLIGHT,
};

const DARK_SURFACES: Record<CardGradientTone, string> = {
  pearl: UNIFIED_DARK_CARD,
  champagne: UNIFIED_DARK_CARD,
  slate: UNIFIED_DARK_CARD,
  sage: UNIFIED_DARK_CARD,
  rose: UNIFIED_DARK_CARD,
  lavender: UNIFIED_DARK_CARD,
  spotlight: UNIFIED_DARK_SPOTLIGHT,
};

export function cardGradient(isLight: boolean, tone: CardGradientTone = "pearl"): string {
  return isLight ? LIGHT_SURFACES[tone] : DARK_SURFACES[tone];
}

export function inferLightFromStyle(style: unknown): boolean | undefined {
  if (!style) return undefined;
  if (Array.isArray(style)) {
    for (let i = style.length - 1; i >= 0; i -= 1) {
      const found = inferLightFromStyle(style[i]);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof style === "object") {
    const bg = (style as { backgroundColor?: unknown }).backgroundColor;
    if (typeof bg === "string" && bg.startsWith("#") && bg.length >= 7) {
      const red = Number.parseInt(bg.slice(1, 3), 16);
      if (!Number.isNaN(red)) return red >= 128;
    }
  }
  return undefined;
}
