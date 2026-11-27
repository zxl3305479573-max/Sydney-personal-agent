import type { ReactNode, Ref } from "react";
import type { ColorValue, PressableProps, StyleProp, View, ViewStyle } from "react-native";
import * as ReactNative from "react-native";
import { Pressable, StyleSheet } from "react-native";
import { useAppBackground } from "../lib/app-background";
import { componentSurfaceStyle } from "../lib/component-opacity";
import type { PressMotionPreset } from "../lib/press-motion";
import { resolvePressMotion } from "../lib/press-motion";

function isAndroidPlatform(): boolean {
  try {
    return ReactNative.Platform?.OS === "android";
  } catch {
    return false;
  }
}

export type MotionPressableProps = Omit<PressableProps, "style" | "children"> & {
  ref?: Ref<View>;
  preset?: PressMotionPreset;
  /** Fill color smoothly faded over the surface while pressed (safe with PlatformColor). */
  highlightColor?: ColorValue;
  /** Override pressed opacity for a specific surface (e.g. dark spotlight banner). */
  activeOpacity?: number;
  /** Disable press feedback while keeping the control interactive (e.g. already-selected tab). */
  motionDisabled?: boolean;
  /** Optional extra style applied only while pressed. */
  pressedStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

function findOpacity(style: unknown): number | undefined {
  if (!style) return undefined;
  if (Array.isArray(style)) {
    let opacity: number | undefined;
    for (const item of style) {
      const next = findOpacity(item);
      if (next !== undefined) opacity = next;
    }
    return opacity;
  }
  if (typeof style === "object" && "opacity" in style && typeof style.opacity === "number") {
    return style.opacity;
  }
  return undefined;
}

function readBaseOpacity(style: StyleProp<ViewStyle>): number {
  return findOpacity(style) ?? 1;
}

/**
 * Non-native / test fallback for `MotionPressable`.
 * Keeps zero dependency on `react-native-reanimated` so minimal unit-test mocks stay compatible,
 * while native iOS & Android bundles resolve `motion-pressable.native.tsx`.
 */
export function MotionPressable({
  preset = "control",
  highlightColor,
  activeOpacity,
  motionDisabled = false,
  pressedStyle,
  style,
  disabled,
  android_ripple,
  children,
  ...props
}: MotionPressableProps) {
  const { componentOpacity } = useAppBackground();
  const surfaceStyle =
    componentOpacity < 1
      ? componentSurfaceStyle(StyleSheet.flatten(style), componentOpacity)
      : style;
  const suppressAndroidRow = isAndroidPlatform() && Boolean(android_ripple) && preset === "row";
  const resolved = resolvePressMotion(preset, {
    activeOpacity,
    hasHighlight: Boolean(highlightColor),
  });
  const baseOpacity = readBaseOpacity(surfaceStyle);

  return (
    <Pressable
      {...props}
      disabled={disabled}
      android_ripple={android_ripple}
      style={({ pressed }) => {
        if (!pressed || disabled || motionDisabled || suppressAndroidRow) {
          return surfaceStyle;
        }
        const feedback: ViewStyle = {};
        if (highlightColor) {
          feedback.backgroundColor = highlightColor;
        }
        if (resolved.pressedOpacity < 1) {
          feedback.opacity = baseOpacity * resolved.pressedOpacity;
        }
        if (Array.isArray(surfaceStyle)) {
          return pressedStyle
            ? [...surfaceStyle, feedback, pressedStyle]
            : [...surfaceStyle, feedback];
        }
        if (pressedStyle) {
          return [surfaceStyle, feedback, pressedStyle];
        }
        return surfaceStyle && typeof surfaceStyle === "object"
          ? { ...surfaceStyle, ...feedback }
          : feedback;
      }}
    >
      {children}
    </Pressable>
  );
}
