import type { AiConsentStatus } from "@rakazo/contracts";
import { AI_DATA_DISCLOSURES } from "@rakazo/contracts";
import type { ColorTokens } from "@rakazo/ui-tokens";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet } from "react-native";
import {
  SettingsFooter,
  SettingsGroup,
  SettingsRow,
  SettingsSwitch,
  useStackedSettings,
} from "../../components/settings-group";
import { promptAiConsent } from "../../lib/ai-consent";
import {
  aiDataSharingPlaceholder,
  aiPrivacyLinks,
  groupAiRecipients,
} from "../../lib/ai-data-sharing";
import { rpc } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import type { NativeColors } from "../../lib/native";
import { native, useThemedStyles } from "../../lib/native";
import { useSideInsets } from "../../lib/side-insets";
import type { ResolvedScopedTheme } from "../../lib/theme-pack";
import { errorText } from "../../lib/user-error";

export default function AiDataSharing() {
  const sideInsets = useSideInsets();
  const { t } = useI18n();
  const [status, setStatus] = useState<AiConsentStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const placeholder = aiDataSharingPlaceholder(status, loadFailed);
  const privacyUrl = status?.privacyUrl;
  const privacyLinks = status ? aiPrivacyLinks(status.recipients) : [];
  const styles = useThemedStyles(createStyles);
  const stacked = useStackedSettings();
  const error = (cause: unknown) =>
    Alert.alert(t("AI data sharing"), errorText(cause, t("Could not load permissions.")));
  useEffect(() => {
    reload();
  }, []);

  function reload() {
    setLoadFailed(false);
    void rpc("aiConsent/status")
      .then(setStatus)
      .catch((cause: unknown) => {
        setLoadFailed(true);
        Alert.alert(t("AI data sharing"), errorText(cause, t("Could not load permissions.")), [
          { text: t("Cancel"), style: "cancel" },
          { text: t("Retry"), onPress: reload },
        ]);
      });
  }

  function setAllowed(recipient: AiConsentStatus["recipients"][number], allowed: boolean) {
    if (!status) return;
    setPending(true);
    void (async () => {
      if (!allowed) setStatus(await rpc("aiConsent/revoke", { key: recipient.key }));
      else if (await promptAiConsent(recipient, status.privacyUrl))
        setStatus(
          await rpc("aiConsent/allow", {
            scope: status.scope,
            version: status.version,
            keys: [recipient.key],
          }),
        );
    })()
      .catch(error)
      .finally(() => setPending(false));
  }

  function requestWithdrawal() {
    Alert.alert(
      t("Withdraw all permissions?"),
      t(
        "New mobile actions won't send data to these services. Runs already in progress and routines keep going until you stop them.",
      ),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Withdraw"),
          style: "destructive",
          onPress: () => {
            setPending(true);
            void rpc("aiConsent/revoke", { key: null })
              .then(setStatus)
              .catch(error)
              .finally(() => setPending(false));
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={[styles.screen, sideInsets]}
      contentContainerStyle={[styles.container, stacked && styles.compactContainer]}
      contentInsetAdjustmentBehavior="automatic"
    >
      {placeholder === "loading" && <ActivityIndicator />}
      {placeholder === "failed" && (
        <SettingsFooter>{t("Could not load permissions.")}</SettingsFooter>
      )}
      {placeholder === "empty" && (
        <SettingsFooter>{t("No AI services configured.")}</SettingsFooter>
      )}
      {status && (
        <>
          {groupAiRecipients(status.recipients).map(({ use, recipients }) => (
            <SettingsGroup
              key={use}
              label={use === "model" ? t("AI models") : use === "voice" ? t("Voice") : t("Memory")}
              footer={t(AI_DATA_DISCLOSURES[use])}
            >
              {recipients.map((recipient) => (
                <SettingsSwitch
                  key={recipient.key}
                  label={recipient.name}
                  detail={recipient.detail}
                  accessibilityLabel={t("Allow {name} on mobile", { name: recipient.name })}
                  disabled={pending}
                  onChange={(allowed) => setAllowed(recipient, allowed)}
                  value={recipient.allowed}
                />
              ))}
            </SettingsGroup>
          ))}
          {privacyLinks.length > 0 || privacyUrl ? (
            <SettingsGroup label={t("Privacy policies")}>
              {privacyLinks.map(({ name, url }) => (
                <SettingsRow
                  key={JSON.stringify([name, url])}
                  title={name}
                  accessibilityRole="link"
                  chevron="right"
                  onPress={() => void Linking.openURL(url)}
                />
              ))}
              {privacyUrl ? (
                <SettingsRow
                  title="Sydney"
                  accessibilityRole="link"
                  chevron="right"
                  onPress={() => void Linking.openURL(privacyUrl)}
                />
              ) : null}
            </SettingsGroup>
          ) : null}
          <SettingsGroup>
            <SettingsRow
              accessibilityRole="button"
              destructive
              dimmed={pending}
              disabled={pending}
              onPress={requestWithdrawal}
              title={t("Withdraw all permissions")}
            />
          </SettingsGroup>
        </>
      )}
    </ScrollView>
  );
}

function createStyles(
  _tokens?: ColorTokens,
  colors: NativeColors = native,
  scope: ResolvedScopedTheme | null = null,
) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: scope?.background ? "transparent" : colors.groupedPage },
    container: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 28 },
    compactContainer: { paddingHorizontal: 8 },
  });
}
