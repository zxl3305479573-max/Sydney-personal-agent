import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import type { ThreadHeaderAction } from "./thread-header-right";

export function BotActionsModal({ actions, onClose }: {
  actions: readonly ThreadHeaderAction[];
  onClose: () => void;
}) {
  const tokens = useMobileTokens();
  const { t } = useI18n();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: tokens.overlay }}>
        <Pressable accessibilityLabel={t("Cancel")} onPress={onClose}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} />
        <View accessibilityViewIsModal
          style={{ maxHeight: "90%", backgroundColor: tokens.popover, borderRadius: 24, paddingVertical: 12 }}>
          <ScrollView bounces={false}>
          {actions.map((action) => (
            <Pressable key={action.text} accessibilityRole="button"
              onPress={() => { onClose(); action.onPress(); }}
              style={{ minHeight: 56, justifyContent: "center", paddingHorizontal: 24 }}>
              <Text style={{ color: action.destructive ? tokens.destructive : tokens.popoverForeground, fontSize: 16 }}>
                {action.text}
              </Text>
            </Pressable>
          ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
