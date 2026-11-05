import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Image, ScrollView, Text, View } from "react-native";
import { NativeActionButton } from "../../components/native-action-button";
import { SettingsGroup, SettingsRow, useStackedSettings } from "../../components/settings-group";
import { mobileTokens } from "../../lib/appearance";
import {
  chooseMobileChatBackground,
  clearMobileChatBackground,
  getMobileChatAppearance,
  MOBILE_BUBBLE_PRESETS,
  saveMobileChatAppearance,
  useMobileChatAppearance,
} from "../../lib/chat-appearance";
import { useI18n } from "../../lib/i18n";
import { useThemedStyles } from "../../lib/native";

export default function ChatAppearanceScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const tokens = mobileTokens();
  const styles = useThemedStyles(createStyles);
  const stacked = useStackedSettings();
  const appearance = useMobileChatAppearance();
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void getMobileChatAppearance();
    }, []),
  );

  async function pickBackground() {
    setBusy(true);
    try {
      await chooseMobileChatBackground();
    } catch {
      Alert.alert(t("Could not save"), t("The image could not be saved on this device."));
    } finally {
      setBusy(false);
    }
  }

  async function clearBackground() {
    setBusy(true);
    try {
      await clearMobileChatBackground();
    } catch {
      Alert.alert(t("Could not save"), t("The image could not be removed."));
    } finally {
      setBusy(false);
    }
  }

  async function saveBubble(bubble: typeof appearance.bubble) {
    setBusy(true);
    try {
      await saveMobileChatAppearance({ ...appearance, bubble });
    } catch {
      Alert.alert(t("Could not save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SettingsGroup label={t("Chat appearance")}>
        <SettingsRow
          title={t("Chat background")}
          detail={
            appearance.backgroundUri
              ? t("A custom background is active.")
              : t("Use the default background.")
          }
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void pickBackground()}
          value={appearance.backgroundUri ? t("Change") : t("Add")}
          chevron="right"
        />
        {appearance.backgroundUri ? (
          <View style={styles.preview}>
            <Image source={{ uri: appearance.backgroundUri }} style={styles.previewImage} />
            <NativeActionButton
              label={t("Remove background")}
              disabled={busy}
              onPress={() => void clearBackground()}
              prominence="destructive"
              fill={false}
            />
          </View>
        ) : null}
        <SettingsRow
          title={t("Bubble style")}
          detail={
            appearance.bubble
              ? t("A custom bubble style is active.")
              : t("Use the default bubbles.")
          }
          value={appearance.bubble ? t("Custom") : t("Default")}
        />
      </SettingsGroup>

      <SettingsGroup label={t("Bubble presets")}>
        {MOBILE_BUBBLE_PRESETS.map((preset) => (
          <SettingsRow
            key={preset.name}
            title={preset.name}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void saveBubble(preset.value)}
            trailing={
              <View style={[styles.swatches, stacked && styles.stackedSwatches]}>
                <View style={[styles.swatch, { backgroundColor: preset.value.userBackground }]} />
                <View style={[styles.swatch, { backgroundColor: preset.value.botBackground }]} />
              </View>
            }
          />
        ))}
        <SettingsRow
          title={t("Default bubbles")}
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void saveBubble(null)}
        />
      </SettingsGroup>

      <Text style={[styles.note, { color: tokens.mutedForeground }]}>
        {t("Chat appearance is saved on this device and is not uploaded.")}
      </Text>
      <NativeActionButton label={t("Done")} onPress={() => router.back()} />
    </ScrollView>
  );
}

function createStyles() {
  const tokens = mobileTokens();
  return {
    content: { padding: 16, gap: 20, paddingBottom: 40 },
    preview: { padding: 16, gap: 12, backgroundColor: tokens.card },
    previewImage: { width: "100%" as const, height: 140, borderRadius: 12 },
    swatches: { flexDirection: "row" as const, gap: 6 },
    stackedSwatches: { marginTop: 8 },
    swatch: { width: 28, height: 28, borderRadius: 14 },
    note: { fontSize: 13, lineHeight: 18 },
  };
}
