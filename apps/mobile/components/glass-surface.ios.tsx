import { Capsule, Circle, Host, RoundedRectangle } from "@expo/ui/swift-ui";
import { foregroundStyle, glassEffect } from "@expo/ui/swift-ui/modifiers";
import { StyleSheet, View } from "react-native";
import { useResolvedAppearance } from "../lib/native";
import { iosAtLeast } from "../lib/native-controls";
import { useScopedTheme } from "../lib/scoped-theme-context";
import { getActiveUiMode } from "../lib/ui-mode";
import type { GlassSurfaceProps } from "./glass-surface";

export function GlassSurface({
  chatTitle = false,
  shape = "capsule",
  cornerRadius,
  tint,
  style,
  fallbackStyle,
  children,
  ...viewProps
}: GlassSurfaceProps) {
  const scheme = useResolvedAppearance();
  const policy = useScopedTheme()?.glassPolicy ?? getActiveUiMode().glassPolicy;
  const radius = cornerRadius ?? policy.defaultCornerRadius ?? 22;
  const resolvedTint = tint ?? (policy.mode === "tinted-liquid" ? policy.defaultTint : undefined);
  if (!chatTitle || !iosAtLeast(26) || policy.mode === "solid-fallback")
    return (
      <View {...viewProps} style={[style, fallbackStyle]}>
        {children}
      </View>
    );
  const modifiers = [
    foregroundStyle("#00000000"),
    glassEffect({
      glass: { variant: "regular", ...(resolvedTint ? { tint: resolvedTint } : {}) },
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
