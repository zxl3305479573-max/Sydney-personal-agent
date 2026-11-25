import { ActivityIndicator, Text, View } from "react-native";
import { conversationStatusTone } from "../../lib/conversation-status";
import { useI18n } from "../../lib/i18n";
import { useMobileTokens } from "../../lib/native";
import type { ActivityMarkBot } from "../activity-mark";
import { ActivityMark } from "../activity-mark";
import { MotionPressable } from "../motion-pressable";
import { ScrollToBottomButton } from "../scroll-to-bottom-button";

/** The bots still working or waiting on the user, shown at the bottom-left under the newest message. */
export function ThreadWorkingFooter({
  bots,
  label,
  atBottom,
}: {
  bots: ReadonlyArray<ActivityMarkBot & { name?: string }>;
  label: string;
  atBottom: boolean;
}) {
  const { t } = useI18n();
  if (bots.length === 0) return null;
  const firstBot = bots[0];
  const waiting = bots.every((bot) => conversationStatusTone(bot.status) === "waiting");
  const accessibilityLabel = waiting
    ? `${firstBot?.name ?? t("Agent")}, ${label}`
    : bots.length === 1
      ? t("{name} is working", { name: firstBot?.name ?? t("Agent") })
      : t("{count} agents working", { count: bots.length });
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="text"
      style={{ minHeight: 40, marginTop: 12, justifyContent: "center" }}
    >
      <ActivityMark bots={bots} atBottom={atBottom} label={label} />
    </View>
  );
}

export function LoadEarlierButton({ loading, onPress }: { loading: boolean; onPress: () => void }) {
  const tokens = useMobileTokens();
  const { t } = useI18n();
  return (
    <MotionPressable
      preset="control"
      disabled={loading}
      onPress={onPress}
      style={{
        alignSelf: "center",
        alignItems: "center",
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      {loading ? (
        <ActivityIndicator color={tokens.mutedForeground} accessibilityLabel={t("Loading…")} />
      ) : null}
      <Text style={{ color: tokens.mutedForeground, fontSize: 13 }}>
        {t("Load earlier messages")}
      </Text>
    </MotionPressable>
  );
}

/** Floats over the column's trailing corner, with a dot while newer messages wait below. */
export function JumpToLatestButton({
  bottomInset,
  insetEnd,
  unread,
  onPress,
}: {
  bottomInset: number;
  /** Distance from the trailing screen edge to the chat column. */
  insetEnd: number;
  unread: boolean;
  onPress: () => void;
}) {
  const tokens = useMobileTokens();
  const { t } = useI18n();
  return (
    <View style={{ position: "absolute", end: insetEnd, bottom: bottomInset + 12 }}>
      <ScrollToBottomButton
        accessibilityLabel={unread ? t("Jump to latest, new messages") : t("Jump to latest")}
        onPress={onPress}
      />
      {unread ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 3,
            end: 3,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: tokens.primary,
          }}
        />
      ) : null}
    </View>
  );
}
