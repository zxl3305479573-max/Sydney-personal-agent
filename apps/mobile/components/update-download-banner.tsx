import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useClientUpdateState } from "../lib/client-update";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { GlassSurface } from "./glass-surface";

/**
 * Floating native Liquid Glass status pill shown only while an OTA update is downloading,
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
        top: Math.max(insets.top, 10) + 6,
        left: 16,
        right: 16,
        alignItems: "center",
        zIndex: 50,
      }}
    >
      <GlassSurface
        nativeOverlay
        shape="capsule"
        accessibilityRole="text"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          maxWidth: 360,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
        fallbackStyle={{
          borderRadius: 24,
          backgroundColor: isLight ? "rgba(255, 255, 255, 0.88)" : "rgba(30, 34, 42, 0.86)",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.18)",
          ...(Platform.OS === "ios"
            ? {
                shadowColor: "#000000",
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: isLight ? 0.12 : 0.34,
                shadowRadius: 16,
              }
            : { elevation: 4 }),
        }}
      >
        <ActivityIndicator size="small" color={tokens.foreground} />
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text
            numberOfLines={1}
            style={{ color: tokens.foreground, fontSize: 13.5, fontWeight: "600" }}
          >
            {title}
          </Text>
          <Text numberOfLines={1} style={{ color: tokens.mutedForeground, fontSize: 12 }}>
            {t("Keep the app open while downloading.")}
          </Text>
        </View>
      </GlassSurface>
    </View>
  );
}
