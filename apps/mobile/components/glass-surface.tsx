import type { ReactNode } from "react";
import type { StyleProp, ViewProps, ViewStyle } from "react-native";
import { View } from "react-native";
import type { CardGradientTone } from "../lib/card-gradient";
import { cardGradient, inferLightFromStyle } from "../lib/card-gradient";

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
  shape,
  cornerRadius: _cornerRadius,
  tint: _tint,
  gradient,
  style,
  fallbackStyle,
  children,
  ...viewProps
}: GlassSurfaceProps) {
  const applyGradient =
    !chatTitle && gradient !== false && (shape === "roundedRectangle" || gradient !== undefined);
  const isLight = inferLightFromStyle(fallbackStyle) ?? inferLightFromStyle(style) ?? true;
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
