import type { ColorTokens, ResolvedAppearance } from "@rakazo/ui-tokens";
import type { ComponentType, ReactNode } from "react";
import type { StyleProp, TextStyle, ViewProps, ViewStyle } from "react-native";

export const CLASSIC_UI_MODE_ID = "classic" as const;
export const UI_MODE_STORAGE_KEY = "sydney.mobile.uiMode.v1" as const;
export const UI_MODE_SCHEMA_VERSION = 1 as const;

export type UiModePlatform = "ios" | "android" | "web";

/**
 * Controls whether the mode follows the user's saved light/dark/system setting
 * or temporarily locks the resolved appearance while active without overwriting
 * `rakazo.uiAppearance` in storage.
 */
export type UiModeColorSchemeLock = "none" | "dark" | "light";

/**
 * `"platform"` keeps iOS `PlatformColor` dynamic semantics in System mode (`classic`).
 * `"tokens"` forces `native` semantic surfaces/labels to use the mode's `ColorTokens`
 * so OS grey tints never bleed into stylized skins.
 */
export type UiModeSystemColorPolicy = "platform" | "tokens";

/**
 * `"preserve"` applies the user's saved `MobileChatAppearance` wallpaper and bubble style.
 * `"suspend"` ignores saved wallpaper/bubble overrides at read time without deleting them,
 * restoring them automatically when switching back to `"classic"`.
 */
export type UiModeChatAppearancePolicy = "preserve" | "suspend";

export type UiModeHapticProfile = "none" | "subtle" | "tactile";

export type UiModeGlassPolicy = {
  /**
   * - `"liquid"`: native SwiftUI Liquid Glass on iOS 26+, `fallbackStyle` elsewhere.
   * - `"tinted-liquid"`: Liquid Glass with `defaultTint` applied unless caller overrides `tint`.
   * - `"solid-fallback"`: bypasses Liquid Glass even on iOS 26+, rendering matte/solid surfaces.
   */
  mode: "liquid" | "tinted-liquid" | "solid-fallback";
  defaultTint?: string;
  defaultCornerRadius?: number;
};

export type UiModeGeometryTokens = {
  cardRadius: number;
  controlRadius: number;
  pillRadius: number;
  borderWidth: number;
  cornerShape: "continuous" | "sharp" | "chamfered";
  chamferSize: number;
  /** Optional 1px top specular highlight color for machined metallic cards. */
  topSpecularHighlight: string | null;
};

export type UiModeTypographyTokens = {
  displayFamily?: string;
  bodyFamily?: string;
  monoFamily?: string;
  uppercaseLabels: boolean;
  letterSpacingScale: number;
};

export type UiModeColorOverrides = {
  light?: Partial<ColorTokens>;
  dark?: Partial<ColorTokens>;
};

export type UiModePreviewBadge = {
  accentColor: string;
  backgroundColor: string;
  foregroundColor: string;
  tag?: string;
};

export type ModeCardSlotProps = Pick<
  ViewProps,
  "testID" | "accessibilityLabel" | "accessibilityRole" | "accessibilityLiveRegion"
> & {
  variant?: "default" | "elevated" | "accent" | "telemetry";
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export type ModeTriggerSlotProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "destructive";
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
};

export type ModeCodeContainerSlotProps = {
  title?: string;
  language?: string;
  meta?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: ReactNode;
};

export type ModeApprovalContainerSlotProps = {
  title: string;
  subtitle?: string;
  badge?: string;
  approveLabel?: string;
  rejectLabel?: string;
  busy?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: ReactNode;
};

export type ModeTelemetryMetric = {
  label: string;
  value: string;
  accent?: boolean;
};

export type ModeTelemetryBannerSlotProps = {
  title: string;
  statusLabel?: string;
  active?: boolean;
  metrics?: readonly ModeTelemetryMetric[];
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export type UiModePrimitiveSlots = {
  Card: ComponentType<ModeCardSlotProps>;
  Trigger: ComponentType<ModeTriggerSlotProps>;
  CodeContainer: ComponentType<ModeCodeContainerSlotProps>;
  ApprovalContainer: ComponentType<ModeApprovalContainerSlotProps>;
  TelemetryBanner: ComponentType<ModeTelemetryBannerSlotProps>;
};

export type UiModeScreenSlotKey = "inbox" | "thread" | "groupThread" | "computer";

export type UiModeScreenSlotProps<TController = unknown> = {
  controller: TController;
  renderClassic: () => ReactNode;
};

export type UiModeScreenSlots = {
  [K in UiModeScreenSlotKey]?: ComponentType<UiModeScreenSlotProps<unknown>>;
};

export type UiModeDefinition = {
  id: string;
  name: string;
  description: string;
  version: string;
  /** Sort order in multi-choice mode pickers; `classic` defaults to 0. */
  order?: number;
  /** Platforms where this mode can activate; defaults to `["ios"]` for custom modes. */
  supportedPlatforms: readonly UiModePlatform[];
  colorSchemeLock: UiModeColorSchemeLock;
  systemColorPolicy: UiModeSystemColorPolicy;
  glassPolicy: UiModeGlassPolicy;
  chatAppearancePolicy: UiModeChatAppearancePolicy;
  hapticProfile: UiModeHapticProfile;
  colors?: UiModeColorOverrides;
  geometry: UiModeGeometryTokens;
  typography: UiModeTypographyTokens;
  previewBadge?: UiModePreviewBadge;
  primitives?: Partial<UiModePrimitiveSlots>;
  screens?: UiModeScreenSlots;
};

export type ResolvedUiModeTheme = {
  mode: UiModeDefinition;
  appearance: ResolvedAppearance;
  tokens: ColorTokens;
  geometry: UiModeGeometryTokens;
  typography: UiModeTypographyTokens;
  glassPolicy: UiModeGlassPolicy;
  systemColorPolicy: UiModeSystemColorPolicy;
  chatAppearancePolicy: UiModeChatAppearancePolicy;
  hapticProfile: UiModeHapticProfile;
};

export type PersistedUiModeState = {
  schemaVersion: typeof UI_MODE_SCHEMA_VERSION;
  activeModeId: string;
  /** Last non-classic mode selected by the user, enabling 1-tap toggle back and forth. */
  lastAlternateModeId: string | null;
};

export type UiModeSnapshot = {
  /** Effective mode ID currently rendered (accounts for preview + platform fallback). */
  activeModeId: string;
  /** Persisted user choice before transient preview or platform fallback. */
  savedModeId: string;
  /** Non-null while previewing an unsaved mode in a picker. */
  previewModeId: string | null;
  /** Last non-classic mode ID for 1-tap quick toggle (`classic` <-> custom). */
  lastAlternateModeId: string | null;
  isClassic: boolean;
  hydrated: boolean;
};

/** Helper to bind a strongly typed controller view-model to a screen slot renderer. */
export function defineUiModeScreenSlot<TController>(
  component: ComponentType<UiModeScreenSlotProps<TController>>,
): ComponentType<UiModeScreenSlotProps<unknown>> {
  return component as ComponentType<UiModeScreenSlotProps<unknown>>;
}
