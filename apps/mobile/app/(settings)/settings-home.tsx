import { accountDisplay } from "@rakazo/core";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SettingsGroup, SettingsRow } from "../../components/settings-group";
import type { MobileMe } from "../../lib/api";
import { rpc } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { native } from "../../lib/native";
import { openFromSettingsSheet } from "../../lib/settings-sheet";
import { useSideInsets } from "../../lib/side-insets";

export default function SettingsHome() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const insets = useSideInsets();
  const [me, setMe] = useState<MobileMe | null>(null);
  const account = accountDisplay(me ?? {}, t("Your account"));
  const chinese = locale === "zh-CN";

  useEffect(() => {
    let active = true;
    void rpc("me")
      .then((value) => {
        if (active) setMe(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  function accountSection(section: string) {
    router.push({ pathname: "/account", params: { section } });
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
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
