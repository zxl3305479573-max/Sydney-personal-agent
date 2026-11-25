import { accountDisplay } from "@rakazo/core";
import { useQuery } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useState, useSyncExternalStore } from "react";
import { Alert, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AccountAvatar } from "../../components/account-avatar";
import { SettingsGroup, SettingsRow } from "../../components/settings-group";
import { useAccountAvatar } from "../../lib/account-avatar";
import { getAppVersionInfo } from "../../lib/app-version";
import {
  checkForManualUpdate,
  promptForAvailableUpdate,
  useClientUpdateState,
} from "../../lib/client-update";
import { useI18n } from "../../lib/i18n";
import { native } from "../../lib/native";
import {
  getCachedNotificationPreferences,
  notificationSummaryLabel,
  subscribeNotificationPreferences,
} from "../../lib/notification-preferences";
import { accountRpcQuery, queryClient } from "../../lib/query";
import { useScreenBackground } from "../../lib/scoped-theme-context";
import { openFromSettingsSheet } from "../../lib/settings-sheet";
import { useSideInsets } from "../../lib/side-insets";
import { sydneyReleaseFromManifest, sydneyReleaseNotes } from "../../lib/sydney-release";
import { formatUnifiedThemeSummary, getUnifiedThemeState } from "../../lib/theme-controls";
import { themeManager } from "../../lib/theme-state";
import { getUiModeRevision, subscribeUiMode } from "../../lib/ui-mode";

export default function SettingsHome() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const insets = useSideInsets();
  const screenBackground = useScreenBackground(native.groupedPage);
  const { data: me } = useQuery(accountRpcQuery("me"), queryClient);
  const { image: avatar } = useAccountAvatar(me);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const { update, downloaded, downloading } = useClientUpdateState();
  const availableRelease = sydneyReleaseFromManifest(update?.manifest);
  const availableVersion = update
    ? availableRelease
      ? t("Version {version} available", { version: availableRelease.version })
      : t("Update available")
    : undefined;
  const { release, nativeLabel } = getAppVersionInfo();
  const currentVersion = release?.version ?? nativeLabel;
  const account = accountDisplay(me ?? {}, t("Your account"));
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  useSyncExternalStore(subscribeUiMode, getUiModeRevision, getUiModeRevision);
  useSyncExternalStore(themeManager.subscribe, themeManager.getSnapshot, themeManager.getSnapshot);
  const notificationPrefs = useSyncExternalStore(
    subscribeNotificationPreferences,
    getCachedNotificationPreferences,
    getCachedNotificationPreferences,
  );
  const notificationSummary =
    Platform.OS === "ios" ? notificationSummaryLabel(notificationPrefs, locale) : undefined;
  const themeSummary =
    Platform.OS === "ios"
      ? formatUnifiedThemeSummary(getUnifiedThemeState(Platform.OS), locale)
      : undefined;

  function accountSection(section: string) {
    router.push({ pathname: "/account", params: { section } });
  }

  async function checkUpdate() {
    if (checkingUpdate || downloading) return;
    if (update && downloaded) {
      promptForAvailableUpdate({ id: update.updateId, release: availableRelease }, true);
      return;
    }
    setCheckingUpdate(true);
    try {
      const result = await checkForManualUpdate();
      if (result.status === "available") {
        promptForAvailableUpdate(result.update);
      } else if (result.status === "disabled") {
        Alert.alert(t("Updates are unavailable in this build."));
      } else {
        Alert.alert(
          t("Your app is up to date."),
          currentVersion ? t("Version {version}", { version: currentVersion }) : undefined,
        );
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
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: screenBackground }}>
      <ScrollView
        style={insets}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 18,
          paddingBottom: 40,
          gap: 22,
        }}
      >
        <SettingsGroup label={t("Account")} gradient="champagne">
          {Platform.OS === "android" ? (
            <SettingsRow
              title={t("Notifications")}
              accessibilityRole="button"
              chevron="right"
              onPress={() => accountSection("notifications")}
            />
          ) : (
            <SettingsRow
              title={chinese ? "消息通知" : t("Notifications")}
              detail={notificationSummary}
              accessibilityRole="button"
              chevron="right"
              onPress={() => router.push("/notifications")}
            />
          )}
          <SettingsRow
            accessibilityRole="button"
            prominent
            title={account.label}
            detail={me?.email && account.label !== me.email ? me.email : undefined}
            chevron="right"
            leading={
              <View style={{ marginRight: 4 }}>
                <AccountAvatar image={avatar} initial={account.initial} size={46} />
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

        <SettingsGroup label={t("Apps")}>
          {link(t("Connect apps"), "/integrations", true)}
          {link("GitHub", "/github", true)}
        </SettingsGroup>

        <SettingsGroup label={chinese ? (traditional ? "小夥伴" : "小伙伴") : t("Bots")}>
          <SettingsRow
            title={chinese ? (traditional ? "權限" : "权限") : t("Rules")}
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
          {Platform.OS === "ios" ? (
            <SettingsRow
              title={chinese ? (traditional ? "介面模式" : "界面模式") : "Interface mode"}
              value={themeSummary}
              accessibilityRole="button"
              chevron="right"
              onPress={() => router.push("/ui-mode")}
            />
          ) : null}
          {link(t("Chat appearance"), "/chat-appearance")}
          <SettingsRow
            title={t("Advanced")}
            accessibilityRole="button"
            chevron="right"
            onPress={() => accountSection("advanced")}
          />
          {link(t("Archived"), "/archived-bots")}
        </SettingsGroup>

        <SettingsGroup label={t("Software update")}>
          {release ? (
            <SettingsRow
              title={t("Release notes")}
              accessibilityRole="button"
              chevron="right"
              onPress={() =>
                Alert.alert(
                  t("Version {version}", { version: release.version }),
                  `${release.releasedOn}\n\n${sydneyReleaseNotes(release, locale)}`,
                  [{ text: t("Close") }],
                )
              }
            />
          ) : null}
          <SettingsRow
            title={
              downloading
                ? t("Downloading update…")
                : checkingUpdate
                  ? t("Checking for updates…")
                  : t("Check for updates")
            }
            detail={availableVersion}
            accessibilityRole="button"
            disabled={checkingUpdate || downloading}
            onPress={() => void checkUpdate()}
          />
        </SettingsGroup>
        <SettingsGroup>
          <SettingsRow
            title={t("About")}
            value={currentVersion ?? undefined}
            accessibilityRole="button"
            chevron="right"
            onPress={() => router.push("/about")}
          />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
