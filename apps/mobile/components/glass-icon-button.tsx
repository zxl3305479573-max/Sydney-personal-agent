import type { ComponentProps } from "react";
import type { ColorValue, StyleProp, ViewStyle } from "react-native";
import { Platform } from "react-native";
import { useMobileTokens } from "../lib/native";
import { androidRipple, withAlpha } from "../lib/ripple";
import { GlassSurface } from "./glass-surface";
import { MotionPressable } from "./motion-pressable";
import { NativeSymbol } from "./native-symbol";

export function GlassIconButton({
  testID,
  accessibilityLabel,
  onPress,
  ios,
  android,
  size = 40,
  iconSize = 17,
  color,
  tint,
  selected,
  nativeOverlay,
  fallbackStyle,
}: {
  testID?: string;
  accessibilityLabel: string;
  onPress: () => void;
  ios: string;
  android: ComponentProps<typeof NativeSymbol>["android"];
  size?: number;
  iconSize?: number;
  color?: ColorValue;
  tint?: string;
  selected?: boolean;
  nativeOverlay?: boolean;
  fallbackStyle?: StyleProp<ViewStyle>;
}) {
  const tokens = useMobileTokens();
  const iconColor = selected ? tokens.primaryForeground : (color ?? tokens.mutedForeground);
  return (
    <GlassSurface
      nativeOverlay={nativeOverlay}
      shape="circle"
      tint={selected ? tokens.primary : tint}
      style={{ width: size, height: size }}
      fallbackStyle={[
        { borderRadius: size / 2 },
        fallbackStyle,
        selected && { backgroundColor: tokens.primary },
      ]}
    >
      <MotionPressable
        preset="icon"
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={selected === undefined ? undefined : { selected }}
        hitSlop={4}
        android_ripple={androidRipple(withAlpha(iconColor, 0.14))}
        onPress={onPress}
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          ...(Platform.OS === "android" ? { borderRadius: size / 2, overflow: "hidden" } : null),
        }}
      >
        <NativeSymbol ios={ios} android={android} size={iconSize} color={iconColor} />
      </MotionPressable>
    </GlassSurface>
  );
}
