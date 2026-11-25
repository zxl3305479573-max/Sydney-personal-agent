import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useResolvedAppearance } from "../lib/native";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const SPLASH_MARK_IMAGE = require("../assets/splash-icon.png");

const STROKE_ONE = "M43 98 C73 85 108 94 130 111 C151 129 150 166 158 190 C166 210 202 209 237 201";
const STROKE_TWO = "M128 111 C150 79 173 45 195 47 C218 46 226 68 210 87 C193 106 171 114 148 125";
const STROKE_THREE = "M130 113 C91 118 37 126 25 151 C7 187 35 211 62 196 C90 181 111 146 130 122";
const PATH_LENGTH = 360;

export const SPLASH_LOGO_MIN_SIZE = 180;
export const SPLASH_LOGO_MAX_SIZE = 240;

export function resolveSplashLogoSize(windowWidth: number): number {
  return Math.round(
    Math.min(SPLASH_LOGO_MAX_SIZE, Math.max(SPLASH_LOGO_MIN_SIZE, windowWidth * 0.56)),
  );
}

export type StartupSplashProps = {
  ready: boolean;
  onFinished: () => void;
};

/**
 * Full-screen animated startup overlay that seamlessly continues from the native splash screen:
 * enlarged Sydney mark, calligraphic stroke reveal, soft warm-porcelain halo, and smooth exit.
 */
export function StartupSplash({ ready, onFinished }: StartupSplashProps) {
  const appearance = useResolvedAppearance();
  const { width } = useWindowDimensions();
  const [visible, setVisible] = useState(true);
  const finishedRef = useRef(false);
  const startedRef = useRef(false);

  const containerOpacity = useSharedValue(1);
  const containerScale = useSharedValue(1);
  const markScale = useSharedValue(0.92);
  const markImageOpacity = useSharedValue(0);
  const strokeOne = useSharedValue(1);
  const strokeTwo = useSharedValue(1);
  const strokeThree = useSharedValue(1);
  const haloOuter = useSharedValue(0);
  const haloInner = useSharedValue(0);
  const wordmarkOpacity = useSharedValue(0);
  const wordmarkTranslateY = useSharedValue(10);

  const isLight = appearance === "light";
  const backgroundColor = isLight ? "#F3F1EC" : "#15171C";
  const strokeColor = isLight ? "#26231F" : "#F3F1EC";
  const titleColor = isLight ? "#26231F" : "#F5F4F0";
  const subtitleColor = isLight ? "#6E675E" : "#A6A199";
  const haloOuterColor = isLight ? "rgba(197, 163, 103, 0.16)" : "rgba(168, 188, 218, 0.14)";
  const haloInnerColor = isLight ? "rgba(54, 69, 86, 0.08)" : "rgba(245, 244, 240, 0.08)";
  const logoSize = resolveSplashLogoSize(width);

  useEffect(() => {
    if (!ready || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    let doneTimer: ReturnType<typeof setTimeout> | undefined;

    const complete = () => {
      if (finishedRef.current || cancelled) return;
      finishedRef.current = true;
      setVisible(false);
      onFinished();
    };

    const start = async () => {
      let reduceMotion = false;
      try {
        reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {
        reduceMotion = false;
      }
      if (cancelled) return;

      if (reduceMotion) {
        strokeOne.value = 0;
        strokeTwo.value = 0;
        strokeThree.value = 0;
        markScale.value = 1;
        markImageOpacity.value = isLight ? 1 : 0;
        wordmarkOpacity.value = 1;
        wordmarkTranslateY.value = 0;
        exitTimer = setTimeout(() => {
          containerOpacity.value = withTiming(0, { duration: 160 });
          doneTimer = setTimeout(complete, 180);
        }, 260);
        return;
      }

      const easeOut = Easing.out(Easing.cubic);
      haloOuter.value = withTiming(1, { duration: 760, easing: easeOut });
      haloInner.value = withDelay(90, withTiming(1, { duration: 680, easing: easeOut }));

      strokeOne.value = withTiming(0, { duration: 340, easing: easeOut });
      strokeTwo.value = withDelay(130, withTiming(0, { duration: 300, easing: easeOut }));
      strokeThree.value = withDelay(240, withTiming(0, { duration: 320, easing: easeOut }));

      markScale.value = withSequence(
        withTiming(1.03, { duration: 480, easing: easeOut }),
        withTiming(1, { duration: 240, easing: easeOut }),
      );
      if (isLight) {
        markImageOpacity.value = withDelay(360, withTiming(1, { duration: 260, easing: easeOut }));
      }

      wordmarkOpacity.value = withDelay(260, withTiming(1, { duration: 320, easing: easeOut }));
      wordmarkTranslateY.value = withDelay(260, withTiming(0, { duration: 340, easing: easeOut }));

      exitTimer = setTimeout(() => {
        containerOpacity.value = withTiming(0, {
          duration: 260,
          easing: Easing.inOut(Easing.quad),
        });
        containerScale.value = withTiming(1.03, { duration: 260, easing: easeOut });
        doneTimer = setTimeout(complete, 280);
      }, 880);
    };

    void start();
    return () => {
      cancelled = true;
      if (exitTimer) clearTimeout(exitTimer);
      if (doneTimer) clearTimeout(doneTimer);
    };
  }, [
    containerOpacity,
    containerScale,
    haloInner,
    haloOuter,
    isLight,
    markImageOpacity,
    markScale,
    onFinished,
    ready,
    strokeOne,
    strokeThree,
    strokeTwo,
    wordmarkOpacity,
    wordmarkTranslateY,
  ]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ scale: containerScale.value }],
  }));

  const markAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: markScale.value }],
  }));

  const markImageStyle = useAnimatedStyle(() => ({
    opacity: markImageOpacity.value,
  }));

  const haloOuterStyle = useAnimatedStyle(() => ({
    opacity: (1 - haloOuter.value * 0.45) * Math.min(1, haloOuter.value * 2),
    transform: [{ scale: 0.72 + haloOuter.value * 0.42 }],
  }));

  const haloInnerStyle = useAnimatedStyle(() => ({
    opacity: (1 - haloInner.value * 0.35) * Math.min(1, haloInner.value * 2),
    transform: [{ scale: 0.78 + haloInner.value * 0.28 }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: wordmarkTranslateY.value }],
  }));

  const strokeOneProps = useAnimatedProps(() => ({
    strokeDashoffset: PATH_LENGTH * strokeOne.value,
  }));
  const strokeTwoProps = useAnimatedProps(() => ({
    strokeDashoffset: PATH_LENGTH * strokeTwo.value,
  }));
  const strokeThreeProps = useAnimatedProps(() => ({
    strokeDashoffset: PATH_LENGTH * strokeThree.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View
      testID="startup-splash-overlay"
      accessibilityLabel="Sydney 正在启动"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor }, containerAnimatedStyle]}
    >
      <View style={styles.center}>
        <Animated.View
          style={[
            styles.halo,
            {
              width: logoSize * 1.48,
              height: logoSize * 1.48,
              borderRadius: logoSize * 0.74,
              backgroundColor: haloOuterColor,
            },
            haloOuterStyle,
          ]}
        />
        <Animated.View
          style={[
            styles.halo,
            {
              width: logoSize * 1.16,
              height: logoSize * 1.16,
              borderRadius: logoSize * 0.58,
              backgroundColor: haloInnerColor,
            },
            haloInnerStyle,
          ]}
        />

        <Animated.View
          testID="startup-splash-logo"
          style={[styles.logoBox, { width: logoSize, height: logoSize }, markAnimatedStyle]}
        >
          <Svg width={logoSize} height={logoSize} viewBox="0 0 256 256">
            <AnimatedPath
              d={STROKE_ONE}
              fill="none"
              stroke={strokeColor}
              strokeWidth={14}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={PATH_LENGTH}
              animatedProps={strokeOneProps}
            />
            <AnimatedPath
              d={STROKE_TWO}
              fill="none"
              stroke={strokeColor}
              strokeWidth={13}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={PATH_LENGTH}
              animatedProps={strokeTwoProps}
            />
            <AnimatedPath
              d={STROKE_THREE}
              fill="none"
              stroke={strokeColor}
              strokeWidth={14}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={PATH_LENGTH}
              animatedProps={strokeThreeProps}
            />
          </Svg>
          {isLight ? (
            <Animated.View style={[StyleSheet.absoluteFill, styles.imageWrap, markImageStyle]}>
              <Image
                source={SPLASH_MARK_IMAGE}
                resizeMode="contain"
                style={{ width: logoSize * 1.46, height: logoSize * 1.46 }}
              />
            </Animated.View>
          ) : null}
        </Animated.View>

        <Animated.View style={[styles.wordmark, wordmarkStyle]}>
          <Text style={[styles.title, { color: titleColor }]}>Sydney</Text>
          <Text style={[styles.subtitle, { color: subtitleColor }]}>Personal Agent</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
  },
  logoBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  imageWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    marginTop: 14,
    alignItems: "center",
    gap: 4,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
  subtitle: {
    fontSize: 12.5,
    lineHeight: 16,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
});
