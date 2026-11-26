import { usePathname } from "expo-router";
import { memo, useEffect, useMemo, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { useAppForeground } from "../lib/app-foreground";
import { useHomeWeather } from "../lib/home-weather";
import { useResolvedAppearance } from "../lib/native";
import { resolveActiveWeatherScene } from "../lib/weather-atmosphere-helpers";
import type {
  CloudWispSpec,
  RainDropSpec,
  RainSplashSpec,
  SnowFlakeSpec,
  StarSpec,
  WeatherSceneConfig,
} from "../lib/weather-scene";
import {
  createCloudWisps,
  createRainParticles,
  createRainSplashes,
  createSnowParticles,
  createStarParticles,
  generateLightningBolt,
} from "../lib/weather-scene";
import { useWeatherScenePreferences } from "../lib/weather-scene-state";

type Palette = {
  rainNear: string;
  rainFar: string;
  rainHighlight: string;
  splashRing: string;
  splashDrop: string;
  snowFill: string;
  snowBorder: string;
  frostTop: string;
  frostBottom: string;
  cloudColor: string;
  fogColor: string;
  sunCore: string;
  sunMid: string;
  starColor: string;
  lightningFlash: string;
  lightningOuter: string;
  lightningCore: string;
  topWash: string;
  bottomWash: string;
};

function resolvePalette(config: WeatherSceneConfig, isLight: boolean): Palette {
  if (isLight) {
    const storm = config.kind === "thunderstorm" || config.kind === "heavy-rain";
    return {
      rainNear: storm ? "rgba(44, 72, 108, 0.72)" : "rgba(62, 98, 138, 0.62)",
      rainFar: storm ? "rgba(74, 102, 136, 0.44)" : "rgba(88, 122, 158, 0.38)",
      rainHighlight: "rgba(218, 236, 255, 0.65)",
      splashRing: storm ? "rgba(52, 84, 122, 0.64)" : "rgba(72, 108, 148, 0.54)",
      splashDrop: storm ? "rgba(46, 78, 118, 0.78)" : "rgba(64, 102, 144, 0.68)",
      snowFill: "rgba(255, 255, 255, 0.96)",
      snowBorder: "rgba(116, 150, 188, 0.42)",
      frostTop: "rgba(255, 255, 255, 0)",
      frostBottom: "rgba(214, 229, 246, 0.52)",
      cloudColor: storm ? "rgba(72, 86, 108, 0.22)" : "rgba(118, 132, 150, 0.16)",
      fogColor: "rgba(164, 174, 188, 0.26)",
      sunCore: "rgba(255, 212, 122, 0.34)",
      sunMid: "rgba(255, 228, 168, 0.12)",
      starColor: "rgba(76, 98, 148, 0.52)",
      lightningFlash: "rgba(214, 230, 255, 0.46)",
      lightningOuter: "rgba(72, 128, 238, 0.62)",
      lightningCore: "rgba(250, 253, 255, 0.98)",
      topWash:
        config.kind === "thunderstorm"
          ? "rgba(38, 52, 76, 0.24)"
          : config.kind === "heavy-rain"
            ? "rgba(54, 72, 98, 0.17)"
            : config.hasRain
              ? "rgba(74, 96, 124, 0.11)"
              : config.hasSnow
                ? "rgba(154, 182, 214, 0.12)"
                : config.hasFog
                  ? "rgba(148, 158, 170, 0.15)"
                  : config.hasStars
                    ? "rgba(40, 52, 86, 0.16)"
                    : "rgba(0, 0, 0, 0)",
      bottomWash: config.hasRain
        ? "rgba(56, 84, 118, 0.08)"
        : config.hasSnow
          ? "rgba(182, 206, 232, 0.14)"
          : "rgba(0, 0, 0, 0)",
    };
  }

  const storm = config.kind === "thunderstorm" || config.kind === "heavy-rain";
  return {
    rainNear: storm ? "rgba(188, 220, 255, 0.72)" : "rgba(168, 206, 248, 0.58)",
    rainFar: storm ? "rgba(142, 182, 224, 0.40)" : "rgba(136, 176, 218, 0.34)",
    rainHighlight: "rgba(242, 248, 255, 0.80)",
    splashRing: storm ? "rgba(196, 226, 255, 0.62)" : "rgba(176, 212, 248, 0.50)",
    splashDrop: storm ? "rgba(218, 238, 255, 0.80)" : "rgba(192, 222, 252, 0.68)",
    snowFill: "rgba(246, 251, 255, 0.94)",
    snowBorder: "rgba(172, 204, 238, 0.34)",
    frostTop: "rgba(232, 244, 255, 0)",
    frostBottom: "rgba(206, 228, 252, 0.24)",
    cloudColor: storm ? "rgba(148, 168, 198, 0.15)" : "rgba(176, 194, 218, 0.12)",
    fogColor: "rgba(198, 212, 228, 0.18)",
    sunCore: "rgba(255, 214, 134, 0.22)",
    sunMid: "rgba(255, 224, 162, 0.08)",
    starColor: "rgba(236, 244, 255, 0.88)",
    lightningFlash: "rgba(214, 232, 255, 0.38)",
    lightningOuter: "rgba(124, 180, 255, 0.72)",
    lightningCore: "rgba(255, 255, 255, 0.98)",
    topWash:
      config.kind === "thunderstorm"
        ? "rgba(20, 32, 56, 0.34)"
        : config.kind === "heavy-rain"
          ? "rgba(26, 40, 64, 0.22)"
          : config.hasRain
            ? "rgba(32, 50, 76, 0.14)"
            : config.hasSnow
              ? "rgba(144, 178, 218, 0.10)"
              : config.hasFog
                ? "rgba(164, 180, 198, 0.12)"
                : config.hasStars
                  ? "rgba(24, 38, 74, 0.24)"
                  : "rgba(0, 0, 0, 0)",
    bottomWash: config.hasRain
      ? "rgba(86, 132, 186, 0.10)"
      : config.hasSnow
        ? "rgba(188, 216, 248, 0.12)"
        : "rgba(0, 0, 0, 0)",
  };
}

const RainDropView = memo(function RainDropView({
  spec,
  width,
  travelHeight,
  windAngleDeg,
  color,
  highlightColor,
  active,
}: {
  spec: RainDropSpec;
  width: number;
  travelHeight: number;
  windAngleDeg: number;
  color: string;
  highlightColor: string;
  active: boolean;
}) {
  const progress = useSharedValue(0);
  const tanAngle = Math.tan((windAngleDeg * Math.PI) / 180);
  const startY = -spec.length - 16;
  const totalDy = travelHeight - startY;
  const totalDx = -totalDy * tanAngle;
  const startX = spec.xRatio * width;

  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      return;
    }
    progress.value = 0;
    progress.value = withDelay(
      spec.delayMs,
      withRepeat(withTiming(1, { duration: spec.durationMs, easing: Easing.linear }), -1, false),
    );
    return () => cancelAnimation(progress);
  }, [active, progress, spec.delayMs, spec.durationMs]);

  const animStyle = useAnimatedStyle(() => {
    const p = progress.value;
    // Fade in swiftly at top and fade right at impact to hand off cleanly to ground splashes.
    const edgeAlpha = p < 0.06 ? p / 0.06 : p > 0.94 ? (1 - p) / 0.06 : 1;
    return {
      opacity: spec.opacity * edgeAlpha,
      transform: [
        { translateX: startX + totalDx * p },
        { translateY: startY + totalDy * p },
        { rotate: `${windAngleDeg}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          width: spec.width,
          height: spec.length,
          borderRadius: spec.width,
          backgroundColor: color,
          overflow: "hidden",
          justifyContent: "flex-end",
        },
        animStyle,
      ]}
    >
      <View
        style={{
          width: spec.width,
          height: Math.max(3, spec.length * 0.28),
          borderRadius: spec.width,
          backgroundColor: highlightColor,
        }}
      />
    </Animated.View>
  );
});

const RainSplashView = memo(function RainSplashView({
  spec,
  width,
  landingBottomPx,
  ringColor,
  dropColor,
  active,
}: {
  spec: RainSplashSpec;
  width: number;
  landingBottomPx: number;
  ringColor: string;
  dropColor: string;
  active: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      return;
    }
    progress.value = 0;
    progress.value = withDelay(
      spec.delayMs,
      withRepeat(withTiming(1, { duration: spec.cycleMs, easing: Easing.linear }), -1, false),
    );
    return () => cancelAnimation(progress);
  }, [active, progress, spec.cycleMs, spec.delayMs]);

  const rippleStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (p > 0.56) return { opacity: 0 };
    const u = p / 0.56;
    const easeOut = 1 - (1 - u) * (1 - u);
    const alpha = u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88;
    return {
      opacity: spec.opacity * alpha,
      transform: [{ scaleX: 0.22 + easeOut * 1.15 }, { scaleY: 0.25 + easeOut * 0.45 }],
    };
  });

  const leftBeadStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (p > 0.44) return { opacity: 0 };
    const u = p / 0.44;
    const arcY = -4 * spec.bounceHeight * u * (1 - u);
    const alpha = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
    return {
      opacity: spec.opacity * 1.05 * alpha,
      transform: [
        { translateX: -(3 + u * (spec.rippleWidth * 0.48)) },
        { translateY: arcY },
        { scale: 1 - u * 0.45 },
      ],
    };
  });

  const rightBeadStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (p > 0.42) return { opacity: 0 };
    const u = p / 0.42;
    const arcY = -4 * (spec.bounceHeight * 0.85) * u * (1 - u);
    const alpha = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
    return {
      opacity: spec.opacity * alpha,
      transform: [
        { translateX: 2.5 + u * (spec.rippleWidth * 0.42) },
        { translateY: arcY },
        { scale: 1 - u * 0.5 },
      ],
    };
  });

  const crownStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (p > 0.24) return { opacity: 0 };
    const u = p / 0.24;
    const rise = -4 * (spec.bounceHeight * 0.55) * u * (1 - u);
    return {
      opacity: spec.opacity * 0.9 * (1 - u),
      transform: [{ translateY: rise }, { scaleY: 0.6 + (1 - u) * 0.8 }],
    };
  });

  const xPos = spec.xRatio * width;
  const ringHeight = Math.max(6, Math.round(spec.rippleWidth * 0.34));
  const beadSize = spec.rippleWidth > 23 ? 3 : 2.4;

  return (
    <View
      style={{
        position: "absolute",
        left: xPos - spec.rippleWidth / 2,
        bottom: landingBottomPx + spec.bottomJitterPx,
        width: spec.rippleWidth,
        height: spec.bounceHeight + ringHeight + 6,
        alignItems: "center",
        justifyContent: "flex-end",
      }}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            bottom: 0,
            width: spec.rippleWidth,
            height: ringHeight,
            borderRadius: spec.rippleWidth / 2,
            borderWidth: 1.25,
            borderColor: ringColor,
          },
          rippleStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            position: "absolute",
            bottom: ringHeight * 0.4,
            width: 2,
            height: 5,
            borderRadius: 1,
            backgroundColor: dropColor,
          },
          crownStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            position: "absolute",
            bottom: ringHeight * 0.35,
            width: beadSize,
            height: beadSize,
            borderRadius: beadSize / 2,
            backgroundColor: dropColor,
          },
          leftBeadStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            position: "absolute",
            bottom: ringHeight * 0.35,
            width: beadSize,
            height: beadSize,
            borderRadius: beadSize / 2,
            backgroundColor: dropColor,
          },
          rightBeadStyle,
        ]}
      />
    </View>
  );
});

const SnowFlakeView = memo(function SnowFlakeView({
  spec,
  width,
  height,
  fillColor,
  borderColor,
  active,
}: {
  spec: SnowFlakeSpec;
  width: number;
  height: number;
  fillColor: string;
  borderColor: string;
  active: boolean;
}) {
  const progress = useSharedValue(0);
  const startX = spec.xRatio * width;
  const startY = -spec.size - 12;
  const totalDy = height + spec.size + 24;

  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      return;
    }
    progress.value = 0;
    progress.value = withDelay(
      spec.delayMs,
      withRepeat(withTiming(1, { duration: spec.durationMs, easing: Easing.linear }), -1, false),
    );
    return () => cancelAnimation(progress);
  }, [active, progress, spec.delayMs, spec.durationMs]);

  const animStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const sway = Math.sin(p * Math.PI * 4) * spec.swayPx;
    const edgeAlpha = p < 0.08 ? p / 0.08 : p > 0.9 ? (1 - p) / 0.1 : 1;
    return {
      opacity: spec.opacity * edgeAlpha,
      transform: [
        { translateX: startX + sway - spec.driftX * p },
        { translateY: startY + totalDy * p },
        { rotate: `${p * 180}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: fillColor,
          borderWidth: spec.size >= 5 ? StyleSheet.hairlineWidth : 0,
          borderColor,
        },
        animStyle,
      ]}
    />
  );
});

const CloudWispView = memo(function CloudWispView({
  spec,
  width,
  height,
  color,
  active,
}: {
  spec: CloudWispSpec;
  width: number;
  height: number;
  color: string;
  active: boolean;
}) {
  const progress = useSharedValue(0);
  const wispWidth = width * spec.widthRatio;

  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      return;
    }
    progress.value = 0;
    progress.value = withDelay(
      spec.delayMs,
      withRepeat(withTiming(1, { duration: spec.durationMs, easing: Easing.linear }), -1, false),
    );
    return () => cancelAnimation(progress);
  }, [active, progress, spec.delayMs, spec.durationMs]);

  const animStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const x = -wispWidth + p * (width + wispWidth * 1.4);
    const fade = p < 0.12 ? p / 0.12 : p > 0.85 ? (1 - p) / 0.15 : 1;
    return {
      opacity: spec.opacity * fade,
      transform: [{ translateX: x }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: height * spec.yRatio,
          left: 0,
          width: wispWidth,
          height: spec.heightPx,
          borderRadius: spec.heightPx / 2,
          backgroundColor: color,
        },
        animStyle,
      ]}
    />
  );
});

const StarTwinkleView = memo(function StarTwinkleView({
  spec,
  width,
  height,
  color,
  active,
}: {
  spec: StarSpec;
  width: number;
  height: number;
  color: string;
  active: boolean;
}) {
  const twinkle = useSharedValue(0.2);

  useEffect(() => {
    if (!active) {
      cancelAnimation(twinkle);
      return;
    }
    twinkle.value = 0.2;
    twinkle.value = withDelay(
      spec.delayMs,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: Math.round(spec.durationMs * 0.5),
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(0.2, {
            duration: Math.round(spec.durationMs * 0.5),
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(twinkle);
  }, [active, spec.delayMs, spec.durationMs, twinkle]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: spec.peakOpacity * twinkle.value,
    transform: [{ scale: 0.75 + twinkle.value * 0.45 }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: spec.xRatio * width,
          top: spec.yRatio * height,
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: color,
        },
        animStyle,
      ]}
    />
  );
});

function LightningLayer({
  width,
  height,
  intervalRange,
  palette,
  active,
}: {
  width: number;
  height: number;
  intervalRange: readonly [number, number];
  palette: Palette;
  active: boolean;
}) {
  const [boltSeed, setBoltSeed] = useState(17);
  const flash = useSharedValue(0);
  const boltOpacity = useSharedValue(0);

  const bolt = useMemo(
    () => generateLightningBolt(width, height, boltSeed),
    [boltSeed, height, width],
  );

  useEffect(() => {
    if (!active) {
      cancelAnimation(flash);
      cancelAnimation(boltOpacity);
      flash.value = 0;
      boltOpacity.value = 0;
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let strikeCount = 0;

    const triggerStrike = () => {
      if (cancelled) return;
      strikeCount += 1;
      setBoltSeed((prev) => prev + 73 + strikeCount * 19);
      // Natural double-flash thunderstorm strike pattern.
      flash.value = withSequence(
        withTiming(0.85, { duration: 55 }),
        withTiming(0.18, { duration: 70 }),
        withTiming(1, { duration: 60 }),
        withTiming(0, { duration: 360, easing: Easing.out(Easing.quad) }),
      );
      boltOpacity.value = withSequence(
        withTiming(0.95, { duration: 45 }),
        withTiming(0.25, { duration: 65 }),
        withTiming(1, { duration: 55 }),
        withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) }),
      );
      const [minMs, maxMs] = intervalRange;
      const nextDelay = minMs + Math.random() * Math.max(1000, maxMs - minMs);
      timer = setTimeout(triggerStrike, nextDelay);
    };

    // First strike happens quickly (1.6s) so users see thunder right away when stormy or previewing.
    timer = setTimeout(triggerStrike, 1_600);
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      cancelAnimation(flash);
      cancelAnimation(boltOpacity);
    };
  }, [active, boltOpacity, flash, intervalRange]);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const boltStyle = useAnimatedStyle(() => ({ opacity: boltOpacity.value }));

  return (
    <>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: palette.lightningFlash }, flashStyle]}
      />
      <Animated.View style={[StyleSheet.absoluteFill, boltStyle]}>
        <Svg width={width} height={height * 0.65}>
          <Path
            d={bolt.mainPath}
            stroke={palette.lightningOuter}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d={bolt.mainPath}
            stroke={palette.lightningCore}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {bolt.branchPath ? (
            <>
              <Path
                d={bolt.branchPath}
                stroke={palette.lightningOuter}
                strokeWidth={4.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <Path
                d={bolt.branchPath}
                stroke={palette.lightningCore}
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </>
          ) : null}
        </Svg>
      </Animated.View>
    </>
  );
}

export function WeatherAtmosphereOverlay({
  bottomLandingOffset = 0,
}: {
  /** Height from bottom of screen where raindrops land and form ripples (e.g. tab bar top). */
  bottomLandingOffset?: number;
}) {
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();
  const appearance = useResolvedAppearance();
  const foreground = useAppForeground();
  const reducedMotion = useReducedMotion();
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

  const config = resolved.config;
  const isLight = appearance === "light";
  const palette = useMemo(
    () => (config ? resolvePalette(config, isLight) : null),
    [config, isLight],
  );

  const rainDrops = useMemo(() => (config ? createRainParticles(config) : []), [config]);
  const rainSplashes = useMemo(() => (config ? createRainSplashes(config) : []), [config]);
  const snowFlakes = useMemo(() => (config ? createSnowParticles(config) : []), [config]);
  const stars = useMemo(() => (config ? createStarParticles(config) : []), [config]);
  const clouds = useMemo(() => (config ? createCloudWisps(config) : []), [config]);

  if (!resolved.visible || !config || !palette || width <= 0 || height <= 0) {
    return null;
  }

  const animate = foreground && !reducedMotion;
  const landingBottomPx = Math.max(4, bottomLandingOffset);
  const rainTravelHeight = Math.max(160, height - landingBottomPx);

  return (
    <View
      pointerEvents="none"
      testID="weather-atmosphere-overlay"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 35, opacity: resolved.opacityScale, overflow: "hidden" },
      ]}
    >
      {/* Subtle atmospheric top/bottom tint wash + clear-day sunbeam bloom */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="weatherTopWash" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.topWash} stopOpacity="1" />
            <Stop offset="0.45" stopColor={palette.topWash} stopOpacity="0" />
            <Stop offset="0.78" stopColor={palette.bottomWash} stopOpacity="0" />
            <Stop offset="1" stopColor={palette.bottomWash} stopOpacity="1" />
          </LinearGradient>
          {config.hasSunbeams ? (
            <RadialGradient id="weatherSunBloom" cx="88%" cy="6%" rx="55%" ry="32%">
              <Stop offset="0" stopColor={palette.sunCore} stopOpacity="1" />
              <Stop offset="0.52" stopColor={palette.sunMid} stopOpacity="1" />
              <Stop offset="1" stopColor={palette.sunMid} stopOpacity="0" />
            </RadialGradient>
          ) : null}
          {config.hasSnow && config.groundFrostOpacity > 0 ? (
            <LinearGradient id="weatherSnowFrost" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={palette.frostTop} stopOpacity="0" />
              <Stop
                offset="1"
                stopColor={palette.frostBottom}
                stopOpacity={String(config.groundFrostOpacity)}
              />
            </LinearGradient>
          ) : null}
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#weatherTopWash)" />
        {config.hasSunbeams ? (
          <Rect x={0} y={0} width={width} height={height * 0.5} fill="url(#weatherSunBloom)" />
        ) : null}
        {config.hasSnow && config.groundFrostOpacity > 0 ? (
          <Rect
            x={0}
            y={Math.max(0, height - landingBottomPx - 36)}
            width={width}
            height={42}
            fill="url(#weatherSnowFrost)"
          />
        ) : null}
      </Svg>

      {/* Soft drifting cloud or fog veils */}
      {clouds.map((wisp) => (
        <CloudWispView
          key={`cloud-${config.kind}-${wisp.id}`}
          spec={wisp}
          width={width}
          height={height}
          color={config.hasFog ? palette.fogColor : palette.cloudColor}
          active={animate}
        />
      ))}

      {/* Clear night stars */}
      {stars.map((star) => (
        <StarTwinkleView
          key={`star-${star.id}`}
          spec={star}
          width={width}
          height={height}
          color={palette.starColor}
          active={animate}
        />
      ))}

      {/* Multi-depth wind-slanted rain streaks */}
      {!reducedMotion
        ? rainDrops.map((drop) => (
            <RainDropView
              key={`rain-${config.kind}-${drop.id}`}
              spec={drop}
              width={width}
              travelHeight={rainTravelHeight}
              windAngleDeg={config.windAngleDeg}
              color={drop.depth > 0.5 ? palette.rainNear : palette.rainFar}
              highlightColor={palette.rainHighlight}
              active={animate}
            />
          ))
        : null}

      {/* Ground-impact rain ripples & bouncing micro-droplets */}
      {!reducedMotion
        ? rainSplashes.map((splash) => (
            <RainSplashView
              key={`splash-${config.kind}-${splash.id}`}
              spec={splash}
              width={width}
              landingBottomPx={landingBottomPx}
              ringColor={palette.splashRing}
              dropColor={palette.splashDrop}
              active={animate}
            />
          ))
        : null}

      {/* Fluttering multi-depth snowflakes */}
      {!reducedMotion
        ? snowFlakes.map((flake) => (
            <SnowFlakeView
              key={`snow-${config.kind}-${flake.id}`}
              spec={flake}
              width={width}
              height={height}
              fillColor={palette.snowFill}
              borderColor={palette.snowBorder}
              active={animate}
            />
          ))
        : null}

      {/* Thunderstorm jagged branching SVG lightning + ambient sky double-flash */}
      {config.hasLightning && !reducedMotion ? (
        <LightningLayer
          width={width}
          height={height}
          intervalRange={config.lightningIntervalMsRange}
          palette={palette}
          active={animate}
        />
      ) : null}
    </View>
  );
}
