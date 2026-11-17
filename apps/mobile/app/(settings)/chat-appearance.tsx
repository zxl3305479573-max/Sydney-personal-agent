import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { NativeActionButton } from "../../components/native-action-button";
import { SettingsGroup, SettingsRow, useStackedSettings } from "../../components/settings-group";
import { mobileTokens } from "../../lib/appearance";
import {
  chooseMobileChatBackground,
  clearMobileChatBackground,
  getMobileChatAppearance,
  MOBILE_BUBBLE_PRESETS,
  mobileBubbleSurfaceStyle,
  saveMobileChatAppearance,
  useMobileChatAppearance,
} from "../../lib/chat-appearance";
import { useI18n } from "../../lib/i18n";
import { useThemedStyles } from "../../lib/native";

export default function ChatAppearanceScreen() {
  const { t, locale } = useI18n();
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
      await saveMobileChatAppearance({ ...getMobileChatAppearance(), bubble });
    } catch {
      Alert.alert(t("Could not save"));
    } finally {
      setBusy(false);
    }
  }

  async function updateBackground(
    update: Partial<
      Pick<typeof appearance, "backgroundFit" | "backgroundOpacity" | "overlayOpacity">
    >,
  ) {
    setBusy(true);
    try {
      await saveMobileChatAppearance({ ...getMobileChatAppearance(), ...update });
    } catch {
      Alert.alert(t("Could not save"));
    } finally {
      setBusy(false);
    }
  }

  const chinese = locale === "zh-CN";
  const previewBubble = appearance.bubble ?? MOBILE_BUBBLE_PRESETS[0]!.value;
  const adjustBubble = (field: "radius" | "opacity", amount: number, max: number) => {
    const current = getMobileChatAppearance().bubble ?? MOBILE_BUBBLE_PRESETS[0]!.value;
    void saveBubble({
      ...current,
      [field]: Math.max(0, Math.min(max, Math.round((current[field] + amount) * 100) / 100)),
    });
  };
  const adjust = (field: "backgroundOpacity" | "overlayOpacity", amount: number, max: number) => {
    const current = getMobileChatAppearance()[field];
    void updateBackground({
      [field]: Math.max(0, Math.min(max, Math.round((current + amount) * 100) / 100)),
    });
  };

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
            <View style={styles.previewFrame}>
              <Image
                source={{ uri: appearance.backgroundUri }}
                resizeMode={appearance.backgroundFit}
                style={[styles.previewImage, { opacity: appearance.backgroundOpacity }]}
              />
              <View
                pointerEvents="none"
                style={[styles.previewOverlay, { opacity: appearance.overlayOpacity }]}
              />
            </View>
            <NativeActionButton
              label={t("Remove background")}
              disabled={busy}
              onPress={() => void clearBackground()}
              prominence="destructive"
              fill={false}
            />
          </View>
        ) : null}
        {appearance.backgroundUri ? (
          <>
            <SettingsRow
              title={chinese ? "显示方式" : "Display mode"}
              value={
                appearance.backgroundFit === "cover"
                  ? chinese
                    ? "填满"
                    : "Fill"
                  : chinese
                    ? "完整显示"
                    : "Fit"
              }
              accessibilityRole="button"
              disabled={busy}
              onPress={() =>
                void updateBackground({
                  backgroundFit: appearance.backgroundFit === "cover" ? "contain" : "cover",
                })
              }
            />
            <OpacityControl
              label={chinese ? "背景透明度" : "Background transparency"}
              value={Math.round((1 - appearance.backgroundOpacity) * 100)}
              max={100}
              disabled={busy}
              onDecrease={() => adjust("backgroundOpacity", 0.1, 1)}
              onIncrease={() => adjust("backgroundOpacity", -0.1, 1)}
              chinese={chinese}
            />
            <OpacityControl
              label={chinese ? "暗色遮罩" : "Dark overlay"}
              value={Math.round(appearance.overlayOpacity * 100)}
              max={80}
              disabled={busy}
              onDecrease={() => adjust("overlayOpacity", -0.1, 0.8)}
              onIncrease={() => adjust("overlayOpacity", 0.1, 0.8)}
              chinese={chinese}
            />
          </>
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

      <SettingsGroup label={chinese ? "气泡调整" : "Bubble adjustments"}>
        <View style={styles.bubblePreview}>
          <View
            style={[
              styles.previewBubble,
              mobileBubbleSurfaceStyle({ ...appearance, bubble: previewBubble }, "bot", {
                backgroundColor: previewBubble.botBackground,
              }),
              { alignSelf: "flex-start" },
            ]}
          >
            <Text style={{ color: previewBubble.botForeground }}>
              {chinese ? "机器人消息" : "Bot message"}
            </Text>
          </View>
          <View
            style={[
              styles.previewBubble,
              mobileBubbleSurfaceStyle({ ...appearance, bubble: previewBubble }, "user", {
                backgroundColor: previewBubble.userBackground,
              }),
              { alignSelf: "flex-end" },
            ]}
          >
            <Text style={{ color: previewBubble.userForeground }}>
              {chinese ? "我发送的消息" : "Your message"}
            </Text>
          </View>
        </View>
        <OpacityControl
          label={chinese ? "气泡圆角" : "Bubble radius"}
          value={previewBubble.radius}
          max={40}
          unit="px"
          disabled={busy}
          onDecrease={() => adjustBubble("radius", -2, 40)}
          onIncrease={() => adjustBubble("radius", 2, 40)}
          chinese={chinese}
        />
        <OpacityControl
          label={chinese ? "气泡透明度" : "Bubble transparency"}
          value={Math.round((1 - previewBubble.opacity) * 100)}
          max={100}
          disabled={busy}
          onDecrease={() => adjustBubble("opacity", 0.1, 1)}
          onIncrease={() => adjustBubble("opacity", -0.1, 1)}
          chinese={chinese}
        />
      </SettingsGroup>

      <Text style={[styles.note, { color: tokens.mutedForeground }]}>
        {t("Chat appearance is saved on this device and is not uploaded.")}
      </Text>
      <NativeActionButton label={t("Done")} onPress={() => router.back()} />
    </ScrollView>
  );
}

function OpacityControl({
  label,
  value,
  max,
  unit = "%",
  disabled,
  onDecrease,
  onIncrease,
  chinese,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  disabled: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  chinese: boolean;
}) {
  const tokens = mobileTokens();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
      <Text style={{ color: tokens.foreground, fontSize: 15 }}>
        {label}：{value}
        {unit}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${chinese ? "降低" : "Decrease "}${label}`}
          disabled={disabled || value <= 0}
          onPress={onDecrease}
          style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: tokens.foreground, fontSize: 24 }}>−</Text>
        </Pressable>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min: 0, max, now: value, text: `${value}${unit}` }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => {
            if (disabled) return;
            if (event.nativeEvent.actionName === "increment" && value < max) onIncrease();
            if (event.nativeEvent.actionName === "decrement" && value > 0) onDecrease();
          }}
          style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: tokens.border }}
        >
          <View
            style={{
              width: `${(value / max) * 100}%`,
              height: 4,
              borderRadius: 2,
              backgroundColor: tokens.foreground,
            }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${chinese ? "提高" : "Increase "}${label}`}
          disabled={disabled || value >= max}
          onPress={onIncrease}
          style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: tokens.foreground, fontSize: 24 }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles() {
  const tokens = mobileTokens();
  return {
    content: { padding: 16, gap: 20, paddingBottom: 40 },
    preview: { padding: 16, gap: 12, backgroundColor: tokens.card },
    previewFrame: { overflow: "hidden" as const, borderRadius: 12 },
    previewImage: { width: "100%" as const, height: 140, borderRadius: 12 },
    previewOverlay: {
      position: "absolute" as const,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: "#000",
    },
    bubblePreview: { padding: 16, gap: 10 },
    previewBubble: { maxWidth: "85%" as const, paddingHorizontal: 14, paddingVertical: 9 },
    swatches: { flexDirection: "row" as const, gap: 6 },
    stackedSwatches: { marginTop: 8 },
    swatch: { width: 28, height: 28, borderRadius: 14 },
    note: { fontSize: 13, lineHeight: 18 },
  };
}
