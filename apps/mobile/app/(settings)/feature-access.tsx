import type { AdminUserFeatureAccess, UserFeatureKey } from "@rakazo/contracts";
import { USER_FEATURE_KEYS } from "@rakazo/contracts";
import { accountDisplay } from "@rakazo/core";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AccountAvatar } from "../../components/account-avatar";
import { SettingsGroup, SettingsRow, SettingsSwitch } from "../../components/settings-group";
import { rpc } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { native, useMobileTokens } from "../../lib/native";
import { accountRpcQuery, queryClient } from "../../lib/query";
import { useScreenBackground } from "../../lib/scoped-theme-context";
import { useSideInsets } from "../../lib/side-insets";
import { errorText } from "../../lib/user-error";

const FEATURE_META: Record<
  UserFeatureKey,
  {
    zhHans: string;
    zhHant: string;
    en: string;
    descZhHans: string;
    descZhHant: string;
    descEn: string;
  }
> = {
  computer: {
    zhHans: "云电脑",
    zhHant: "雲電腦",
    en: "Cloud computer",
    descZhHans: "桌面、终端命令、文件读写与截屏工具",
    descZhHant: "桌面、終端指令、檔案讀寫與截圖工具",
    descEn: "Desktop, shell commands, workspace files & screen tools",
  },
  projects: {
    zhHans: "项目工作区",
    zhHant: "項目工作區",
    en: "Projects",
    descZhHans: "底部「项目」页、项目群聊与目录工作区",
    descZhHant: "底部「項目」頁、項目群聊與目錄工作區",
    descEn: "Projects tab, project chats & folder workspaces",
  },
  github: {
    zhHans: "GitHub",
    zhHant: "GitHub",
    en: "GitHub",
    descZhHans: "GitHub 主页、仓库浏览与 Bot 分析工具",
    descZhHant: "GitHub 主頁、倉庫瀏覽與 Bot 分析工具",
    descEn: "GitHub overview, repository browsing & bot tools",
  },
  integrations: {
    zhHans: "连接应用与 MCP",
    zhHant: "連接應用與 MCP",
    en: "Connected apps & MCP",
    descZhHans: "外部连接器、应用目录与 MCP 插件",
    descZhHant: "外部連接器、應用目錄與 MCP 插件",
    descEn: "External connectors, app catalog & MCP plugins",
  },
};

function hasCustomOverrides(user: AdminUserFeatureAccess): boolean {
  return USER_FEATURE_KEYS.some((key) => user.overrides[key] !== null);
}

export default function FeatureAccessScreen() {
  const { locale, t } = useI18n();
  const tokens = useMobileTokens();
  const sideInsets = useSideInsets();
  const screenBackground = useScreenBackground(native.groupedPage);
  const { data: me } = useQuery(accountRpcQuery("me"), queryClient);
  const isAdmin = me?.isAdmin === true;

  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const copy = useCallback(
    (zhHans: string, zhHant: string, en: string) =>
      chinese ? (traditional ? zhHant : zhHans) : en,
    [chinese, traditional],
  );

  const [users, setUsers] = useState<AdminUserFeatureAccess[]>([]);
  const [restrictNonAdmins, setRestrictNonAdmins] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isAdmin) {
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await rpc("featureAccess/listUsers");
        setRestrictNonAdmins(result.restrictNonAdmins);
        setUsers(result.users);
      } catch (cause) {
        setError(
          errorText(
            cause,
            copy(
              "无法加载成员权限列表，请确认后端已更新并配置了管理员邮箱。",
              "無法載入成員權限清單，請確認後端已更新並設定了管理員信箱。",
              "Could not load member permissions.",
            ),
          ),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [copy, isAdmin],
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  async function updateUser(
    target: AdminUserFeatureAccess,
    patch: Partial<Record<UserFeatureKey, boolean | null>>,
  ) {
    if (savingUserId) return;
    setSavingUserId(target.userId);
    try {
      const updated = await rpc("featureAccess/updateUser", {
        userId: target.userId,
        ...patch,
      });
      setUsers((current) =>
        current.map((entry) => (entry.userId === updated.userId ? updated : entry)),
      );
    } catch (cause) {
      Alert.alert(
        copy("保存权限失败", "儲存權限失敗", "Could not save permissions"),
        errorText(cause, t("Try again.")),
      );
    } finally {
      setSavingUserId(null);
    }
  }

  if (!isAdmin) {
    return (
      <SafeAreaView
        edges={["bottom"]}
        style={[{ flex: 1, backgroundColor: screenBackground }, sideInsets]}
      >
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text
            accessibilityRole="alert"
            style={{
              color: tokens.mutedForeground,
              fontSize: 15,
              lineHeight: 22,
              textAlign: "center",
            }}
          >
            {copy(
              "仅服务器管理员可管理成员功能权限。",
              "僅伺服器管理員可管理成員功能權限。",
              "Only server administrators can manage member feature access.",
            )}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const policySummary = restrictNonAdmins
    ? copy(
        "当前默认策略：普通成员默认关闭以下 4 项功能（云电脑、项目工作区、GitHub、连接应用与 MCP），管理员默认全部开放；聊天、陪伴、记账、地图天气、外观换肤与默认模型不受影响。",
        "目前預設策略：普通成員預設關閉以下 4 項功能（雲電腦、項目工作區、GitHub、連接應用與 MCP），管理員預設全部開放；聊天、陪伴、記帳、地圖天氣、外觀換膚與預設模型不受影響。",
        "Default policy: non-admin accounts start with these 4 features off (Cloud computer, Projects, GitHub, Connected apps & MCP), while admins have full access.",
      )
    : copy(
        "当前默认策略：普通成员默认开放全部功能（可在服务器启用 SYDNEY_FEATURE_ACCESS_RESTRICTED=true 改为默认关闭），你仍可在此为指定成员单独关闭或开启。",
        "目前預設策略：普通成員預設開放全部功能（可在伺服器啟用 SYDNEY_FEATURE_ACCESS_RESTRICTED=true 改為預設關閉），你仍可在此為指定成員單獨關閉或開啟。",
        "Default policy: non-admin accounts start with all features enabled unless you turn off individual features below.",
      );

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: screenBackground }}>
      <ScrollView
        testID="feature-access-scroll"
        showsVerticalScrollIndicator={false}
        style={sideInsets}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={native.secondaryLabel}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 18,
          paddingBottom: 40,
          gap: 20,
        }}
      >
        <View
          style={{
            borderRadius: 18,
            backgroundColor: tokens.card,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: tokens.border,
            paddingHorizontal: 16,
            paddingVertical: 14,
            gap: 6,
          }}
        >
          <Text
            style={{
              color: tokens.foreground,
              fontSize: 15,
              lineHeight: 21,
              fontWeight: "600",
            }}
          >
            {copy("按账号控制功能开放", "按帳號控制功能開放", "Per-account feature controls")}
          </Text>
          <Text style={{ color: tokens.mutedForeground, fontSize: 13.5, lineHeight: 19 }}>
            {policySummary}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator
            accessibilityLabel={t("Loading…")}
            color={native.secondaryLabel ?? native.label}
          />
        ) : null}

        {!loading && error ? (
          <SettingsGroup>
            <SettingsRow
              title={copy("加载失败", "載入失敗", "Could not load")}
              detail={error}
              accessibilityRole="button"
              onPress={() => void load(false)}
            />
          </SettingsGroup>
        ) : null}

        {!loading && !error && users.length === 0 ? (
          <Text
            style={{
              color: tokens.mutedForeground,
              fontSize: 14,
              lineHeight: 20,
              textAlign: "center",
              paddingVertical: 16,
            }}
          >
            {copy("暂无可管理的账号。", "暫無可管理的帳號。", "No accounts found.")}
          </Text>
        ) : null}

        {!loading && !error
          ? users.map((entry) => {
              const display = accountDisplay(entry, entry.email);
              const title = entry.name.trim() || display.label;
              const detailParts = [
                entry.email && title !== entry.email ? entry.email : null,
                entry.emailVerified ? null : copy("邮箱未验证", "信箱未驗證", "Email unverified"),
              ].filter((part): part is string => Boolean(part));
              const busy = savingUserId === entry.userId;
              const custom = hasCustomOverrides(entry);
              const roleBadge = entry.isAdmin
                ? copy("管理员", "管理員", "Admin")
                : copy("普通成员", "普通成員", "Member");
              return (
                <SettingsGroup key={entry.userId} label={roleBadge}>
                  <SettingsRow
                    prominent
                    title={title}
                    detail={detailParts.length > 0 ? detailParts.join(" · ") : undefined}
                    leading={
                      <View style={{ marginRight: 4 }}>
                        <AccountAvatar image={entry.image} initial={display.initial} size={40} />
                      </View>
                    }
                  />
                  {entry.isAdmin ? (
                    <SettingsRow
                      title={copy(
                        "管理员默认拥有全部权限",
                        "管理員預設擁有全部權限",
                        "Admins always have full access",
                      )}
                      detail={copy(
                        "为避免误锁，管理员账号不可限制这 4 项功能。",
                        "為避免誤鎖，管理員帳號不可限制這 4 項功能。",
                        "Admin accounts cannot be restricted to prevent accidental lockout.",
                      )}
                    />
                  ) : (
                    <>
                      {USER_FEATURE_KEYS.map((key) => {
                        const meta = FEATURE_META[key];
                        const label = copy(meta.zhHans, meta.zhHant, meta.en);
                        const detail = copy(meta.descZhHans, meta.descZhHant, meta.descEn);
                        return (
                          <SettingsSwitch
                            key={key}
                            label={label}
                            detail={detail}
                            value={entry.effective[key]}
                            disabled={busy}
                            onChange={(next) => void updateUser(entry, { [key]: next })}
                          />
                        );
                      })}
                      {custom ? (
                        <SettingsRow
                          title={copy("恢复默认权限", "恢復預設權限", "Reset to default")}
                          accessibilityRole="button"
                          disabled={busy}
                          onPress={() =>
                            void updateUser(entry, {
                              computer: null,
                              projects: null,
                              github: null,
                              integrations: null,
                            })
                          }
                        />
                      ) : null}
                    </>
                  )}
                </SettingsGroup>
              );
            })
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}
