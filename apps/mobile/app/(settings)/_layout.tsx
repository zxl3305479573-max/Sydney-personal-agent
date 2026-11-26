import { Stack, useNavigation } from "expo-router";
import { HeaderBackButton } from "expo-router/react-navigation";
import { useEffect } from "react";
import { Platform } from "react-native";
import { floatingHeaderOptions, glassHeaderOptions } from "../../components/glass-title";
import { ScopedThemeScreen } from "../../components/scoped-theme";
import { useI18n } from "../../lib/i18n";
import { native, useMobileTokens } from "../../lib/native";
import { registerSettingsSheet, settingsSheetCloser } from "../../lib/settings-sheet";

/** Settings pages share one stack, which the root layout presents as a sheet on iOS. */
export default function SettingsLayout() {
  const { t, locale } = useI18n();
  const tokens = useMobileTokens();
  const sheet = useNavigation();
  const close = settingsSheetCloser(sheet);

  useEffect(() => registerSettingsSheet(settingsSheetCloser(sheet)), [sheet]);

  return (
    <Stack
      screenLayout={({ children }) => (
        <ScopedThemeScreen scope="settings">{children}</ScopedThemeScreen>
      )}
      screenOptions={({ navigation, route }) => ({
        headerStyle: { backgroundColor: tokens.background },
        ...floatingHeaderOptions(),
        headerTintColor: tokens.foreground,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        // Account has no visible title, so iOS's long-press back menu would list it as a blank entry.
        headerBackButtonMenuEnabled: false,
        contentStyle: { backgroundColor: String(native.page) },
        // The first page closes the sheet, or returns Home when opened by a cold deep link.
        // The inner stack has no native back arrow on its first page.
        ...(navigation.getState().routes[0]?.key === route.key
          ? Platform.OS === "ios"
            ? {
                unstable_headerLeftItems: () => [
                  {
                    type: "button" as const,
                    hidesSharedBackground: true,
                    label: t("Dismiss"),
                    icon: { type: "sfSymbol" as const, name: "xmark" as const },
                    onPress: close,
                  },
                ],
              }
            : {
                headerBackVisible: false,
                headerLeft: ({ tintColor }) => (
                  <HeaderBackButton
                    accessibilityLabel={t("Back")}
                    displayMode="minimal"
                    tintColor={tintColor}
                    onPress={close}
                  />
                ),
              }
          : null),
      })}
    >
      <Stack.Screen
        name="settings-home"
        options={{
          ...glassHeaderOptions(t("Settings")),
          ...(Platform.OS === "ios" ? { headerTitle: "" } : null),
          contentStyle: { backgroundColor: native.groupedPage },
        }}
      />
      <Stack.Screen
        name="account"
        options={({ route }) => ({
          ...glassHeaderOptions(
            (route.params as { section?: string } | undefined)?.section === "usage"
              ? t("Usage")
              : (route.params as { section?: string } | undefined)?.section === "appearance"
                ? t("Appearance")
                : (route.params as { section?: string } | undefined)?.section === "permissions"
                  ? t("Rules")
                  : (route.params as { section?: string } | undefined)?.section === "notifications"
                    ? t("Notifications")
                    : (route.params as { section?: string } | undefined)?.section === "advanced"
                      ? t("Advanced")
                      : t("Account"),
          ),
          contentStyle: { backgroundColor: native.groupedPage },
        })}
      />
      <Stack.Screen name="about" options={glassHeaderOptions(t("About"))} />
      <Stack.Screen name="ai-data-sharing" options={glassHeaderOptions(t("AI data sharing"))} />
      <Stack.Screen name="archived-bots" options={{ title: t("Archived") }} />
      <Stack.Screen name="change-password" options={{ title: t("Change password") }} />
      <Stack.Screen name="chat-appearance" options={glassHeaderOptions(t("Chat appearance"))} />
      <Stack.Screen
        name="ui-mode"
        options={glassHeaderOptions(
          locale.startsWith("zh")
            ? locale === "zh-TW"
              ? "介面模式"
              : "界面模式"
            : "Interface mode",
        )}
      />
      <Stack.Screen name="signup-survey" options={glassHeaderOptions(t("Welcome to Sydney"))} />
      <Stack.Screen name="language" options={glassHeaderOptions(t("Language"))} />
      <Stack.Screen name="model-picker" options={glassHeaderOptions(t("Model"))} />
      <Stack.Screen name="model-connection" options={glassHeaderOptions(t("Model"))} />
      <Stack.Screen name="billing" options={glassHeaderOptions(t("Billing"))} />
      <Stack.Screen name="devices" options={glassHeaderOptions(t("Computers"))} />
      <Stack.Screen name="models" options={glassHeaderOptions(t("Models"))} />
      <Stack.Screen
        name="notifications"
        options={{
          ...glassHeaderOptions(
            locale.startsWith("zh")
              ? locale === "zh-TW"
                ? "消息通知"
                : "消息通知"
              : t("Notifications"),
          ),
          contentStyle: { backgroundColor: native.groupedPage },
        }}
      />
      <Stack.Screen name="voice" options={glassHeaderOptions(t("Voice"))} />
      <Stack.Screen name="wallet" options={glassHeaderOptions(t("Wallet"))} />
      <Stack.Screen
        name="approvals"
        options={{
          ...glassHeaderOptions(t("Rules")),
          contentStyle: { backgroundColor: native.groupedPage },
        }}
      />
      <Stack.Screen
        name="bot-permissions"
        options={{
          ...glassHeaderOptions(
            locale.startsWith("zh")
              ? locale === "zh-TW"
                ? "Bot 應用權限"
                : "Bot 应用权限"
              : "Bot app permissions",
          ),
          contentStyle: { backgroundColor: native.groupedPage },
        }}
      />
      <Stack.Screen
        name="vault"
        options={{
          ...glassHeaderOptions(t("Vault")),
          contentStyle: { backgroundColor: native.groupedPage },
        }}
      />
      <Stack.Screen
        name="space"
        // Named after the Space it opened from.
        options={({ route }) => ({
          ...glassHeaderOptions(
            (route.params as { name?: string } | undefined)?.name ?? t("Space"),
          ),
          contentStyle: { backgroundColor: native.groupedPage },
        })}
      />
      <Stack.Screen name="messaging" options={glassHeaderOptions(t("Messaging"))} />
      <Stack.Screen name="team-conversation" />
      <Stack.Screen name="skills" options={glassHeaderOptions(t("Skills"))} />
      {/* Titled by the screen once the skill loads. */}
      <Stack.Screen name="skill" options={glassHeaderOptions("")} />
      <Stack.Screen
        name="plugin"
        // Named after the plugin it opened.
        options={({ route }) =>
          glassHeaderOptions((route.params as { name?: string } | undefined)?.name ?? "")
        }
      />
    </Stack>
  );
}
