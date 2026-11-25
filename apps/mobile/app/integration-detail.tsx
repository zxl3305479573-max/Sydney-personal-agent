import type { Connection, ConnectionCatalogItem, RpcOutput } from "@rakazo/contracts";
import { CONNECTION_LABEL_MAX_LENGTH } from "@rakazo/contracts";
import {
  catalogItemAccounts,
  catalogItemKey,
  connectCatalogItem,
  humanizeToolName,
} from "@rakazo/core";
import type { ColorTokens } from "@rakazo/ui-tokens";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ConnectorIcon } from "../components/connector-icon";
import { GlassSurface } from "../components/glass-surface";
import { MotionPressable } from "../components/motion-pressable";
import { NativeActionButton } from "../components/native-action-button";
import { Chevron } from "../components/row-accessories";
import { rpc } from "../lib/api";
import { mobileTokens } from "../lib/appearance";
import { cardGradient } from "../lib/card-gradient";
import { useI18n } from "../lib/i18n";
import type { IntegrationsCacheScope, IntegrationsSnapshot } from "../lib/integrations-cache";
import {
  integrationsCacheScope,
  isIntegrationsScopeCurrent,
  persistedIntegrationsCacheScope,
  readIntegrationsCache,
  writeIntegrationsCache,
} from "../lib/integrations-cache";
import { loadLastBotId } from "../lib/last-bot";
import type { NativeColors } from "../lib/native";
import { native, useThemedStyles } from "../lib/native";
import { useSideInsets } from "../lib/side-insets";
import type { ResolvedScopedTheme } from "../lib/theme-pack";
import { errorText } from "../lib/user-error";

type ConnectionTool = RpcOutput<"connections/tools">[number];

const LOGO_SIZE = 32;

export default function IntegrationDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    connectorId?: string;
    slug?: string;
    name?: string;
    logo?: string;
  }>();
  const connectorId = typeof params.connectorId === "string" ? params.connectorId : "";
  const slug = typeof params.slug === "string" ? params.slug : "";
  const paramName = typeof params.name === "string" ? params.name : "";
  const paramLogo = typeof params.logo === "string" ? params.logo : null;

  const sideInsets = useSideInsets();
  const styles = useThemedStyles(createDetailStyles);
  const { t } = useI18n();

  const [catalog, setCatalog] = useState<ConnectionCatalogItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [lastBotId, setLastBotId] = useState("");
  const [tools, setTools] = useState<ConnectionTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [toolsTick, setToolsTick] = useState(0);

  const connectionAttempt = useRef<AbortController | null>(null);
  const cacheScope = useRef<IntegrationsCacheScope | null>(null);
  const snapshot = useRef<IntegrationsSnapshot>({ catalog: [], connections: [] });
  const mounted = useRef(false);
  const focusGeneration = useRef(0);
  const refreshGeneration = useRef(0);

  function applySnapshot(next: IntegrationsSnapshot) {
    snapshot.current = next;
    setCatalog(next.catalog);
    setConnections(next.connections);
    setLabelDrafts((current) =>
      Object.fromEntries(
        next.connections
          .filter((row) => row.status === "connected" || row.status === "pending")
          .map((row) => [row.id, current[row.id] ?? row.displayName]),
      ),
    );
  }

  function saveSnapshot(next: IntegrationsSnapshot) {
    const scope = cacheScope.current;
    if (!mounted.current || !scope || !isIntegrationsScopeCurrent(scope)) return;
    refreshGeneration.current += 1;
    applySnapshot(next);
    writeIntegrationsCache(scope, next);
  }

  function captureConnectionScope() {
    const scope = cacheScope.current;
    const focus = focusGeneration.current;
    return () => {
      const current = cacheScope.current;
      return (
        !!scope &&
        !!current &&
        mounted.current &&
        focus === focusGeneration.current &&
        isIntegrationsScopeCurrent(scope) &&
        scope.userId === current.userId &&
        scope.spaceId === current.spaceId
      );
    };
  }

  function updateAccount(row: Connection) {
    const nextConnections = [
      ...snapshot.current.connections.filter((entry) => entry.id !== row.id),
      row,
    ];
    saveSnapshot({
      connections: nextConnections,
      catalog: snapshot.current.catalog.map((item) =>
        item.connectorId === row.connectorId && item.slug === row.provider
          ? {
              ...item,
              connected: nextConnections.some(
                (entry) =>
                  entry.connectorId === item.connectorId &&
                  entry.provider === item.slug &&
                  entry.status === "connected",
              ),
            }
          : item,
      ),
    });
  }

  function clearStaleScope() {
    if (!cacheScope.current || isIntegrationsScopeCurrent(cacheScope.current)) return;
    cacheScope.current = null;
    refreshGeneration.current += 1;
    applySnapshot({ catalog: [], connections: [] });
    setLabelDrafts({});
    setPending(null);
    connectionAttempt.current?.abort();
  }

  async function refresh() {
    const focus = focusGeneration.current;
    clearStaleScope();
    let scope: IntegrationsCacheScope;
    try {
      scope = await integrationsCacheScope();
    } catch (reason) {
      if (!mounted.current || focus !== focusGeneration.current) return;
      if (cacheScope.current && !isIntegrationsScopeCurrent(cacheScope.current)) {
        clearStaleScope();
        return refresh();
      }
      throw reason;
    }
    if (!mounted.current || focus !== focusGeneration.current) return;
    if (!isIntegrationsScopeCurrent(scope)) {
      clearStaleScope();
      return refresh();
    }
    const previous = cacheScope.current;
    if (previous && (previous.userId !== scope.userId || previous.spaceId !== scope.spaceId)) {
      applySnapshot({ catalog: [], connections: [] });
      setLabelDrafts({});
    }
    cacheScope.current = scope;
    if (!previous || previous.userId !== scope.userId || previous.spaceId !== scope.spaceId) {
      const cached = readIntegrationsCache(scope);
      if (cached) applySnapshot(cached);
    }
    const generation = ++refreshGeneration.current;
    setCatalogError(null);
    let next: IntegrationsSnapshot;
    try {
      const nextCatalog = await rpc("connections/catalog");
      const nextConnections = await rpc("connections/list");
      next = { catalog: nextCatalog, connections: nextConnections };
    } catch (reason) {
      if (!mounted.current || focus !== focusGeneration.current) return;
      if (!isIntegrationsScopeCurrent(scope)) return refresh();
      if (generation === refreshGeneration.current) throw reason;
      return;
    }
    if (!mounted.current || focus !== focusGeneration.current) return;
    if (!isIntegrationsScopeCurrent(scope)) return refresh();
    if (generation !== refreshGeneration.current) return;
    applySnapshot(next);
    writeIntegrationsCache(scope, next);
  }

  async function retryRefresh() {
    const focus = focusGeneration.current;
    try {
      await refresh();
    } catch (reason) {
      if (
        mounted.current &&
        focus === focusGeneration.current &&
        (!cacheScope.current || isIntegrationsScopeCurrent(cacheScope.current))
      ) {
        setCatalogError(errorText(reason, t("Could not load integrations")));
      }
    }
  }

  useFocusEffect(
    useCallback(() => {
      mounted.current = true;
      focusGeneration.current += 1;
      let cancelled = false;
      clearStaleScope();
      void (async () => {
        const scope = await persistedIntegrationsCacheScope();
        if (cancelled) return;
        if (scope && isIntegrationsScopeCurrent(scope)) {
          cacheScope.current = scope;
          const cached = readIntegrationsCache(scope);
          if (cached) applySnapshot(cached);
        }
        await retryRefresh();
      })();
      void loadLastBotId().then((id) => {
        if (!cancelled) setLastBotId(id);
      });
      return () => {
        cancelled = true;
        mounted.current = false;
        focusGeneration.current += 1;
        refreshGeneration.current += 1;
        connectionAttempt.current?.abort();
        setPending(null);
      };
    }, []),
  );

  useEffect(() => {
    if (!connectorId || !slug) {
      setTools([]);
      setToolsLoading(false);
      return;
    }
    let cancelled = false;
    setToolsLoading(true);
    void rpc("connections/tools", {
      connectorId,
      provider: slug,
    })
      .then((list) => {
        if (!cancelled) setTools(list);
      })
      .catch(() => {
        if (!cancelled) setTools([]);
      })
      .finally(() => {
        if (!cancelled) setToolsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectorId, slug, toolsTick]);

  const item = useMemo<ConnectionCatalogItem | null>(() => {
    if (!connectorId || !slug) return null;
    const found = catalog.find((entry) => entry.connectorId === connectorId && entry.slug === slug);
    if (found) return found;
    if (paramName) {
      return {
        connectorId,
        slug,
        name: paramName,
        logo: paramLogo,
        connected: false,
        noAuth: false,
      };
    }
    return null;
  }, [catalog, connectorId, slug, paramName, paramLogo]);

  const accounts = useMemo(
    () => (item ? catalogItemAccounts(connections, item) : []),
    [connections, item],
  );

  async function notifyAppConnected(target: ConnectionCatalogItem, isCurrent: () => boolean) {
    const botId = lastBotId || (await loadLastBotId());
    if (!botId || !isCurrent()) return;
    if (botId !== lastBotId) setLastBotId(botId);
    void rpc("onboarding/appConnected", {
      botId,
      provider: target.slug,
      connectorId: target.connectorId,
    }).catch(() => undefined);
  }

  async function connect(target: ConnectionCatalogItem) {
    const isCurrent = captureConnectionScope();
    if (!isCurrent()) return;
    connectionAttempt.current?.abort();
    const controller = new AbortController();
    connectionAttempt.current = controller;
    const key = catalogItemKey(target);
    setPending(key);
    setCatalogError(null);
    try {
      const result = await connectCatalogItem(target, connections, {
        begin: (input) => rpc("connections/begin", input),
        complete: (input) => rpc("connections/complete", input),
        openUrl: (url) => Linking.openURL(url),
        signal: controller.signal,
        isCurrent,
      });
      if (result.status === "aborted") return;
      if (result.status === "connected") {
        if (result.row) updateAccount(result.row);
        void notifyAppConnected(target, isCurrent);
        await refresh();
        if (isCurrent()) setToolsTick((tick) => tick + 1);
        return;
      }
      Alert.alert(
        t("Connection pending"),
        t("Finish connecting in the browser, then refresh this page."),
      );
    } catch (reason) {
      if (controller.signal.aborted || !isCurrent()) return;
      setCatalogError(errorText(reason, t("Could not connect")));
    } finally {
      if (connectionAttempt.current === controller) {
        connectionAttempt.current = null;
        if (isCurrent()) setPending(null);
      }
    }
  }

  async function revokeAccount(row: Connection) {
    const isCurrent = captureConnectionScope();
    if (!isCurrent()) return;
    setPending(row.id);
    setCatalogError(null);
    try {
      await rpc("connections/revoke", { connectionId: row.id });
      if (!isCurrent()) return;
      updateAccount({ ...row, status: "revoked" });
      await refresh();
      if (isCurrent()) setToolsTick((tick) => tick + 1);
    } catch (reason) {
      if (!isCurrent()) return;
      setCatalogError(errorText(reason, t("Could not revoke connection")));
    } finally {
      if (isCurrent()) setPending(null);
    }
  }

  async function renameAccount(row: Connection) {
    const displayName = (labelDrafts[row.id] ?? row.displayName).trim();
    if (!displayName || displayName === row.displayName) return;
    const isCurrent = captureConnectionScope();
    if (!isCurrent()) return;
    setPending(`rename:${row.id}`);
    setCatalogError(null);
    try {
      const updated = await rpc("connections/rename", {
        connectionId: row.id,
        displayName,
      });
      if (!isCurrent()) return;
      updateAccount(updated);
      setLabelDrafts((current) => ({ ...current, [row.id]: updated.displayName }));
    } catch (reason) {
      if (!isCurrent()) return;
      setCatalogError(errorText(reason, t("Could not rename connection")));
    } finally {
      if (isCurrent()) setPending(null);
    }
  }

  async function uninstall(target: ConnectionCatalogItem) {
    const isCurrent = captureConnectionScope();
    if (!isCurrent()) return;
    const matches = catalogItemAccounts(connections, target);
    const key = catalogItemKey(target);
    if (matches.length === 0) {
      router.back();
      return;
    }
    setPending(`uninstall:${key}`);
    setCatalogError(null);
    try {
      for (const row of matches) {
        await rpc("connections/revoke", { connectionId: row.id });
        if (!isCurrent()) return;
        updateAccount({ ...row, status: "revoked" });
      }
      await refresh();
      if (isCurrent()) router.back();
    } catch (reason) {
      if (!isCurrent()) return;
      setCatalogError(errorText(reason, t("Could not revoke connection")));
      await refresh().catch(() => undefined);
    } finally {
      if (isCurrent()) setPending(null);
    }
  }

  const key = item ? catalogItemKey(item) : "";
  const connecting = pending === key;
  const uninstalling = pending === `uninstall:${key}`;
  const toolCount = tools.length;

  return (
    <SafeAreaView edges={["bottom"]} style={styles.screen}>
      <Stack.Screen options={{ title: item?.name ?? paramName ?? t("Apps") }} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={sideInsets}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {catalogError ? (
          <View style={styles.stack}>
            <Text accessibilityRole="alert" style={styles.error}>
              {catalogError}
            </Text>
            <NativeActionButton
              label={t("Retry")}
              fill={false}
              onPress={() => void retryRefresh()}
              prominence="secondary"
            />
          </View>
        ) : null}

        {item ? (
          <View style={styles.detail}>
            <View style={styles.detailHeader}>
              <View style={styles.detailTitleRow}>
                <ConnectorIcon logo={item.logo} name={item.name} size={LOGO_SIZE} />
                <Text style={styles.detailTitle}>{item.name}</Text>
              </View>
              <NativeActionButton
                accessibilityLabel={t("Uninstall")}
                disabled={uninstalling || connecting}
                fill={false}
                label={uninstalling ? t("Working…") : t("Uninstall")}
                onPress={() => void uninstall(item)}
                prominence="destructive"
              />
            </View>

            <GlassSurface
              shape="roundedRectangle"
              cornerRadius={20}
              style={styles.card}
              fallbackStyle={styles.cardFallback}
            >
              <Text style={styles.section}>{t("Accounts")}</Text>
              {accounts.map((row) => (
                <View key={row.id} style={styles.accountRow}>
                  <TextInput
                    value={labelDrafts[row.id] ?? row.displayName}
                    maxLength={CONNECTION_LABEL_MAX_LENGTH}
                    onChangeText={(value) =>
                      setLabelDrafts((current) => ({ ...current, [row.id]: value }))
                    }
                    onEndEditing={() => void renameAccount(row)}
                    accessibilityLabel={t("Account label")}
                    style={styles.accountLabel}
                  />
                  <NativeActionButton
                    accessibilityLabel={t("Remove {name}", { name: row.displayName })}
                    disabled={pending === row.id || uninstalling}
                    fill={false}
                    label={pending === row.id ? t("Working…") : t("Remove")}
                    onPress={() => void revokeAccount(row)}
                    prominence="destructive"
                  />
                </View>
              ))}
              <NativeActionButton
                accessibilityLabel={t("Add another {name}", { name: item.name })}
                disabled={connecting || uninstalling}
                label={connecting ? t("Working…") : t("Add another")}
                onPress={() => void connect(item)}
                prominence="secondary"
                variant="text"
              />
            </GlassSurface>

            <GlassSurface
              shape="roundedRectangle"
              cornerRadius={20}
              style={styles.card}
              fallbackStyle={styles.cardFallback}
            >
              <MotionPressable
                preset="row"
                highlightColor={native.fillPressed}
                accessibilityRole="button"
                accessibilityState={{ expanded: toolsOpen }}
                onPress={() => setToolsOpen((open) => !open)}
                style={styles.toolsToggle}
              >
                <Text style={styles.title}>
                  {toolsLoading
                    ? t("Tools")
                    : toolCount === 1
                      ? t("1 tool")
                      : t("{count} tools", { count: toolCount })}
                </Text>
                <Chevron expanded={toolsOpen} />
              </MotionPressable>
              {toolsOpen ? (
                <View style={styles.toolsBody}>
                  {toolsLoading ? (
                    <ActivityIndicator
                      color={native.secondaryLabel}
                      accessibilityLabel={t("Loading tools…")}
                    />
                  ) : tools.length === 0 ? (
                    <Text style={styles.secondary}>{t("No tools available.")}</Text>
                  ) : (
                    tools.map((tool) => (
                      <Text key={tool.name} style={styles.toolName}>
                        {humanizeToolName(tool.name)}
                      </Text>
                    ))
                  )}
                </View>
              ) : null}
            </GlassSurface>
          </View>
        ) : !catalogError ? (
          <ActivityIndicator color={native.secondaryLabel} accessibilityLabel={t("Loading…")} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function isLightSurface(background?: string): boolean {
  if (!background || !background.startsWith("#") || background.length < 7) return true;
  return Number.parseInt(background.slice(1, 3), 16) >= 128;
}

function createDetailStyles(
  tokens: ColorTokens = mobileTokens(),
  colors: NativeColors = native,
  scope: ResolvedScopedTheme | null = null,
) {
  const isLight = isLightSurface(tokens?.background);
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const pageBg = scope?.background
    ? "transparent"
    : (colors?.page ?? tokens?.background ?? (isLight ? "#F3F1EC" : "#15171C"));
  const cardBg = scope ? colors.fill : isLight ? "#FFFEFC" : "#242933";
  const cardBorder = scope
    ? colors.separator
    : isLight
      ? "rgba(38, 35, 31, 0.055)"
      : "rgba(245, 244, 240, 0.09)";
  const chipBg = scope ? colors.fillPressed : isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = scope
    ? colors.separator
    : isLight
      ? "rgba(38, 35, 31, 0.07)"
      : "rgba(245, 244, 240, 0.10)";
  const labelInk = colors?.label ?? tokens?.foreground ?? (isLight ? "#26231F" : "#F5F4F0");
  const secondaryInk =
    colors?.secondaryLabel ?? tokens?.mutedForeground ?? (isLight ? "#6E675E" : "#B8B3AA");
  const destructive = tokens?.destructive ?? (isLight ? "#C4272D" : "#FF8F8C");
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: pageBg },
    content: { padding: 20, paddingBottom: 32, gap: 14 },
    stack: { gap: 10 },
    section: { color: secondaryInk, fontSize: 14, fontWeight: "600", marginTop: 2 },
    card: { padding: 18, borderRadius: 20, gap: 12 },
    cardFallback: {
      backgroundColor: cardBg,
      ...(scope
        ? {}
        : {
            experimental_backgroundImage: cardGradient(isLight, "rose"),
            overflow: "hidden" as const,
          }),
      borderRadius: 20,
      borderWidth: hairline,
      borderColor: cardBorder,
      shadowColor: "#26231F",
      shadowOpacity: isLight ? 0.028 : 0.16,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 5 },
      elevation: 1,
    },
    title: { color: labelInk, fontSize: 17, lineHeight: 22, fontWeight: "600" },
    secondary: { color: secondaryInk, fontSize: 14, lineHeight: 20 },
    accountRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    accountLabel: {
      flex: 1,
      minHeight: 40,
      borderRadius: 14,
      backgroundColor: chipBg,
      borderWidth: hairline,
      borderColor: chipBorder,
      color: labelInk,
      paddingHorizontal: 12,
      fontSize: 14,
    },
    error: { color: destructive, fontSize: 14 },
    detail: { gap: 14 },
    detailHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    detailTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
    detailTitle: { flex: 1, color: labelInk, fontSize: 17, lineHeight: 22, fontWeight: "600" },
    toolsToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    toolsBody: { gap: 8, paddingTop: 4 },
    toolName: { color: labelInk, fontSize: 14 },
  });
}
