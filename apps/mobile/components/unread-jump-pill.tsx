import { fontWeight, typeScale } from "@rakazo/ui-tokens";
import { StyleSheet, Text } from "react-native";
import { useResolvedAppearance } from "../lib/native";
import type { JumpDirection } from "../lib/offscreen-unreads";
import { GlassSurface } from "./glass-surface";
import { MotionPressable } from "./motion-pressable";
import { NativeSymbol } from "./native-symbol";

export const UNREAD_JUMP_PILL_HEIGHT = 38;

/** A warm-charcoal capsule matching the unified porcelain palette. */
export function UnreadJumpPill({
  direction,
  label,
  accessibilityLabel,
  onPress,
}: {
  direction: JumpDirection;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const appearance = useResolvedAppearance();
  const isLight = appearance === "light";
  const fill = isLight ? "#2E2B27" : "#2F333C";
  const onFill = isLight ? "#FAF8F4" : "#F5F4F0";
  return (
    <MotionPressable
      preset="control"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
    >
      <GlassSurface
        tint={fill}
        style={styles.pill}
        fallbackStyle={{
          backgroundColor: fill,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: isLight ? "rgba(250, 248, 244, 0.14)" : "rgba(245, 244, 240, 0.14)",
          boxShadow: isLight
            ? "0 4px 12px rgba(38, 35, 31, 0.18)"
            : "0 4px 14px rgba(0, 0, 0, 0.34)",
        }}
      >
        <NativeSymbol
          ios={direction === "above" ? "chevron.up" : "chevron.down"}
          android={direction === "above" ? "chevron-up" : "chevron-down"}
          size={16}
          weight="semibold"
          color={onFill}
        />
        <Text style={[styles.label, { color: onFill }]}>{label}</Text>
      </GlassSurface>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: UNREAD_JUMP_PILL_HEIGHT,
    borderRadius: UNREAD_JUMP_PILL_HEIGHT / 2,
    paddingStart: 12,
    paddingEnd: 14,
  },
  label: {
    ...typeScale.secondary,
    fontWeight: fontWeight.medium,
  },
});
