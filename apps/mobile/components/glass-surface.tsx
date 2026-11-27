import type { ReactNode } from "react";
import type { StyleProp, ViewProps, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { useAppBackground } from "../lib/app-background";
import type { CardGradientTone } from "../lib/card-gradient";
import { cardGradient, inferLightFromStyle } from "../lib/card-gradient";
import { componentSurfaceStyle } from "../lib/component-opacity";

export type GlassSurfaceProps = Pick<
  ViewProps,
  | "testID"
  | "accessibilityLabel"
  | "accessibilityRole"
  | "accessibilityLiveRegion"
  | "accessibilityViewIsModal"
  | "pointerEvents"
> & {
  chatTitle?: boolean;
  /** Enables native iOS 26+ Liquid Glass for floating system-style overlays (banners, status bars, call cards). */
  nativeOverlay?: boolean;
  /** Optional Liquid Glass material variant (`"regular"` default, `"clear"` for lighter translucent overlays). */
  glassVariant?: "regular" | "clear";
  shape?: "capsule" | "circle" | "roundedRectangle";
  /** Corner radius for `roundedRectangle`. */
  cornerRadius?: number;
  /** Glass tint, e.g. for a selected or primary control. */
  tint?: string;
  /** Optional ambient color gradient wash for rounded Bento cards (`false` disables). */
  gradient?: CardGradientTone | false;
  style?: StyleProp<ViewStyle>;
  fallbackStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function GlassSurface({
  chatTitle = false,
  nativeOverlay = false,
  glassVariant: _glassVariant,
  shape,
  cornerRadius: _cornerRadius,
  tint: _tint,
  gradient,
  style,
  fallbackStyle,
  children,
  ...viewProps
}: GlassSurfaceProps) {
  const { componentOpacity } = useAppBackground();
  const applyGradient =
    !chatTitle &&
    !nativeOverlay &&
    gradient !== false &&
    (shape === "roundedRectangle" || gradient !== undefined);
  const isLight = inferLightFromStyle(fallbackStyle) ?? inferLightFromStyle(style) ?? true;
  const gradientLayer: ViewStyle | null = applyGradient
    ? { experimental_backgroundImage: cardGradient(isLight, gradient || "pearl") }
    : null;
  return (
    <View
      {...viewProps}
      style={
        componentOpacity < 1
          ? componentSurfaceStyle(StyleSheet.flatten([style, fallbackStyle]), componentOpacity)
          : gradientLayer
            ? [gradientLayer, style, fallbackStyle]
            : [style, fallbackStyle]
      }
    >
      {children}
    </View>
  );
}
