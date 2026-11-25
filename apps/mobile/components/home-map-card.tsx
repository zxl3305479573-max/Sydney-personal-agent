import { useRouter } from "expo-router";
import { useEffect } from "react";
import type { ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import { useI18n } from "../lib/i18n";
import type { UserLocation } from "../lib/map-location";
import {
  loadSavedMapLocation,
  locationSourceLabel,
  locationSummaryText,
  resolveApproxIpLocation,
  useCachedUserLocation,
} from "../lib/map-location";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { MotionPressable } from "./motion-pressable";
import { NativeSymbol } from "./native-symbol";

export type HomeMapCardProps = {
  cardStyle: ViewStyle;
  location?: UserLocation | null;
};

export function HomeMapCard({ cardStyle, location: locationOverride }: HomeMapCardProps) {
  const router = useRouter();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const { locale } = useI18n();
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const copy = (zhHans: string, zhHant: string, en: string) =>
    chinese ? (traditional ? zhHant : zhHans) : en;

  const cachedLocation = useCachedUserLocation();
  const resolvedLocation = locationOverride !== undefined ? locationOverride : cachedLocation;

  useEffect(() => {
    if (locationOverride !== undefined) return;
    let active = true;
    void loadSavedMapLocation().then((saved) => {
      if (!active || saved) return;
      void resolveApproxIpLocation();
    });
    return () => {
      active = false;
    };
  }, [locationOverride]);

  const isLight = appearance === "light";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const mapThumbBg = isLight ? "#EAE6DC" : "#2C3340";
  const roadLine = isLight ? "rgba(255, 255, 255, 0.85)" : "rgba(255, 255, 255, 0.14)";
  const pinBlue = isLight ? "#2563EB" : "#60A5FA";
  const pinHalo = isLight ? "rgba(37, 99, 235, 0.22)" : "rgba(96, 165, 250, 0.26)";

  const locationText = resolvedLocation
    ? locationSummaryText(resolvedLocation, locale)
    : copy("点击查看当前位置", "點擊查看目前位置", "Tap to view your location");
  const sourceBadge = resolvedLocation
    ? locationSourceLabel(resolvedLocation.source, locale)
    : copy("高德导航", "高德導航", "Amap Nav");

  return (
    <MotionPressable
      preset="card"
      testID="home-hub-map-card"
      accessibilityRole="button"
      accessibilityLabel={copy(
        `地图与导航，${locationText}`,
        `地圖與導航，${locationText}`,
        `Map & Navigation, ${locationText}`,
      )}
      onPress={() => router.push("/map")}
      style={[
        cardStyle,
        {
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          overflow: "hidden",
        },
      ]}
    >
      {/* Lightweight stylized mini-map visual (zero WebView overhead in HomeHub) */}
      <View
        pointerEvents="none"
        style={{
          width: 60,
          height: 60,
          borderRadius: 16,
          backgroundColor: mapThumbBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: chipBorder,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            position: "absolute",
            left: -8,
            right: -8,
            top: 22,
            height: 6,
            backgroundColor: roadLine,
            transform: [{ rotate: "-14deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            top: -8,
            bottom: -8,
            left: 26,
            width: 5,
            backgroundColor: roadLine,
            transform: [{ rotate: "16deg" }],
          }}
        />
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: pinHalo,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: pinBlue,
              borderWidth: 2,
              borderColor: "#FFFFFF",
            }}
          />
        </View>
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <NativeSymbol ios="map" android="map-outline" size={14} color={tokens.mutedForeground} />
          <Text
            numberOfLines={1}
            style={{ color: tokens.foreground, fontSize: 15.5, lineHeight: 20, fontWeight: "600" }}
          >
            {copy("地图与导航", "地圖與導航", "Map & Navigation")}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={{ color: tokens.foreground, fontSize: 14, lineHeight: 19, fontWeight: "500" }}
        >
          {locationText}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 16 }}
        >
          {`${sourceBadge} · ${copy("定位与高德地图路线导航", "定位與高德地圖路線導航", "Location & Amap turn-by-turn")}`}
        </Text>
      </View>

      <View
        style={{
          paddingHorizontal: 11,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: chipBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: chipBorder,
        }}
      >
        <Text style={{ color: tokens.foreground, fontSize: 12.5, fontWeight: "600" }}>
          {copy("导航 ›", "導航 ›", "Open ›")}
        </Text>
      </View>
    </MotionPressable>
  );
}
