import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import {
  APP_BACKGROUND_PALETTES,
  chooseAppBackground,
  DEFAULT_APP_BACKGROUND,
  updateAppBackground,
  useAppBackground,
} from "../lib/app-background";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { MotionPressable } from "./motion-pressable";
import { NativeSegmentedControl } from "./native-segmented-control";
import { SettingsGroup, SettingsRow } from "./settings-group";

export function AppBackgroundSettings() {
  const { locale } = useI18n();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const background = useAppBackground();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = (cn: string, tw: string, en: string) =>
    locale.startsWith("zh") ? (locale === "zh-TW" ? tw : cn) : en;
  const paletteNames = {
    porcelain: copy("暖瓷", "暖瓷", "Porcelain"),
    mint: copy("薄荷", "薄荷", "Mint"),
    lavender: copy("淡紫", "淡紫", "Lavender"),
    ocean: copy("浅海", "淺海", "Ocean"),
  };
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(
        copy(
          "背景未能保存，请重试。",
          "背景未能儲存，請重試。",
          "Could not save the background. Try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const imageControls = [
    {
      key: "opacity" as const,
      label: copy("图片透明度", "圖片透明度", "Image transparency"),
      value: Math.round((1 - background.opacity) * 100),
      levels: [0, 25, 50, 75],
    },
    {
      key: "overlayOpacity" as const,
      label: copy("遮罩强度", "遮罩強度", "Overlay strength"),
      value: Math.round(background.overlayOpacity * 100),
      levels: [0, 20, 35, 60, 80],
    },
  ];
  return (
    <View style={{ gap: 12 }} testID="app-background-settings">
      <SettingsGroup
        label={copy("全局 App 背景", "全域 App 背景", "App background")}
        footer={copy(
          "应用到首页、聊天、项目和设置。底色随明暗模式适配；单独设置的聊天背景优先。图片仅保存在本机。",
          "套用至首頁、聊天、專案與設定。底色隨明暗模式適配；單獨設定的聊天背景優先。圖片僅儲存在本機。",
          "Applies to Home, chats, projects, and settings. Colors adapt to light and dark mode. Custom chat backgrounds take priority. Images stay on this device.",
        )}
      >
        <View style={{ padding: 16, gap: 14 }}>
          <View
            testID="app-background-preview"
            accessibilityLabel={copy("全局背景预览", "全域背景預覽", "App background preview")}
            style={{
              height: 150,
              borderRadius: 14,
              overflow: "hidden",
              backgroundColor: tokens.background,
              justifyContent: "center",
              padding: 20,
              gap: 10,
            }}
          >
            {background.imageUri ? (
              <>
                <Image
                  source={{ uri: background.imageUri }}
                  resizeMode={background.fit}
                  accessible={false}
                  style={[StyleSheet.absoluteFill, { opacity: background.opacity }]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      backgroundColor: appearance === "dark" ? "#000000" : "#FFFFFF",
                      opacity: background.overlayOpacity,
                    },
                  ]}
                />
              </>
            ) : null}
            <Text style={{ color: tokens.foreground, fontSize: 17, fontWeight: "600" }}>
              Sydney
            </Text>
            <View style={{ backgroundColor: tokens.card, padding: 12, borderRadius: 12 }}>
              <Text style={{ color: tokens.foreground }}>
                {copy("你的 App，你的背景", "你的 App，你的背景", "Your app, your background")}
              </Text>
            </View>
          </View>
          <Text style={{ color: tokens.foreground, fontWeight: "600" }}>
            {copy("背景底色", "背景底色", "Background color")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(
              [null, ...Object.keys(APP_BACKGROUND_PALETTES)] as Array<
                keyof typeof APP_BACKGROUND_PALETTES | null
              >
            ).map((palette) => {
              const selected = palette === background.palette;
              const label = palette
                ? paletteNames[palette]
                : copy("跟随主题", "跟隨主題", "Theme default");
              return (
                <MotionPressable
                  key={palette ?? "default"}
                  preset="control"
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected, disabled: busy }}
                  onPress={() => void run(() => updateAppBackground({ palette }))}
                  style={{
                    minHeight: 44,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? tokens.primary : tokens.border,
                    backgroundColor: tokens.card,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      borderWidth: 1,
                      borderColor: tokens.border,
                      backgroundColor: palette
                        ? APP_BACKGROUND_PALETTES[palette][appearance]
                        : tokens.muted,
                    }}
                  />
                  <Text style={{ color: tokens.foreground }}>{label}</Text>
                </MotionPressable>
              );
            })}
          </View>
        </View>
        <SettingsRow
          title={
            background.imageUri
              ? copy("更换背景图片", "更換背景圖片", "Replace background image")
              : copy("从相册选择背景", "從相簿選擇背景", "Choose background photo")
          }
          value={busy ? copy("保存中…", "儲存中…", "Saving…") : undefined}
          disabled={busy}
          accessibilityRole="button"
          onPress={() => void run(chooseAppBackground)}
        />
        {background.imageUri ? (
          <SettingsRow
            title={copy("移除背景图片", "移除背景圖片", "Remove background image")}
            disabled={busy}
            accessibilityRole="button"
            onPress={() => void run(() => updateAppBackground({ imageUri: null }))}
          />
        ) : null}
      </SettingsGroup>
      {background.imageUri ? (
        <SettingsGroup label={copy("图片显示", "圖片顯示", "Image display")}>
          <View style={{ padding: 16, gap: 14 }}>
            <NativeSegmentedControl
              accessibilityLabel={copy("显示方式", "顯示方式", "Display mode")}
              disabled={busy}
              value={background.fit}
              options={[
                { value: "cover", label: copy("填满屏幕", "填滿螢幕", "Fill") },
                { value: "contain", label: copy("完整显示", "完整顯示", "Fit") },
              ]}
              onChange={(fit) => void run(() => updateAppBackground({ fit }))}
            />
            {imageControls.map((control) => (
              <View key={control.key} style={{ gap: 8 }}>
                <Text style={{ color: tokens.foreground }}>
                  {control.label} · {control.value}%
                </Text>
                <NativeSegmentedControl
                  accessibilityLabel={control.label}
                  disabled={busy}
                  value={String(control.value)}
                  options={control.levels.map((level) => ({
                    value: String(level),
                    label: `${level}%`,
                  }))}
                  onChange={(value) =>
                    void run(() =>
                      updateAppBackground({
                        [control.key]:
                          control.key === "opacity" ? 1 - Number(value) / 100 : Number(value) / 100,
                      }),
                    )
                  }
                />
              </View>
            ))}
          </View>
        </SettingsGroup>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
          {error}
        </Text>
      ) : null}
      <SettingsGroup>
        <SettingsRow
          title={copy("恢复默认 App 背景", "恢復預設 App 背景", "Reset app background")}
          disabled={busy || (!background.palette && !background.imageUri)}
          accessibilityRole="button"
          onPress={() => void run(() => updateAppBackground(DEFAULT_APP_BACKGROUND))}
        />
      </SettingsGroup>
    </View>
  );
}
