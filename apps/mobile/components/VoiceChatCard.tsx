import type { VoiceChatGroup } from "@rakazo/core";
import { speechFromBlocks, voiceChatDuration, voiceChatSummary } from "@rakazo/core";
import { typeScale } from "@rakazo/ui-tokens";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { MobileMessage } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { NativeSymbol } from "./native-symbol";

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** One call's exchange, collapsed to a card; expanding it shows the transcript. */
export function VoiceChatCard({ group }: { group: VoiceChatGroup<MobileMessage> }) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const [open, setOpen] = useState(false);
  const summary = voiceChatSummary(group);

  const bg = tokens?.background;
  const isLight =
    typeof bg === "string" && /^#[\da-f]{6}/i.test(bg)
      ? Number.parseInt(bg.slice(1, 3), 16) > 128
      : true;
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder =
    tokens?.border ?? (isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)");
  const pillBg = isLight ? "#F8F6F2" : "#2A303B";
  const pillBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const softTaupe = isLight ? "#6E675E" : "#B8B3AA";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: cardBg,
          borderWidth: hairline,
          borderColor: cardBorder,
          shadowColor: "#26231F",
          shadowOpacity: isLight ? 0.028 : 0.16,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 5 },
          elevation: 1,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? t("Hide transcript") : t("Show transcript")}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((wasOpen) => !wasOpen)}
        style={styles.header}
      >
        <View
          style={[
            styles.waveBadge,
            {
              backgroundColor: pillBg,
              borderWidth: hairline,
              borderColor: pillBorder,
            },
          ]}
        >
          <NativeSymbol ios="waveform" android="pulse-outline" size={14} color={softTaupe} />
        </View>
        <Text style={[styles.title, { color: tokens.foreground }]}>{t("Voice chat")}</Text>
        <Text style={[styles.duration, { color: tokens.mutedForeground }]}>
          {clock(voiceChatDuration(group))}
        </Text>
        <View style={styles.chevron}>
          <NativeSymbol
            ios={open ? "chevron.up" : "chevron.down"}
            android={open ? "chevron-up" : "chevron-down"}
            size={15}
            color={tokens.mutedForeground}
          />
        </View>
      </Pressable>
      {open ? (
        <View style={styles.transcript}>
          {group.messages.map((message) => {
            // The marker is the card's summary line, never a transcript turn.
            if (message === group.marker) return null;
            const text = speechFromBlocks(message.blocks).trim();
            if (!text) return null;
            return message.role === "user" ? (
              <Text key={message.id} style={[styles.user, { color: tokens.mutedForeground }]}>
                {text}
              </Text>
            ) : (
              <Text
                key={message.id}
                style={[
                  styles.bot,
                  {
                    backgroundColor: pillBg,
                    borderWidth: hairline,
                    borderColor: pillBorder,
                    color: tokens.foreground,
                  },
                ]}
              >
                {text}
              </Text>
            );
          })}
        </View>
      ) : summary ? (
        <Text numberOfLines={1} style={[styles.summary, { color: tokens.mutedForeground }]}>
          {summary}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "flex-start",
    maxWidth: "88%",
    borderRadius: 20,
  },
  // 40 tall around the 22 pt title line, growing with it at larger text sizes.
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 40,
  },
  waveBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: typeScale.cardTitle,
  duration: { ...typeScale.caption, fontVariant: ["tabular-nums"] },
  chevron: { marginStart: "auto", paddingStart: 8 },
  summary: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    ...typeScale.secondary,
    writingDirection: "auto",
  },
  transcript: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  user: {
    alignSelf: "flex-end",
    ...typeScale.secondary,
    textAlign: "right",
    writingDirection: "auto",
  },
  bot: {
    ...typeScale.secondary,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    overflow: "hidden",
    writingDirection: "auto",
  },
});
