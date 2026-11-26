import { Capsule, Circle, Host, RoundedRectangle } from "@expo/ui/swift-ui";
import { foregroundStyle, glassEffect } from "@expo/ui/swift-ui/modifiers";
import type { ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { cardGradient, inferLightFromStyle } from "../lib/card-gradient";
import { useResolvedAppearance } from "../lib/native";
import { iosAtLeast } from "../lib/native-controls";
import { useScopedTheme } from "../lib/scoped-theme-context";
import { getActiveUiMode } from "../lib/ui-mode";
import type { GlassSurfaceProps } from "./glass-surface";

export function GlassSurface({
  chatTitle = false,
  nativeOverlay = false,
  glassVariant = "regular",
  shape = "capsule",
  cornerRadius,
  tint,
  gradient,
  style,
  fallbackStyle,
  children,
  ...viewProps
}: GlassSurfaceProps) {
  const scheme = useResolvedAppearance();
  const policy = useScopedTheme()?.glassPolicy ?? getActiveUiMode().glassPolicy;
  const radius = cornerRadius ?? policy.defaultCornerRadius ?? 22;
  const resolvedTint = tint ?? (policy.mode === "tinted-liquid" ? policy.defaultTint : undefined);
  const useNativeGlass =
    (chatTitle || nativeOverlay) && iosAtLeast(26) && policy.mode !== "solid-fallback";
  if (!useNativeGlass) {
    const applyGradient =
      !chatTitle &&
      !nativeOverlay &&
      gradient !== false &&
      (shape === "roundedRectangle" || gradient !== undefined);
    const isLight =
      inferLightFromStyle(fallbackStyle) ?? inferLightFromStyle(style) ?? scheme === "light";
    const gradientLayer: ViewStyle | null = applyGradient
      ? { experimental_backgroundImage: cardGradient(isLight, gradient || "pearl") }
      : null;
    return (
      <View
        {...viewProps}
        style={gradientLayer ? [gradientLayer, style, fallbackStyle] : [style, fallbackStyle]}
      >
        {children}
      </View>
    );
  }
  const modifiers = [
    foregroundStyle("#00000000"),
    glassEffect({
      glass: { variant: glassVariant, ...(resolvedTint ? { tint: resolvedTint } : {}) },
      shape,
      cornerRadius: radius,
    }),
  ];
  return (
    <View {...viewProps} style={style}>
      <Host
        colorScheme={scheme}
        ignoreSafeArea="all"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        {shape === "circle" ? (
          <Circle modifiers={modifiers} />
        ) : shape === "roundedRectangle" ? (
          <RoundedRectangle cornerRadius={radius} modifiers={modifiers} />
        ) : (
          <Capsule modifiers={modifiers} />
        )}
      </Host>
      {children}
    </View>
  );
}
