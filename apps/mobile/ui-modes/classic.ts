import { darkTokens, lightTokens } from "@rakazo/ui-tokens";
import type { UiModeDefinition } from "./types";
import { CLASSIC_UI_MODE_ID } from "./types";

export const classicUiMode: UiModeDefinition = Object.freeze({
  id: CLASSIC_UI_MODE_ID,
  name: "Classic",
  description: "Default native interface",
  version: "1.0.0",
  order: 0,
  supportedPlatforms: Object.freeze(["ios", "android", "web"] as const),
  colorSchemeLock: "none",
  systemColorPolicy: "platform",
  glassPolicy: Object.freeze({
    mode: "liquid" as const,
    defaultCornerRadius: 22,
  }),
  chatAppearancePolicy: "preserve",
  hapticProfile: "subtle",
  geometry: Object.freeze({
    cardRadius: 22,
    controlRadius: 12,
    pillRadius: 999,
    borderWidth: 1,
    cornerShape: "continuous" as const,
    chamferSize: 0,
    topSpecularHighlight: null,
  }),
  typography: Object.freeze({
    uppercaseLabels: false,
    letterSpacingScale: 1,
  }),
  previewBadge: Object.freeze({
    accentColor: darkTokens.unread,
    backgroundColor: darkTokens.background,
    foregroundColor: lightTokens.background,
    tag: "Default",
  }),
});
