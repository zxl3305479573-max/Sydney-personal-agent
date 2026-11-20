import { useFocusEffect } from "expo-router";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Alert, Platform, ScrollView, Text, View } from "react-native";
import { NativeActionButton } from "../../components/native-action-button";
import { SettingsGroup, SettingsRow } from "../../components/settings-group";
import { useI18n } from "../../lib/i18n";
import { native, useMobileTokens } from "../../lib/native";
import { useSideInsets } from "../../lib/side-insets";
import {
  beginUiModePreview,
  cancelUiModePreview,
  commitUiModePreview,
  getUiModeRevision,
  getUiModeSnapshot,
  resetUiModeToClassic,
  subscribeUiMode,
} from "../../lib/ui-mode";
import { listAvailableUiModes } from "../../lib/ui-mode-registry";

export default function UiModeScreen() {
  const { locale } = useI18n();
  const tokens = useMobileTokens();
  const insets = useSideInsets();
  const [busy, setBusy] = useState(false);
  useSyncExternalStore(subscribeUiMode, getUiModeRevision, getUiModeRevision);
  const snapshot = getUiModeSnapshot();
  const modes = listAvailableUiModes(Platform.OS);
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const labels = chinese
    ? {
        title: traditional ? "介面模式" : "界面模式",
        classic: traditional ? "經典" : "经典",
        classicDetail: traditional
          ? "原生外觀，沿用明暗與聊天偏好。"
          : "原生外观，沿用明暗与聊天偏好。",
        midnight: "午夜",
        midnightDetail: traditional
          ? "深藍底色與柔和藍色重點，使用深色外觀。"
          : "深蓝底色与柔和蓝色重点，使用深色外观。",
        preview: traditional ? "預覽中" : "预览中",
        active: traditional ? "已套用" : "已应用",
        apply: traditional ? "套用模式" : "应用模式",
        cancel: traditional ? "取消預覽" : "取消预览",
        reset: traditional ? "恢復經典模式" : "恢复经典模式",
        hint: traditional
          ? "點選模式即可預覽；套用後會保留選擇。取消或離開本頁會還原預覽。聊天背景與氣泡設定會保留。"
          : "点选模式即可预览；应用后会保留选择。取消或离开本页会还原预览。聊天背景与气泡设置会保留。",
        error: traditional ? "無法套用模式，請重試。" : "无法应用模式，请重试。",
      }
    : {
        title: "Interface mode",
        classic: "Classic",
        classicDetail: "Native appearance with your light, dark and chat preferences.",
        midnight: "Midnight",
        midnightDetail: "Deep blue surfaces with a soft blue accent. Uses dark appearance.",
        preview: "Previewing",
        active: "Applied",
        apply: "Apply mode",
        cancel: "Cancel preview",
        reset: "Restore Classic",
        hint: "Tap a mode to preview it, then apply to keep your choice. Cancel or leave this page to undo the preview. Chat backgrounds and bubble settings are kept.",
        error: "Could not apply the mode. Please try again.",
      };

  useFocusEffect(
    useCallback(() => {
      return () => {
        cancelUiModePreview();
      };
    }, []),
  );

  async function save(action: typeof commitUiModePreview) {
    setBusy(true);
    try {
      await action();
    } catch {
      Alert.alert(labels.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: native.groupedPage }, insets]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 24 }}
    >
      <SettingsGroup label={labels.title} footer={labels.hint}>
        {modes.map((mode) => (
          <SettingsRow
            key={mode.id}
            title={
              mode.id === "classic"
                ? labels.classic
                : mode.id === "midnight"
                  ? labels.midnight
                  : mode.name
            }
            detail={
              mode.id === "classic"
                ? labels.classicDetail
                : mode.id === "midnight"
                  ? labels.midnightDetail
                  : mode.description
            }
            value={
              snapshot.previewModeId === mode.id
                ? labels.preview
                : snapshot.savedModeId === mode.id
                  ? labels.active
                  : undefined
            }
            accessibilityRole="radio"
            accessibilityState={{ checked: snapshot.activeModeId === mode.id }}
            disabled={busy || !snapshot.hydrated}
            onPress={() => beginUiModePreview(mode.id)}
            leading={
              <View
                accessibilityElementsHidden
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  marginRight: 12,
                  borderWidth: 2,
                  borderColor: mode.previewBadge?.accentColor ?? tokens.border,
                  backgroundColor: mode.previewBadge?.backgroundColor ?? tokens.background,
                }}
              />
            }
          />
        ))}
      </SettingsGroup>
      {snapshot.previewModeId !== null ? (
        <View style={{ gap: 12 }}>
          <Text accessibilityLiveRegion="polite" style={{ color: tokens.mutedForeground }}>
            {labels.preview}
          </Text>
          <NativeActionButton
            label={labels.apply}
            busy={busy}
            onPress={() => void save(commitUiModePreview)}
          />
          <NativeActionButton
            label={labels.cancel}
            prominence="secondary"
            disabled={busy}
            onPress={() => cancelUiModePreview()}
          />
        </View>
      ) : null}
      <NativeActionButton
        label={labels.reset}
        prominence="secondary"
        disabled={
          busy ||
          !snapshot.hydrated ||
          (snapshot.activeModeId === "classic" &&
            snapshot.savedModeId === "classic" &&
            snapshot.previewModeId === null)
        }
        onPress={() => void save(resetUiModeToClassic)}
      />
    </ScrollView>
  );
}
