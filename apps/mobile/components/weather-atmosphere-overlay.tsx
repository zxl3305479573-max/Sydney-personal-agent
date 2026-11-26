import { usePathname } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useHomeWeather } from "../lib/home-weather";
import { resolveActiveWeatherScene } from "../lib/weather-atmosphere-helpers";
import { useWeatherScenePreferences } from "../lib/weather-scene-state";

/** Lightweight non-native / web / test fallback for the full-app weather atmosphere overlay. */
export function WeatherAtmosphereOverlay({
  bottomLandingOffset = 0,
}: {
  bottomLandingOffset?: number;
}) {
  const pathname = usePathname();
  const prefs = useWeatherScenePreferences();
  const { weather } = useHomeWeather({ enabled: prefs.enabled });

  const resolved = useMemo(
    () =>
      resolveActiveWeatherScene({
        enabled: prefs.enabled,
        previewScene: prefs.previewScene,
        weather,
        pathname,
      }),
    [pathname, prefs.enabled, prefs.previewScene, weather],
  );

  if (!resolved.visible || !resolved.config) return null;

  return (
    <View
      pointerEvents="none"
      testID="weather-atmosphere-overlay"
      accessibilityLabel={`${resolved.config.kind}:${resolved.config.intensity.toFixed(2)}:${bottomLandingOffset}`}
      style={[StyleSheet.absoluteFill, { zIndex: 35, opacity: resolved.opacityScale }]}
    />
  );
}
