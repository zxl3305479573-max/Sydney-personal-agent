import type { MessageBlock } from "@rakazo/contracts";
import { typeScale } from "@rakazo/ui-tokens";
import { useRef, useState } from "react";
import type { ViewProps } from "react-native";
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import {
  choiceCardOptions,
  DISMISSED_CHOICE_ANSWER_ID,
  threadCardWidth,
} from "../lib/message-presentation";
import { useMobileTokens } from "../lib/native";
import { useThreadReadOnly } from "../lib/thread-read-only";
import { errorText } from "../lib/user-error";
import { GlassSurface } from "./glass-surface";
import { NativeSymbol } from "./native-symbol";

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  dismiss: {
    alignItems: "center",
    borderRadius: 13,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  header: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
  heading: { flex: 1, gap: 2 },
  letter: {
    alignItems: "center",
    borderRadius: 8,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  letterText: { fontSize: 12.5, fontWeight: "600" },
  option: {
    alignItems: "center",
    borderRadius: 16,
    flexDirection: "row",
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionLabel: { flex: 1, fontSize: 15 },
  options: { gap: 8 },
  question: typeScale.cardTitle,
  subtitle: typeScale.secondary,
});

export function ChoiceCard({
  botId,
  block,
  onDismissed,
  accessibilityActions,
  onAccessibilityAction,
}: {
  botId: string;
  block: Extract<MessageBlock, { kind: "choice" }>;
  onDismissed?: () => void;
  accessibilityActions?: ViewProps["accessibilityActions"];
  onAccessibilityAction?: ViewProps["onAccessibilityAction"];
}) {
  const { t } = useI18n();
  const readOnly = useThreadReadOnly();
  const tokens = useMobileTokens();
  const { width: windowWidth } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  // Set in the handler, so a second tap cannot pass before the buttons re-render disabled.
  const pending = useRef(false);
  // Shows the outcome before the thread stream delivers the updated block.
  const [localAnswerId, setLocalAnswerId] = useState<string>();
  const answerId = block.answerId ?? localAnswerId;
  if (answerId === DISMISSED_CHOICE_ANSWER_ID) return null;

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
  const pillPressedBg = isLight ? "#EFECE5" : "#323946";
  const pillBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const softTaupe = isLight ? "#6E675E" : "#B8B3AA";

  // Dismissing records the server's dismissed answer id, so both outcomes share this path.
  async function submit(optionId: string) {
    if (readOnly || pending.current || answerId) return;
    pending.current = true;
    setBusy(true);
    try {
      if (optionId === DISMISSED_CHOICE_ANSWER_ID) {
        await rpc("onboarding/dismissFocus", { botId });
      } else {
        await rpc("onboarding/choose", { botId, optionId });
      }
      setLocalAnswerId(optionId);
      if (optionId === DISMISSED_CHOICE_ANSWER_ID) onDismissed?.();
    } catch (reason) {
      Alert.alert(t("Could not complete action"), errorText(reason, t("Please try again.")));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <GlassSurface
      testID="choice-card"
      shape="roundedRectangle"
      cornerRadius={20}
      style={[
        styles.card,
        {
          width: threadCardWidth(windowWidth),
          shadowColor: "#26231F",
          shadowOpacity: isLight ? 0.028 : 0.16,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 5 },
        },
      ]}
      fallbackStyle={{
        backgroundColor: cardBg,
        borderWidth: hairline,
        borderColor: cardBorder,
      }}
    >
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text
            accessibilityRole="header"
            accessibilityActions={accessibilityActions}
            onAccessibilityAction={onAccessibilityAction}
            style={[styles.question, { color: tokens.foreground }]}
          >
            {block.question}
          </Text>
          {block.subtitle ? (
            <Text style={[styles.subtitle, { color: tokens.mutedForeground }]}>
              {block.subtitle}
            </Text>
          ) : null}
        </View>
        {!readOnly && !answerId ? (
          <Pressable
            testID="choice-card-dismiss"
            accessibilityRole="button"
            accessibilityLabel={t("Dismiss")}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            hitSlop={10}
            onPress={() => void submit(DISMISSED_CHOICE_ANSWER_ID)}
            style={[
              styles.dismiss,
              {
                backgroundColor: pillBg,
                borderWidth: hairline,
                borderColor: pillBorder,
              },
            ]}
          >
            <NativeSymbol ios="xmark" android="close" size={13} color={softTaupe} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.options}>
        {choiceCardOptions({ ...block, answerId }).map((option) => {
          const chosen = option.id === answerId;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ disabled: readOnly || busy || chosen, selected: chosen }}
              disabled={readOnly || busy || chosen}
              onPress={() => void submit(option.id)}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: pressed || chosen ? pillPressedBg : pillBg,
                  borderWidth: hairline,
                  borderColor: pillBorder,
                  opacity: busy ? 0.6 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.letter,
                  {
                    backgroundColor: cardBg,
                    borderWidth: hairline,
                    borderColor: pillBorder,
                  },
                ]}
              >
                <Text style={[styles.letterText, { color: softTaupe }]}>{option.letter}</Text>
              </View>
              <Text
                style={[
                  styles.optionLabel,
                  { color: chosen ? tokens.mutedForeground : tokens.foreground },
                ]}
              >
                {option.label}
              </Text>
              {chosen ? (
                <NativeSymbol
                  ios="checkmark"
                  android="checkmark"
                  size={15}
                  color={softTaupe}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </GlassSurface>
  );
}
