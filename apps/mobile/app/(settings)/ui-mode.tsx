import { useFocusEffect } from "expo-router";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Alert, Platform, ScrollView, Text, View } from "react-native";
import { NativeActionButton } from "../../components/native-action-button";
import { SettingsGroup, SettingsRow } from "../../components/settings-group";
import { useI18n } from "../../lib/i18n";
import { native, useMobileTokens } from "../../lib/native";
import { useSideInsets } from "../../lib/side-insets";
import { effectiveThemeAssignments } from "../../lib/theme-manager";
import type { ThemeScope, ThemeTarget } from "../../lib/theme-pack";
import { THEME_SCOPES } from "../../lib/theme-pack";
import { themeManager } from "../../lib/theme-state";
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
  const themeSnapshot = useSyncExternalStore(
    themeManager.subscribe,
    themeManager.getSnapshot,
    themeManager.getSnapshot,
  );
  const snapshot = getUiModeSnapshot();
  const canRestoreClassic = snapshot.savedModeId !== "classic" || snapshot.previewModeId !== null;
  const modes = listAvailableUiModes(Platform.OS);
  const themeAssignments = effectiveThemeAssignments(themeSnapshot);
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
        themeManager.cancelPreview();
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

  async function importTheme() {
    try {
      const { pickThemePack } = await import("../../lib/theme-library");
      const pack = await pickThemePack();
      if (pack)
        if (themeSnapshot.packs.some((item) => item.id === pack.id)) {
          Alert.alert(
            chinese ? "替换主题包？" : "Replace theme pack?",
            chinese
              ? `已安装 ${pack.name}。替换后会更新现有主题文件。`
              : `${pack.name} is already installed. Replacing it updates the existing theme file.`,
            [
              { text: chinese ? "取消" : "Cancel", style: "cancel" },
              {
                text: chinese ? "替换" : "Replace",
                onPress: () =>
                  void themeManager
                    .install(pack, true)
                    .catch((error) =>
                      Alert.alert(error instanceof Error ? error.message : labels.error),
                    ),
              },
            ],
          );
        } else {
          await themeManager.install(pack);
        }
    } catch (error) {
      Alert.alert(error instanceof Error ? error.message : labels.error);
    }
  }

  function themeTargetLabel(target: ThemeTarget) {
    if (target === "all") return chinese ? "全部界面" : "All screens";
    const labelsByScope: Partial<Record<ThemeScope, string>> = {
      inbox: chinese ? "首页" : "Home",
      thread: chinese ? "单聊" : "Thread",
      groupThread: chinese ? "群聊" : "Group chat",
      projects: chinese ? "项目" : "Projects",
      projectThread: chinese ? "项目会话" : "Project chat",
      github: "GitHub",
      computer: chinese ? "电脑" : "Computer",
      settings: chinese ? "设置" : "Settings",
    };
    return labelsByScope[target] ?? target;
  }

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: native.groupedPage }, insets]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 24 }}
    >
      <SettingsGroup accessibilityLabel={labels.title} footer={labels.hint}>
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
      {canRestoreClassic ? (
        <NativeActionButton
          label={labels.reset}
          prominence="secondary"
          disabled={busy || !snapshot.hydrated}
          onPress={() => void save(resetUiModeToClassic)}
        />
      ) : null}
      <SettingsGroup
        label={chinese ? "主题包" : "Theme packs"}
        footer={
          themeSnapshot.warning ??
          (chinese
            ? "主题包只读取声明式颜色、布局和本地图片。"
            : "Theme packs use declarative colors, layouts and local images only.")
        }
      >
        <NativeActionButton
          label={chinese ? "导入主题包" : "Import theme pack"}
          onPress={() => void importTheme()}
        />
        {themeSnapshot.packs
          .filter((pack) => pack.id !== "classic" && pack.id !== "midnight")
          .map((pack) => (
            <View key={pack.id} style={{ gap: 8, paddingVertical: 8 }}>
              <Text style={{ color: tokens.foreground, fontWeight: "600" }}>
                {pack.name} · {pack.version}
              </Text>
              <Text style={{ color: tokens.mutedForeground }}>
                {pack.author} ·{" "}
                {pack.coverage === "all"
                  ? themeTargetLabel("all")
                  : pack.coverage.map(themeTargetLabel).join("、")}
              </Text>
              <View style={{ gap: 8 }}>
                {(["all", ...THEME_SCOPES] as ThemeTarget[])
                  .filter((target) =>
                    target === "all"
                      ? pack.coverage === "all"
                      : pack.coverage === "all" || pack.coverage.includes(target),
                  )
                  .map((target) => {
                    const active =
                      target === "all"
                        ? themeAssignments.globalPackId === pack.id
                        : themeAssignments.pages[target] === pack.id;
                    return (
                      <NativeActionButton
                        key={`${pack.id}-${target}`}
                        label={`${active ? (chinese ? "已应用" : "Applied") : chinese ? "应用" : "Apply"} · ${themeTargetLabel(target)}`}
                        prominence={active ? "primary" : "secondary"}
                        onPress={() => {
                          try {
                            themeManager.preview(target, pack.id);
                          } catch (error) {
                            Alert.alert(error instanceof Error ? error.message : labels.error);
                          }
                        }}
                      />
                    );
                  })}
                <NativeActionButton
                  label={chinese ? "卸载" : "Uninstall"}
                  prominence="secondary"
                  onPress={() =>
                    void themeManager
                      .uninstall(pack.id)
                      .catch((error) =>
                        Alert.alert(error instanceof Error ? error.message : labels.error),
                      )
                  }
                />
              </View>
            </View>
          ))}
      </SettingsGroup>
      {themeSnapshot.preview?.packId && themeSnapshot.preview.packId !== "classic" ? (
        <View style={{ gap: 12 }}>
          <Text accessibilityLiveRegion="polite" style={{ color: tokens.mutedForeground }}>
            {chinese
              ? `预览：${themeSnapshot.preview.packId} · ${themeTargetLabel(themeSnapshot.preview.target)}`
              : `Preview: ${themeSnapshot.preview.packId} · ${themeTargetLabel(themeSnapshot.preview.target)}`}
          </Text>
          <NativeActionButton
            label={chinese ? "应用主题预览" : "Apply theme preview"}
            onPress={() => void themeManager.commitPreview()}
          />
          <NativeActionButton
            label={chinese ? "取消主题预览" : "Cancel theme preview"}
            prominence="secondary"
            onPress={() => themeManager.cancelPreview()}
          />
        </View>
      ) : null}
      <NativeActionButton
        label={chinese ? "恢复所有主题默认" : "Restore all theme defaults"}
        prominence="secondary"
        onPress={() => void themeManager.reset()}
      />
    </ScrollView>
  );
}
