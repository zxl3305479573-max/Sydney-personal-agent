import type { UserFeatureKey } from "@rakazo/contracts";
import { Text, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { useScreenBackground } from "../lib/scoped-theme-context";
import { useSideInsets } from "../lib/side-insets";

const FEATURE_LABELS: Record<UserFeatureKey, { zhHans: string; zhHant: string; en: string }> = {
  computer: { zhHans: "云电脑", zhHant: "雲電腦", en: "Cloud Computer" },
  projects: { zhHans: "项目工作区", zhHant: "項目工作區", en: "Projects" },
  github: { zhHans: "GitHub", zhHant: "GitHub", en: "GitHub" },
  integrations: {
    zhHans: "连接应用与 MCP",
    zhHant: "連接應用與 MCP",
    en: "Connected Apps & MCP",
  },
};

export function FeatureDisabledView({ feature }: { feature: UserFeatureKey }) {
  const { locale } = useI18n();
  const tokens = useMobileTokens();
  const sideInsets = useSideInsets();
  const screenBackground = useScreenBackground(tokens.background);
  const activeLocale = locale ?? "en";
  const chinese = activeLocale.startsWith("zh");
  const traditional = activeLocale === "zh-TW";
  const label = FEATURE_LABELS[feature];
  const featureName = chinese ? (traditional ? label.zhHant : label.zhHans) : label.en;
  const badge = chinese ? (traditional ? "未開放權限" : "未开放权限") : "Restricted";
  const title = chinese
    ? traditional
      ? `${featureName}未對目前帳號開放`
      : `${featureName}未对当前账号开放`
    : `${featureName} is not enabled for this account`;
  const detail = chinese
    ? traditional
      ? "如需使用此功能，請聯繫伺服器管理員在「設定 → 成員功能權限」中為你開啟。"
      : "如需使用此功能，请联系服务器管理员在「设置 → 成员功能权限」中为你开启。"
    : "Ask a server administrator to enable this feature for your account in Settings → Member feature access.";

  return (
    <View
      testID={`feature-disabled-${feature}`}
      style={[
        {
          flex: 1,
          backgroundColor: screenBackground,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 28,
        },
        sideInsets,
      ]}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 360,
          borderRadius: 22,
          backgroundColor: tokens.card ?? tokens.background,
          borderWidth: 1,
          borderColor: tokens.border,
          paddingHorizontal: 22,
          paddingVertical: 26,
          alignItems: "center",
          gap: 12,
        }}
      >
        <View
          style={{
            borderRadius: 999,
            backgroundColor: tokens.muted ?? tokens.background,
            paddingHorizontal: 12,
            paddingVertical: 5,
          }}
        >
          <Text
            style={{
              color: tokens.mutedForeground,
              fontSize: 12,
              lineHeight: 16,
              fontWeight: "600",
            }}
          >
            {badge}
          </Text>
        </View>
        <Text
          accessibilityRole="header"
          style={{
            color: tokens.foreground,
            fontSize: 17,
            lineHeight: 23,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: tokens.mutedForeground,
            fontSize: 14,
            lineHeight: 20,
            textAlign: "center",
          }}
        >
          {detail}
        </Text>
      </View>
    </View>
  );
}
