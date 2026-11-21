import type { GroupMember } from "@rakazo/contracts";
import type { ComponentProps } from "react";
import { Pressable } from "react-native";
import { useThemedStyles } from "../lib/native";
import { CHAT_TITLE_AVATAR_SIZE, ChatTitleAvatar } from "./chat-title-avatar";
import { ChatTitleLabel } from "./chat-title-label";
import { GlassSurface } from "./glass-surface";
import { GroupSeats } from "./group-seats";
import { createThreadHeaderStyles } from "./thread-header-styles";

export function ChatTitleContent({
  name,
  bot,
  members,
  status,
  composing = false,
  accessibilityLabel,
  onPress,
  showAvatar = true,
}: {
  name: string;
  bot?: ComponentProps<typeof ChatTitleAvatar>["bot"];
  members?: GroupMember[];
  status?: string;
  composing?: boolean;
  accessibilityLabel: string;
  onPress?: () => void;
  showAvatar?: boolean;
}) {
  const styles = useThemedStyles(createThreadHeaderStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      onPress={onPress}
    >
      <GlassSurface chatTitle style={styles.titleCapsule} fallbackStyle={styles.titleCapsuleFill}>
        {!showAvatar ? null : members ? (
          <GroupSeats members={members} size={CHAT_TITLE_AVATAR_SIZE} />
        ) : (
          <ChatTitleAvatar bot={bot} status={status} composing={composing} />
        )}
        <ChatTitleLabel label={name} placeholder={!name} style={styles.title} />
      </GlassSurface>
    </Pressable>
  );
}
