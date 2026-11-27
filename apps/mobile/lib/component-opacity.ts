import type { ColorTokens } from "@rakazo/ui-tokens";
import type { ViewStyle } from "react-native";
import { translucentColor } from "./color";

export function componentSurfaceColor(color: string, opacity: number): string {
  if (opacity >= 1 || color === "transparent") return color;
  const hex = /^#([\da-f]{4}|[\da-f]{8})$/i.exec(color)?.[1];
  const rgba = /^rgba\([^)]*[,/]\s*([\d.]+)(%)?\s*\)$/i.exec(color);
  const alpha = hex
    ? Number.parseInt(hex.length === 4 ? hex[3]!.repeat(2) : hex.slice(6), 16) / 255
    : rgba
      ? Number(rgba[1]) / (rgba[2] ? 100 : 1)
      : 1;
  return translucentColor(color, Math.min(alpha, opacity));
}

export function componentSurfaceTokens(tokens: ColorTokens, opacity: number): ColorTokens {
  if (opacity >= 1) return tokens;
  const result = { ...tokens };
  for (const key of [
    "card",
    "dialog",
    "popover",
    "glassFill",
    "secondary",
    "muted",
    "accent",
    "input",
    "sidebar",
    "sidebarAccent",
  ] as const) {
    result[key] = componentSurfaceColor(tokens[key], opacity);
  }
  return result;
}

export function componentSurfaceStyle(
  style: ViewStyle | undefined,
  opacity: number,
): ViewStyle | undefined {
  if (opacity >= 1) return style;
  const flat = style;
  if (!flat) return style;
  return {
    ...style,
    ...(typeof flat.backgroundColor === "string"
      ? { backgroundColor: componentSurfaceColor(flat.backgroundColor, opacity) }
      : {}),
    experimental_backgroundImage: undefined,
    shadowOpacity:
      typeof flat.shadowOpacity === "number" ? flat.shadowOpacity * opacity : flat.shadowOpacity,
  };
}
