import type { MessageBlock } from "@rakazo/contracts";
import { appConnectedInput, waitForConnection } from "@rakazo/core";
import { fontWeight, typeScale } from "@rakazo/ui-tokens";
import { useEffect, useRef, useState } from "react";
import type { ViewProps } from "react-native";
import { Linking, Text, View } from "react-native";
import { rpc } from "../lib/api";
import { appConnectPresentation } from "../lib/app-connect";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { useThreadReadOnly } from "../lib/thread-read-only";
import { errorText } from "../lib/user-error";
import { ConnectorIcon } from "./connector-icon";
import { GlassSurface } from "./glass-surface";
import { NativeActionButton } from "./native-action-button";

function isLightSurface(background?: string): boolean {
  if (!background || !background.startsWith("#") || background.length < 7) return true;
  return Number.parseInt(background.slice(1, 3), 16) >= 128;
}

export function AppConnectCard({
  botId,
  threadId,
  messageId,
  block,
  accessibilityActions,
  onAccessibilityAction,
}: {
  botId: string;
  threadId?: string;
  messageId?: string;
  block: Extract<MessageBlock, { kind: "app_connect" }>;
  accessibilityActions?: ViewProps["accessibilityActions"];
  onAccessibilityAction?: ViewProps["onAccessibilityAction"];
}) {
  const { t } = useI18n();
  const readOnly = useThreadReadOnly();
  const tokens = useMobileTokens();
  const [busy, setBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState<"pending" | "connected">(block.status);
  const [error, setError] = useState<string | null>(null);
  const connectionAttempt = useRef<AbortController | null>(null);
  const status = block.status === "connected" ? "connected" : localStatus;
  const view = appConnectPresentation({ ...block, status }, busy);

  useEffect(() => () => connectionAttempt.current?.abort(), []);

  async function authorize() {
    if (readOnly || !threadId) return;
    connectionAttempt.current?.abort();
    const controller = new AbortController();
    connectionAttempt.current = controller;
    setBusy(true);
    setError(null);
    try {
      const started = await rpc(
        "connections/begin",
        {
          connectorId: block.connectorId,
          provider: block.provider,
          displayName: block.name,
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (started.authorizationUrl) await Linking.openURL(started.authorizationUrl);
      const result = await waitForConnection(
        started.connectionId,
        (input) => rpc("connections/complete", input, { signal: controller.signal }),
        { signal: controller.signal, attempts: 60 },
      );
      if (result.status === "aborted") return;
      if (result.status === "connected") {
        await rpc("onboarding/appConnected", appConnectedInput(botId, threadId, block, messageId));
        if (controller.signal.aborted) return;
        setLocalStatus("connected");
        return;
      }
      setError(t("Authorization timed out. Please try again."));
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(errorText(reason, t("Could not authorize this app")));
      }
    } finally {
      if (connectionAttempt.current === controller) {
        connectionAttempt.current = null;
        setBusy(false);
      }
    }
  }

  const isLight = isLightSurface(tokens?.background);
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder = isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const fg = tokens?.foreground ?? (isLight ? "#26231F" : "#F5F4F0");
  const mutedFg = tokens?.mutedForeground ?? (isLight ? "#6E675E" : "#B8B3AA");
  const successColor = tokens?.success ?? (isLight ? "#006B3D" : "#46BD7B");
  const destructiveColor = tokens?.destructive ?? (isLight ? "#C4272D" : "#FF8F8C");

  return (
    <GlassSurface
      accessibilityLabel={t("{name} connection", { name: block.name })}
      shape="roundedRectangle"
      cornerRadius={20}
      gradient="rose"
      fallbackStyle={{
        backgroundColor: cardBg,
        borderRadius: 20,
        borderWidth: 0.5,
        borderColor: cardBorder,
        shadowColor: "#26231F",
        shadowOpacity: isLight ? 0.028 : 0.16,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 5 },
        elevation: 1,
      }}
      style={{
        width: "100%",
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 15,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            backgroundColor: chipBg,
            borderWidth: 0.5,
            borderColor: chipBorder,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ConnectorIcon name={block.name} logo={block.logo} size={30} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            accessibilityActions={accessibilityActions}
            onAccessibilityAction={onAccessibilityAction}
            style={{ color: fg, ...typeScale.cardTitle }}
          >
            {view.title}
          </Text>
          <Text style={{ color: mutedFg, ...typeScale.secondary }} numberOfLines={1}>
            {view.description}
          </Text>
        </View>
        {view.showAuthorize && !readOnly && threadId ? (
          <NativeActionButton
            label={view.actionLabel}
            accessibilityLabel={t("Authorize {name}", { name: block.name })}
            fill={false}
            busy={busy}
            style={{ alignSelf: "center" }}
            onPress={() => void authorize()}
          />
        ) : !view.showAuthorize ? (
          <View
            style={{
              backgroundColor: chipBg,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderWidth: 0.5,
              borderColor: chipBorder,
            }}
          >
            <Text
              style={{ color: successColor, ...typeScale.secondary, fontWeight: fontWeight.medium }}
            >
              {view.actionLabel}
            </Text>
          </View>
        ) : null}
      </View>
      {error ? (
        <Text style={{ color: destructiveColor, ...typeScale.caption }}>{error}</Text>
      ) : null}
    </GlassSurface>
  );
}
