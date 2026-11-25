import { StyleSheet, Text, TextInput, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { native } from "../lib/native";
import type { useMcpOAuthReturn } from "../lib/use-mcp-oauth-return";
import { GlassSurface } from "./glass-surface";
import { NativeActionButton } from "./native-action-button";

export function McpOAuthReturn({
  flow,
  onCompleted,
}: {
  flow: ReturnType<typeof useMcpOAuthReturn>;
  onCompleted: () => void;
}) {
  const { t } = useI18n();
  if (!flow.available && !flow.error) return null;
  return (
    <GlassSurface style={styles.card} fallbackStyle={{ backgroundColor: native.groupedCell }}>
      {flow.available ? (
        <>
          <Text style={{ color: native.label }}>
            {t("If the browser cannot finish, copy its full callback address and paste it here.")}
          </Text>
          <TextInput
            accessibilityLabel={t("MCP callback address")}
            value={flow.value}
            onChangeText={flow.setValue}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            secureTextEntry
            maxLength={16_384}
            placeholder={t("Paste callback address")}
            placeholderTextColor={native.tertiaryLabel}
            style={[styles.input, { color: native.label }]}
          />
          <View style={styles.actions}>
            <NativeActionButton
              label={t("Complete connection")}
              disabled={!flow.value.trim() || flow.busy}
              busy={flow.busy}
              onPress={() => void flow.complete().then((completed) => completed && onCompleted())}
              prominence="primary"
              fill={false}
            />
            <NativeActionButton
              label={t("Cancel")}
              disabled={flow.busy}
              onPress={flow.clear}
              prominence="secondary"
              fill={false}
            />
          </View>
        </>
      ) : null}
      {flow.error ? (
        <Text accessibilityLiveRegion="polite" style={{ color: native.secondaryLabel }}>
          {flow.error === "invalid"
            ? t("The callback address does not match this connection attempt.")
            : flow.error === "changed"
              ? t("The account, server, or space changed. Start the connection again.")
              : t("Could not confirm the connection. Start a new connection attempt.")}
        </Text>
      ) : null}
      {!flow.available && flow.error ? (
        <NativeActionButton
          label={t("Dismiss")}
          onPress={flow.clear}
          prominence="secondary"
          fill={false}
        />
      ) : null}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 12 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: native.separator,
    backgroundColor: native.fill,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
