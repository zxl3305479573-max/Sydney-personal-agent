import type { ReactNode, Ref } from "react";
import type { ColorValue, PressableProps, StyleProp, View, ViewStyle } from "react-native";
import * as ReactNative from "react-native";
import { Pressable } from "react-native";
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
  const suppressAndroidRow = isAndroidPlatform() && Boolean(android_ripple) && preset === "row";
  const resolved = resolvePressMotion(preset, {
    activeOpacity,
    hasHighlight: Boolean(highlightColor),
  });
  const baseOpacity = readBaseOpacity(style);

  return (
    <Pressable
      {...props}
      disabled={disabled}
      android_ripple={android_ripple}
      style={({ pressed }) => {
        if (!pressed || disabled || motionDisabled || suppressAndroidRow) {
          return style;
        }
        const feedback: ViewStyle = {};
        if (highlightColor) {
          feedback.backgroundColor = highlightColor;
        }
        if (resolved.pressedOpacity < 1) {
          feedback.opacity = baseOpacity * resolved.pressedOpacity;
        }
        if (Array.isArray(style)) {
          return pressedStyle ? [...style, feedback, pressedStyle] : [...style, feedback];
        }
        if (pressedStyle) {
          return [style, feedback, pressedStyle];
        }
        return style && typeof style === "object" ? { ...style, ...feedback } : feedback;
      }}
    >
      {children}
    </Pressable>
  );
}
