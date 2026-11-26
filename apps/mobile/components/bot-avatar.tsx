import type { BotAvatarSet } from "@rakazo/contracts";
import type { AvatarMotionMode, LogoAvatarActivity } from "@rakazo/core";
import { avatarWorkingDot, isRunWorking } from "@rakazo/core";
import { memo } from "react";
import { Image, View } from "react-native";
import { mobileBotAvatarPresentation } from "../lib/bot-avatar";
import { conversationStatusLabel, conversationStatusTone } from "../lib/conversation-status";
import { DEFAULT_BOT_AVATAR_IMAGE_SOURCE } from "../lib/default-bot-avatar";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { NativeSymbol } from "./native-symbol";

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
  muted = false,
  unread = false,
  motion = "static",
  composing = false,
}: BotAvatarProps) {
  const tokens = useMobileTokens();
  const { t } = useI18n();
  const parsed = mobileBotAvatarPresentation(color);
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
        : unread || ((isRunWorking(status) || composing) && motion !== "running")
          ? {
              color: tokens.workingDot,
              label: t("Working"),
            }
          : null;

  const source =
    parsed.kind === "image" && parsed.imageUrl
      ? { uri: parsed.imageUrl }
      : DEFAULT_BOT_AVATAR_IMAGE_SOURCE;

  return (
    <View style={{ width: size, height: size }}>
      <View
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
});
