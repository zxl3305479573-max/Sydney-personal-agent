import { usePathname } from "expo-router";
import { memo, useEffect, useMemo, useRef, useState } from "react";
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
import Svg, {
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { useAppForeground } from "../lib/app-foreground";
import { useHomeWeather } from "../lib/home-weather";
import { useResolvedAppearance } from "../lib/native";
import type { WeatherAtmosphereWashSpec } from "../lib/weather-atmosphere-helpers";
import {
  resolveActiveWeatherScene,
  resolveWeatherAtmosphereWash,
} from "../lib/weather-atmosphere-helpers";
import type {
  CloudWispSpec,
  RainDropSpec,
  RainSplashSpec,
  SnowFlakeSpec,
  StarSpec,
  SunMoteSpec,
  SunShaftSpec,
  WeatherSceneConfig,
} from "../lib/weather-scene";
import {
  createCloudWisps,
  createRainParticles,
  createRainSplashes,
  createSnowParticles,
  createStarParticles,
  createSunMotes,
  createSunShafts,
  generateLightningBolt,
} from "../lib/weather-scene";
import { useWeatherScenePreferences } from "../lib/weather-scene-state";
import { useWeatherAmbientSound } from "../lib/weather-sound";

type Palette = {
  rainNear: string;
  rainFar: string;
  rainHighlight: string;
  splashRing: string;
  splashDrop: string;
  snowFill: string;
  snowBorder: string;
  cloudHex: string;
  cloudOpacity: number;
  fogHex: string;
  fogOpacity: number;
  sunShaftHex: string;
  sunShaftOpacity: number;
  sunMoteColor: string;
  sunFlareRing: string;
  sunFlareTint: string;
  starColor: string;
  lightningFlash: string;
  lightningOuterHex: string;
  lightningOuterOpacity: number;
  lightningCoreHex: string;
  lightningCoreOpacity: number;
  wash: WeatherAtmosphereWashSpec;
};

function resolvePalette(config: WeatherSceneConfig, isLight: boolean): Palette {
  const wash = resolveWeatherAtmosphereWash(config, isLight);
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
      cloudHex: storm ? "#5B6D86" : "#FFFFFF",
      cloudOpacity: storm ? 0.24 : 0.44,
      fogHex: "#C2CBD6",
      fogOpacity: 0.34,
      sunShaftHex: "#FFF5D6",
      sunShaftOpacity: 0.28,
      sunMoteColor: "rgba(255, 232, 174, 0.85)",
      sunFlareRing: "rgba(246, 214, 146, 0.26)",
      sunFlareTint: "rgba(255, 240, 196, 0.14)",
      starColor: "rgba(76, 98, 148, 0.52)",
      lightningFlash: "rgba(214, 230, 255, 0.34)",
      lightningOuterHex: "#4880EE",
      lightningOuterOpacity: 0.62,
      lightningCoreHex: "#FAFDFF",
      lightningCoreOpacity: 0.98,
      wash,
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
    cloudHex: storm ? "#8FA4C4" : "#B6C9E0",
    cloudOpacity: storm ? 0.18 : 0.16,
    fogHex: "#C6D4E4",
    fogOpacity: 0.2,
    sunShaftHex: "#FFE8B8",
    sunShaftOpacity: 0.15,
    sunMoteColor: "rgba(255, 236, 188, 0.72)",
    sunFlareRing: "rgba(255, 226, 166, 0.18)",
    sunFlareTint: "rgba(255, 232, 182, 0.08)",
    starColor: "rgba(236, 244, 255, 0.88)",
    lightningFlash: "rgba(214, 232, 255, 0.32)",
    lightningOuterHex: "#7CB4FF",
    lightningOuterOpacity: 0.72,
    lightningCoreHex: "#FFFFFF",
    lightningCoreOpacity: 0.98,
    wash,
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
  hexColor,
  peakOpacity,
  active,
}: {
  spec: CloudWispSpec;
  width: number;
  height: number;
  hexColor: string;
  peakOpacity: number;
  active: boolean;
}) {
  const progress = useSharedValue(0);
  const wispWidth = Math.round(width * spec.widthRatio);
  const wispHeight = spec.heightPx;
  const gradId = `cloudPuff-${spec.id}`;

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

  const midOpacity = Number((peakOpacity * 0.45).toFixed(3));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: height * spec.yRatio,
          left: 0,
          width: wispWidth,
          height: wispHeight,
        },
        animStyle,
      ]}
    >
      <Svg width={wispWidth} height={wispHeight}>
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={hexColor} stopOpacity={String(peakOpacity)} />
            <Stop offset="0.55" stopColor={hexColor} stopOpacity={String(midOpacity)} />
            <Stop offset="1" stopColor={hexColor} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={wispWidth * 0.5}
          cy={wispHeight * 0.54}
          rx={wispWidth * 0.48}
          ry={wispHeight * 0.44}
          fill={`url(#${gradId})`}
        />
        <Ellipse
          cx={wispWidth * 0.36}
          cy={wispHeight * 0.44}
          rx={wispWidth * 0.28}
          ry={wispHeight * 0.36}
          fill={`url(#${gradId})`}
        />
        <Ellipse
          cx={wispWidth * 0.64}
          cy={wispHeight * 0.46}
          rx={wispWidth * 0.26}
          ry={wispHeight * 0.34}
          fill={`url(#${gradId})`}
        />
      </Svg>
    </Animated.View>
  );
});

const SunShaftView = memo(function SunShaftView({
  spec,
  width,
  height,
  hexColor,
  peakOpacity,
  active,
}: {
  spec: SunShaftSpec;
  width: number;
  height: number;
  hexColor: string;
  peakOpacity: number;
  active: boolean;
}) {
  const breath = useSharedValue(0.65);
  const lengthPx = Math.round(height * spec.lengthRatio);
  const gradId = `sunShaft-${spec.id}`;

  useEffect(() => {
    if (!active) {
      cancelAnimation(breath);
      breath.value = 0.72;
      return;
    }
    breath.value = 0.5;
    breath.value = withDelay(
      spec.delayMs,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: Math.round(spec.durationMs * 0.5),
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(0.42, {
            duration: Math.round(spec.durationMs * 0.5),
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(breath);
  }, [active, breath, spec.delayMs, spec.durationMs]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: spec.peakOpacity * breath.value,
  }));

  const midOpacity = Number((peakOpacity * 0.42).toFixed(3));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: -lengthPx * 0.16,
          left: width - spec.widthPx * 0.5 + spec.rightOffsetPx,
          width: spec.widthPx,
          height: lengthPx,
          transform: [{ rotate: `${spec.angleDeg}deg` }],
        },
        animStyle,
      ]}
    >
      <Svg width={spec.widthPx} height={lengthPx}>
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="18%" rx="50%" ry="76%">
            <Stop offset="0" stopColor={hexColor} stopOpacity={String(peakOpacity)} />
            <Stop offset="0.48" stopColor={hexColor} stopOpacity={String(midOpacity)} />
            <Stop offset="1" stopColor={hexColor} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={spec.widthPx / 2}
          cy={lengthPx / 2}
          rx={spec.widthPx / 2}
          ry={lengthPx / 2}
          fill={`url(#${gradId})`}
        />
      </Svg>
    </Animated.View>
  );
});

const SunMoteView = memo(function SunMoteView({
  spec,
  width,
  height,
  color,
  active,
}: {
  spec: SunMoteSpec;
  width: number;
  height: number;
  color: string;
  active: boolean;
}) {
  const pulse = useSharedValue(0.35);

  useEffect(() => {
    if (!active) {
      cancelAnimation(pulse);
      return;
    }
    pulse.value = 0.2;
    pulse.value = withDelay(
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
    return () => cancelAnimation(pulse);
  }, [active, pulse, spec.delayMs, spec.durationMs]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: spec.peakOpacity * pulse.value,
    transform: [
      { translateY: (pulse.value - 0.5) * -spec.driftY },
      { scale: 0.8 + pulse.value * 0.35 },
    ],
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

const SunbeamLayer = memo(function SunbeamLayer({
  width,
  height,
  shafts,
  motes,
  palette,
  active,
}: {
  width: number;
  height: number;
  shafts: SunShaftSpec[];
  motes: SunMoteSpec[];
  palette: Palette;
  active: boolean;
}) {
  const { wash } = palette;
  const glowHeight = Math.round(height * 0.38);
  const flares = [
    { x: width * 0.72, y: height * 0.11, size: 22, filled: false },
    { x: width * 0.62, y: height * 0.16, size: 12, filled: true },
    { x: width * 0.53, y: height * 0.21, size: 8, filled: false },
  ];

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Wide off-corner warm sunlit atmosphere (no circular sun blob) */}
      <Svg width={width} height={glowHeight} style={{ position: "absolute", top: 0, left: 0 }}>
        <Defs>
          <RadialGradient id="weatherSunAtmosphere" cx="100%" cy="-6%" rx="72%" ry="86%">
            <Stop
              offset="0"
              stopColor={wash.sunCore.color}
              stopOpacity={String(wash.sunCore.opacity)}
            />
            <Stop
              offset="0.48"
              stopColor={wash.sunMid.color}
              stopOpacity={String(wash.sunMid.opacity)}
            />
            <Stop offset="1" stopColor={wash.sunMid.color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={glowHeight} fill="url(#weatherSunAtmosphere)" />
      </Svg>

      {/* Breathing diagonal volumetric light shafts */}
      {shafts.map((shaft) => (
        <SunShaftView
          key={`shaft-${shaft.id}`}
          spec={shaft}
          width={width}
          height={height}
          hexColor={palette.sunShaftHex}
          peakOpacity={palette.sunShaftOpacity}
          active={active}
        />
      ))}

      {/* Subtle optical lens-flare bokeh rings */}
      {flares.map((flare, idx) => (
        <View
          key={`flare-${idx}`}
          style={{
            position: "absolute",
            left: flare.x - flare.size / 2,
            top: flare.y - flare.size / 2,
            width: flare.size,
            height: flare.size,
            borderRadius: flare.size / 2,
            borderWidth: flare.filled ? 0 : 1,
            borderColor: palette.sunFlareRing,
            backgroundColor: flare.filled ? palette.sunFlareTint : "transparent",
          }}
        />
      ))}

      {/* Gently drifting sunlit warm motes */}
      {motes.map((mote) => (
        <SunMoteView
          key={`mote-${mote.id}`}
          spec={mote}
          width={width}
          height={height}
          color={palette.sunMoteColor}
          active={active}
        />
      ))}
    </View>
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

  const hasSparkle = spec.size >= 3;
  const sparkleSpan = Math.round(spec.size * 2.8);

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: spec.xRatio * width,
          top: spec.yRatio * height,
          width: hasSparkle ? sparkleSpan : spec.size,
          height: hasSparkle ? sparkleSpan : spec.size,
          alignItems: "center",
          justifyContent: "center",
        },
        animStyle,
      ]}
    >
      {hasSparkle ? (
        <>
          <View
            style={{
              position: "absolute",
              width: sparkleSpan,
              height: 1,
              borderRadius: 0.5,
              backgroundColor: color,
              opacity: 0.55,
            }}
          />
          <View
            style={{
              position: "absolute",
              width: 1,
              height: sparkleSpan,
              borderRadius: 0.5,
              backgroundColor: color,
              opacity: 0.55,
            }}
          />
        </>
      ) : null}
      <View
        style={{
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: color,
        }}
      />
    </Animated.View>
  );
});

function LightningLayer({
  width,
  height,
  intervalRange,
  palette,
  active,
  onStrike,
}: {
  width: number;
  height: number;
  intervalRange: readonly [number, number];
  palette: Palette;
  active: boolean;
  onStrike?: () => void;
}) {
  const [boltSeed, setBoltSeed] = useState(17);
  const flash = useSharedValue(0);
  const boltOpacity = useSharedValue(0);
  const onStrikeRef = useRef(onStrike);
  onStrikeRef.current = onStrike;

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
    let thunderTimer: ReturnType<typeof setTimeout> | undefined;
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
      // Realistic slight light-to-sound propagation delay before thunder rolls in.
      if (thunderTimer !== undefined) clearTimeout(thunderTimer);
      thunderTimer = setTimeout(
        () => {
          if (!cancelled) onStrikeRef.current?.();
        },
        240 + Math.round(Math.random() * 240),
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
      if (thunderTimer !== undefined) clearTimeout(thunderTimer);
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
            stroke={palette.lightningOuterHex}
            strokeOpacity={palette.lightningOuterOpacity}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d={bolt.mainPath}
            stroke={palette.lightningCoreHex}
            strokeOpacity={palette.lightningCoreOpacity}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {bolt.branchPath ? (
            <>
              <Path
                d={bolt.branchPath}
                stroke={palette.lightningOuterHex}
                strokeOpacity={palette.lightningOuterOpacity}
                strokeWidth={4.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <Path
                d={bolt.branchPath}
                stroke={palette.lightningCoreHex}
                strokeOpacity={palette.lightningCoreOpacity}
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
  const sunShafts = useMemo(() => (config ? createSunShafts(config) : []), [config]);
  const sunMotes = useMemo(() => (config ? createSunMotes(config) : []), [config]);

  const { onLightningStrike } = useWeatherAmbientSound({
    config: resolved.visible ? config : null,
    sceneEnabled: prefs.enabled,
    soundEnabled: prefs.soundEnabled,
    soundVolume: prefs.soundVolume,
    foreground,
  });

  if (!resolved.visible || !config || !palette || width <= 0 || height <= 0) {
    return null;
  }

  const animate = foreground && !reducedMotion;
  const landingBottomPx = Math.max(4, bottomLandingOffset);
  const rainTravelHeight = Math.max(160, height - landingBottomPx);

  const { wash } = palette;
  const hasTopWash = wash.topWash.opacity > 0;
  const hasBottomMist = wash.bottomMist.opacity > 0;
  const hasSnowFrost = wash.frostBottom.opacity > 0;
  const hasAnyAtmosphereSvg = hasTopWash || hasBottomMist || hasSnowFrost;
  const topWashHeight = Math.max(48, Math.round(height * wash.topWashHeightRatio));

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
      {/* Subtle localized sky rim / rain-landing mist / snow frost (strict hex + stopOpacity) */}
      {hasAnyAtmosphereSvg ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            {hasTopWash ? (
              <LinearGradient id="weatherTopWash" x1="0" y1="0" x2="0" y2="1">
                <Stop
                  offset="0"
                  stopColor={wash.topWash.color}
                  stopOpacity={String(wash.topWash.opacity)}
                />
                <Stop
                  offset="0.55"
                  stopColor={wash.topWash.color}
                  stopOpacity={String(Number((wash.topWash.opacity * 0.35).toFixed(3)))}
                />
                <Stop offset="1" stopColor={wash.topWash.color} stopOpacity="0" />
              </LinearGradient>
            ) : null}
            {hasBottomMist ? (
              <LinearGradient id="weatherBottomMist" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={wash.bottomMist.color} stopOpacity="0" />
                <Stop
                  offset="1"
                  stopColor={wash.bottomMist.color}
                  stopOpacity={String(wash.bottomMist.opacity)}
                />
              </LinearGradient>
            ) : null}
            {hasSnowFrost ? (
              <LinearGradient id="weatherSnowFrost" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={wash.frostBottom.color} stopOpacity="0" />
                <Stop
                  offset="1"
                  stopColor={wash.frostBottom.color}
                  stopOpacity={String(wash.frostBottom.opacity)}
                />
              </LinearGradient>
            ) : null}
          </Defs>
          {hasTopWash ? (
            <Rect x={0} y={0} width={width} height={topWashHeight} fill="url(#weatherTopWash)" />
          ) : null}
          {hasBottomMist ? (
            <Rect
              x={0}
              y={Math.max(0, height - landingBottomPx - 26)}
              width={width}
              height={28}
              fill="url(#weatherBottomMist)"
            />
          ) : null}
          {hasSnowFrost ? (
            <Rect
              x={0}
              y={Math.max(0, height - landingBottomPx - 30)}
              width={width}
              height={32}
              fill="url(#weatherSnowFrost)"
            />
          ) : null}
        </Svg>
      ) : null}

      {/* Clear-day volumetric sunbeams, soft off-corner glow, lens-flare bokeh & warm motes */}
      {config.hasSunbeams ? (
        <SunbeamLayer
          width={width}
          height={height}
          shafts={sunShafts}
          motes={sunMotes}
          palette={palette}
          active={animate}
        />
      ) : null}

      {/* Feathered drifting cloud or fog veils */}
      {clouds.map((wisp) => (
        <CloudWispView
          key={`cloud-${config.kind}-${wisp.id}`}
          spec={wisp}
          width={width}
          height={height}
          hexColor={config.hasFog ? palette.fogHex : palette.cloudHex}
          peakOpacity={config.hasFog ? palette.fogOpacity : palette.cloudOpacity}
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
          onStrike={onLightningStrike}
        />
      ) : null}
    </View>
  );
}
