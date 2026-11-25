import type { ColorValue } from "react-native";
import { View } from "react-native";

export type TabIndicatorProps = {
  selected: boolean;
  color: ColorValue;
  borderRadius: number;
};

/** Non-native / test fallback for the bottom navigation selection indicator. */
export function TabIndicator({ selected, color, borderRadius }: TabIndicatorProps) {
  return (
    <View
      accessibilityElementsHidden
      style={{
        width: 18,
        height: 2,
        borderRadius,
        backgroundColor: selected ? color : "transparent",
      }}
    />
  );
}
