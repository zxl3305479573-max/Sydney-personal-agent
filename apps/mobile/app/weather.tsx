import { useRef, useState } from "react";
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
import { useAppBackground } from "../lib/app-background";
import { cardGradient } from "../lib/card-gradient";
import { componentSurfaceColor } from "../lib/component-opacity";
import type { HomeWeatherDailyItem, HomeWeatherHourlyItem } from "../lib/home-weather";
import {
  alignTodayHourlyForecast,
  getWeatherHourlyForDate,
  homeWeatherLabel,
  homeWeatherSymbol,
  useHomeWeather,
} from "../lib/home-weather";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens, useResolvedAppearance } from "../lib/native";
import { useScreenBackground } from "../lib/scoped-theme-context";
import { useSideInsets } from "../lib/side-insets";
import {
  ALL_WEATHER_PREVIEW_SCENES,
  resolveWeatherSceneKind,
  weatherSceneLabel,
  weatherSceneSymbol,
} from "../lib/weather-scene";
import {
  previewWeatherSoundVolume,
  setWeatherSceneEnabled,
  setWeatherScenePreview,
  setWeatherSoundEnabled,
  setWeatherSoundVolume,
  useWeatherScenePreferences,
} from "../lib/weather-scene-state";
import { weatherSoundDescription } from "../lib/weather-sound-model";

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

function formatMonthDay(dateIso: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) return dateIso;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (locale.startsWith("zh")) {
    return `${month}月${day}日`;
  }
  const parsed = new Date(`${dateIso}T12:00:00`);
  if (!Number.isNaN(parsed.getTime())) {
    try {
      return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parsed);
    } catch {
      return `${month}/${day}`;
    }
  }
  return `${month}/${day}`;
}

function formatShortNumericDate(dateIso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) return "";
  return `${Number(match[2])}/${Number(match[3])}`;
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

  const { weather, clockNow, loading, error, refreshWeather } = useHomeWeather();
  const scenePrefs = useWeatherScenePreferences();
  const [selectedDateIso, setSelectedDateIso] = useState<string | null>(null);
  const [selectedHourIso, setSelectedHourIso] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const hourlyScrollRef = useRef<ScrollView | null>(null);
  const scrollOffsetYRef = useRef(0);
  const soundSliderWidthRef = useRef(180);

  const isLight = appearance === "light";
  const { componentOpacity } = useAppBackground();
  const softAccentInk = isLight ? "#6E675E" : "#B8B3AA";
  const chipBackground = componentSurfaceColor(isLight ? "#F8F6F2" : "#2A303B", componentOpacity);
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const selectedSurface = componentSurfaceColor(isLight ? "#EFECE5" : "#333A47", componentOpacity);
  const selectedBorder = isLight ? "rgba(38, 35, 31, 0.22)" : "rgba(245, 244, 240, 0.26)";
  const trackBg = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const trackFill = isLight ? "#7A7368" : "#A6ACB8";
  const selectedTrackFill = isLight ? "#26231F" : "#F5F4F0";

  const cardSurface = {
    backgroundColor: componentSurfaceColor(isLight ? "#FFFEFC" : "#242933", componentOpacity),
    experimental_backgroundImage: componentOpacity < 1 ? undefined : cardGradient(isLight, "pearl"),
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isLight ? "rgba(38, 35, 31, 0.06)" : "rgba(245, 244, 240, 0.09)",
  } as const;

  const daily = weather?.daily ?? [];
  const selectedDayIndex =
    selectedDateIso != null ? daily.findIndex((day) => day.dateIso === selectedDateIso) : 0;
  const effectiveDayIndex = selectedDayIndex >= 0 ? selectedDayIndex : 0;
  const isTodaySelected = effectiveDayIndex === 0;
  const selectedDay = daily[effectiveDayIndex] ?? null;

  const activeHourly = weather
    ? isTodaySelected
      ? alignTodayHourlyForecast(weather, clockNow)
      : getWeatherHourlyForDate(weather, selectedDay?.dateIso ?? null)
    : [];

  const selectedHour =
    selectedHourIso != null
      ? (activeHourly.find((slot) => slot.timeIso === selectedHourIso) ?? null)
      : null;

  const isLiveView = isTodaySelected && !selectedHour;

  const displayCondition = weather
    ? selectedHour
      ? selectedHour.condition
      : !isTodaySelected && selectedDay
        ? selectedDay.condition
        : weather.condition
    : null;
  const displayIsDay = weather
    ? selectedHour
      ? selectedHour.isDay
      : !isTodaySelected
        ? true
        : weather.isDay
    : true;
  const liveScene = isLiveView ? (weather?.scene ?? null) : null;
  const symbol = liveScene
    ? weatherSceneSymbol(liveScene)
    : displayCondition
      ? homeWeatherSymbol(displayCondition, displayIsDay)
      : null;
  const conditionText = liveScene
    ? weatherSceneLabel(liveScene, locale)
    : displayCondition
      ? homeWeatherLabel(displayCondition, locale)
      : null;

  const displayHighC = weather
    ? !isTodaySelected && selectedDay
      ? selectedDay.highC
      : (weather.highC ?? selectedDay?.highC ?? null)
    : null;
  const displayLowC = weather
    ? !isTodaySelected && selectedDay
      ? selectedDay.lowC
      : (weather.lowC ?? selectedDay?.lowC ?? null)
    : null;

  const displayApparentC = weather
    ? selectedHour
      ? (selectedHour.apparentTemperatureC ??
        (!isTodaySelected ? selectedDay?.apparentTemperatureC : weather.apparentTemperatureC) ??
        null)
      : !isTodaySelected && selectedDay
        ? (selectedDay.apparentTemperatureC ?? null)
        : (weather.apparentTemperatureC ?? null)
    : null;
  const displayHumidityPercent = weather
    ? selectedHour
      ? (selectedHour.humidityPercent ??
        (!isTodaySelected ? selectedDay?.humidityPercent : weather.humidityPercent) ??
        null)
      : !isTodaySelected && selectedDay
        ? (selectedDay.humidityPercent ?? null)
        : (weather.humidityPercent ?? null)
    : null;
  const displayWindSpeedKmh = weather
    ? selectedHour
      ? (selectedHour.windSpeedKmh ??
        (!isTodaySelected ? selectedDay?.windSpeedKmh : weather.windSpeedKmh) ??
        null)
      : !isTodaySelected && selectedDay
        ? (selectedDay.windSpeedKmh ?? null)
        : (weather.windSpeedKmh ?? null)
    : null;

  const selectedTimeLabel = !isLiveView
    ? !isTodaySelected && selectedDay
      ? selectedHour
        ? `${formatDayLabel(selectedDay.dateIso, effectiveDayIndex, locale)} · ${formatMonthDay(selectedDay.dateIso, locale)} ${selectedHour.hourLabel}`
        : `${formatDayLabel(selectedDay.dateIso, effectiveDayIndex, locale)} · ${formatMonthDay(selectedDay.dateIso, locale)}`
      : selectedHour
        ? `${copy("今天", "今天", "Today")} · ${selectedHour.hourLabel}`
        : null
    : null;

  const hourlyHeading =
    !isTodaySelected && selectedDay
      ? `${formatDayLabel(selectedDay.dateIso, effectiveDayIndex, locale)} · ${copy("逐小时预报", "逐小時預報", "Hourly forecast")}`
      : copy("逐小时预报", "逐小時預報", "Hourly forecast");

  const weekMin = daily.length > 0 ? Math.min(...daily.map((day) => day.lowC)) : 0;
  const weekMax = daily.length > 0 ? Math.max(...daily.map((day) => day.highC)) : 1;
  const weekSpan = Math.max(1, weekMax - weekMin);

  const handleSelectDay = (day: HomeWeatherDailyItem, index: number) => {
    setSelectedDateIso(index === 0 ? null : day.dateIso);
    setSelectedHourIso(null);
    hourlyScrollRef.current?.scrollTo?.({ x: 0, animated: false });
    if (scrollOffsetYRef.current > 60) {
      scrollViewRef.current?.scrollTo?.({ y: 0, animated: true });
    }
  };

  const handleBackToToday = () => {
    setSelectedDateIso(null);
    setSelectedHourIso(null);
    hourlyScrollRef.current?.scrollTo?.({ x: 0, animated: false });
  };

  const handleSelectHour = (slot: HomeWeatherHourlyItem, index: number) => {
    if (isTodaySelected && index === 0) {
      setSelectedHourIso(null);
      return;
    }
    setSelectedHourIso((prev) => (prev === slot.timeIso ? null : slot.timeIso));
  };

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: screenBackground }}>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        style={insets}
        contentInsetAdjustmentBehavior="automatic"
        scrollEventThrottle={100}
        onScroll={(event) => {
          scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
        }}
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
            {/* Hero Weather Card */}
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

              {selectedTimeLabel ? (
                <View
                  testID="weather-selected-time-banner"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 14,
                    backgroundColor: selectedSurface,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: selectedBorder,
                  }}
                >
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}
                  >
                    <NativeSymbol
                      ios="calendar"
                      android="calendar-outline"
                      size={13}
                      color={tokens.foreground}
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        color: tokens.foreground,
                        fontSize: 13,
                        lineHeight: 17,
                        fontWeight: "600",
                        flexShrink: 1,
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {selectedTimeLabel}
                    </Text>
                  </View>
                  <MotionPressable
                    preset="control"
                    testID="weather-back-today-button"
                    accessibilityRole="button"
                    accessibilityLabel={
                      isTodaySelected
                        ? copy("回到现在", "回到現在", "Back to now")
                        : copy("回到今天", "回到今天", "Back to today")
                    }
                    onPress={handleBackToToday}
                    style={{
                      paddingHorizontal: 9,
                      paddingVertical: 3,
                      borderRadius: 999,
                      backgroundColor: chipBackground,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: chipBorder,
                    }}
                  >
                    <Text
                      style={{
                        color: tokens.foreground,
                        fontSize: 11.5,
                        lineHeight: 15,
                        fontWeight: "600",
                      }}
                    >
                      {isTodaySelected
                        ? copy("回到现在", "回到現在", "Now")
                        : copy("回到今天", "回到今天", "Today")}
                    </Text>
                  </MotionPressable>
                </View>
              ) : null}

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <View style={{ gap: 4, flexShrink: 1 }}>
                  {selectedHour ? (
                    <Text
                      style={{
                        color: tokens.foreground,
                        fontSize: 56,
                        lineHeight: 62,
                        fontWeight: "700",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {`${selectedHour.temperatureC}°`}
                    </Text>
                  ) : !isTodaySelected && selectedDay ? (
                    <Text
                      style={{
                        color: tokens.foreground,
                        fontSize: 50,
                        lineHeight: 56,
                        fontWeight: "700",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {`${selectedDay.highC}°`}
                      <Text
                        style={{
                          color: tokens.mutedForeground,
                          fontSize: 28,
                          fontWeight: "500",
                        }}
                      >
                        {` / ${selectedDay.lowC}°`}
                      </Text>
                    </Text>
                  ) : (
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
                  )}
                  <Text style={{ color: tokens.foreground, fontSize: 16, fontWeight: "600" }}>
                    {conditionText}
                  </Text>
                  {displayHighC != null && displayLowC != null ? (
                    <Text
                      style={{
                        color: tokens.mutedForeground,
                        fontSize: 13.5,
                        lineHeight: 18,
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {copy(
                        `最高 ${displayHighC}° · 最低 ${displayLowC}°`,
                        `最高 ${displayHighC}° · 最低 ${displayLowC}°`,
                        `H ${displayHighC}° · L ${displayLowC}°`,
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
            <View testID="weather-metrics-row" style={{ flexDirection: "row", gap: 10 }}>
              {[
                {
                  key: "feels",
                  label: copy("体感温度", "體感溫度", "Feels like"),
                  value: displayApparentC != null ? `${displayApparentC}°` : "--",
                  ios: "thermometer.medium",
                  android: "thermometer-outline" as const,
                },
                {
                  key: "humidity",
                  label: copy("相对湿度", "相對濕度", "Humidity"),
                  value: displayHumidityPercent != null ? `${displayHumidityPercent}%` : "--",
                  ios: "drop",
                  android: "water-outline" as const,
                },
                {
                  key: "wind",
                  label: copy("风速", "風速", "Wind"),
                  value: displayWindSpeedKmh != null ? `${displayWindSpeedKmh} km/h` : "--",
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
            {activeHourly.length > 0 ? (
              <View
                testID="weather-hourly-card"
                style={[cardSurface, { paddingVertical: 16, gap: 12 }]}
              >
                <Text
                  style={{
                    paddingHorizontal: 18,
                    color: tokens.mutedForeground,
                    fontSize: 13.5,
                    fontWeight: "600",
                  }}
                >
                  {hourlyHeading}
                </Text>
                <ScrollView
                  ref={hourlyScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
                >
                  {activeHourly.map((slot, index) => {
                    const slotSymbol = homeWeatherSymbol(slot.condition, slot.isDay);
                    const isSlotSelected = selectedHour
                      ? selectedHour.timeIso === slot.timeIso
                      : isTodaySelected && index === 0;
                    const slotTimeLabel =
                      isTodaySelected && index === 0 ? copy("现在", "現在", "Now") : slot.hourLabel;
                    return (
                      <MotionPressable
                        key={slot.timeIso}
                        preset="card"
                        testID={`weather-hourly-${slot.timeIso}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSlotSelected }}
                        accessibilityLabel={`${slotTimeLabel} ${slot.temperatureC}°C ${homeWeatherLabel(slot.condition, locale)}`}
                        onPress={() => handleSelectHour(slot, index)}
                        style={{
                          width: 60,
                          paddingVertical: 10,
                          borderRadius: 16,
                          backgroundColor: isSlotSelected ? selectedSurface : chipBackground,
                          borderWidth: isSlotSelected ? 1 : StyleSheet.hairlineWidth,
                          borderColor: isSlotSelected ? selectedBorder : chipBorder,
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Text
                          style={{
                            color: isSlotSelected ? tokens.foreground : tokens.mutedForeground,
                            fontSize: 12,
                            fontWeight: isSlotSelected ? "600" : "400",
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {slotTimeLabel}
                        </Text>
                        <NativeSymbol
                          ios={slotSymbol.ios}
                          android={slotSymbol.android}
                          size={18}
                          color={isSlotSelected ? tokens.foreground : softAccentInk}
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
                      </MotionPressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {/* Daily Forecast */}
            {daily.length > 0 ? (
              <View
                testID="weather-daily-card"
                style={[cardSurface, { paddingHorizontal: 12, paddingVertical: 16, gap: 10 }]}
              >
                <View
                  style={{
                    paddingHorizontal: 6,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <Text
                    style={{ color: tokens.mutedForeground, fontSize: 13.5, fontWeight: "600" }}
                  >
                    {copy("未来天气", "未來天氣", "Forecast")}
                  </Text>
                  <Text style={{ color: softAccentInk, fontSize: 11.5 }}>
                    {copy("点击切换日期", "點擊切換日期", "Tap a day")}
                  </Text>
                </View>
                <View style={{ gap: 4 }}>
                  {daily.map((day, index) => {
                    const daySymbol = homeWeatherSymbol(day.condition, true);
                    const startPct = ((day.lowC - weekMin) / weekSpan) * 100;
                    const widthPct = Math.max(12, ((day.highC - day.lowC) / weekSpan) * 100);
                    const isSelected = effectiveDayIndex === index;
                    const dayLabel = formatDayLabel(day.dateIso, index, locale);
                    const shortDate = formatShortNumericDate(day.dateIso);
                    const dayConditionLabel = homeWeatherLabel(day.condition, locale);
                    return (
                      <MotionPressable
                        key={day.dateIso}
                        preset="row"
                        testID={`weather-daily-${day.dateIso}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`${dayLabel} ${formatMonthDay(day.dateIso, locale)} ${dayConditionLabel} ${day.lowC}° - ${day.highC}°`}
                        onPress={() => handleSelectDay(day, index)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          paddingHorizontal: 8,
                          paddingVertical: 9,
                          borderRadius: 14,
                          backgroundColor: isSelected ? selectedSurface : "transparent",
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: isSelected ? selectedBorder : "transparent",
                        }}
                      >
                        <View style={{ width: 50, gap: 1 }}>
                          <Text
                            numberOfLines={1}
                            style={{
                              color: isSelected ? tokens.foreground : tokens.mutedForeground,
                              fontSize: 14,
                              lineHeight: 18,
                              fontWeight: isSelected ? "600" : "400",
                            }}
                          >
                            {dayLabel}
                          </Text>
                          {shortDate ? (
                            <Text
                              style={{
                                color: softAccentInk,
                                fontSize: 11,
                                lineHeight: 13,
                                fontVariant: ["tabular-nums"],
                              }}
                            >
                              {shortDate}
                            </Text>
                          ) : null}
                        </View>
                        <View style={{ width: 24, alignItems: "center" }}>
                          <NativeSymbol
                            ios={daySymbol.ios}
                            android={daySymbol.android}
                            size={17}
                            color={isSelected ? tokens.foreground : softAccentInk}
                          />
                        </View>
                        <Text
                          style={{
                            width: 38,
                            color: isSelected ? tokens.foreground : tokens.mutedForeground,
                            fontSize: 13,
                            fontWeight: isSelected ? "500" : "400",
                          }}
                        >
                          {dayConditionLabel}
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
                              backgroundColor: isSelected ? selectedTrackFill : trackFill,
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
                      </MotionPressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Global Live Weather Scene Controls & Live Preview */}
            <View
              testID="weather-atmosphere-card"
              style={[cardSurface, { paddingVertical: 16, gap: 12 }]}
            >
              <View
                style={{
                  paddingHorizontal: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Text
                    style={{
                      color: tokens.foreground,
                      fontSize: 15,
                      lineHeight: 20,
                      fontWeight: "600",
                    }}
                  >
                    {copy("全应用动态天气场景", "全應用動態天氣場景", "App-wide weather effects")}
                  </Text>
                  <Text
                    style={{
                      color: tokens.mutedForeground,
                      fontSize: 12,
                      lineHeight: 16,
                    }}
                  >
                    {!scenePrefs.enabled
                      ? copy(
                          "已关闭，开启后随实时天气呈现雨雪雷电氛围",
                          "已關閉，開啟後隨即時天氣呈現雨雪雷電氛圍",
                          "Off — enable to animate live rain, snow & thunder",
                        )
                      : scenePrefs.previewScene
                        ? copy(
                            `预览中 · ${weatherSceneLabel(scenePrefs.previewScene, locale)}（切页同样可见）`,
                            `預覽中 · ${weatherSceneLabel(scenePrefs.previewScene, locale)}（切頁同樣可見）`,
                            `Previewing ${weatherSceneLabel(scenePrefs.previewScene, locale)} across app`,
                          )
                        : copy(
                            `跟随实时天气 · ${weatherSceneLabel(weather.scene ?? resolveWeatherSceneKind(weather), locale)}`,
                            `跟隨即時天氣 · ${weatherSceneLabel(weather.scene ?? resolveWeatherSceneKind(weather), locale)}`,
                            `Live weather · ${weatherSceneLabel(weather.scene ?? resolveWeatherSceneKind(weather), locale)}`,
                          )}
                  </Text>
                </View>
                <MotionPressable
                  preset="control"
                  testID="weather-atmosphere-toggle"
                  accessibilityRole="button"
                  accessibilityLabel={
                    scenePrefs.enabled
                      ? copy("关闭动态天气", "關閉動態天氣", "Disable weather effects")
                      : copy("开启动态天气", "開啟動態天氣", "Enable weather effects")
                  }
                  onPress={() => void setWeatherSceneEnabled(!scenePrefs.enabled)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: scenePrefs.enabled
                      ? isLight
                        ? "#26231F"
                        : "#F5F4F0"
                      : chipBackground,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: scenePrefs.enabled ? "transparent" : chipBorder,
                  }}
                >
                  <Text
                    style={{
                      color: scenePrefs.enabled
                        ? isLight
                          ? "#FFFEFC"
                          : "#181C23"
                        : tokens.foreground,
                      fontSize: 12.5,
                      lineHeight: 16,
                      fontWeight: "600",
                    }}
                  >
                    {scenePrefs.enabled
                      ? copy("已开启", "已開啟", "On")
                      : copy("已关闭", "已關閉", "Off")}
                  </Text>
                </MotionPressable>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
              >
                <MotionPressable
                  preset="control"
                  testID="weather-scene-live"
                  accessibilityRole="button"
                  accessibilityState={{ selected: scenePrefs.enabled && !scenePrefs.previewScene }}
                  onPress={() => {
                    void setWeatherSceneEnabled(true);
                    void setWeatherScenePreview(null);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 11,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor:
                      scenePrefs.enabled && !scenePrefs.previewScene
                        ? selectedSurface
                        : chipBackground,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor:
                      scenePrefs.enabled && !scenePrefs.previewScene ? selectedBorder : chipBorder,
                  }}
                >
                  <NativeSymbol
                    ios="location.fill"
                    android="locate"
                    size={12}
                    color={
                      scenePrefs.enabled && !scenePrefs.previewScene
                        ? tokens.foreground
                        : softAccentInk
                    }
                  />
                  <Text
                    style={{
                      color:
                        scenePrefs.enabled && !scenePrefs.previewScene
                          ? tokens.foreground
                          : tokens.mutedForeground,
                      fontSize: 12.5,
                      lineHeight: 16,
                      fontWeight: scenePrefs.enabled && !scenePrefs.previewScene ? "600" : "500",
                    }}
                  >
                    {copy("跟随实时", "跟隨即時", "Live")}
                  </Text>
                </MotionPressable>

                {ALL_WEATHER_PREVIEW_SCENES.map((kind) => {
                  const selected = scenePrefs.enabled && scenePrefs.previewScene === kind;
                  const sym = weatherSceneSymbol(kind);
                  return (
                    <MotionPressable
                      key={kind}
                      preset="control"
                      testID={`weather-scene-${kind}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => void setWeatherScenePreview(kind)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                        paddingHorizontal: 11,
                        paddingVertical: 7,
                        borderRadius: 999,
                        backgroundColor: selected ? selectedSurface : chipBackground,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: selected ? selectedBorder : chipBorder,
                      }}
                    >
                      <NativeSymbol
                        ios={sym.ios}
                        android={sym.android}
                        size={13}
                        color={selected ? tokens.foreground : softAccentInk}
                      />
                      <Text
                        style={{
                          color: selected ? tokens.foreground : tokens.mutedForeground,
                          fontSize: 12.5,
                          lineHeight: 16,
                          fontWeight: selected ? "600" : "500",
                        }}
                      >
                        {weatherSceneLabel(kind, locale)}
                      </Text>
                    </MotionPressable>
                  );
                })}
              </ScrollView>

              {/* Weather Ambient Sound Toggle & Volume Slider */}
              {(() => {
                const activeSoundScene =
                  scenePrefs.previewScene ?? weather.scene ?? resolveWeatherSceneKind(weather);
                const soundActive =
                  scenePrefs.enabled && scenePrefs.soundEnabled && scenePrefs.soundVolume > 0;
                const soundPct = Math.round(scenePrefs.soundVolume * 100);
                const filledPct = scenePrefs.soundEnabled ? soundPct : 0;
                const updateVolumeFromTouch = (locationX: number, commit: boolean) => {
                  const width = Math.max(1, soundSliderWidthRef.current);
                  const ratio = Math.min(1, Math.max(0, locationX / width));
                  if (commit) {
                    void setWeatherSoundVolume(ratio);
                  } else {
                    previewWeatherSoundVolume(ratio);
                  }
                };
                return (
                  <View
                    testID="weather-sound-section"
                    style={{
                      marginHorizontal: 18,
                      paddingTop: 12,
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: chipBorder,
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <NativeSymbol
                          ios={soundActive ? "speaker.wave.2.fill" : "speaker.slash"}
                          android={soundActive ? "volume-medium-outline" : "volume-mute-outline"}
                          size={15}
                          color={soundActive ? tokens.foreground : softAccentInk}
                        />
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Text
                            style={{
                              color: tokens.foreground,
                              fontSize: 14,
                              lineHeight: 18,
                              fontWeight: "600",
                            }}
                          >
                            {copy("天气环境音效", "天氣環境音效", "Weather ambient sound")}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={{
                              color: tokens.mutedForeground,
                              fontSize: 11.5,
                              lineHeight: 15,
                            }}
                          >
                            {!scenePrefs.enabled
                              ? copy(
                                  "已随动态天气场景暂停",
                                  "已隨動態天氣場景暫停",
                                  "Paused while weather effects are off",
                                )
                              : !scenePrefs.soundEnabled || soundPct <= 0
                                ? copy(
                                    "已静音，开启后自动播放雨声／雷声／微风",
                                    "已靜音，開啟後自動播放雨聲／雷聲／微風",
                                    "Muted — enable for rain, thunder & breeze",
                                  )
                                : copy(
                                    `${weatherSoundDescription(activeSoundScene, locale)} · 音量 ${soundPct}%`,
                                    `${weatherSoundDescription(activeSoundScene, locale)} · 音量 ${soundPct}%`,
                                    `${weatherSoundDescription(activeSoundScene, locale)} · ${soundPct}%`,
                                  )}
                          </Text>
                        </View>
                      </View>
                      <MotionPressable
                        preset="control"
                        testID="weather-sound-toggle"
                        accessibilityRole="button"
                        accessibilityLabel={
                          scenePrefs.soundEnabled
                            ? copy("关闭天气音效", "關閉天氣音效", "Mute weather sound")
                            : copy("开启天气音效", "開啟天氣音效", "Unmute weather sound")
                        }
                        onPress={() => void setWeatherSoundEnabled(!scenePrefs.soundEnabled)}
                        style={{
                          paddingHorizontal: 11,
                          paddingVertical: 5,
                          borderRadius: 999,
                          backgroundColor: scenePrefs.soundEnabled
                            ? isLight
                              ? "#26231F"
                              : "#F5F4F0"
                            : chipBackground,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: scenePrefs.soundEnabled ? "transparent" : chipBorder,
                        }}
                      >
                        <Text
                          style={{
                            color: scenePrefs.soundEnabled
                              ? isLight
                                ? "#FFFEFC"
                                : "#181C23"
                              : tokens.foreground,
                            fontSize: 12,
                            lineHeight: 15,
                            fontWeight: "600",
                          }}
                        >
                          {scenePrefs.soundEnabled
                            ? copy("已开启", "已開啟", "On")
                            : copy("已关闭", "已關閉", "Off")}
                        </Text>
                      </MotionPressable>
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        opacity: scenePrefs.enabled ? 1 : 0.45,
                      }}
                    >
                      <MotionPressable
                        preset="control"
                        testID="weather-sound-down"
                        accessibilityRole="button"
                        accessibilityLabel={copy("减小音效音量", "減小音效音量", "Decrease volume")}
                        onPress={() =>
                          void setWeatherSoundVolume(Math.max(0, scenePrefs.soundVolume - 0.1))
                        }
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: chipBackground,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: chipBorder,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <NativeSymbol
                          ios="minus"
                          android="remove"
                          size={13}
                          color={tokens.foreground}
                        />
                      </MotionPressable>

                      <View
                        testID="weather-sound-slider"
                        accessible
                        accessibilityRole="adjustable"
                        accessibilityLabel={copy(
                          "天气音效音量",
                          "天氣音效音量",
                          "Weather sound volume",
                        )}
                        accessibilityValue={{ min: 0, max: 100, now: filledPct }}
                        onLayout={(event) => {
                          const w = event.nativeEvent.layout.width;
                          if (w > 0) soundSliderWidthRef.current = w;
                        }}
                        onStartShouldSetResponder={() => true}
                        onMoveShouldSetResponder={() => true}
                        onResponderTerminationRequest={() => false}
                        onResponderGrant={(event) => {
                          updateVolumeFromTouch(event.nativeEvent.locationX, false);
                        }}
                        onResponderMove={(event) => {
                          updateVolumeFromTouch(event.nativeEvent.locationX, false);
                        }}
                        onResponderRelease={(event) => {
                          updateVolumeFromTouch(event.nativeEvent.locationX, true);
                        }}
                        style={{
                          flex: 1,
                          height: 30,
                          justifyContent: "center",
                        }}
                      >
                        <View
                          style={{
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: trackBg,
                            overflow: "hidden",
                          }}
                        >
                          <View
                            style={{
                              width: `${filledPct}%`,
                              height: "100%",
                              borderRadius: 3,
                              backgroundColor: soundActive ? selectedTrackFill : trackFill,
                            }}
                          />
                        </View>
                        <View
                          pointerEvents="none"
                          style={{
                            position: "absolute",
                            left: `${filledPct}%`,
                            marginLeft: -9,
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            backgroundColor: isLight ? "#FFFEFC" : "#F5F4F0",
                            borderWidth: 1.5,
                            borderColor: soundActive ? selectedTrackFill : trackFill,
                          }}
                        />
                      </View>

                      <MotionPressable
                        preset="control"
                        testID="weather-sound-up"
                        accessibilityRole="button"
                        accessibilityLabel={copy("增大音效音量", "增大音效音量", "Increase volume")}
                        onPress={() =>
                          void setWeatherSoundVolume(Math.min(1, scenePrefs.soundVolume + 0.1))
                        }
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: chipBackground,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: chipBorder,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <NativeSymbol
                          ios="plus"
                          android="add"
                          size={13}
                          color={tokens.foreground}
                        />
                      </MotionPressable>

                      <Text
                        testID="weather-sound-percent"
                        style={{
                          width: 36,
                          textAlign: "right",
                          color: tokens.mutedForeground,
                          fontSize: 12,
                          lineHeight: 16,
                          fontWeight: "600",
                          fontVariant: ["tabular-nums"],
                        }}
                      >
                        {`${filledPct}%`}
                      </Text>
                    </View>
                  </View>
                );
              })()}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
