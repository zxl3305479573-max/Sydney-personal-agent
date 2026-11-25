import type { MessageBlock } from "@rakazo/contracts";
import { typeScale } from "@rakazo/ui-tokens";
import { useEffect, useState } from "react";
import type { ViewProps } from "react-native";
import { Alert, StyleSheet, Text, View } from "react-native";
import { rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { useThreadReadOnly } from "../lib/thread-read-only";
import { errorText } from "../lib/user-error";
import { GlassSurface } from "./glass-surface";
import { NativeActionButton } from "./native-action-button";

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: {
    alignItems: "center",
    borderRadius: 10,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  badgeText: { fontSize: 12.5, fontWeight: "600" },
  card: {
    maxWidth: 576,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 10,
  },
  description: { ...typeScale.secondary, opacity: 0.78 },
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  headline: { flex: 1, gap: 2 },
  summary: typeScale.caption,
  title: typeScale.cardTitle,
});

export function McpApprovalCard({
  botId,
  threadId,
  block,
  accessibilityActions,
  onAccessibilityAction,
}: {
  botId: string;
  threadId?: string;
  block: Extract<MessageBlock, { kind: "mcp_approval" }>;
  accessibilityActions?: ViewProps["accessibilityActions"];
  onAccessibilityAction?: ViewProps["onAccessibilityAction"];
}) {
  const { t } = useI18n();
  const readOnly = useThreadReadOnly();
  const tokens = useMobileTokens();
  const [localStatus, setLocalStatus] = useState<"pending" | "connected" | "dismissed">("pending");
  const [pendingAction, setPendingAction] = useState<"approve" | "dismiss" | null>(null);
  useEffect(() => {
    if (block.status === "connected" || block.status === "dismissed") return;
    setLocalStatus((current) =>
      current === "connected" || current === "dismissed" ? "pending" : current,
    );
  }, [block.status]);
  const status = block.status && block.status !== "pending" ? block.status : localStatus;
  const summary = block.endpoint ?? `stdio (${block.transport})`;

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

  async function submit(action: "approve" | "dismiss") {
    if (readOnly || status !== "pending" || pendingAction !== null) return;
    setPendingAction(action);
    try {
      if (action === "approve") {
        await rpc("mcp/assignments/approve", { botId, serverId: block.serverId, threadId });
      } else {
        await rpc("mcp/assignments/dismiss", { botId, serverId: block.serverId, threadId });
      }
      setLocalStatus(action === "approve" ? "connected" : "dismissed");
    } catch (reason) {
      Alert.alert(
        action === "approve" ? t("Could not approve this server") : t("Could not complete action"),
        errorText(reason, t("Please try again.")),
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <GlassSurface
      shape="roundedRectangle"
      cornerRadius={20}
      accessibilityLabel={t("Connect MCP server {name}", { name: block.name })}
      style={[
        styles.card,
        {
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
        <View
          style={[
            styles.badge,
            {
              backgroundColor: pillBg,
              borderWidth: hairline,
              borderColor: pillBorder,
            },
          ]}
        >
          <Text style={[styles.badgeText, { color: softTaupe }]}>M</Text>
        </View>
        <View style={styles.headline}>
          <Text
            accessibilityActions={accessibilityActions}
            onAccessibilityAction={onAccessibilityAction}
            style={[styles.title, { color: tokens.foreground }]}
          >
            {t("Connect MCP server {name}", { name: block.name })}
          </Text>
          <Text style={[styles.summary, { color: tokens.mutedForeground }]} numberOfLines={2}>
            {summary}
          </Text>
        </View>
      </View>
      {status !== "pending" ? (
        <Text
          style={{
            color: status === "connected" ? tokens.success : tokens.mutedForeground,
            ...typeScale.secondary,
          }}
        >
          {status === "connected"
            ? t("Connected.")
            : t("Dismissed. Reconnect anytime from MCP settings.")}
        </Text>
      ) : !readOnly ? (
        <>
          <Text style={[styles.description, { color: tokens.foreground }]}>
            {block.needsOAuth
              ? t("Finish MCP authorization in the web app.")
              : t("Approve this server to let your agent use its tools.")}
          </Text>
          <View style={styles.actions}>
            {!block.needsOAuth ? (
              <NativeActionButton
                label={t("Approve")}
                fill={false}
                disabled={pendingAction !== null}
                onPress={() => void submit("approve")}
              />
            ) : null}
            <NativeActionButton
              label={t("Not now")}
              prominence="secondary"
              disabled={pendingAction !== null}
              onPress={() => void submit("dismiss")}
            />
          </View>
        </>
      ) : null}
    </GlassSurface>
  );
}
