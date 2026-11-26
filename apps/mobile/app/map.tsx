import { Stack } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { glassHeaderOptions } from "../components/glass-title";
import type { MapCanvasEvent, MapCanvasHandle, MapTileProvider } from "../components/map-canvas";
import { MapCanvas } from "../components/map-canvas";
import { MotionPressable } from "../components/motion-pressable";
import { NativeSymbol } from "../components/native-symbol";
import type { MapPlace, TravelMode } from "../lib/amap-navigation";
import { openInAmapNavigation, travelModeLabel } from "../lib/amap-navigation";
import { isNativeLocationAvailable, requestDeviceGpsLocation } from "../lib/device-location";
import { useI18n } from "../lib/i18n";
import type { GeoPoint, UserLocation } from "../lib/map-location";
import {
  formatCoordsLabel,
  formatDistance,
  formatDuration,
  getCachedUserLocation,
  loadSavedMapLocation,
  locationSourceLabel,
  locationSummaryText,
  resolveApproxIpLocation,
  saveMapLocation,
} from "../lib/map-location";
import type { MapRoutePreview, MapSearchResult } from "../lib/map-search";
import {
  fetchMapRoutePreview,
  loadRecentMapDestinations,
  rememberMapDestination,
  reverseGeocodeLocation,
  searchMapPlaces,
} from "../lib/map-search";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { useScreenBackground } from "../lib/scoped-theme-context";

const TRAVEL_MODES: readonly TravelMode[] = ["driving", "transit", "walking", "riding"];

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const screenBackground = useScreenBackground(tokens.background);
  const { locale } = useI18n();
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const copy = (zhHans: string, zhHant: string, en: string) =>
    chinese ? (traditional ? zhHant : zhHans) : en;

  const canvasRef = useRef<MapCanvasHandle>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  const initialCenteredRef = useRef(false);

  const [myLocation, setMyLocation] = useState<UserLocation | null>(() => getCachedUserLocation());
  const [locating, setLocating] = useState(false);
  const [calibrateMode, setCalibrateMode] = useState(false);
  const [tileProvider, setTileProvider] = useState<MapTileProvider>("amap");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MapSearchResult[]>([]);
  const [recentPlaces, setRecentPlaces] = useState<MapPlace[]>([]);
  const [destination, setDestination] = useState<MapPlace | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>("driving");
  const [routePreview, setRoutePreview] = useState<MapRoutePreview | null>(null);
  const [routing, setRouting] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const isLight = appearance === "light";
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const accentDarkBg = isLight ? "#2E2B27" : "#E7E4DD";
  const accentDarkInk = isLight ? "#FAF8F4" : "#15171C";
  const pinBlue = isLight ? "#2563EB" : "#60A5FA";

  const applyLocation = useCallback((next: UserLocation, shouldCenter = true) => {
    setMyLocation(next);
    void saveMapLocation(next);
    if (shouldCenter) {
      initialCenteredRef.current = true;
      canvasRef.current?.centerOn(next, next.source === "gps" ? 16 : 13);
    }
  }, []);

  const refreshLocation = useCallback(
    async (preferGps = true) => {
      setLocating(true);
      setStatusNotice(null);
      const saved = await loadSavedMapLocation();
      if (saved && !myLocation) {
        setMyLocation(saved);
        if (!initialCenteredRef.current) {
          initialCenteredRef.current = true;
          canvasRef.current?.centerOn(saved, saved.source === "gps" ? 15 : 13);
        }
      }

      if (preferGps && isNativeLocationAvailable()) {
        const gpsResult = await requestDeviceGpsLocation({
          requestPermission: true,
          force: true,
        });
        if (gpsResult.status === "ok") {
          applyLocation(gpsResult.location, true);
          if (!gpsResult.location.label) {
            void reverseGeocodeLocation(gpsResult.location).then((address) => {
              if (address) {
                applyLocation({ ...gpsResult.location, label: address }, false);
              }
            });
          }
          setLocating(false);
          return;
        }
        if (gpsResult.status === "denied") {
          setStatusNotice(
            copy(
              "未开启定位权限，请在系统「设置 → Sydney → 位置」中允许使用期间访问，或点击地图手动校准。",
              "未開啟定位權限，請在系統「設定 → Sydney → 位置」中允許使用期間存取，或點擊地圖手動校準。",
              "Location permission denied. Enable it in Settings → Sydney → Location, or tap the map to pin your spot.",
            ),
          );
        }
      } else if (preferGps) {
        canvasRef.current?.requestGpsLocation();
      }

      const approx = await resolveApproxIpLocation({ force: !preferGps });
      if (approx) {
        setMyLocation((prev) => {
          if (prev && (prev.source === "gps" || prev.source === "manual")) return prev;
          void saveMapLocation(approx);
          if (!initialCenteredRef.current) {
            initialCenteredRef.current = true;
            canvasRef.current?.centerOn(approx, 13);
          }
          return approx;
        });
      }
      setLocating(false);
    },
    [applyLocation, copy, myLocation],
  );

  useEffect(() => {
    void loadRecentMapDestinations().then(setRecentPlaces);
    void refreshLocation(true);
    return () => {
      searchAbortRef.current?.abort();
      routeAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    routeAbortRef.current?.abort();
    if (
      !myLocation ||
      !destination ||
      typeof destination.latitude !== "number" ||
      typeof destination.longitude !== "number"
    ) {
      setRoutePreview(null);
      setRouting(false);
      return;
    }
    const controller = new AbortController();
    routeAbortRef.current = controller;
    setRouting(true);
    const originPoint: GeoPoint = {
      latitude: myLocation.latitude,
      longitude: myLocation.longitude,
    };
    const destPoint: GeoPoint = {
      latitude: destination.latitude,
      longitude: destination.longitude,
    };
    void fetchMapRoutePreview(originPoint, destPoint, travelMode, controller.signal)
      .then((preview) => {
        if (!controller.signal.aborted) {
          setRoutePreview(preview);
          setRouting(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRouting(false);
        }
      });
    return () => controller.abort();
  }, [myLocation, destination, travelMode]);

  const runSearch = useCallback(
    async (text: string) => {
      searchAbortRef.current?.abort();
      const trimmed = text.trim();
      if (!trimmed) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearching(true);
      try {
        const results = await searchMapPlaces(trimmed, myLocation, controller.signal);
        if (!controller.signal.aborted) {
          setSearchResults(results);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    },
    [myLocation],
  );

  const selectDestination = useCallback(
    (place: MapPlace) => {
      Keyboard.dismiss();
      setDestination(place);
      setQuery(place.name);
      setSearchFocused(false);
      setSearchResults([]);
      setStatusNotice(null);
      void rememberMapDestination(place).then(setRecentPlaces);
      if (typeof place.latitude === "number" && typeof place.longitude === "number") {
        const destPoint = { latitude: place.latitude, longitude: place.longitude };
        if (myLocation) {
          canvasRef.current?.fitRoute([
            { latitude: myLocation.latitude, longitude: myLocation.longitude },
            destPoint,
          ]);
        } else {
          canvasRef.current?.centerOn(destPoint, 15);
        }
      }
    },
    [myLocation],
  );

  const handleMapEvent = useCallback(
    (event: MapCanvasEvent) => {
      if (event.type === "ready") {
        if (myLocation) {
          initialCenteredRef.current = true;
          canvasRef.current?.centerOn(myLocation, myLocation.source === "gps" ? 15 : 13);
        }
        if (!isNativeLocationAvailable()) {
          canvasRef.current?.requestGpsLocation();
        }
        return;
      }
      if (event.type === "location") {
        const point: GeoPoint = { latitude: event.latitude, longitude: event.longitude };
        const base: UserLocation = {
          latitude: event.latitude,
          longitude: event.longitude,
          accuracyMeters: event.accuracyMeters,
          source: "gps",
          updatedAt: Date.now(),
        };
        applyLocation(base, true);
        setLocating(false);
        void reverseGeocodeLocation(point).then((address) => {
          if (address) {
            applyLocation({ ...base, label: address }, false);
          }
        });
        return;
      }
      if (event.type === "locationError") {
        setLocating(false);
        return;
      }
      if (event.type === "tileFallback") {
        const fallbackProvider: MapTileProvider = event.provider === "amap" ? "osm" : "amap";
        setTileProvider(fallbackProvider);
        setStatusNotice(
          copy(
            `已自动切换至 ${fallbackProvider === "osm" ? "OSM" : "高德"} 底图`,
            `已自動切換至 ${fallbackProvider === "osm" ? "OSM" : "高德"} 底圖`,
            `Switched to ${fallbackProvider.toUpperCase()} map tiles`,
          ),
        );
        return;
      }
      if (event.type === "tap") {
        const tapped: GeoPoint = { latitude: event.latitude, longitude: event.longitude };
        if (calibrateMode) {
          const calibrated: UserLocation = {
            latitude: tapped.latitude,
            longitude: tapped.longitude,
            label: formatCoordsLabel(tapped),
            source: "manual",
            updatedAt: Date.now(),
          };
          applyLocation(calibrated, false);
          setCalibrateMode(false);
          setStatusNotice(copy("已校准我的位置", "已校準我的位置", "Current location calibrated"));
          void reverseGeocodeLocation(tapped).then((address) => {
            if (address) {
              applyLocation({ ...calibrated, label: address }, false);
            }
          });
          return;
        }
        const initialPlace: MapPlace = {
          name: copy("地图选点", "地圖選點", "Pinned location"),
          address: formatCoordsLabel(tapped),
          latitude: tapped.latitude,
          longitude: tapped.longitude,
        };
        setDestination(initialPlace);
        setSearchFocused(false);
        setStatusNotice(null);
        void reverseGeocodeLocation(tapped).then((address) => {
          if (!address) return;
          setDestination((prev) =>
            prev && prev.latitude === tapped.latitude && prev.longitude === tapped.longitude
              ? { ...prev, name: address, address }
              : prev,
          );
        });
      }
    },
    [applyLocation, calibrateMode, copy, myLocation],
  );

  const handleOpenAmap = async (overrideDestination?: MapPlace) => {
    const target = overrideDestination ?? destination;
    if (!target) return;
    if (overrideDestination) {
      void rememberMapDestination(overrideDestination).then(setRecentPlaces);
    }
    const outcome = await openInAmapNavigation({
      origin: myLocation
        ? {
            name: locationSummaryText(myLocation, locale),
            latitude: myLocation.latitude,
            longitude: myLocation.longitude,
          }
        : null,
      destination: target,
      mode: travelMode,
    });
    if (outcome.opened === "amap-app") {
      setStatusNotice(copy("已跳转至高德地图", "已跳轉至高德地圖", "Opened in Amap"));
    } else if (outcome.opened === "amap-web") {
      setStatusNotice(
        copy(
          "未检测到高德地图 App，已打开高德网页导航",
          "未偵測到高德地圖 App，已開啟高德網頁導航",
          "Opened Amap web navigation",
        ),
      );
    } else {
      Alert.alert(
        copy("无法打开高德地图", "無法開啟高德地圖", "Could not open Amap"),
        outcome.error ||
          copy(
            "请确认设备网络或高德地图安装状态。",
            "請確認裝置網路或高德地圖安裝狀態。",
            "Check network or Amap installation.",
          ),
      );
    }
  };

  const trimmedQuery = query.trim();
  const showDropdown = searchFocused && (trimmedQuery.length > 0 || recentPlaces.length > 0);

  return (
    <View style={{ flex: 1, backgroundColor: screenBackground }}>
      <Stack.Screen
        options={glassHeaderOptions(copy("地图与导航", "地圖與導航", "Map & Navigation"))}
      />

      {/* Full-bleed interactive tile map canvas */}
      <MapCanvas
        ref={canvasRef}
        origin={
          myLocation
            ? {
                latitude: myLocation.latitude,
                longitude: myLocation.longitude,
                label: locationSummaryText(myLocation, locale),
              }
            : null
        }
        destination={
          destination &&
          typeof destination.latitude === "number" &&
          typeof destination.longitude === "number"
            ? {
                latitude: destination.latitude,
                longitude: destination.longitude,
                label: destination.name,
              }
            : null
        }
        route={
          routePreview ? { points: routePreview.points, estimated: routePreview.estimated } : null
        }
        tileProvider={tileProvider}
        dark={!isLight}
        initialCenter={myLocation}
        initialZoom={myLocation?.source === "gps" ? 16 : 14}
        onEvent={handleMapEvent}
      />

      {/* Top floating search bar (headerTransparent is false, so y=0 already sits below the nav bar) */}
      <View
        testID="map-search-overlay"
        style={{
          position: "absolute",
          top: 12,
          left: 14,
          right: 14,
          gap: 8,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 18,
            backgroundColor: cardBg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: cardBorder,
            shadowColor: "#26231F",
            shadowOpacity: isLight ? 0.08 : 0.28,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 4 },
            elevation: 3,
          }}
        >
          <NativeSymbol
            ios="magnifyingglass"
            android="search"
            size={16}
            color={tokens.mutedForeground}
          />
          <TextInput
            testID="map-search-input"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              if (!text.trim()) setSearchResults([]);
            }}
            onFocus={() => setSearchFocused(true)}
            onSubmitEditing={() => void runSearch(query)}
            placeholder={copy(
              "搜索目的地，或点击地图选点…",
              "搜尋目的地，或點擊地圖選點…",
              "Search destination or tap map…",
            )}
            placeholderTextColor={tokens.mutedForeground}
            returnKeyType="search"
            style={{
              flex: 1,
              color: tokens.foreground,
              fontSize: 15,
              paddingVertical: 2,
            }}
          />
          {query.length > 0 ? (
            <MotionPressable
              preset="icon"
              testID="map-search-clear"
              accessibilityRole="button"
              accessibilityLabel={copy("清空搜索", "清空搜尋", "Clear search")}
              onPress={() => {
                setQuery("");
                setSearchResults([]);
              }}
              hitSlop={6}
            >
              <NativeSymbol
                ios="xmark.circle.fill"
                android="close-circle"
                size={17}
                color={tokens.mutedForeground}
              />
            </MotionPressable>
          ) : null}
          <MotionPressable
            preset="control"
            testID="map-search-submit"
            accessibilityRole="button"
            accessibilityLabel={copy("搜索", "搜尋", "Search")}
            onPress={() => void runSearch(query)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: chipBg,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: chipBorder,
            }}
          >
            <Text style={{ color: tokens.foreground, fontSize: 12.5, fontWeight: "600" }}>
              {copy("搜索", "搜尋", "Go")}
            </Text>
          </MotionPressable>
        </View>

        {calibrateMode ? (
          <View
            testID="map-calibrate-banner"
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: accentDarkBg,
            }}
          >
            <Text style={{ color: accentDarkInk, fontSize: 13, fontWeight: "600", flex: 1 }}>
              {copy(
                "请在地图上轻点你当前的准确位置",
                "請在地圖上輕點你目前的準確位置",
                "Tap your exact location on the map",
              )}
            </Text>
            <MotionPressable preset="inline" onPress={() => setCalibrateMode(false)} hitSlop={6}>
              <Text style={{ color: accentDarkInk, fontSize: 13, fontWeight: "700" }}>
                {copy("取消", "取消", "Cancel")}
              </Text>
            </MotionPressable>
          </View>
        ) : null}

        {showDropdown ? (
          <View
            style={{
              maxHeight: 240,
              borderRadius: 18,
              backgroundColor: cardBg,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: cardBorder,
              overflow: "hidden",
              shadowColor: "#26231F",
              shadowOpacity: isLight ? 0.1 : 0.3,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
            }}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingVertical: 6 }}
            >
              {searching ? (
                <View style={{ padding: 14, alignItems: "center" }}>
                  <ActivityIndicator color={tokens.foreground} />
                </View>
              ) : null}

              {trimmedQuery.length > 0 ? (
                <MotionPressable
                  preset="row"
                  testID="map-direct-amap-query"
                  accessibilityRole="button"
                  onPress={() => {
                    const directPlace: MapPlace = { name: trimmedQuery };
                    setDestination(directPlace);
                    setSearchFocused(false);
                    void handleOpenAmap(directPlace);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: chipBorder,
                  }}
                >
                  <NativeSymbol
                    ios="arrow.triangle.turn.up.right.diamond"
                    android="navigate-outline"
                    size={16}
                    color={pinBlue}
                  />
                  <Text
                    numberOfLines={1}
                    style={{ color: pinBlue, fontSize: 14, fontWeight: "600", flex: 1 }}
                  >
                    {copy(
                      `直接跳转高德导航至「${trimmedQuery}」`,
                      `直接跳轉高德導航至「${trimmedQuery}」`,
                      `Navigate in Amap to "${trimmedQuery}"`,
                    )}
                  </Text>
                </MotionPressable>
              ) : null}

              {searchResults.map((item) => (
                <MotionPressable
                  key={item.id}
                  preset="row"
                  testID={`map-search-result-${item.id}`}
                  accessibilityRole="button"
                  onPress={() =>
                    selectDestination({
                      name: item.name,
                      address: item.address,
                      latitude: item.latitude,
                      longitude: item.longitude,
                    })
                  }
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    gap: 2,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: chipBorder,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ color: tokens.foreground, fontSize: 14.5, fontWeight: "600" }}
                  >
                    {item.name}
                  </Text>
                  {item.address ? (
                    <Text numberOfLines={1} style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                      {item.address}
                    </Text>
                  ) : null}
                </MotionPressable>
              ))}

              {trimmedQuery.length === 0 && recentPlaces.length > 0 ? (
                <>
                  <Text
                    style={{
                      color: tokens.mutedForeground,
                      fontSize: 11.5,
                      fontWeight: "600",
                      paddingHorizontal: 14,
                      paddingTop: 6,
                      paddingBottom: 4,
                    }}
                  >
                    {copy("最近目的地", "最近目的地", "Recent")}
                  </Text>
                  {recentPlaces.map((place) => (
                    <MotionPressable
                      key={place.name}
                      preset="row"
                      accessibilityRole="button"
                      onPress={() => selectDestination(place)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                      }}
                    >
                      <NativeSymbol
                        ios="clock"
                        android="time-outline"
                        size={14}
                        color={tokens.mutedForeground}
                      />
                      <Text
                        numberOfLines={1}
                        style={{ color: tokens.foreground, fontSize: 14, flex: 1 }}
                      >
                        {place.name}
                      </Text>
                    </MotionPressable>
                  ))}
                </>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </View>

      {/* Right-edge floating map controls */}
      <View
        style={{
          position: "absolute",
          right: 14,
          bottom: Math.max(insets.bottom, 16) + 236,
          gap: 8,
        }}
      >
        <MotionPressable
          preset="icon"
          testID="map-locate-button"
          accessibilityRole="button"
          accessibilityLabel={copy("定位到我的位置", "定位到我的位置", "Locate me")}
          onPress={() => void refreshLocation(true)}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: cardBg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: cardBorder,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#26231F",
            shadowOpacity: isLight ? 0.08 : 0.25,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
            elevation: 2,
          }}
        >
          {locating ? (
            <ActivityIndicator size="small" color={pinBlue} />
          ) : (
            <NativeSymbol ios="location.fill" android="locate" size={18} color={pinBlue} />
          )}
        </MotionPressable>

        <MotionPressable
          preset="icon"
          testID="map-calibrate-button"
          accessibilityRole="button"
          accessibilityLabel={copy("手动校准我的位置", "手動校準我的位置", "Calibrate my location")}
          onPress={() => setCalibrateMode((prev) => !prev)}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: calibrateMode ? accentDarkBg : cardBg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: cardBorder,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#26231F",
            shadowOpacity: isLight ? 0.08 : 0.25,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
            elevation: 2,
          }}
        >
          <NativeSymbol
            ios="mappin.and.ellipse"
            android="pin-outline"
            size={18}
            color={calibrateMode ? accentDarkInk : tokens.foreground}
          />
        </MotionPressable>

        <MotionPressable
          preset="icon"
          testID="map-layer-toggle"
          accessibilityRole="button"
          accessibilityLabel={copy("切换底图", "切換底圖", "Switch map layer")}
          onPress={() => setTileProvider((prev) => (prev === "amap" ? "osm" : "amap"))}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: cardBg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: cardBorder,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#26231F",
            shadowOpacity: isLight ? 0.08 : 0.25,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
            elevation: 2,
          }}
        >
          <Text style={{ color: tokens.foreground, fontSize: 11, fontWeight: "700" }}>
            {tileProvider === "amap" ? copy("高德", "高德", "AMap") : "OSM"}
          </Text>
        </MotionPressable>

        <View
          style={{
            borderRadius: 21,
            backgroundColor: cardBg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: cardBorder,
            overflow: "hidden",
          }}
        >
          <MotionPressable
            preset="icon"
            accessibilityRole="button"
            accessibilityLabel={copy("放大", "放大", "Zoom in")}
            onPress={() => canvasRef.current?.zoomBy(1)}
            style={{ width: 42, height: 38, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: tokens.foreground, fontSize: 19, fontWeight: "500" }}>+</Text>
          </MotionPressable>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: cardBorder }} />
          <MotionPressable
            preset="icon"
            accessibilityRole="button"
            accessibilityLabel={copy("缩小", "縮小", "Zoom out")}
            onPress={() => canvasRef.current?.zoomBy(-1)}
            style={{ width: 42, height: 38, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: tokens.foreground, fontSize: 19, fontWeight: "500" }}>−</Text>
          </MotionPressable>
        </View>
      </View>

      {/* Bottom warm-porcelain navigation panel */}
      <View
        testID="map-bottom-panel"
        style={{
          position: "absolute",
          left: 14,
          right: 14,
          bottom: Math.max(insets.bottom, 16),
          borderRadius: 24,
          backgroundColor: cardBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: cardBorder,
          padding: 16,
          gap: 12,
          shadowColor: "#26231F",
          shadowOpacity: isLight ? 0.1 : 0.32,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 6 },
          elevation: 4,
        }}
      >
        {/* Current location row */}
        <MotionPressable
          preset="row"
          testID="map-origin-row"
          accessibilityRole="button"
          onPress={() => {
            if (myLocation) canvasRef.current?.centerOn(myLocation, 15);
            else void refreshLocation(true);
          }}
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pinBlue }} />
          <Text
            numberOfLines={1}
            style={{ color: tokens.foreground, fontSize: 13.5, fontWeight: "600", flex: 1 }}
          >
            {copy("我的位置：", "我的位置：", "My location: ")}
            {locationSummaryText(myLocation, locale)}
          </Text>
          {myLocation ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: chipBg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: chipBorder,
              }}
            >
              <Text style={{ color: tokens.mutedForeground, fontSize: 11, fontWeight: "600" }}>
                {locationSourceLabel(myLocation.source, locale)}
              </Text>
            </View>
          ) : null}
        </MotionPressable>

        {destination ? (
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: tokens.foreground, fontSize: 16, fontWeight: "700" }}
                >
                  {destination.name}
                </Text>
                <Text numberOfLines={1} style={{ color: tokens.mutedForeground, fontSize: 12.5 }}>
                  {routing
                    ? copy("正在规划路线…", "正在規劃路線…", "Calculating route…")
                    : routePreview
                      ? `${formatDistance(routePreview.distanceMeters, locale)} · ${copy("约 ", "約 ", "~")}${formatDuration(routePreview.durationMinutes, locale)}${routePreview.estimated ? copy("（直线估算）", "（直線估算）", " (est.)") : ""}`
                      : (destination.address ??
                        copy(
                          "点击下方按钮由高德地图导航",
                          "點擊下方按鈕由高德地圖導航",
                          "Open Amap to navigate",
                        ))}
                </Text>
              </View>
              <MotionPressable
                preset="icon"
                testID="map-clear-destination"
                accessibilityRole="button"
                accessibilityLabel={copy("清除目的地", "清除目的地", "Clear destination")}
                onPress={() => {
                  setDestination(null);
                  setRoutePreview(null);
                }}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: chipBg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <NativeSymbol
                  ios="xmark"
                  android="close"
                  size={14}
                  color={tokens.mutedForeground}
                />
              </MotionPressable>
            </View>

            {/* Travel mode segmented pills */}
            <View style={{ flexDirection: "row", gap: 6 }}>
              {TRAVEL_MODES.map((mode) => {
                const selected = travelMode === mode;
                return (
                  <MotionPressable
                    key={mode}
                    preset="control"
                    testID={`map-mode-${mode}`}
                    accessibilityRole="button"
                    accessibilityLabel={travelModeLabel(mode, locale)}
                    onPress={() => setTravelMode(mode)}
                    style={{
                      flex: 1,
                      paddingVertical: 7,
                      borderRadius: 999,
                      alignItems: "center",
                      backgroundColor: selected ? accentDarkBg : chipBg,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: selected ? "transparent" : chipBorder,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? accentDarkInk : tokens.foreground,
                        fontSize: 12.5,
                        fontWeight: "600",
                      }}
                    >
                      {travelModeLabel(mode, locale)}
                    </Text>
                  </MotionPressable>
                );
              })}
            </View>

            <MotionPressable
              preset="control"
              testID="map-open-amap-button"
              accessibilityRole="button"
              accessibilityLabel={copy("跳转高德地图导航", "跳轉高德地圖導航", "Navigate in Amap")}
              onPress={() => void handleOpenAmap()}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: pinBlue,
              }}
            >
              <NativeSymbol
                ios="arrow.triangle.turn.up.right.diamond.fill"
                android="navigate"
                size={16}
                color="#FFFFFF"
              />
              <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}>
                {copy("跳转高德地图导航", "跳轉高德地圖導航", "Navigate in Amap")}
              </Text>
            </MotionPressable>
          </>
        ) : (
          <Text style={{ color: tokens.mutedForeground, fontSize: 13, lineHeight: 18 }}>
            {copy(
              "在上方搜索目的地，或直接轻点地图任意位置即可规划路线并跳转高德地图导航。",
              "在上方搜尋目的地，或直接輕點地圖任意位置即可規劃路線並跳轉高德地圖導航。",
              "Search above or tap anywhere on the map to plan a route and open Amap navigation.",
            )}
          </Text>
        )}

        {statusNotice ? (
          <Text
            testID="map-status-notice"
            style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 16 }}
          >
            {statusNotice}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
