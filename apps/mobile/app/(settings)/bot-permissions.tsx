import type { MobileBridgePermissionsPatch } from "@rakazo/contracts";
import { DEFAULT_MOBILE_BRIDGE_PERMISSIONS } from "@rakazo/contracts";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Alert, AppState, Linking, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeSwitch } from "../../components/native-switch";
import { SettingsGroup, SettingsRow } from "../../components/settings-group";
import { useApprovalSettings } from "../../lib/approval-settings";
import {
  getNativeLocationStatus,
  isNativeLocationAvailable,
  requestDeviceGpsLocation,
} from "../../lib/device-location";
import { useI18n } from "../../lib/i18n";
import {
  getCachedMobileBridgeState,
  loadMobileBridgeState,
  subscribeMobileBridgeState,
  syncMobileBridgeNow,
  updateMobileBridgePermissions,
} from "../../lib/mobile-bridge";
import { native } from "../../lib/native";
import type {
  NativeBridgeAuthStatus,
  NativeBridgeAuthStatuses,
  NativeBridgeDomain,
} from "../../lib/native-device-bridge";
import {
  getNativeDeviceBridgeStatuses,
  isNativeDeviceBridgeAvailable,
  requestNativeBridgePermission,
} from "../../lib/native-device-bridge";
import { useScreenBackground } from "../../lib/scoped-theme-context";
import { ACCOUNT_SETTINGS } from "../../lib/settings-target";
import { useSideInsets } from "../../lib/side-insets";
import { errorText } from "../../lib/user-error";

function statusLabel(status: NativeBridgeAuthStatus | string, chinese: boolean): string {
  switch (status) {
    case "authorized":
      return chinese ? "已授权" : "Allowed";
    case "denied":
      return chinese ? "系统已拒绝" : "Denied";
    case "restricted":
      return chinese ? "系统受限" : "Restricted";
    case "notDetermined":
      return chinese ? "未请求" : "Not set";
    default:
      return chinese ? "待新 IPA" : "Needs IPA";
  }
}

export default function BotPermissionsScreen() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const sideInsets = useSideInsets();
  const screenBackground = useScreenBackground(native.groupedPage);
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const copy = (zhHans: string, zhHant: string, en: string) =>
    chinese ? (traditional ? zhHant : zhHans) : en;

  const bridgeState = useSyncExternalStore(
    subscribeMobileBridgeState,
    getCachedMobileBridgeState,
    getCachedMobileBridgeState,
  );
  const permissions = bridgeState.permissions;
  const approvals = useApprovalSettings(ACCOUNT_SETTINGS, true);

  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string>(() => getNativeLocationStatus());
  const [nativeStatuses, setNativeStatuses] = useState<NativeBridgeAuthStatuses>(() =>
    getNativeDeviceBridgeStatuses(),
  );
  const nativeBridgeReady = isNativeDeviceBridgeAvailable();

  const refreshNativeStatuses = useCallback(() => {
    setLocationStatus(getNativeLocationStatus());
    setNativeStatuses(getNativeDeviceBridgeStatuses());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshNativeStatuses();
      void loadMobileBridgeState();
      const sub = AppState.addEventListener("change", (next) => {
        if (next === "active") refreshNativeStatuses();
      });
      return () => sub.remove();
    }, [refreshNativeStatuses]),
  );

  async function patchPermissions(patch: MobileBridgePermissionsPatch) {
    if (saving) return;
    setSaving(true);
    try {
      await updateMobileBridgePermissions(patch);
      void syncMobileBridgeNow({ force: true, includeNative: true });
    } catch (error) {
      Alert.alert(
        copy("保存权限失败", "儲存權限失敗", "Could not save permissions"),
        errorText(error, t("Try again.")),
      );
    } finally {
      setSaving(false);
    }
  }

  async function authorizeNativeDomain(domain: NativeBridgeDomain) {
    if (!nativeBridgeReady) {
      Alert.alert(
        copy("需安装新版 IPA", "需安裝新版 IPA", "Requires updated IPA"),
        copy(
          "当前安装包尚未内置原生 iOS 日历／提醒／通讯录桥接模块，安装新版侧载 IPA 后即可直接授权。",
          "目前安裝包尚未內建原生 iOS 行事曆／提醒／聯絡人橋接模組，安裝新版側載 IPA 後即可直接授權。",
          "Install the updated sideload IPA to enable native iOS Calendar, Reminders, Contacts, and Clipboard access.",
        ),
      );
      return;
    }
    const current = nativeStatuses[domain];
    if (current === "denied" || current === "restricted") {
      await Linking.openSettings().catch(() => undefined);
      return;
    }
    await requestNativeBridgePermission(domain);
    refreshNativeStatuses();
    await syncMobileBridgeNow({ force: true, includeNative: true });
  }

  async function enableAllPermissions() {
    if (saving || syncing) return;
    setSaving(true);
    setSyncing(true);
    try {
      await updateMobileBridgePermissions({ ...DEFAULT_MOBILE_BRIDGE_PERMISSIONS });
      if (approvals.settings && approvals.settings.mode !== "never") {
        await approvals.setMode("never");
      }
      if (isNativeLocationAvailable()) {
        await requestDeviceGpsLocation({ requestPermission: true, force: false }).catch(
          () => undefined,
        );
      }
      if (nativeBridgeReady) {
        await requestNativeBridgePermission("calendar");
        await requestNativeBridgePermission("reminders");
        await requestNativeBridgePermission("contacts");
      }
      refreshNativeStatuses();
      await syncMobileBridgeNow({ force: true, includeNative: true });
      Alert.alert(
        copy(
          "已开通全部 Bot 应用权限",
          "已開通全部 Bot 應用權限",
          "All bot app permissions enabled",
        ),
        copy(
          "账号下所有 Bot（单聊、群聊、项目）现已全选开通账单协同记账、定位、天气、高德导航、后台陪伴及已授权的 iOS 系统数据；银行卡号与 CVV 仍严格隔离。",
          "帳號下所有 Bot（單聊、群聊、專案）現已全選開通帳單協同記帳、定位、天氣、高德導航、背景陪伴及已授權的 iOS 系統資料；銀行卡號與 CVV 仍嚴格隔離。",
          "All bots (DM, group, and project) now have bill logging, location, weather, Amap navigation, companion state, and authorized iOS data; bank card numbers and CVV remain strictly isolated.",
        ),
      );
    } catch (error) {
      Alert.alert(
        copy("开通失败", "開通失敗", "Could not enable permissions"),
        errorText(error, t("Try again.")),
      );
    } finally {
      setSaving(false);
      setSyncing(false);
    }
  }

  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    try {
      refreshNativeStatuses();
      await syncMobileBridgeNow({ force: true, includeNative: true });
    } finally {
      setSyncing(false);
    }
  }

  const lastSyncedLabel = bridgeState.updatedAt
    ? new Date(bridgeState.updatedAt).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : copy("尚未同步", "尚未同步", "Not synced");

  const relaxedApproval = approvals.settings?.mode === "never";
  const subDisabled = saving || !permissions.enabled;

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: screenBackground }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={sideInsets}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 18,
          paddingBottom: 40,
          gap: 20,
        }}
      >
        <SettingsGroup
          label={copy("全局总控", "全域總控", "Master control")}
          footer={copy(
            "开启后仅对当前账号本人发起的对话生效，他人消息、外部群或 Webhook 均无法读取你的手机数据。",
            "開啟後僅對目前帳號本人發起的對話生效，他人訊息、外部群或 Webhook 均無法讀取你的手機資料。",
            "Applies only to conversations started by your own account. Other people, external channels, and webhooks cannot read your phone data.",
          )}
        >
          <SettingsRow
            title={copy(
              "允许 Bot 访问 App 能力",
              "允許 Bot 存取 App 能力",
              "Allow bots to access app capabilities",
            )}
            detail={copy(
              "对账号下全部自有 Bot 生效",
              "對帳號下全部自有 Bot 生效",
              "Applies to all bots owned by this account",
            )}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy(
                  "允许 Bot 访问 App 能力",
                  "允許 Bot 存取 App 能力",
                  "Allow bot app access",
                )}
                disabled={saving}
                value={permissions.enabled}
                onValueChange={(enabled) => void patchPermissions({ enabled })}
              />
            }
          />
          <SettingsRow
            title={copy("前台自动执行操作", "前景自動執行操作", "Auto-run actions in foreground")}
            detail={copy(
              "App 在前台时自动拉起高德导航或切换页面，后台则生成一键卡片",
              "App 在前景時自動拉起高德導航或切換頁面，背景則產生一鍵卡片",
              "Auto-launch Amap or open screens while foregrounded; show one-tap cards otherwise",
            )}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy(
                  "前台自动执行操作",
                  "前景自動執行操作",
                  "Auto-run in foreground",
                )}
                disabled={subDisabled}
                value={permissions.foregroundAutoExecute}
                onValueChange={(foregroundAutoExecute) =>
                  void patchPermissions({ foregroundAutoExecute })
                }
              />
            }
          />
          <SettingsRow
            title={copy(
              "一键开通全部权限并同步",
              "一鍵開通全部權限並同步",
              "Enable all permissions & sync",
            )}
            detail={copy(
              "全开 App 内能力、请求 iOS 原生授权并开启放宽审批",
              "全開 App 內能力、請求 iOS 原生授權並開啟放寬審批",
              "Turn on all capabilities, request iOS access, and enable relaxed approvals",
            )}
            accessibilityRole="button"
            disabled={saving || syncing}
            chevron="right"
            onPress={() => void enableAllPermissions()}
          />
        </SettingsGroup>

        <SettingsGroup label={copy("App 内置能力", "App 內建能力", "Built-in app capabilities")}>
          <SettingsRow
            title={copy(
              "实时定位与常用地点",
              "即時定位與常用地點",
              "Live location & recent places",
            )}
            detail={`${copy("系统定位", "系統定位", "GPS")}: ${statusLabel(locationStatus, chinese)}`}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy("实时定位", "即時定位", "Location")}
                disabled={subDisabled}
                value={permissions.location}
                onValueChange={(location) => void patchPermissions({ location })}
              />
            }
          />
          <SettingsRow
            title={copy("实时天气与预报", "即時天氣與預報", "Weather & forecast")}
            detail={copy(
              "当前温度、体感、湿度与未来预报",
              "目前溫度、體感、濕度與未來預報",
              "Current conditions, hourly & daily forecast",
            )}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy("实时天气", "即時天氣", "Weather")}
                disabled={subDisabled}
                value={permissions.weather}
                onValueChange={(weather) => void patchPermissions({ weather })}
              />
            }
          />
          <SettingsRow
            title={copy(
              "地图搜索、路线与高德导航",
              "地圖搜尋、路線與高德導航",
              "Maps, routes & Amap navigation",
            )}
            detail={copy(
              "搜索附近地点、估算路线并一键拉起高德地图",
              "搜尋附近地點、估算路線並一鍵拉起高德地圖",
              "Search places, estimate routes, and launch Amap",
            )}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy("高德导航与地图", "高德導航與地圖", "Maps and Amap")}
                disabled={subDisabled}
                value={permissions.mapAndAmap}
                onValueChange={(mapAndAmap) => void patchPermissions({ mapAndAmap })}
              />
            }
          />
          <SettingsRow
            title={copy(
              "后台陪伴与灵动岛",
              "背景陪伴與靈動島",
              "Background companion & Dynamic Island",
            )}
            detail={copy(
              "查看当前陪伴伙伴或启停／切换陪伴",
              "檢視目前陪伴夥伴或啟停／切換陪伴",
              "Read status and start, stop, or switch companion",
            )}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy("后台陪伴", "背景陪伴", "Companion")}
                disabled={subDisabled}
                value={permissions.companion}
                onValueChange={(companion) => void patchPermissions({ companion })}
              />
            }
          />
          <SettingsRow
            title={copy(
              "打开 App 页面与通知状态",
              "開啟 App 頁面與通知狀態",
              "App screens & notification status",
            )}
            detail={copy(
              "允许跳转地图、天气、账单与云电脑等内置页面",
              "允許跳轉地圖、天氣、帳單與雲電腦等內建頁面",
              "Open map, weather, bills, cloud computer, and settings screens",
            )}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy("打开 App 页面", "開啟 App 頁面", "App navigation")}
                disabled={subDisabled}
                value={permissions.appNavigation}
                onValueChange={(appNavigation) => void patchPermissions({ appNavigation })}
              />
            }
          />
          <SettingsRow
            title={copy("账单协同记账", "帳單協同記帳", "Bill ledger assistant")}
            detail={copy(
              "账号下所有 Bot（单聊／群聊／项目）均可直接在对话中文字或识图记账与查统计；银行卡号、有效期与安全码绝不暴露",
              "帳號下所有 Bot（單聊／群聊／專案）均可直接在對話中文字或識圖記帳與查統計；銀行卡號、有效期與安全碼絕不暴露",
              "All bots (DM, group, project) can log bills from chat or receipt photos and read summaries; card numbers and CVV stay strictly hidden",
            )}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy("账单协同记账", "帳單協同記帳", "Bill ledger assistant")}
                disabled={subDisabled}
                value={permissions.financeLedger}
                onValueChange={(financeLedger) => void patchPermissions({ financeLedger })}
              />
            }
          />
        </SettingsGroup>

        {Platform.OS === "ios" ? (
          <SettingsGroup
            label={copy("iPhone 系统数据", "iPhone 系統資料", "iPhone native data")}
            footer={
              nativeBridgeReady
                ? copy(
                    "点击各行名称可主动请求或前往系统设置调整权限；关闭开关后服务端会立即清除对应缓存。",
                    "點擊各行名稱可主動請求或前往系統設定調整權限；關閉開關後伺服器端會立即清除對應快取。",
                    "Tap a row to request or manage iOS permission. Turning a switch off immediately strips its server cache.",
                  )
                : copy(
                    "当前安装包尚未包含日历／提醒／通讯录／剪贴板原生模块，安装最新构建的侧载 IPA 后即刻可用。",
                    "目前安裝包尚未包含行事曆／提醒／聯絡人／剪貼簿原生模組，安裝最新建置的側載 IPA 後即刻可用。",
                    "Install the updated sideload IPA to activate native iOS Calendar, Reminders, Contacts, and Clipboard access.",
                  )
            }
          >
            <SettingsRow
              title={copy("日历日程（读／写）", "行事曆行程（讀／寫）", "Calendar (read & create)")}
              detail={`${copy("系统权限", "系統權限", "iOS")}: ${statusLabel(nativeStatuses.calendar, chinese)}`}
              accessibilityRole="button"
              onPress={() => void authorizeNativeDomain("calendar")}
              trailing={
                <NativeSwitch
                  accessibilityLabel={copy("日历权限", "行事曆權限", "Calendar access")}
                  disabled={subDisabled}
                  value={permissions.calendar}
                  onValueChange={(calendar) => void patchPermissions({ calendar })}
                />
              }
            />
            <SettingsRow
              title={copy("提醒事项（读／写）", "提醒事項（讀／寫）", "Reminders (read & create)")}
              detail={`${copy("系统权限", "系統權限", "iOS")}: ${statusLabel(nativeStatuses.reminders, chinese)}`}
              accessibilityRole="button"
              onPress={() => void authorizeNativeDomain("reminders")}
              trailing={
                <NativeSwitch
                  accessibilityLabel={copy("提醒事项权限", "提醒事項權限", "Reminders access")}
                  disabled={subDisabled}
                  value={permissions.reminders}
                  onValueChange={(reminders) => void patchPermissions({ reminders })}
                />
              }
            />
            <SettingsRow
              title={copy("通讯录（检索）", "聯絡人（檢索）", "Contacts (search)")}
              detail={`${copy("系统权限", "系統權限", "iOS")}: ${statusLabel(nativeStatuses.contacts, chinese)}`}
              accessibilityRole="button"
              onPress={() => void authorizeNativeDomain("contacts")}
              trailing={
                <NativeSwitch
                  accessibilityLabel={copy("通讯录权限", "聯絡人權限", "Contacts access")}
                  disabled={subDisabled}
                  value={permissions.contacts}
                  onValueChange={(contacts) => void patchPermissions({ contacts })}
                />
              }
            />
            <SettingsRow
              title={copy("剪贴板（读／写）", "剪貼簿（讀／寫）", "Clipboard (read & write)")}
              detail={`${copy("状态", "狀態", "Status")}: ${statusLabel(nativeStatuses.clipboard, chinese)}`}
              trailing={
                <NativeSwitch
                  accessibilityLabel={copy("剪贴板权限", "剪貼簿權限", "Clipboard access")}
                  disabled={subDisabled}
                  value={permissions.clipboard}
                  onValueChange={(clipboard) => void patchPermissions({ clipboard })}
                />
              }
            />
          </SettingsGroup>
        ) : null}

        <SettingsGroup
          label={copy("后端工具审批策略", "後端工具審批策略", "Backend tool approvals")}
          footer={copy(
            "放宽审批（从不询问）可免除网页抓取、外部工具与日历／提醒写入的逐次确认弹窗；支付操作、密钥保护与手动禁止规则仍始终有效。",
            "放寬審批（從不詢問）可免除網頁抓取、外部工具與行事曆／提醒寫入的逐次確認彈窗；支付操作、金鑰保護與手動禁止規則仍始終有效。",
            "Relaxed mode skips per-call approval cards for web fetches, external tools, and device writes. Purchases, secret boundaries, and explicit deny rules remain protected.",
          )}
        >
          <SettingsRow
            title={copy(
              "免逐次审批（放宽模式）",
              "免逐次審批（放寬模式）",
              "Skip per-action approvals",
            )}
            detail={
              approvals.settings
                ? relaxedApproval
                  ? copy("当前：从不询问", "目前：從不詢問", "Current: Never ask")
                  : approvals.settings.mode === "auto"
                    ? copy("当前：智能审核", "目前：智慧審核", "Current: Auto review")
                    : copy("当前：每次询问", "目前：每次詢問", "Current: Ask every time")
                : copy("正在读取审批设置…", "正在讀取審批設定…", "Loading approval settings…")
            }
            trailing={
              <NativeSwitch
                accessibilityLabel={copy("免逐次审批", "免逐次審批", "Skip approvals")}
                disabled={approvals.pending || !approvals.settings}
                value={relaxedApproval}
                onValueChange={(next) => void approvals.setMode(next ? "never" : "auto")}
              />
            }
          />
          <SettingsRow
            title={copy("细粒度审批规则", "細粒度審批規則", "Approval rules")}
            value={approvals.ruleCount > 0 ? String(approvals.ruleCount) : undefined}
            accessibilityRole="button"
            chevron="right"
            onPress={() => router.push("/approvals")}
          />
        </SettingsGroup>

        <SettingsGroup label={copy("数据同步", "資料同步", "Sync status")}>
          <SettingsRow
            title={
              syncing
                ? copy("正在同步手机数据…", "正在同步手機資料…", "Syncing phone context…")
                : copy("立即同步手机数据给 Bot", "立即同步手機資料給 Bot", "Sync phone context now")
            }
            detail={`${copy("上次同步", "上次同步", "Last synced")}: ${lastSyncedLabel}`}
            accessibilityRole="button"
            disabled={syncing}
            chevron="right"
            onPress={() => void syncNow()}
          />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
