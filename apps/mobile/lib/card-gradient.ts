export type CardGradientTone =
  | "pearl"
  | "champagne"
  | "slate"
  | "sage"
  | "rose"
  | "lavender"
  | "spotlight";

const LIGHT_SURFACES: Record<CardGradientTone, string> = {
  pearl: [
    "radial-gradient(circle at 86% 18%, rgba(224, 198, 152, 0.19), transparent 58%)",
    "radial-gradient(circle at 14% 88%, rgba(178, 198, 222, 0.13), transparent 54%)",
    "linear-gradient(145deg, #FFFEFD 0%, #FAF7F1 100%)",
  ].join(", "),
  champagne: [
    "radial-gradient(circle at 84% 20%, rgba(228, 196, 138, 0.24), transparent 60%)",
    "radial-gradient(circle at 16% 86%, rgba(214, 180, 148, 0.12), transparent 52%)",
    "linear-gradient(145deg, #FFFEFD 0%, #FAF6EE 100%)",
  ].join(", "),
  slate: [
    "radial-gradient(circle at 86% 18%, rgba(154, 184, 218, 0.22), transparent 60%)",
    "radial-gradient(circle at 16% 88%, rgba(220, 200, 164, 0.12), transparent 54%)",
    "linear-gradient(145deg, #FFFEFE 0%, #F6F8FB 100%)",
  ].join(", "),
  sage: [
    "radial-gradient(circle at 86% 18%, rgba(156, 190, 166, 0.22), transparent 60%)",
    "radial-gradient(circle at 14% 86%, rgba(218, 202, 164, 0.12), transparent 54%)",
    "linear-gradient(145deg, #FFFEFD 0%, #F6F9F6 100%)",
  ].join(", "),
  rose: [
    "radial-gradient(circle at 86% 18%, rgba(218, 168, 148, 0.22), transparent 60%)",
    "radial-gradient(circle at 16% 88%, rgba(226, 200, 162, 0.12), transparent 54%)",
    "linear-gradient(145deg, #FFFEFD 0%, #FAF6F3 100%)",
  ].join(", "),
  lavender: [
    "radial-gradient(circle at 86% 18%, rgba(182, 170, 212, 0.20), transparent 60%)",
    "radial-gradient(circle at 16% 88%, rgba(222, 198, 164, 0.12), transparent 54%)",
    "linear-gradient(145deg, #FFFEFE 0%, #F8F6FB 100%)",
  ].join(", "),
  spotlight: [
    "radial-gradient(circle at 78% 20%, rgba(242, 224, 190, 0.26), transparent 44%)",
    "radial-gradient(circle at 16% 88%, rgba(190, 214, 240, 0.24), transparent 48%)",
    "linear-gradient(135deg, #44556A 0%, #364556 58%, #2C3948 100%)",
  ].join(", "),
};

const DARK_SURFACES: Record<CardGradientTone, string> = {
  pearl: [
    "radial-gradient(circle at 86% 18%, rgba(224, 196, 148, 0.14), transparent 58%)",
    "radial-gradient(circle at 14% 88%, rgba(132, 160, 198, 0.11), transparent 54%)",
    "linear-gradient(145deg, #2A303C 0%, #20242E 100%)",
  ].join(", "),
  champagne: [
    "radial-gradient(circle at 84% 20%, rgba(230, 196, 138, 0.18), transparent 60%)",
    "radial-gradient(circle at 16% 86%, rgba(198, 158, 126, 0.10), transparent 52%)",
    "linear-gradient(145deg, #2C303B 0%, #20242D 100%)",
  ].join(", "),
  slate: [
    "radial-gradient(circle at 86% 18%, rgba(134, 170, 214, 0.18), transparent 60%)",
    "radial-gradient(circle at 16% 88%, rgba(208, 184, 142, 0.09), transparent 54%)",
    "linear-gradient(145deg, #283140 0%, #202530 100%)",
  ].join(", "),
  sage: [
    "radial-gradient(circle at 86% 18%, rgba(138, 180, 154, 0.17), transparent 60%)",
    "radial-gradient(circle at 14% 86%, rgba(204, 186, 142, 0.09), transparent 54%)",
    "linear-gradient(145deg, #26302F 0%, #20252D 100%)",
  ].join(", "),
  rose: [
    "radial-gradient(circle at 86% 18%, rgba(212, 158, 138, 0.17), transparent 60%)",
    "radial-gradient(circle at 16% 88%, rgba(212, 186, 144, 0.09), transparent 54%)",
    "linear-gradient(145deg, #2D2934 0%, #20242E 100%)",
  ].join(", "),
  lavender: [
    "radial-gradient(circle at 86% 18%, rgba(168, 156, 208, 0.17), transparent 60%)",
    "radial-gradient(circle at 16% 88%, rgba(208, 184, 146, 0.09), transparent 54%)",
    "linear-gradient(145deg, #292938 0%, #20242E 100%)",
  ].join(", "),
  spotlight: [
    "radial-gradient(circle at 78% 20%, rgba(238, 214, 174, 0.22), transparent 44%)",
    "radial-gradient(circle at 16% 88%, rgba(158, 190, 226, 0.20), transparent 48%)",
    "linear-gradient(135deg, #39485C 0%, #2B3646 58%, #222B39 100%)",
  ].join(", "),
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
