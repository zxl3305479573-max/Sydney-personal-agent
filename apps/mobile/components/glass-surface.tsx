import type { ReactNode } from "react";
import type { StyleProp, ViewProps, ViewStyle } from "react-native";
import { View } from "react-native";

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
  style?: StyleProp<ViewStyle>;
  fallbackStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function GlassSurface({
  chatTitle: _chatTitle,
  shape: _shape,
  cornerRadius: _cornerRadius,
  tint: _tint,
  style,
  fallbackStyle,
  children,
  ...viewProps
}: GlassSurfaceProps) {
  return (
    <View {...viewProps} style={[style, fallbackStyle]}>
      {children}
    </View>
  );
}
