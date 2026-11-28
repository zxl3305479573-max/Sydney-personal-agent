import { ChatMarkdown } from "@rakazo/chat-ui/native";
import type { MessageBlock } from "@rakazo/contracts";
import { typeScale } from "@rakazo/ui-tokens";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import type { ViewProps } from "react-native";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { WebView } from "react-native-webview";
import { currentApiBase } from "../lib/api";
import { useAppForeground } from "../lib/app-foreground";
import { embeddableScreenUrl, retainScreenSource, screenUrlForApi } from "../lib/computer";
import { useFeatureAccess } from "../lib/feature-access";
import { useI18n } from "../lib/i18n";
import { threadCardWidth } from "../lib/message-presentation";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { queryClient, rpcQuery } from "../lib/query";
import { isAllowedScreenNavigation } from "../lib/screen-navigation";
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
  botId,
  active = false,
  onOpen,
  onTakeControl,
  accessibilityActions,
  onAccessibilityAction,
}: {
  block: Extract<MessageBlock, { kind: "computer" }>;
  botId?: string;
  active?: boolean;
  onOpen?: () => void;
  onTakeControl?: () => void;
  accessibilityActions?: ViewProps["accessibilityActions"];
  onAccessibilityAction?: ViewProps["onAccessibilityAction"];
}) {
  const { t } = useI18n();
  const readOnly = useThreadReadOnly();
  const tokens = useMobileTokens();
  const colorScheme = useResolvedAppearance();
  const { width: windowWidth } = useWindowDimensions();
  const access = useFeatureAccess();
  const foreground = useAppForeground();
  const [focused, setFocused] = useState(false);
  const [source, setSource] = useState<{ scope: string; url: string } | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const previewActive = Boolean(
    botId && active && !readOnly && access.computer && foreground && focused,
  );
  const options = rpcQuery("computer/screenUrl", { botId: botId ?? "", viewOnly: true });
  const scope = JSON.stringify(options.queryKey);
  const preview = useQuery(
    {
      ...options,
      enabled: previewActive,
      refetchInterval: previewActive ? 30_000 : false,
      retry: false,
    },
    queryClient,
  );
  useEffect(() => {
    if (!previewActive || preview.isError || !preview.data) {
      setSource(null);
      return;
    }
    const next = embeddableScreenUrl(
      screenUrlForApi(preview.data, currentApiBase()),
      currentApiBase(),
    );
    setSource((held) =>
      next
        ? {
            scope,
            url:
              held?.scope === scope && held.url !== failedSource
                ? retainScreenSource(held.url, next)
                : next,
          }
        : null,
    );
  }, [previewActive, preview.data, preview.isError, failedSource, scope]);
  const visibleSource =
    previewActive && !preview.isError && source?.scope === scope && source.url !== failedSource
      ? source.url
      : null;
  const state = block.state === "Live" ? (active ? t("Live desktop") : t("Done")) : block.state;

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
                  : state}
          </Text>
        </View>
      </View>
      {previewActive ? (
        <View
          testID="computer-card-preview"
          style={{
            aspectRatio: 16 / 10,
            borderRadius: 12,
            overflow: "hidden",
            backgroundColor: tokens.muted,
          }}
        >
          {visibleSource ? (
            <WebView
              source={{ uri: visibleSource }}
              style={{ flex: 1 }}
              pointerEvents="none"
              accessible={false}
              scrollEnabled={false}
              javaScriptCanOpenWindowsAutomatically={false}
              setSupportMultipleWindows={false}
              mixedContentMode="never"
              onShouldStartLoadWithRequest={(request) =>
                isAllowedScreenNavigation(visibleSource, request.url)
              }
              onError={() => setFailedSource(visibleSource)}
              onHttpError={() => setFailedSource(visibleSource)}
              onContentProcessDidTerminate={() => setFailedSource(visibleSource)}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: tokens.mutedForeground, textAlign: "center" }}
              >
                {preview.isError || failedSource || !preview.isPending
                  ? t("Preview unavailable. Open the computer to reconnect.")
                  : t("Loading live desktop…")}
              </Text>
            </View>
          )}
        </View>
      ) : null}
      {block.text ? (
        <ChatMarkdown palette={tokens} colorScheme={colorScheme}>
          {block.text}
        </ChatMarkdown>
      ) : null}
      {onOpen && !readOnly && access.computer ? (
        <View style={{ gap: 8 }}>
          {onTakeControl ? (
            <Text style={{ color: tokens.mutedForeground, ...typeScale.caption }}>
              {t("If the bot is working, taking control stops its current task.")}
            </Text>
          ) : null}
          <View
            testID="computer-card-open"
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
          >
            <NativeActionButton label={t("Open computer")} fill={false} onPress={onOpen} />
            {onTakeControl ? (
              <NativeActionButton label={t("Take control")} fill={false} onPress={onTakeControl} />
            ) : null}
          </View>
        </View>
      ) : null}
    </GlassSurface>
  );
}
