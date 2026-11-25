import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useClientUpdateState } from "../lib/client-update";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";

/**
 * Floating warm-porcelain status pill shown only while an OTA update is downloading,
 * so users who started an update from the startup alert know it is active and keep the app open.
 */
export function UpdateDownloadBanner() {
  const { downloading, progress = 0, attempt = 0, totalAttempts = 3 } = useClientUpdateState();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();

  if (!downloading) return null;

  const isLight = appearance === "light";
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const title =
    attempt > 1
      ? t("Retrying update download ({attempt}/{total})…", { attempt, total: totalAttempts })
      : percent > 0 && percent < 100
        ? t("Downloading update… {percent}%", { percent })
        : t("Downloading update…");

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: Math.max(insets.top, 12) + 8,
        left: 16,
        right: 16,
        alignItems: "center",
        zIndex: 50,
      }}
    >
      <View
        accessibilityRole="text"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          maxWidth: 360,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 16,
          backgroundColor: isLight ? "#FFFEFC" : "#242933",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: isLight ? "rgba(38, 35, 31, 0.10)" : "rgba(245, 244, 240, 0.14)",
          ...(Platform.OS === "ios"
            ? {
                shadowColor: "#1C1915",
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: isLight ? 0.1 : 0.3,
                shadowRadius: 14,
              }
            : { elevation: 4 }),
        }}
      >
        <ActivityIndicator size="small" color={tokens.foreground} />
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text
            numberOfLines={1}
            style={{ color: tokens.foreground, fontSize: 13, fontWeight: "600" }}
          >
            {title}
          </Text>
          <Text numberOfLines={1} style={{ color: tokens.mutedForeground, fontSize: 12 }}>
            {t("Keep the app open while downloading.")}
          </Text>
        </View>
      </View>
    </View>
  );
}
