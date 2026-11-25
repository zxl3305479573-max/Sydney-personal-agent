import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Alert, AppState, Linking, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeSwitch } from "../../components/native-switch";
import { SettingsGroup, SettingsRow } from "../../components/settings-group";
import { useI18n } from "../../lib/i18n";
import { native } from "../../lib/native";
import type {
  NotificationPreferences,
  SystemNotificationPermission,
} from "../../lib/notification-preferences";
import {
  enableNotificationsWithPrompt,
  getCachedNotificationPreferences,
  getSystemNotificationPermissionStatus,
  isSideloadBuild,
  loadNotificationPreferences,
  sendTestLocalNotification,
  subscribeNotificationPreferences,
  updateNotificationPreferences,
} from "../../lib/notification-preferences";
import { useScreenBackground } from "../../lib/scoped-theme-context";
import { useSideInsets } from "../../lib/side-insets";

function copyFor(locale: string) {
  if (locale === "zh-TW") {
    return {
      general: "通知狀態",
      enableTitle: "開啟消息通知",
      enableDetail: "允許接收新回覆、任務審批與提醒",
      permissionDeniedTitle: "系統通知權限已關閉",
      permissionDeniedDetail: "點擊前往系統設定開啟通知權限",
      openSystemSettings: "前往系統設定",
      categories: "提醒類型",
      messagesTitle: "新消息回覆",
      messagesDetail: "不在當前對話頁時提示新回覆",
      attentionTitle: "審批、提問與異常",
      attentionDetail: "需要人工確認或執行失敗時立即提示",
      completionsTitle: "任務完成提醒",
      completionsDetail: "前景使用時也顯示任務完成橫幅",
      soundTitle: "提示音",
      soundDetail: "彈出通知時播放系統提示音",
      testGroup: "驗證與說明",
      testTitle: "發送測試通知",
      testDetail: "立即發送一條本機測試通知以檢查效果",
      testSentTitle: "已發送測試通知",
      testDeniedTitle: "尚未獲得通知權限",
      testDeniedBody: "請先在系統設定中允許 Sydney 傳送通知。",
      sideloadFooter: "目前側載版本支援本機通知提醒；App 徹底關閉後的遠端推播需正式簽名版本。",
      signedFooter: "系統通知權限與分類開關保存在本機，不會影響其他裝置。",
    };
  }
  if (locale.startsWith("zh")) {
    return {
      general: "通知状态",
      enableTitle: "开启消息通知",
      enableDetail: "允许接收新回复、任务审批与提醒",
      permissionDeniedTitle: "系统通知权限已关闭",
      permissionDeniedDetail: "点击前往系统设置开启通知权限",
      openSystemSettings: "前往系统设置",
      categories: "提醒类型",
      messagesTitle: "新消息回复",
      messagesDetail: "不在当前对话页时提示新回复",
      attentionTitle: "审批、提问与异常",
      attentionDetail: "需要人工确认或执行失败时立即提示",
      completionsTitle: "任务完成提醒",
      completionsDetail: "前台使用时也显示任务完成横幅",
      soundTitle: "提示音",
      soundDetail: "弹出通知时播放系统提示音",
      testGroup: "验证与说明",
      testTitle: "发送测试通知",
      testDetail: "立即发送一条本地测试通知以检查效果",
      testSentTitle: "已发送测试通知",
      testDeniedTitle: "尚未获得通知权限",
      testDeniedBody: "请先在系统设置中允许 Sydney 发送通知。",
      sideloadFooter: "当前侧载版本支持本地通知提醒；App 彻底关闭后的远程离线推送需正式签名版本。",
      signedFooter: "系统通知权限与分类开关保存在本机，不会影响其他设备。",
    };
  }
  return {
    general: "Notifications",
    enableTitle: "Enable notifications",
    enableDetail: "Receive new replies, approval prompts, and task alerts",
    permissionDeniedTitle: "Notifications are blocked in system settings",
    permissionDeniedDetail: "Open system settings to allow notifications for Sydney",
    openSystemSettings: "Open system settings",
    categories: "Alert types",
    messagesTitle: "New messages",
    messagesDetail: "Notify when a bot replies in another chat",
    attentionTitle: "Approvals, questions & failures",
    attentionDetail: "Alert immediately when a task needs attention",
    completionsTitle: "Task completions",
    completionsDetail: "Also show a banner while the app is open",
    soundTitle: "Sound",
    soundDetail: "Play the default alert sound for notifications",
    testGroup: "Test & info",
    testTitle: "Send test notification",
    testDetail: "Trigger a local notification right now",
    testSentTitle: "Test notification sent",
    testDeniedTitle: "Notifications are disabled",
    testDeniedBody: "Allow notifications for Sydney in system settings first.",
    sideloadFooter:
      "This sideload build supports local notifications. Background remote push requires a signed Apple Developer build.",
    signedFooter: "Notification preferences are stored on this device.",
  };
}

export default function NotificationsSettingsScreen() {
  const { locale } = useI18n();
  const insets = useSideInsets();
  const screenBackground = useScreenBackground(native.groupedPage);
  const copy = copyFor(locale);
  const prefs = useSyncExternalStore(
    subscribeNotificationPreferences,
    getCachedNotificationPreferences,
    getCachedNotificationPreferences,
  );
  const [permission, setPermission] = useState<SystemNotificationPermission>("undetermined");
  const [busy, setBusy] = useState(false);

  const refreshPermission = useCallback(async () => {
    const status = await getSystemNotificationPermissionStatus();
    setPermission(status);
  }, []);

  useEffect(() => {
    void loadNotificationPreferences();
    void refreshPermission();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void refreshPermission();
    });
    return () => sub.remove();
  }, [refreshPermission]);

  const toggleMaster = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (next) {
        const result = await enableNotificationsWithPrompt();
        setPermission(result.granted ? "granted" : "denied");
        if (!result.granted) {
          Alert.alert(copy.testDeniedTitle, copy.testDeniedBody);
        }
      } else {
        await updateNotificationPreferences({ prompted: true, enabled: false });
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleCategory = (
    key: keyof Pick<
      NotificationPreferences,
      "messages" | "needsAttention" | "completions" | "sound"
    >,
    value: boolean,
  ) => {
    void updateNotificationPreferences({ [key]: value });
  };

  const handleTest = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await sendTestLocalNotification(locale);
      if (outcome === "sent") {
        setPermission("granted");
        Alert.alert(copy.testSentTitle);
      } else {
        setPermission("denied");
        Alert.alert(copy.testDeniedTitle, copy.testDeniedBody);
      }
    } finally {
      setBusy(false);
    }
  };

  const sideload = isSideloadBuild();
  const categoriesEnabled = prefs.enabled && permission !== "denied";

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
        <SettingsGroup label={copy.general} gradient="champagne">
          <SettingsRow
            title={copy.enableTitle}
            detail={copy.enableDetail}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy.enableTitle}
                disabled={busy}
                value={prefs.enabled && permission !== "denied"}
                onValueChange={(value) => void toggleMaster(value)}
              />
            }
          />
          {permission === "denied" ? (
            <SettingsRow
              title={copy.openSystemSettings}
              detail={copy.permissionDeniedDetail}
              accessibilityRole="button"
              chevron="right"
              onPress={() => void Linking.openSettings()}
            />
          ) : null}
        </SettingsGroup>

        <SettingsGroup label={copy.categories}>
          <SettingsRow
            title={copy.messagesTitle}
            detail={copy.messagesDetail}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy.messagesTitle}
                disabled={!categoriesEnabled}
                value={prefs.messages}
                onValueChange={(value) => toggleCategory("messages", value)}
              />
            }
          />
          <SettingsRow
            title={copy.attentionTitle}
            detail={copy.attentionDetail}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy.attentionTitle}
                disabled={!categoriesEnabled}
                value={prefs.needsAttention}
                onValueChange={(value) => toggleCategory("needsAttention", value)}
              />
            }
          />
          <SettingsRow
            title={copy.completionsTitle}
            detail={copy.completionsDetail}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy.completionsTitle}
                disabled={!categoriesEnabled}
                value={prefs.completions}
                onValueChange={(value) => toggleCategory("completions", value)}
              />
            }
          />
          <SettingsRow
            title={copy.soundTitle}
            detail={copy.soundDetail}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy.soundTitle}
                disabled={!categoriesEnabled}
                value={prefs.sound}
                onValueChange={(value) => toggleCategory("sound", value)}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup
          label={copy.testGroup}
          footer={sideload ? copy.sideloadFooter : copy.signedFooter}
        >
          <SettingsRow
            title={copy.testTitle}
            detail={copy.testDetail}
            accessibilityRole="button"
            chevron="right"
            disabled={busy}
            onPress={() => void handleTest()}
          />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
