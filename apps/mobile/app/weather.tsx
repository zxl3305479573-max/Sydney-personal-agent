import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotionPressable } from "../components/motion-pressable";
import { NativeSymbol } from "../components/native-symbol";
import { cardGradient } from "../lib/card-gradient";
import { homeWeatherLabel, homeWeatherSymbol, useHomeWeather } from "../lib/home-weather";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens, useResolvedAppearance } from "../lib/native";
import { useScreenBackground } from "../lib/scoped-theme-context";
import { useSideInsets } from "../lib/side-insets";

function padTwo(value: number): string {
  return String(value).padStart(2, "0");
}

function formatUpdatedClock(timestamp: number): string {
  const date = new Date(timestamp);
  return `${padTwo(date.getHours())}:${padTwo(date.getMinutes())}`;
}

function formatDayLabel(dateIso: string, index: number, locale: string): string {
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  if (index === 0) return chinese ? "今天" : "Today";
  const parsed = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  if (chinese) {
    const days = traditional
      ? ["週日", "週一", "週二", "週三", "週四", "週五", "週六"]
      : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return days[parsed.getDay()] ?? dateIso;
  }
  try {
    return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(parsed);
  } catch {
    return dateIso.slice(5);
  }
}

export default function WeatherDetailScreen() {
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const screenBackground = useScreenBackground(tokens.background);
  const insets = useSideInsets();
  const { locale } = useI18n();
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const copy = (zhHans: string, zhHant: string, en: string) =>
    chinese ? (traditional ? zhHant : zhHans) : en;

  const { weather, loading, error, refreshWeather } = useHomeWeather();

  const isLight = appearance === "light";
  const softAccentInk = isLight ? "#6E675E" : "#B8B3AA";
  const chipBackground = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const trackBg = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const trackFill = isLight ? "#7A7368" : "#A6ACB8";

  const cardSurface = {
    backgroundColor: isLight ? "#FFFEFC" : "#242933",
    experimental_backgroundImage: cardGradient(isLight, "pearl"),
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isLight ? "rgba(38, 35, 31, 0.06)" : "rgba(245, 244, 240, 0.09)",
  } as const;

  const symbol = weather ? homeWeatherSymbol(weather.condition, weather.isDay) : null;
  const conditionText = weather ? homeWeatherLabel(weather.condition, locale) : null;
  const hourly = weather?.hourly ?? [];
  const daily = weather?.daily ?? [];
  const weekMin = daily.length > 0 ? Math.min(...daily.map((day) => day.lowC)) : 0;
  const weekMax = daily.length > 0 ? Math.max(...daily.map((day) => day.highC)) : 1;
  const weekSpan = Math.max(1, weekMax - weekMin);

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: screenBackground }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={insets}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingTop: 14,
          paddingBottom: 40,
          gap: 14,
        }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refreshWeather(true)}
            tintColor={native.secondaryLabel}
            colors={[tokens.mutedForeground]}
          />
        }
      >
        {!weather ? (
          <View style={[cardSurface, { padding: 28, alignItems: "center", gap: 12 }]}>
            {loading ? (
              <>
                <ActivityIndicator color={softAccentInk} />
                <Text style={{ color: tokens.mutedForeground, fontSize: 14 }}>
                  {copy("正在获取实时天气…", "正在取得即時天氣…", "Loading live weather…")}
                </Text>
              </>
            ) : (
              <>
                <NativeSymbol
                  ios="cloud"
                  android="cloudy-outline"
                  size={28}
                  color={softAccentInk}
                />
                <Text style={{ color: tokens.foreground, fontSize: 15.5, fontWeight: "600" }}>
                  {error
                    ? copy("暂时无法获取天气", "暫時無法取得天氣", "Unable to load weather")
                    : copy("暂无天气数据", "暫無天氣資料", "No weather data")}
                </Text>
                <MotionPressable
                  preset="control"
                  testID="weather-retry-button"
                  accessibilityRole="button"
                  accessibilityLabel={copy("重新获取", "重新取得", "Retry")}
                  onPress={() => void refreshWeather(true)}
                  style={{
                    marginTop: 4,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: chipBackground,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: chipBorder,
                  }}
                >
                  <Text style={{ color: tokens.foreground, fontSize: 13.5, fontWeight: "600" }}>
                    {copy("重新获取", "重新取得", "Retry")}
                  </Text>
                </MotionPressable>
              </>
            )}
          </View>
        ) : (
          <>
            {/* Hero Current Weather Card */}
            <View testID="weather-hero-card" style={[cardSurface, { padding: 22, gap: 16 }]}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
                  <NativeSymbol
                    ios={weather.locationSource === "gps" ? "location.fill" : "location"}
                    android="location-outline"
                    size={14}
                    color={softAccentInk}
                  />
                  <Text
                    numberOfLines={1}
                    style={{
                      color: tokens.mutedForeground,
                      fontSize: 14,
                      lineHeight: 18,
                      fontWeight: "500",
                      flexShrink: 1,
                    }}
                  >
                    {weather.locationLabel || copy("当前位置", "目前位置", "Current location")}
                  </Text>
                  {weather.locationSource ? (
                    <View
                      testID="weather-location-source"
                      style={{
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 999,
                        backgroundColor: chipBackground,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: chipBorder,
                      }}
                    >
                      <Text
                        style={{
                          color: softAccentInk,
                          fontSize: 10.5,
                          lineHeight: 14,
                          fontWeight: "600",
                        }}
                      >
                        {weather.locationSource === "gps"
                          ? copy("手机定位", "手機定位", "GPS")
                          : weather.locationSource === "manual"
                            ? copy("手动校准", "手動校準", "Pinned")
                            : copy("网络定位", "網路定位", "IP")}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <MotionPressable
                  preset="control"
                  testID="weather-refresh-button"
                  accessibilityRole="button"
                  accessibilityLabel={copy("刷新天气", "重新整理天氣", "Refresh weather")}
                  onPress={() => void refreshWeather(true)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: chipBackground,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: chipBorder,
                  }}
                >
                  <NativeSymbol
                    ios="arrow.clockwise"
                    android="refresh-outline"
                    size={12}
                    color={softAccentInk}
                  />
                  <Text
                    style={{
                      color: tokens.mutedForeground,
                      fontSize: 12,
                      lineHeight: 15,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {formatUpdatedClock(weather.fetchedAt)}
                  </Text>
                </MotionPressable>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <View style={{ gap: 4 }}>
                  <Text
                    style={{
                      color: tokens.foreground,
                      fontSize: 56,
                      lineHeight: 62,
                      fontWeight: "700",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {`${weather.temperatureC}°`}
                  </Text>
                  <Text style={{ color: tokens.foreground, fontSize: 16, fontWeight: "600" }}>
                    {conditionText}
                  </Text>
                  {weather.highC != null && weather.lowC != null ? (
                    <Text
                      style={{
                        color: tokens.mutedForeground,
                        fontSize: 13.5,
                        lineHeight: 18,
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {copy(
                        `最高 ${weather.highC}° · 最低 ${weather.lowC}°`,
                        `最高 ${weather.highC}° · 最低 ${weather.lowC}°`,
                        `H ${weather.highC}° · L ${weather.lowC}°`,
                      )}
                    </Text>
                  ) : null}
                </View>
                {symbol ? (
                  <View
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 36,
                      backgroundColor: chipBackground,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: chipBorder,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <NativeSymbol
                      ios={symbol.ios}
                      android={symbol.android}
                      size={34}
                      color={softAccentInk}
                    />
                  </View>
                ) : null}
              </View>
            </View>

            {/* Key Metrics Row */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[
                {
                  key: "feels",
                  label: copy("体感温度", "體感溫度", "Feels like"),
                  value:
                    weather.apparentTemperatureC != null
                      ? `${weather.apparentTemperatureC}°`
                      : "--",
                  ios: "thermometer.medium",
                  android: "thermometer-outline" as const,
                },
                {
                  key: "humidity",
                  label: copy("相对湿度", "相對濕度", "Humidity"),
                  value: weather.humidityPercent != null ? `${weather.humidityPercent}%` : "--",
                  ios: "drop",
                  android: "water-outline" as const,
                },
                {
                  key: "wind",
                  label: copy("风速", "風速", "Wind"),
                  value: weather.windSpeedKmh != null ? `${weather.windSpeedKmh} km/h` : "--",
                  ios: "wind",
                  android: "speedometer-outline" as const,
                },
              ].map((metric) => (
                <View
                  key={metric.key}
                  style={[cardSurface, { flex: 1, padding: 14, gap: 6, borderRadius: 20 }]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <NativeSymbol
                      ios={metric.ios}
                      android={metric.android}
                      size={13}
                      color={softAccentInk}
                    />
                    <Text
                      numberOfLines={1}
                      style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 15 }}
                    >
                      {metric.label}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: tokens.foreground,
                      fontSize: 17,
                      lineHeight: 22,
                      fontWeight: "600",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {metric.value}
                  </Text>
                </View>
              ))}
            </View>

            {/* Hourly Forecast */}
            {hourly.length > 0 ? (
              <View style={[cardSurface, { paddingVertical: 16, gap: 12 }]}>
                <Text
                  style={{
                    paddingHorizontal: 18,
                    color: tokens.mutedForeground,
                    fontSize: 13.5,
                    fontWeight: "600",
                  }}
                >
                  {copy("逐小时预报", "逐小時預報", "Hourly forecast")}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
                >
                  {hourly.map((slot, index) => {
                    const slotSymbol = homeWeatherSymbol(slot.condition, slot.isDay);
                    return (
                      <View
                        key={slot.timeIso}
                        style={{
                          width: 60,
                          paddingVertical: 10,
                          borderRadius: 16,
                          backgroundColor: chipBackground,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: chipBorder,
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Text
                          style={{
                            color: index === 0 ? tokens.foreground : tokens.mutedForeground,
                            fontSize: 12,
                            fontWeight: index === 0 ? "600" : "400",
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {index === 0 ? copy("现在", "現在", "Now") : slot.hourLabel}
                        </Text>
                        <NativeSymbol
                          ios={slotSymbol.ios}
                          android={slotSymbol.android}
                          size={18}
                          color={softAccentInk}
                        />
                        <Text
                          style={{
                            color: tokens.foreground,
                            fontSize: 14,
                            fontWeight: "600",
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {`${slot.temperatureC}°`}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {/* Daily Forecast */}
            {daily.length > 0 ? (
              <View style={[cardSurface, { padding: 18, gap: 12 }]}>
                <Text style={{ color: tokens.mutedForeground, fontSize: 13.5, fontWeight: "600" }}>
                  {copy("未来天气", "未來天氣", "Forecast")}
                </Text>
                <View style={{ gap: 12 }}>
                  {daily.map((day, index) => {
                    const daySymbol = homeWeatherSymbol(day.condition, true);
                    const startPct = ((day.lowC - weekMin) / weekSpan) * 100;
                    const widthPct = Math.max(12, ((day.highC - day.lowC) / weekSpan) * 100);
                    return (
                      <View
                        key={day.dateIso}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Text
                          style={{
                            width: 46,
                            color: index === 0 ? tokens.foreground : tokens.mutedForeground,
                            fontSize: 14,
                            fontWeight: index === 0 ? "600" : "400",
                          }}
                        >
                          {formatDayLabel(day.dateIso, index, locale)}
                        </Text>
                        <View style={{ width: 24, alignItems: "center" }}>
                          <NativeSymbol
                            ios={daySymbol.ios}
                            android={daySymbol.android}
                            size={17}
                            color={softAccentInk}
                          />
                        </View>
                        <Text
                          style={{
                            width: 38,
                            color: tokens.mutedForeground,
                            fontSize: 13,
                          }}
                        >
                          {homeWeatherLabel(day.condition, locale)}
                        </Text>
                        <Text
                          style={{
                            width: 32,
                            textAlign: "right",
                            color: tokens.mutedForeground,
                            fontSize: 13.5,
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {`${day.lowC}°`}
                        </Text>
                        <View
                          style={{
                            flex: 1,
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: trackBg,
                            overflow: "hidden",
                          }}
                        >
                          <View
                            style={{
                              position: "absolute",
                              left: `${Math.min(88, Math.max(0, startPct))}%`,
                              width: `${Math.min(100 - Math.max(0, startPct), widthPct)}%`,
                              top: 0,
                              bottom: 0,
                              borderRadius: 3,
                              backgroundColor: trackFill,
                            }}
                          />
                        </View>
                        <Text
                          style={{
                            width: 32,
                            textAlign: "right",
                            color: tokens.foreground,
                            fontSize: 13.5,
                            fontWeight: "600",
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {`${day.highC}°`}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
