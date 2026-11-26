import type { BotAvatarSet } from "@rakazo/contracts";
import type { AvatarMotionMode, LogoAvatarActivity } from "@rakazo/core";
import {
  AVATAR_LID_CLOSE,
  AVATAR_MOTION_UNITS,
  AVATAR_TYPING_DOTS,
  avatarClip,
  avatarClock,
  avatarFrame,
  avatarLifeState,
  avatarPokeFrame,
  avatarRestingBlink,
  avatarSchedulePose,
  avatarThinkingDot,
  avatarWorkingDot,
  isRunWorking,
} from "@rakazo/core";
import { memo } from "react";
import { Image, Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion } from "react-native-reanimated";
import type { AvatarLife } from "../lib/avatar-life";
import { useAvatarOnScreen, useLife, usePoke, useSettling } from "../lib/avatar-life";
import { mobileBotAvatarPresentation } from "../lib/bot-avatar";
import { conversationStatusLabel, conversationStatusTone } from "../lib/conversation-status";
import { DEFAULT_BOT_AVATAR_IMAGE_SOURCE } from "../lib/default-bot-avatar";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { NativeSymbol } from "./native-symbol";

/** How far (0–1) the face has turned into the typing dots, for a morph of 0–1. */
function morphGrow(morph: number): number {
  "worklet";
  const t = Math.min(Math.max(morph, 0), 1);
  return t * t * (3 - 2 * t);
}
/** The face shrinks until it is the size of the middle typing dot. */
const MORPH_SHRINK = 1 - (2 * AVATAR_TYPING_DOTS.radius) / AVATAR_MOTION_UNITS;

/** The avatar's flat frame right now, a tap poke included; a worklet. */
function liveFrame(life: AvatarLife) {
  "worklet";
  const now = life.seconds.value;
  const segments = life.schedule.value;
  const pose = avatarSchedulePose(segments, now);
  const frame = avatarFrame(pose, life.awake.value);
  if (life.awake.value < 1) {
    let shut = 0;
    for (const segment of segments) {
      if (!segment.clip || segment.start > now) continue;
      const clip = avatarClip(segment.clip);
      for (const blink of clip.blinks ?? [])
        shut = Math.max(shut, avatarRestingBlink(now - segment.start - blink));
    }
    frame.lid = Math.min(frame.lid, 1 - AVATAR_LID_CLOSE * shut);
  }
  const poke = life.poke.value;
  if (poke) {
    const extra = avatarPokeFrame(poke, life.pokeProgress.value);
    frame.rotate += extra.rotate;
    frame.translateY += extra.translateY;
    frame.scaleY *= extra.scaleY;
    frame.eyeY += extra.eyeY;
  }
  const grow = morphGrow(life.morph.value);
  frame.scaleX *= 1 - MORPH_SHRINK * grow;
  frame.scaleY *= 1 - MORPH_SHRINK * grow;
  return { frame, grow };
}

/** The body transform for an avatar `size` points wide. */
function useBodyStyle(life: AvatarLife, size: number) {
  return useAnimatedStyle(() => {
    const { frame, grow } = liveFrame(life);
    return {
      opacity: 1 - grow,
      transform: [
        { translateX: frame.translateX * size },
        { translateY: frame.translateY * size },
        { rotate: `${frame.rotate}deg` },
        { scaleX: frame.scaleX },
        { scaleY: frame.scaleY },
      ],
    };
  });
}

export interface BotAvatarProps {
  color: string;
  size?: number;
  status?: string;
  identity?: string;
  avatarSet?: BotAvatarSet;
  activity?: LogoAvatarActivity;
  muted?: boolean;
  unread?: boolean;
  motion?: AvatarMotionMode;
  composing?: boolean;
  pokeable?: boolean;
}

function WorkingDot({
  size,
  muted,
  color,
  accessibilityLabel,
}: {
  size: number;
  muted: boolean;
  color: string;
  accessibilityLabel: string;
}) {
  const tokens = useMobileTokens();
  const dot = avatarWorkingDot(size);
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={{
        position: "absolute",
        right: muted ? undefined : dot.inset - dot.ring,
        left: muted ? dot.inset - dot.ring : undefined,
        bottom: dot.inset - dot.ring,
        width: dot.diameter + dot.ring * 2,
        height: dot.diameter + dot.ring * 2,
        borderRadius: size,
        borderWidth: dot.ring,
        borderColor: tokens.background,
        backgroundColor: color,
      }}
    />
  );
}

function MutedBadge({ size }: { size: number }) {
  const tokens = useMobileTokens();
  const { t } = useI18n();
  return (
    <View
      accessible
      accessibilityLabel={t("Notifications silenced")}
      style={{
        position: "absolute",
        right: -2,
        bottom: -2,
        width: Math.max(14, Math.round(size * 0.34)),
        height: Math.max(14, Math.round(size * 0.34)),
        borderRadius: size,
        borderWidth: 2,
        borderColor: tokens.background,
        // Opaque under the translucent fill, so the avatar does not show through the bell.
        backgroundColor: tokens.background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          borderRadius: size,
          backgroundColor: tokens.secondary,
        }}
      />
      <NativeSymbol
        ios="bell.slash.fill"
        android="notifications-off"
        size={Math.max(8, Math.round(size * 0.17))}
        color={tokens.foreground}
      />
    </View>
  );
}

export const BotAvatar = memo(function BotAvatar({
  color,
  size = 54,
  status,
  identity,
  muted = false,
  unread = false,
  motion = "static",
  composing = false,
  pokeable = false,
}: BotAvatarProps) {
  const tokens = useMobileTokens();
  const { t } = useI18n();
  const state = avatarLifeState(status, composing);
  const parsed = mobileBotAvatarPresentation(color);
  const isCustomPhoto = parsed.kind === "image" && Boolean(parsed.imageUrl);
  const onScreen = useAvatarOnScreen();
  const reducedMotion = useReducedMotion();
  const settling = useSettling(state);
  const clock = avatarClock({
    mode: motion,
    onScreen,
    hasEyes: !isCustomPhoto,
    size,
    state,
    settling,
    reducedMotion,
  });
  const typingDotsActive = !isCustomPhoto && clock !== "still" && composing;
  const statusTone = conversationStatusTone(status);
  const marker: { color: string; label: string } | null =
    statusTone === "waiting"
      ? {
          color: tokens.warning ?? "#E89E30",
          label: conversationStatusLabel(status, t) || t("Needs input"),
        }
      : statusTone === "failed" && !unread
        ? {
            color: tokens.destructive ?? "#E5484D",
            label: t("Failed"),
          }
        : unread ||
            ((isRunWorking(status) || composing) && !typingDotsActive && motion !== "running")
          ? {
              color: tokens.workingDot,
              label: t("Working"),
            }
          : null;

  const life = useLife(state, clock, size, motion);
  const poke = usePoke(life, pokeable && clock === "running");
  const bodyStyle = useBodyStyle(life, size);
  const fillColor = parsed.kind === "shape" || parsed.kind === "color" ? parsed.color : color;
  const source =
    isCustomPhoto && parsed.kind === "image" && parsed.imageUrl
      ? { uri: parsed.imageUrl }
      : DEFAULT_BOT_AVATAR_IMAGE_SOURCE;

  const circle = (
    <View
      testID={identity ? `bot-avatar-${identity}` : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        // A plain circle holds the photo's place while it loads, or if it fails to.
        backgroundColor: tokens.secondary,
      }}
    >
      <Image source={source} style={{ width: size, height: size }} />
    </View>
  );

  const avatar = (
    <View style={{ width: size, height: size }}>
      {isCustomPhoto ? circle : <Animated.View style={bodyStyle}>{circle}</Animated.View>}
      {!isCustomPhoto && clock !== "still" ? (
        <ThinkingDots color={fillColor || tokens.workingDot} size={size} life={life} />
      ) : null}
      {marker ? (
        <WorkingDot
          size={size}
          muted={muted}
          color={marker.color}
          accessibilityLabel={marker.label}
        />
      ) : null}
      {muted ? <MutedBadge size={size} /> : null}
    </View>
  );

  // A tap is a little toy, not an action, so it stays out of the accessibility tree.
  return pokeable ? (
    <Pressable accessible={false} onPress={poke}>
      {avatar}
    </Pressable>
  ) : (
    avatar
  );
});

/** The three typing dots a writing bot's avatar turns into; the middle one is its body. */
function ThinkingDots({ color, size, life }: { color: string; size: number; life: AvatarLife }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: size, height: size }}>
      <Dot slot={0} color={color} size={size} life={life} />
      <Dot slot={1} color={color} size={size} life={life} />
      <Dot slot={2} color={color} size={size} life={life} />
    </View>
  );
}

function Dot({
  slot,
  color,
  size,
  life,
}: {
  slot: 0 | 1 | 2;
  color: string;
  size: number;
  life: AvatarLife;
}) {
  const style = useAnimatedStyle(() => {
    const dot = avatarThinkingDot(slot, life.seconds.value, life.morph.value);
    const unit = size / AVATAR_MOTION_UNITS;
    const radius = dot.radius * unit;
    return {
      opacity: dot.opacity,
      width: radius * 2,
      height: radius * 2,
      borderRadius: radius,
      left: size / 2 + dot.x * unit - radius,
      top: size / 2 + dot.y * unit - radius,
    };
  });
  return <Animated.View style={[{ position: "absolute", backgroundColor: color }, style]} />;
}
