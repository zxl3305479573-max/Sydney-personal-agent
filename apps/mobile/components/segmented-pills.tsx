import { StyleSheet, Text, View } from "react-native";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import type { NativeSegmentedControlProps } from "../lib/native-controls";
import { useScopedTheme } from "../lib/scoped-theme-context";
import { MotionPressable } from "./motion-pressable";

/** The pre-native segmented control, kept for Android and for an empty selection. */
export function SegmentedPills<T extends string>({
  accessibilityLabel,
  value,
  onChange,
  options,
  disabled = false,
}: NativeSegmentedControlProps<T>) {
  const tokens = useMobileTokens();
  const scope = useScopedTheme();
  const isLight = useResolvedAppearance() === "light";
  const hairline = StyleSheet?.hairlineWidth ?? 0.5;
  const trackFill = scope ? tokens.accent : isLight ? "#EAE6DE" : "#1E222A";
  // The selected segment sits lighter than the track in both palettes.
  const selectedFill = scope
    ? isLight
      ? tokens.popover
      : tokens.chatUser
    : isLight
      ? "#FFFEFC"
      : "#2D3340";
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: "row",
        padding: 3,
        borderRadius: 999,
        backgroundColor: trackFill,
        borderWidth: hairline,
        borderColor: isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.08)",
      }}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <MotionPressable
            key={option.value}
            preset="control"
            motionDisabled={selected}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: selected ? selectedFill : "transparent",
              borderRadius: 999,
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderWidth: selected ? hairline : 0,
              borderColor: selected
                ? isLight
                  ? "rgba(38, 35, 31, 0.06)"
                  : "rgba(245, 244, 240, 0.11)"
                : "transparent",
              shadowColor: "#26231F",
              shadowOpacity: selected ? (isLight ? 0.04 : 0.2) : 0,
              shadowRadius: selected ? 8 : 0,
              shadowOffset: { width: 0, height: selected ? 2 : 0 },
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                color: selected ? tokens.foreground : tokens.mutedForeground,
                fontWeight: selected ? "600" : "500",
              }}
            >
              {option.label}
            </Text>
          </MotionPressable>
        );
      })}
    </View>
  );
}
