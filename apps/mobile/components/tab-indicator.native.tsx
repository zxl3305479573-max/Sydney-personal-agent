import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { TabIndicatorProps } from "./tab-indicator";

/** Smoothly expands and fades the bottom navigation indicator bar on selection changes. */
export function TabIndicator({ selected, color, borderRadius }: TabIndicatorProps) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, {
      duration: reducedMotion ? 90 : 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, reducedMotion, selected]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scaleX: reducedMotion ? 1 : 0.35 + 0.65 * progress.value }],
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      style={[
        {
          width: 18,
          height: 2,
          borderRadius,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}
