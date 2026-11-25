import { Stack, useRouter } from "expo-router";
import { Pressable } from "react-native";
import { useI18n } from "../lib/i18n";
import { iosAtLeast } from "../lib/native-controls";
import { NativeSymbol } from "./native-symbol";

export function MainNavigationHeader({ onBack }: { onBack?: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <Stack.Screen
      options={{
        headerBackVisible: false,
        ...(iosAtLeast(26)
          ? {
              unstable_headerLeftItems: () => [
                {
                  type: "button" as const,
                  label: t("Back"),
                  accessibilityLabel: t("Back"),
                  icon: { type: "sfSymbol" as const, name: "chevron.left" },
                  hidesSharedBackground: true,
                  onPress: onBack ?? (() => router.dismissTo("/")),
                },
              ],
            }
          : {}),
        headerLeft: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Back")}
            onPress={onBack ?? (() => router.dismissTo("/"))}
            hitSlop={8}
            style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}
          >
            <NativeSymbol ios="chevron.left" android="chevron-back" size={22} />
          </Pressable>
        ),
      }}
    />
  );
}
