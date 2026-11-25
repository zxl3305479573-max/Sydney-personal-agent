import type { ColorTokens } from "@rakazo/ui-tokens";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
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
  useSavedMobileChatAppearance,
} from "../../lib/chat-appearance";
import { useI18n } from "../../lib/i18n";
import type { NativeColors } from "../../lib/native";
import { native, useMobileTokens, useThemedStyles } from "../../lib/native";
import type { ResolvedScopedTheme } from "../../lib/theme-pack";

type AppearanceState = ReturnType<typeof getMobileChatAppearance>;
type BubbleValue = NonNullable<AppearanceState["bubble"]>;

function matchesBubblePreset(current: AppearanceState["bubble"], candidate: BubbleValue): boolean {
  if (!current) return false;
  return (
    current.userBackground === candidate.userBackground &&
    current.userForeground === candidate.userForeground &&
    current.botBackground === candidate.botBackground &&
    current.botForeground === candidate.botForeground &&
    current.radius === candidate.radius &&
    Math.abs(current.opacity - candidate.opacity) < 0.005
  );
}

export default function ChatAppearanceScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const tokens = useMobileTokens();
  const styles = useThemedStyles(createStyles);
  const stacked = useStackedSettings();
  const appearance = useSavedMobileChatAppearance();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<AppearanceState> | null>(null);

  useFocusEffect(
    useCallback(() => {
      void getMobileChatAppearance();
    }, []),
  );

  const live: AppearanceState = draft ? { ...appearance, ...draft } : appearance;
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const previewBubble = live.bubble ?? MOBILE_BUBBLE_PRESETS[0]!.value;

  async function pickBackground() {
    setBusy(true);
    try {
      await chooseMobileChatBackground();
      setDraft(null);
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
      setDraft(null);
    } catch {
      Alert.alert(t("Could not save"), t("The image could not be removed."));
    } finally {
      setBusy(false);
    }
  }

  async function savePatch(next: AppearanceState) {
    setBusy(true);
    try {
      await saveMobileChatAppearance(next);
    } catch {
      Alert.alert(t("Could not save"));
    } finally {
      setDraft(null);
      setBusy(false);
    }
  }

  async function saveBubble(bubble: AppearanceState["bubble"]) {
    await savePatch({ ...getMobileChatAppearance(), bubble });
  }

  async function updateBackground(
    update: Partial<
      Pick<AppearanceState, "backgroundFit" | "backgroundOpacity" | "overlayOpacity">
    >,
  ) {
    await savePatch({ ...getMobileChatAppearance(), ...update });
  }

  const commitBackgroundPercent = (
    field: "backgroundOpacity" | "overlayOpacity",
    percent: number,
  ) => {
    const clamped =
      field === "overlayOpacity"
        ? Math.max(0, Math.min(80, Math.round(percent)))
        : Math.max(0, Math.min(100, Math.round(percent)));
    const nextValue =
      field === "backgroundOpacity"
        ? Math.round((1 - clamped / 100) * 100) / 100
        : Math.round((clamped / 100) * 100) / 100;
    void updateBackground({ [field]: nextValue });
  };

  const previewBackgroundPercent = (
    field: "backgroundOpacity" | "overlayOpacity",
    percent: number,
  ) => {
    const clamped =
      field === "overlayOpacity"
        ? Math.max(0, Math.min(80, Math.round(percent)))
        : Math.max(0, Math.min(100, Math.round(percent)));
    const nextValue =
      field === "backgroundOpacity"
        ? Math.round((1 - clamped / 100) * 100) / 100
        : Math.round((clamped / 100) * 100) / 100;
    setDraft((prev) => ({ ...prev, [field]: nextValue }));
  };

  const commitBubbleControl = (field: "radius" | "opacity", controlValue: number) => {
    const base = getMobileChatAppearance().bubble ?? MOBILE_BUBBLE_PRESETS[0]!.value;
    const nextBubble: BubbleValue =
      field === "radius"
        ? { ...base, radius: Math.max(0, Math.min(40, Math.round(controlValue))) }
        : {
            ...base,
            opacity:
              Math.round((1 - Math.max(0, Math.min(100, Math.round(controlValue))) / 100) * 100) /
              100,
          };
    void saveBubble(nextBubble);
  };

  const previewBubbleControl = (field: "radius" | "opacity", controlValue: number) => {
    const base = live.bubble ?? MOBILE_BUBBLE_PRESETS[0]!.value;
    const nextBubble: BubbleValue =
      field === "radius"
        ? { ...base, radius: Math.max(0, Math.min(40, Math.round(controlValue))) }
        : {
            ...base,
            opacity:
              Math.round((1 - Math.max(0, Math.min(100, Math.round(controlValue))) / 100) * 100) /
              100,
          };
    setDraft((prev) => ({ ...prev, bubble: nextBubble }));
  };

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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SettingsGroup label={chinese ? (traditional ? "即時預覽" : "实时预览") : "Live preview"}>
        <View style={styles.preview}>
          <View
            testID="chat-appearance-live-preview"
            style={[styles.previewFrame, { backgroundColor: tokens.background ?? tokens.card }]}
          >
            {live.backgroundUri ? (
              <Image
                source={{ uri: live.backgroundUri }}
                resizeMode={live.backgroundFit}
                style={[styles.previewImage, { opacity: live.backgroundOpacity }]}
              />
            ) : null}
            {live.backgroundUri ? (
              <View
                pointerEvents="none"
                style={[styles.previewOverlay, { opacity: live.overlayOpacity }]}
              />
            ) : null}
            <View style={styles.liveTranscript}>
              <View
                style={[
                  styles.previewBubble,
                  mobileBubbleSurfaceStyle({ ...live, bubble: previewBubble }, "bot", {
                    backgroundColor: previewBubble.botBackground,
                  }),
                  { alignSelf: "flex-start" },
                ]}
              >
                <Text style={{ color: previewBubble.botForeground }}>
                  {chinese ? (traditional ? "機器人訊息" : "机器人消息") : "Bot message"}
                </Text>
              </View>
              <View
                style={[
                  styles.previewBubble,
                  mobileBubbleSurfaceStyle({ ...live, bubble: previewBubble }, "user", {
                    backgroundColor: previewBubble.userBackground,
                  }),
                  { alignSelf: "flex-end" },
                ]}
              >
                <Text style={{ color: previewBubble.userForeground }}>
                  {chinese ? (traditional ? "我傳送的訊息" : "我发送的消息") : "Your message"}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </SettingsGroup>

      <SettingsGroup label={t("Chat appearance")}>
        <SettingsRow
          title={t("Chat background")}
          detail={
            live.backgroundUri
              ? t("A custom background is active.")
              : t("Use the default background.")
          }
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void pickBackground()}
          value={live.backgroundUri ? t("Change") : t("Add")}
          chevron="right"
        />
        {live.backgroundUri ? (
          <>
            <SettingsRow
              title={chinese ? (traditional ? "顯示方式" : "显示方式") : "Display mode"}
              value={
                live.backgroundFit === "cover"
                  ? chinese
                    ? traditional
                      ? "填滿"
                      : "填满"
                    : "Fill"
                  : chinese
                    ? traditional
                      ? "完整顯示"
                      : "完整显示"
                    : "Fit"
              }
              accessibilityRole="button"
              disabled={busy}
              onPress={() =>
                void updateBackground({
                  backgroundFit: live.backgroundFit === "cover" ? "contain" : "cover",
                })
              }
            />
            <SliderControl
              label={
                chinese ? (traditional ? "背景透明度" : "背景透明度") : "Background transparency"
              }
              value={Math.round((1 - live.backgroundOpacity) * 100)}
              max={100}
              disabled={busy}
              onPreview={(next) => previewBackgroundPercent("backgroundOpacity", next)}
              onCommit={(next) => commitBackgroundPercent("backgroundOpacity", next)}
              onDecrease={() => adjust("backgroundOpacity", 0.1, 1)}
              onIncrease={() => adjust("backgroundOpacity", -0.1, 1)}
              chinese={chinese}
            />
            <SliderControl
              label={chinese ? (traditional ? "暗色遮罩" : "暗色遮罩") : "Dark overlay"}
              value={Math.round(live.overlayOpacity * 100)}
              max={80}
              disabled={busy}
              onPreview={(next) => previewBackgroundPercent("overlayOpacity", next)}
              onCommit={(next) => commitBackgroundPercent("overlayOpacity", next)}
              onDecrease={() => adjust("overlayOpacity", -0.1, 0.8)}
              onIncrease={() => adjust("overlayOpacity", 0.1, 0.8)}
              chinese={chinese}
            />
            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
              <NativeActionButton
                label={t("Remove background")}
                disabled={busy}
                onPress={() => void clearBackground()}
                prominence="destructive"
                fill={false}
              />
            </View>
          </>
        ) : null}
        <SettingsRow
          title={t("Bubble style")}
          detail={
            live.bubble ? t("A custom bubble style is active.") : t("Use the default bubbles.")
          }
          value={live.bubble ? t("Custom") : t("Default")}
        />
      </SettingsGroup>

      <SettingsGroup label={t("Bubble presets")}>
        {MOBILE_BUBBLE_PRESETS.map((preset) => {
          const selected = matchesBubblePreset(live.bubble, preset.value);
          return (
            <SettingsRow
              key={preset.name}
              title={preset.name}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              value={selected ? "✓" : undefined}
              disabled={busy}
              onPress={() => void saveBubble(preset.value)}
              trailing={
                <View style={[styles.swatches, stacked && styles.stackedSwatches]}>
                  <View style={[styles.swatch, { backgroundColor: preset.value.userBackground }]} />
                  <View style={[styles.swatch, { backgroundColor: preset.value.botBackground }]} />
                </View>
              }
            />
          );
        })}
        <SettingsRow
          title={t("Default bubbles")}
          accessibilityRole="button"
          accessibilityState={{ selected: live.bubble === null }}
          value={live.bubble === null ? "✓" : undefined}
          disabled={busy}
          onPress={() => void saveBubble(null)}
        />
      </SettingsGroup>

      <SettingsGroup
        label={chinese ? (traditional ? "氣泡調整" : "气泡调整") : "Bubble adjustments"}
      >
        <SliderControl
          label={chinese ? (traditional ? "氣泡圓角" : "气泡圆角") : "Bubble radius"}
          value={previewBubble.radius}
          max={40}
          unit="px"
          disabled={busy}
          onPreview={(next) => previewBubbleControl("radius", next)}
          onCommit={(next) => commitBubbleControl("radius", next)}
          onDecrease={() => adjustBubble("radius", -2, 40)}
          onIncrease={() => adjustBubble("radius", 2, 40)}
          chinese={chinese}
        />
        <SliderControl
          label={chinese ? (traditional ? "氣泡透明度" : "气泡透明度") : "Bubble transparency"}
          value={Math.round((1 - previewBubble.opacity) * 100)}
          max={100}
          disabled={busy}
          onPreview={(next) => previewBubbleControl("opacity", next)}
          onCommit={(next) => commitBubbleControl("opacity", next)}
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

function SliderControl({
  label,
  value,
  max,
  unit = "%",
  disabled,
  onPreview,
  onCommit,
  onDecrease,
  onIncrease,
  chinese,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  disabled: boolean;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
  onDecrease: () => void;
  onIncrease: () => void;
  chinese: boolean;
}) {
  const tokens = useMobileTokens();
  const trackWidth = useRef(0);
  const lastValue = useRef(value);
  lastValue.current = value;

  const valueFromLocation = (locationX: number) => {
    if (trackWidth.current <= 0) return lastValue.current;
    const ratio = Math.max(0, Math.min(1, locationX / trackWidth.current));
    return Math.round(ratio * max);
  };

  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: tokens.foreground, fontSize: 15 }}>{label}</Text>
        <Text
          style={{
            color: tokens.mutedForeground ?? tokens.foreground,
            fontSize: 14,
            fontVariant: ["tabular-nums"],
          }}
        >
          {value}
          {unit}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${chinese ? "降低" : "Decrease "}${label}`}
          disabled={disabled || value <= 0}
          onPress={onDecrease}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            borderWidth: 1,
            borderColor: tokens.border,
            alignItems: "center",
            justifyContent: "center",
            opacity: disabled || value <= 0 ? 0.4 : 1,
          }}
        >
          <Text style={{ color: tokens.foreground, fontSize: 20, lineHeight: 22 }}>−</Text>
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
          onLayout={(event) => {
            trackWidth.current = event.nativeEvent.layout.width;
          }}
          onStartShouldSetResponder={() => !disabled}
          onMoveShouldSetResponder={() => !disabled}
          onResponderGrant={(event) => {
            const next = valueFromLocation(event.nativeEvent.locationX);
            lastValue.current = next;
            onPreview(next);
          }}
          onResponderMove={(event) => {
            const next = valueFromLocation(event.nativeEvent.locationX);
            lastValue.current = next;
            onPreview(next);
          }}
          onResponderRelease={() => {
            onCommit(lastValue.current);
          }}
          onResponderTerminate={() => {
            onCommit(lastValue.current);
          }}
          style={{
            flex: 1,
            height: 36,
            justifyContent: "center",
          }}
        >
          <View style={{ height: 6, borderRadius: 3, backgroundColor: tokens.border }}>
            <View
              style={{
                width: `${ratio * 100}%`,
                height: 6,
                borderRadius: 3,
                backgroundColor: tokens.primary ?? tokens.foreground,
              }}
            />
          </View>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: `${ratio * 100}%`,
              marginLeft: -9,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: tokens.card ?? "#ffffff",
              borderWidth: 2,
              borderColor: tokens.primary ?? tokens.foreground,
            }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${chinese ? "提高" : "Increase "}${label}`}
          disabled={disabled || value >= max}
          onPress={onIncrease}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            borderWidth: 1,
            borderColor: tokens.border,
            alignItems: "center",
            justifyContent: "center",
            opacity: disabled || value >= max ? 0.4 : 1,
          }}
        >
          <Text style={{ color: tokens.foreground, fontSize: 20, lineHeight: 22 }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(
  tokens: ColorTokens = mobileTokens(),
  colors: NativeColors = native,
  scope: ResolvedScopedTheme | null = null,
) {
  return {
    screen: { flex: 1, backgroundColor: scope?.background ? "transparent" : colors.groupedPage },
    content: { padding: 16, gap: 20, paddingBottom: 40 },
    preview: { padding: 14, backgroundColor: tokens.card },
    previewFrame: { overflow: "hidden" as const, borderRadius: 14, minHeight: 164 },
    previewImage: {
      position: "absolute" as const,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: "100%" as const,
      height: "100%" as const,
    },
    previewOverlay: {
      position: "absolute" as const,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: "#000",
    },
    liveTranscript: { padding: 16, gap: 12, justifyContent: "center" as const, minHeight: 164 },
    previewBubble: { maxWidth: "85%" as const, paddingHorizontal: 14, paddingVertical: 9 },
    swatches: { flexDirection: "row" as const, gap: 6 },
    stackedSwatches: { marginTop: 8 },
    swatch: { width: 28, height: 28, borderRadius: 14 },
    note: { fontSize: 13, lineHeight: 18 },
  };
}
