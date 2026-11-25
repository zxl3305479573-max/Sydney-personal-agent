import { Alert } from "react-native";
import { useI18n } from "../lib/i18n";
import { native } from "../lib/native";
import { MotionPressable } from "./motion-pressable";
import { NativeSymbol } from "./native-symbol";

export function InfoButton({ label, children }: { label: string; children: string }) {
  const { t } = useI18n();
  return (
    <MotionPressable
      preset="icon"
      accessibilityRole="button"
      accessibilityLabel={t("About {label}", { label })}
      accessibilityHint={children}
      onPress={() => Alert.alert(label, children)}
      style={{
        marginStart: -4,
        minWidth: 24,
        minHeight: 24,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <NativeSymbol
        ios="questionmark.circle"
        android="help-circle-outline"
        size={14}
        color={native.secondaryLabel}
      />
    </MotionPressable>
  );
}
