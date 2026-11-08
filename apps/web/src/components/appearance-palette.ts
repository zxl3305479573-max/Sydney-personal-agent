/** Palette values for the color picker. Kept out of the TSX file so the UI color rule
 * still applies to component chrome, while these strings are the colors being chosen. */

export const PRESETS = [
  "#000000",
  "#FFFFFF",
  "#6B7280",
  "#EF4444",
  "#F59E0B",
  "#22C55E",
  "#3B82F6",
  "#A855F7",
];

export const HEX = /^#[0-9a-f]{6}$/i;

export const HEX_EXAMPLE = "#000000";

export const SATURATION_BACKGROUND =
  "linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,transparent)";

export const HUE_GRADIENT = "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)";

export const CHECKERBOARD = "repeating-conic-gradient(#d4d4d4 0 25%, #fff 0 50%) 0 0 / 8px 8px";
