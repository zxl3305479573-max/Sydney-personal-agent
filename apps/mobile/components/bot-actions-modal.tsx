import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { MotionPressable } from "./motion-pressable";
import type { ThreadHeaderAction } from "./thread-header-right";

export function BotActionsModal({
  actions,
  onClose,
}: {
  actions: readonly ThreadHeaderAction[];
  onClose: () => void;
}) {
  const tokens = useMobileTokens();
  const { t } = useI18n();
  const bg = tokens?.background;
  const isLight =
    typeof bg === "string" && /^#[\da-f]{6}/i.test(bg)
      ? Number.parseInt(bg.slice(1, 3), 16) > 128
      : true;
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const porcelainSurface = isLight ? "#FFFEFC" : "#242933";
  const porcelainBorder =
    tokens?.border ?? (isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)");
  const creamPressed = isLight ? "#F8F6F2" : "#2A303B";
  const softTaupe = isLight ? "#6E675E" : "#B8B3AA";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 24,
          backgroundColor: tokens?.overlay ?? "rgba(24, 22, 18, 0.20)",
        }}
      >
        <Pressable
          accessibilityLabel={t("Cancel")}
          onPress={onClose}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: "90%",
            backgroundColor: porcelainSurface,
            borderRadius: 22,
            borderWidth: hairline,
            borderColor: porcelainBorder,
            paddingHorizontal: 8,
            paddingTop: 10,
            paddingBottom: 10,
            shadowColor: "#26231F",
            shadowOpacity: isLight ? 0.05 : 0.24,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 8 },
            elevation: 2,
          }}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              alignSelf: "center",
              marginBottom: 6,
              backgroundColor: softTaupe,
              opacity: 0.28,
            }}
          />
          <ScrollView bounces={false}>
            {actions.map((action) => (
              <MotionPressable
                key={action.text}
                preset="row"
                highlightColor={creamPressed}
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
                style={{
                  minHeight: 52,
                  borderRadius: 16,
                  justifyContent: "center",
                  paddingHorizontal: 18,
                  backgroundColor: "transparent",
                }}
              >
                <Text
                  style={{
                    color: action.destructive
                      ? tokens.destructive
                      : (tokens?.foreground ?? tokens?.popoverForeground),
                    fontSize: 16,
                  }}
                >
                  {action.text}
                </Text>
              </MotionPressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
