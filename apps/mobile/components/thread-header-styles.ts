import type { ColorTokens } from "@rakazo/ui-tokens";
import { typeScale } from "@rakazo/ui-tokens";
import { StyleSheet } from "react-native";
import { mobileTokens } from "../lib/appearance";
import { transparentColor } from "../lib/color";
import { HEADER_CONTROL_SIZE } from "../lib/native-controls";

export function createThreadHeaderStyles(tokens: ColorTokens = mobileTokens()) {
  const bg = tokens?.background ?? "#F3F1EC";
  const isLight =
    typeof bg === "string" && /^#[\da-f]{6}/i.test(bg)
      ? Number.parseInt(bg.slice(1, 3), 16) > 128
      : true;
  const transparentBackground = transparentColor(bg);
  const customGlassFill =
    tokens?.glassFill && tokens.glassFill !== "#FFFFFF" && tokens.glassFill !== "#272C36"
      ? tokens.glassFill
      : undefined;
  const porcelainPill = customGlassFill ?? (isLight ? "#FFFEFC" : "#242933");
  return StyleSheet.create({
    titleCapsule: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      maxWidth: 220,
      minHeight: HEADER_CONTROL_SIZE,
      paddingStart: 14,
      paddingEnd: 10,
      borderRadius: 999,
    },
    titleCapsuleFill: {
      backgroundColor: porcelainPill,
      shadowColor: "#26231F",
      shadowOpacity: isLight ? 0.028 : 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    title: {
      // A long name gives way to the avatars beside it and ends in "…".
      flexShrink: 1,
      ...typeScale.cardTitle,
      color: tokens.foreground,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 20,
    },
    statusBarFade: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      experimental_backgroundImage: `linear-gradient(to bottom, ${bg} 0%, ${bg} 60%, ${transparentBackground} 100%)`,
    },
  });
}
