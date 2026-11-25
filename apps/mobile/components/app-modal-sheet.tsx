import type { ReactNode } from "react";
import { useCallback } from "react";
import type { ColorValue, StyleProp, ViewStyle } from "react-native";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { NativeSheet, useNativeSheet } from "./native-sheet";

export type AppModalSheetProps = {
  visible?: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  /** Disables backdrop/swipe dismissal while an operation is in flight. */
  preventDismiss?: boolean;
  /** Accessibility label for modal container / backdrop close button. */
  accessibilityLabel?: string;
  /** Override sheet surface background color (defaults to warm porcelain canvas). */
  backgroundColor?: ColorValue;
  /** Optional bottom safe-area inset supplied by caller when available. */
  bottomInset?: number;
  /** Optional style applied to the inner sheet container. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Whether to show a subtle top grabber pill inside non-native fallback sheets. */
  showGrabber?: boolean;
  children: ReactNode;
};

/**
 * Unified native modal sheet for forms and confirmations.
 *
 * - iOS: native UIKit `presentationStyle="formSheet"` with swipe-to-dismiss and
 *   built-in keyboard avoidance.
 * - Android: native Compose `BottomSheet` via `@expo/ui/community/bottom-sheet`
 *   when available, falling back to a warm-porcelain bottom sheet.
 */
export function AppModalSheet({
  visible = true,
  onClose,
  onDismiss,
  preventDismiss = false,
  accessibilityLabel,
  backgroundColor,
  bottomInset = 20,
  contentStyle,
  showGrabber = true,
  children,
}: AppModalSheetProps) {
  const Sheet = useNativeSheet();
  const tokens = useMobileTokens();
  const { t } = useI18n();

  const requestClose = useCallback(() => {
    if (!preventDismiss) onClose();
  }, [onClose, preventDismiss]);

  if (!visible) {
    if (Platform.OS === "ios" && onDismiss) {
      return (
        <Modal
          visible={false}
          animationType="slide"
          presentationStyle="formSheet"
          allowSwipeDismissal={!preventDismiss}
          onRequestClose={requestClose}
          onDismiss={onDismiss}
        >
          <View />
        </Modal>
      );
    }
    return null;
  }

  if (Sheet === undefined) return null;

  const bg = tokens?.background;
  const isLight =
    typeof bg === "string" && /^#[\da-f]{6}/i.test(bg)
      ? Number.parseInt(bg.slice(1, 3), 16) >= 128
      : true;
  const sheetBg = backgroundColor ?? tokens?.background ?? (isLight ? "#F3F1EC" : "#15171C");
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const borderColor =
    tokens?.border ?? (isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)");
  const grabberColor = isLight ? "rgba(38, 35, 31, 0.2)" : "rgba(245, 244, 240, 0.24)";
  const bottomPad = Math.max(bottomInset, 20);

  if (Sheet) {
    return (
      <NativeSheet Sheet={Sheet} onClose={requestClose} label={accessibilityLabel}>
        <View style={[{ paddingBottom: bottomPad }, contentStyle]}>{children}</View>
      </NativeSheet>
    );
  }

  if (Platform.OS === "ios") {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="formSheet"
        allowSwipeDismissal={!preventDismiss}
        onRequestClose={requestClose}
        onDismiss={onDismiss}
      >
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={54}
          style={{ flex: 1, backgroundColor: sheetBg }}
        >
          <View
            accessibilityViewIsModal
            accessibilityLabel={accessibilityLabel}
            style={[
              {
                flex: 1,
                paddingTop: showGrabber ? 10 : 16,
                paddingBottom: bottomPad,
              },
              contentStyle,
            ]}
          >
            {showGrabber ? (
              <View
                accessible={false}
                style={{
                  alignSelf: "center",
                  width: 38,
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: grabberColor,
                  marginBottom: 10,
                }}
              />
            ) : null}
            {children}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={requestClose}
      onDismiss={onDismiss}
    >
      <KeyboardAvoidingView
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor:
            tokens?.overlay ?? (isLight ? "rgba(24, 22, 18, 0.24)" : "rgba(8, 10, 14, 0.45)"),
        }}
      >
        <Pressable
          accessibilityLabel={accessibilityLabel ?? t("Close")}
          disabled={preventDismiss}
          onPress={requestClose}
          style={{ flex: 1 }}
        />
        <View
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel}
          style={[
            {
              maxHeight: "92%",
              backgroundColor: sheetBg,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderTopWidth: hairline,
              borderColor,
              paddingTop: 10,
              paddingBottom: bottomPad,
            },
            contentStyle,
          ]}
        >
          {showGrabber ? (
            <View
              accessible={false}
              style={{
                alignSelf: "center",
                width: 38,
                height: 5,
                borderRadius: 999,
                backgroundColor: grabberColor,
                marginBottom: 10,
              }}
            />
          ) : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
