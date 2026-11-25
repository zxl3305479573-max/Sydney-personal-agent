import { useEffect, useRef } from "react";
import * as ReactNative from "react-native";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { MotionPressable } from "./motion-pressable";
import type { ThreadHeaderAction } from "./thread-header-right";

function readActionSheetIOS(): typeof ReactNative.ActionSheetIOS | undefined {
  try {
    return Object.hasOwn(ReactNative, "ActionSheetIOS") ? ReactNative.ActionSheetIOS : undefined;
  } catch {
    return undefined;
  }
}

export function BotActionsModal({
  actions,
  onClose,
}: {
  actions: readonly ThreadHeaderAction[];
  onClose: () => void;
}) {
  const tokens = useMobileTokens();
  const { t } = useI18n();
  const actionSheetIOS = Platform.OS === "ios" ? readActionSheetIOS() : undefined;
  const useNativeIosActionSheet = typeof actionSheetIOS?.showActionSheetWithOptions === "function";
  const shownRef = useRef(false);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!useNativeIosActionSheet || !actionSheetIOS || shownRef.current) return;
    shownRef.current = true;
    const currentActions = actionsRef.current;
    const cancelLabel = t("Cancel");
    const options = [...currentActions.map((action) => action.text), cancelLabel];
    const cancelButtonIndex = currentActions.length;
    const destructiveIndices = currentActions.reduce<number[]>((indices, action, index) => {
      if (action.destructive) indices.push(index);
      return indices;
    }, []);
    const destructiveButtonIndex =
      destructiveIndices.length === 0
        ? undefined
        : destructiveIndices.length === 1
          ? destructiveIndices[0]
          : destructiveIndices;

    actionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        destructiveButtonIndex,
      },
      (buttonIndex) => {
        onCloseRef.current();
        if (buttonIndex >= 0 && buttonIndex < currentActions.length) {
          currentActions[buttonIndex]?.onPress();
        }
      },
    );
  }, [useNativeIosActionSheet, actionSheetIOS, t]);

  if (useNativeIosActionSheet) return null;

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
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: tokens?.overlay ?? "rgba(24, 22, 18, 0.24)",
        }}
      >
        <Pressable accessibilityLabel={t("Cancel")} onPress={onClose} style={{ flex: 1 }} />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: "82%",
            backgroundColor: porcelainSurface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderTopWidth: hairline,
            borderColor: porcelainBorder,
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: 24,
            shadowColor: "#26231F",
            shadowOpacity: isLight ? 0.05 : 0.24,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: -4 },
            elevation: 2,
          }}
        >
          <View
            accessible={false}
            style={{
              width: 38,
              height: 5,
              borderRadius: 999,
              alignSelf: "center",
              marginBottom: 8,
              backgroundColor: softTaupe,
              opacity: 0.28,
            }}
          />
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
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
