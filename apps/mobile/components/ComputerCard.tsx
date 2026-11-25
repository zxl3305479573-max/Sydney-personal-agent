import { ChatMarkdown } from "@rakazo/chat-ui/native";
import type { MessageBlock } from "@rakazo/contracts";
import { typeScale } from "@rakazo/ui-tokens";
import type { ViewProps } from "react-native";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { threadCardWidth } from "../lib/message-presentation";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { useThreadReadOnly } from "../lib/thread-read-only";
import { GlassSurface } from "./glass-surface";
import { NativeActionButton } from "./native-action-button";

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  header: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  state: { flexShrink: 1, ...typeScale.caption },
  statePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  title: typeScale.cardTitle,
});

export function ComputerCard({
  block,
  onOpen,
  accessibilityActions,
  onAccessibilityAction,
}: {
  block: Extract<MessageBlock, { kind: "computer" }>;
  onOpen?: () => void;
  accessibilityActions?: ViewProps["accessibilityActions"];
  onAccessibilityAction?: ViewProps["onAccessibilityAction"];
}) {
  const { t } = useI18n();
  const readOnly = useThreadReadOnly();
  const tokens = useMobileTokens();
  const colorScheme = useResolvedAppearance();
  const { width: windowWidth } = useWindowDimensions();

  const isLight = colorScheme === "light";
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder =
    tokens?.border ?? (isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)");
  const pillBg = isLight ? "#F8F6F2" : "#2A303B";
  const pillBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";

  return (
    <GlassSurface
      testID="computer-card"
      shape="roundedRectangle"
      cornerRadius={20}
      fallbackStyle={{
        backgroundColor: cardBg,
        borderWidth: hairline,
        borderColor: cardBorder,
      }}
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
    >
      <View style={styles.header}>
        <Text
          accessibilityActions={accessibilityActions}
          onAccessibilityAction={onAccessibilityAction}
          style={[styles.title, { color: tokens.foreground }]}
        >
          {t("Computer")}
        </Text>
        <View
          style={[
            styles.statePill,
            {
              backgroundColor: pillBg,
              borderWidth: hairline,
              borderColor: pillBorder,
            },
          ]}
        >
          <Text
            style={[
              styles.state,
              {
                color:
                  block.state === "Needs you"
                    ? tokens.warning
                    : block.state === "Skipped"
                      ? tokens.mutedForeground
                      : tokens.success,
              },
            ]}
          >
            {block.state === "Needs you"
              ? t("Needs you")
              : block.state === "Skipped"
                ? t("Skipped")
                : block.state === "Done"
                  ? t("Done")
                  : block.state}
          </Text>
        </View>
      </View>
      {block.text ? (
        <ChatMarkdown palette={tokens} colorScheme={colorScheme}>
          {block.text}
        </ChatMarkdown>
      ) : null}
      {onOpen && !readOnly ? (
        <View testID="computer-card-open">
          <NativeActionButton label={t("Open computer")} fill={false} onPress={onOpen} />
        </View>
      ) : null}
    </GlassSurface>
  );
}
