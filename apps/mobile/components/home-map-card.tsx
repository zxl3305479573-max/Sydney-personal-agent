import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import { isNativeLocationAvailable, requestDeviceGpsLocation } from "../lib/device-location";
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
import type { MapCanvasEvent, MapCanvasHandle, MapTileProvider } from "./map-canvas";
import { MapCanvas } from "./map-canvas";
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
  const canvasRef = useRef<MapCanvasHandle>(null);
  const [tileProvider, setTileProvider] = useState<MapTileProvider>("amap");
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (locationOverride !== undefined) return;
    let active = true;
    void (async () => {
      const saved = await loadSavedMapLocation();
      if (!active) return;
      if (isNativeLocationAvailable()) {
        const gps = await requestDeviceGpsLocation({ requestPermission: true });
        if (!active || gps.status === "ok") return;
      }
      if (!saved) {
        await resolveApproxIpLocation();
      }
    })();
    return () => {
      active = false;
    };
  }, [locationOverride]);

  const previewZoom =
    resolvedLocation?.source === "gps" || resolvedLocation?.source === "manual" ? 16 : 14;

  useEffect(() => {
    if (!mapReady || !resolvedLocation) return;
    canvasRef.current?.centerOn(resolvedLocation, previewZoom);
  }, [mapReady, previewZoom, resolvedLocation]);

  const handleMapEvent = useCallback((event: MapCanvasEvent) => {
    if (event.type === "ready") {
      setMapReady(true);
      return;
    }
    if (event.type === "tileFallback") {
      setTileProvider(event.provider === "amap" ? "osm" : "amap");
    }
  }, []);

  const isLight = appearance === "light";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const mapStageBg = isLight ? "#EAE6DC" : "#222833";
  const badgeBg = isLight ? "rgba(255, 254, 252, 0.90)" : "rgba(28, 33, 42, 0.86)";
  const badgeBorder = isLight ? "rgba(38, 35, 31, 0.10)" : "rgba(245, 244, 240, 0.14)";
  const liveDotColor =
    resolvedLocation?.source === "gps"
      ? isLight
        ? "#2E6F4E"
        : "#8ADBA9"
      : isLight
        ? "#2563EB"
        : "#60A5FA";

  const locationText = resolvedLocation
    ? locationSummaryText(resolvedLocation, locale)
    : copy("正在获取实时位置…", "正在取得即時位置…", "Locating your position…");
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
          padding: 12,
          gap: 10,
          overflow: "hidden",
        },
      ]}
    >
      {/* Live Retina tile map preview; pointerEvents="none" keeps scroll & card tap seamless */}
      <View
        testID="home-hub-map-live-preview"
        pointerEvents="none"
        style={{
          height: 162,
          borderRadius: 16,
          backgroundColor: mapStageBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: chipBorder,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {resolvedLocation ? (
          <MapCanvas
            ref={canvasRef}
            interactive={false}
            origin={{
              latitude: resolvedLocation.latitude,
              longitude: resolvedLocation.longitude,
              label: locationText,
            }}
            destination={null}
            route={null}
            tileProvider={tileProvider}
            dark={!isLight}
            initialCenter={resolvedLocation}
            initialZoom={previewZoom}
            onEvent={handleMapEvent}
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: isLight ? "rgba(37, 99, 235, 0.14)" : "rgba(96, 165, 250, 0.2)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <NativeSymbol
                ios="location.fill"
                android="locate"
                size={18}
                color={isLight ? "#2563EB" : "#60A5FA"}
              />
            </View>
            <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, fontWeight: "500" }}>
              {copy("正在加载实时地图…", "正在載入即時地圖…", "Loading live map…")}
            </Text>
          </View>
        )}

        {/* Top-left frosted live status pill */}
        <View
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: badgeBg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: badgeBorder,
          }}
        >
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 3.5,
              backgroundColor: liveDotColor,
            }}
          />
          <Text style={{ color: tokens.foreground, fontSize: 11.5, fontWeight: "600" }}>
            {sourceBadge}
          </Text>
        </View>

        {/* Bottom-right frosted expand hint */}
        <View
          style={{
            position: "absolute",
            right: 10,
            bottom: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: badgeBg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: badgeBorder,
          }}
        >
          <NativeSymbol
            ios="arrow.up.left.and.arrow.down.right"
            android="expand-outline"
            size={11}
            color={tokens.foreground}
          />
          <Text style={{ color: tokens.foreground, fontSize: 11.5, fontWeight: "600" }}>
            {copy("进入详情", "進入詳情", "Full map")}
          </Text>
        </View>
      </View>

      {/* Compact info footer */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 4,
          paddingBottom: 2,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <NativeSymbol
              ios="map"
              android="map-outline"
              size={14}
              color={tokens.mutedForeground}
            />
            <Text
              numberOfLines={1}
              style={{ color: tokens.foreground, fontSize: 15, lineHeight: 20, fontWeight: "600" }}
            >
              {copy("地图与导航", "地圖與導航", "Map & Navigation")}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={{ color: tokens.mutedForeground, fontSize: 13, lineHeight: 18 }}
          >
            {locationText}
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
      </View>
    </MotionPressable>
  );
}
