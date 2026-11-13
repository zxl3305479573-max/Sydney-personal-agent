import { accountDisplay } from "@rakazo/core";
import { useQuery } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SettingsGroup, SettingsRow } from "../../components/settings-group";
import { checkForManualUpdate, restartForUpdate } from "../../lib/client-update";
import { useI18n } from "../../lib/i18n";
import { native } from "../../lib/native";
import { accountRpcQuery, queryClient } from "../../lib/query";
import { openFromSettingsSheet } from "../../lib/settings-sheet";
import { useSideInsets } from "../../lib/side-insets";

export default function SettingsHome() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const insets = useSideInsets();
  const { data: me } = useQuery(accountRpcQuery("me"), queryClient);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const account = accountDisplay(me ?? {}, t("Your account"));
  const chinese = locale === "zh-CN";

  function accountSection(section: string) {
    router.push({ pathname: "/account", params: { section } });
  }

  async function checkUpdate() {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const result = await checkForManualUpdate();
      if (result === "disabled") Alert.alert(t("Updates are unavailable in this build."));
      else if (result === "current") Alert.alert(t("Your app is up to date."));
      else {
        Alert.alert(t("Update downloaded"), t("Restart the app now? Save unfinished work first."), [
          { text: t("Not Now"), style: "cancel" },
          {
            text: t("Restart"),
            onPress: () =>
              void restartForUpdate().catch(() =>
                Alert.alert(t("Could not restart. Reopen the app to apply the update.")),
              ),
          },
        ]);
      }
    } catch {
      Alert.alert(t("Could not check for updates. Try again later."));
    } finally {
      setCheckingUpdate(false);
    }
  }

  function link(title: string, href: Href, root = false) {
    return (
      <SettingsRow
        key={String(href)}
        title={title}
        accessibilityRole="button"
        chevron="right"
        onPress={() => {
          if (root) openFromSettingsSheet(router, href);
          else router.push(href);
        }}
      />
    );
  }

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: native.groupedPage }}>
      <ScrollView
        style={insets}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 24,
          paddingBottom: 32,
          gap: 28,
        }}
      >
        <SettingsGroup>
          {Platform.OS === "android" ? (
            <SettingsRow
              title={t("Notifications")}
              accessibilityRole="button"
              chevron="right"
              onPress={() => accountSection("notifications")}
            />
          ) : null}
          <SettingsRow
            accessibilityRole="button"
            title={account.label}
            detail={me?.email && account.label !== me.email ? me.email : undefined}
            chevron="right"
            leading={
              <View
                accessibilityElementsHidden
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: native.fill,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                <Text style={{ color: native.label, fontSize: 18 }}>{account.initial ?? "?"}</Text>
              </View>
            }
            onPress={() => accountSection("account")}
          />
          <SettingsRow
            title={t("Usage")}
            accessibilityRole="button"
            chevron="right"
            onPress={() => accountSection("usage")}
          />
          {me?.billingEnabled ? link(t("Billing"), "/billing") : null}
          {link(t("Vault"), "/vault")}
          {link(t("Computers"), "/devices")}
        </SettingsGroup>

        <SettingsGroup>{link(t("Connect apps"), "/integrations")}</SettingsGroup>

        <SettingsGroup label={chinese ? "小伙伴" : t("Bots")}>
          <SettingsRow
            title={chinese ? "权限" : t("Rules")}
            accessibilityRole="button"
            chevron="right"
            onPress={() => accountSection("permissions")}
          />
          {link(t("Models"), "/models")}
          {link(t("Voice"), "/voice")}
          {link(t("Skills"), "/skills")}
          {link(t("Messaging"), "/messaging")}
          {link(t("AI data sharing"), "/ai-data-sharing")}
          {me?.paymentWalletProvider ? link(t("Wallet"), "/wallet") : null}
          {me?.ticketBoardEnabled ? link(t("Board"), "/board", true) : null}
          {link(t("Artifacts"), "/artifacts", true)}
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            title={t("Appearance")}
            accessibilityRole="button"
            chevron="right"
            onPress={() => accountSection("appearance")}
          />
          {link(t("Language"), "/language")}
          {link(t("Chat appearance"), "/chat-appearance")}
          <SettingsRow
            title={t("Advanced")}
            accessibilityRole="button"
            chevron="right"
            onPress={() => accountSection("advanced")}
          />
          {link(t("Archived"), "/archived-bots")}
          <SettingsRow
            title={checkingUpdate ? t("Checking for updates…") : t("Check for updates")}
            accessibilityRole="button"
            disabled={checkingUpdate}
            onPress={() => void checkUpdate()}
          />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
