import { useEffect, useState } from "react";
import type { GestureResponderEvent, StyleProp, ViewStyle } from "react-native";
import { Platform, Pressable, StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { resolvePressMotion } from "../lib/press-motion";
import type { MotionPressableProps } from "./motion-pressable";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function walkStyleHints(style: unknown, out: { opacity?: number; borderRadius?: number }): void {
  if (!style) return;
  if (Array.isArray(style)) {
    for (const item of style) walkStyleHints(item, out);
    return;
  }
  if (typeof style === "object") {
    if ("opacity" in style && typeof style.opacity === "number") {
      out.opacity = style.opacity;
    }
    if ("borderRadius" in style && typeof style.borderRadius === "number") {
      out.borderRadius = style.borderRadius;
    }
  }
}

function readStyleHints(style: StyleProp<ViewStyle>): {
  opacity: number;
  borderRadius?: number;
} {
  if (!style) return { opacity: 1 };
  const flattened =
    typeof StyleSheet?.flatten === "function" ? StyleSheet.flatten(style) : undefined;
  if (flattened && typeof flattened === "object") {
    return {
      opacity: typeof flattened.opacity === "number" ? flattened.opacity : 1,
      borderRadius: typeof flattened.borderRadius === "number" ? flattened.borderRadius : undefined,
    };
  }
  const hints: { opacity?: number; borderRadius?: number } = {};
  walkStyleHints(style, hints);
  return {
    opacity: hints.opacity ?? 1,
    borderRadius: hints.borderRadius,
  };
}

/**
 * Unified UI-thread press motion primitive for iOS and Android.
 * Drives scale, opacity, and PlatformColor-safe highlight overlays via Reanimated
 * without adding wrapper views that could alter flex layout or drop shadows.
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
  onPressIn,
  onPressOut,
  children,
  ...props
}: MotionPressableProps) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const [pressedActive, setPressedActive] = useState(false);

  const suppressAndroidRow =
    Platform.OS === "android" && Boolean(android_ripple) && preset === "row";
  const inactive = Boolean(disabled) || motionDisabled || suppressAndroidRow;
  const resolved = resolvePressMotion(preset, {
    reducedMotion,
    activeOpacity,
    hasHighlight: Boolean(highlightColor),
  });
  const { opacity: baseOpacity, borderRadius } = readStyleHints(style);

  useEffect(() => {
    if (!inactive) return;
    progress.value = withTiming(0, { duration: 90, easing: Easing.out(Easing.quad) });
    if (pressedStyle) setPressedActive(false);
  }, [inactive, pressedStyle, progress]);

  const handlePressIn = (event: GestureResponderEvent) => {
    if (!inactive) {
      progress.value = withTiming(1, {
        duration: resolved.inDurationMs,
        easing: Easing.out(Easing.quad),
      });
      if (pressedStyle) setPressedActive(true);
    }
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    if (!inactive) {
      progress.value =
        resolved.useSpring && resolved.spring
          ? withSpring(0, resolved.spring)
          : withTiming(0, {
              duration: resolved.outDurationMs,
              easing: Easing.out(Easing.cubic),
            });
      if (pressedStyle) setPressedActive(false);
    }
    onPressOut?.(event);
  };

  const containerAnimatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const scaleDelta = 1 - resolved.pressedScale;
    const opacityDelta = 1 - resolved.pressedOpacity;
    const next: ViewStyle = {};
    if (scaleDelta > 0) {
      next.transform = [{ scale: 1 - p * scaleDelta }];
    }
    if (opacityDelta > 0) {
      next.opacity = baseOpacity * (1 - p * opacityDelta);
    }
    return next;
  }, [baseOpacity, resolved.pressedOpacity, resolved.pressedScale]);

  const highlightAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      android_ripple={android_ripple}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        style,
        pressedActive && pressedStyle ? pressedStyle : undefined,
        containerAnimatedStyle,
      ]}
    >
      {highlightColor && !suppressAndroidRow ? (
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: highlightColor },
            borderRadius !== undefined ? { borderRadius } : undefined,
            highlightAnimatedStyle,
          ]}
        />
      ) : null}
      {children}
    </AnimatedPressable>
  );
}
