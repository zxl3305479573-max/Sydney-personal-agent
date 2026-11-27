import { sanitizedError } from "@rakazo/logging/monitoring";
import type { ColorValue } from "react-native";
import { Text } from "react-native";

export function RenderErrorDetails({ error, color }: { error: unknown; color: ColorValue }) {
  const safe = sanitizedError(error);
  return (
    <Text
      selectable
      accessibilityRole="alert"
      style={{ color, fontSize: 13, lineHeight: 20, textAlign: "left" }}
    >
      {`${safe.name}: ${safe.message}`.slice(0, 1200)}
    </Text>
  );
}
