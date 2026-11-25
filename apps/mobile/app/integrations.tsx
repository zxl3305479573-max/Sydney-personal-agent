import { MenuView } from "@expo/ui/community/menu";
import type {
  CapabilityInstall,
  Connection,
  ConnectionCatalogItem,
  McpServer,
  PluginMarketplaceEntry,
  RpcOutput,
} from "@rakazo/contracts";
import { CONNECTION_LABEL_MAX_LENGTH, MCP_OAUTH_CLIENT_REQUIRED } from "@rakazo/contracts";
import type { PluginCategory } from "@rakazo/core";
import {
  buildFeaturedConnectorTiles,
  CONNECTION_CATALOG_PAGE_SIZE,
  catalogItemAccounts,
  catalogItemKey,
  connectCatalogItem,
  EMPTY_PLUGIN_CATALOG_MESSAGE,
  filterConnectionCatalogItems,
  humanizeToolName,
  isCatalogItemConnected,
  matchesWordPrefixes,
  newClientId,
  OTHER_PLUGINS,
} from "@rakazo/core";
import type { ColorTokens } from "@rakazo/ui-tokens";
import type { NativeStackNavigationOptions } from "expo-router";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ConnectorIcon } from "../components/connector-icon";
import { GlassSurface } from "../components/glass-surface";
import { MainNavigationHeader } from "../components/main-navigation-header";
import { McpOAuthReturn } from "../components/mcp-oauth-return";
import { MenuPicker } from "../components/menu-picker";
import { MotionPressable } from "../components/motion-pressable";
import { NativeActionButton } from "../components/native-action-button";
import { NativeSymbol } from "../components/native-symbol";
import { PluginIcon } from "../components/plugin-icon";
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
import { useHideMainNavigation } from "../lib/main-navigation";
import type { NativeColors } from "../lib/native";
import { native, useResolvedAppearance, useThemedStyles } from "../lib/native";
import { iosAtLeast } from "../lib/native-controls";
import type { PluginParams } from "../lib/plugin-marketplace";
import {
  browsablePlugins,
  filterPlugins,
  gitImportParams,
  hasPluginConnector,
  managedPluginParams,
  mcpServerReady,
  pluginCategories,
  pluginParams,
  pluginSite,
} from "../lib/plugin-marketplace";
import { queryClient, rpcQuery } from "../lib/query";
import { useBottomSafeAreaClaimed, useSideInsets } from "../lib/side-insets";
import type { ResolvedScopedTheme } from "../lib/theme-pack";
import { useMcpOAuthReturn } from "../lib/use-mcp-oauth-return";
import { errorText } from "../lib/user-error";

type SourceAuth = "none" | "bearer" | "header" | "oauth";
type SourceKind = "treg" | "executor" | "mcp" | "api" | "graphql";
type ConnectionTool = RpcOutput<"connections/tools">[number];

const LOGO_SIZE = 32;
const SECTION_SIZE = 4;
const PLUGIN_PAGE_SIZE = 20;

export default function Integrations() {
  const bottomClaimed = useBottomSafeAreaClaimed();
  const sideInsets = useSideInsets();
  const router = useRouter();
  // A merged brand's plugin page sends people back here to manage the app's accounts.
  const { app: appToOpen } = useLocalSearchParams<{ app?: string }>();
  const navigation = useNavigation();
  const scheme = useResolvedAppearance();
  const styles = useThemedStyles(createIntegrationsStyles);
  const { t } = useI18n();
  const mcpReturn = useMcpOAuthReturn();
  const categoryLabels: Record<PluginCategory, string> = {
    productivity: t("Productivity"),
    communication: t("Communication"),
    sales: t("Sales & CRM"),
    marketing: t("Marketing"),
    finance: t("Finance"),
    people: t("Recruiting & HR"),
    design: t("Design"),
    code: t("Developer"),
    data: t("Data"),
    ops: t("Security & Ops"),
  };
  const categoryLabel = (name: string) => categoryLabels[name as PluginCategory] ?? name;
  const { width } = useWindowDimensions();
  const catalogColumns = width >= 480 ? 2 : 1;
  const [catalog, setCatalog] = useState<ConnectionCatalogItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(CONNECTION_CATALOG_PAGE_SIZE);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [sources, setSources] = useState<CapabilityInstall[]>([]);
  const [pluginInstalls, setPluginInstalls] = useState<CapabilityInstall[]>([]);
  const [pluginEntries, setPluginEntries] = useState<PluginMarketplaceEntry[]>([]);
  const [pluginsState, setPluginsState] = useState<"loading" | "ready" | "partial">("loading");
  const [category, setCategory] = useState("");
  const [pluginCount, setPluginCount] = useState(PLUGIN_PAGE_SIZE);
  const [gitUrl, setGitUrl] = useState("");
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(null);
  const [adding, setAdding] = useState<"github" | "source" | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [credential, setCredential] = useState("");
  const [sourceAuth, setSourceAuth] = useState<SourceAuth>("none");
  const [authHeader, setAuthHeader] = useState("x-api-key");
  const [oauthServerId, setOauthServerId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [lastBotId, setLastBotId] = useState("");
  const [catalogReady, setCatalogReady] = useState(false);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [detailKey, setDetailKey] = useState<{ connectorId: string; slug: string } | null>(null);
  useHideMainNavigation(Boolean(detailKey || adding));
  const [tools, setTools] = useState<ConnectionTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [toolsTick, setToolsTick] = useState(0);
  const connectionAttempt = useRef<AbortController | null>(null);
  const oauthBrowserOpen = useRef(false);

  const cacheScope = useRef<IntegrationsCacheScope | null>(null);
  const snapshot = useRef<IntegrationsSnapshot>({ catalog: [], connections: [] });
  const mounted = useRef(false);
  const focusGeneration = useRef(0);
  const refreshGeneration = useRef(0);
  const sourcesGeneration = useRef(0);

  function applySnapshot(next: IntegrationsSnapshot) {
    snapshot.current = next;
    setCatalog(next.catalog);
    setConnections(next.connections);
    setCatalogReady(true);
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
    // A mutation invalidates any earlier background refresh.
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
    const connections = [
      ...snapshot.current.connections.filter((entry) => entry.id !== row.id),
      row,
    ];
    saveSnapshot({
      connections,
      catalog: snapshot.current.catalog.map((item) =>
        item.connectorId === row.connectorId && item.slug === row.provider
          ? {
              ...item,
              connected: connections.some(
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

  const featuredTiles = useMemo(() => buildFeaturedConnectorTiles(catalog), [catalog]);
  const showFeatured = !query.trim();
  const catalogApps = useMemo(() => filterConnectionCatalogItems(catalog, query), [catalog, query]);
  const renderedApps = catalogApps.slice(0, visibleCount);
  const { plugins, pluginForApp } = useMemo(
    () => browsablePlugins(pluginEntries, catalog),
    [pluginEntries, catalog],
  );
  // Managed apps standing in for a plugin keep that plugin's category, so a category lists them too.
  const mergedBrands = catalog.flatMap((item) => {
    const entry = pluginForApp.get(catalogItemKey(item));
    return entry ? [{ item, entry }] : [];
  });
  const categories = pluginCategories([...plugins, ...mergedBrands.map(({ entry }) => entry)]);
  const brandMatches = category
    ? mergedBrands.filter(
        ({ item, entry }) =>
          entry.category === (category === OTHER_PLUGINS ? null : category) &&
          (matchesWordPrefixes(item.name, query) ||
            filterPlugins([entry], query, null, categoryLabel).length > 0),
      )
    : [];
  const pluginMatches = filterPlugins(plugins, query, category || null, categoryLabel);
  const filtering = Boolean(query.trim() || category);
  const installedSources = new Set(pluginInstalls.map((install) => install.source));
  const standaloneServers = mcpServers.filter((server) => !server.installId);
  const savedServerMatches =
    query.trim() && !category
      ? standaloneServers.filter((server) =>
          matchesWordPrefixes(`${server.name} ${server.description}`, query),
        )
      : [];
  const connectorPlugins = pluginInstalls.filter(hasPluginConnector);

  const detailItem = useMemo(() => {
    if (!detailKey) return null;
    return (
      catalog.find(
        (entry) => entry.connectorId === detailKey.connectorId && entry.slug === detailKey.slug,
      ) ?? null
    );
  }, [catalog, detailKey]);

  function clearStaleScope() {
    if (!cacheScope.current || isIntegrationsScopeCurrent(cacheScope.current)) return;
    cacheScope.current = null;
    refreshGeneration.current += 1;
    sourcesGeneration.current += 1;
    applySnapshot({ catalog: [], connections: [] });
    setCatalogReady(false);
    setSources([]);
    setPluginInstalls([]);
    setPluginEntries([]);
    setPluginsState("loading");
    setMcpServers([]);
    setMcpError(null);
    setDetailKey(null);
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
      setCatalogReady(false);
      setSources([]);
      setPluginInstalls([]);
      setPluginEntries([]);
      setPluginsState("loading");
      setMcpServers([]);
      setMcpError(null);
      setDetailKey(null);
      setLabelDrafts({});
    }
    cacheScope.current = scope;
    if (!previous || previous.userId !== scope.userId || previous.spaceId !== scope.spaceId) {
      const cached = readIntegrationsCache(scope);
      if (cached) applySnapshot(cached);
    }
    const serversQuery = rpcQuery("mcp/servers/list");
    const installsQuery = rpcQuery("capabilities/list");
    const marketplaceQuery = rpcQuery("marketplace/catalog", { query: "" });
    const cachedServers = queryClient.getQueryData(serversQuery.queryKey);
    const cachedInstalls = queryClient.getQueryData(installsQuery.queryKey);
    const cachedMarketplace = queryClient.getQueryData(marketplaceQuery.queryKey);
    if (cachedServers) setMcpServers(cachedServers);
    if (cachedInstalls) {
      setSources(
        cachedInstalls.filter(
          (item) => item.kind === "mcp" || item.kind === "api" || item.kind === "graphql",
        ),
      );
      setPluginInstalls(cachedInstalls.filter((item) => item.kind === "plugin"));
    }
    if (cachedMarketplace) {
      setPluginEntries(cachedMarketplace.entries);
      setPluginsState(cachedMarketplace.unavailableRegistries.length ? "partial" : "ready");
    }
    const generation = ++refreshGeneration.current;
    const sourceGeneration = ++sourcesGeneration.current;
    void rpc("mcp/servers/list")
      .then((servers) => {
        if (
          mounted.current &&
          focus === focusGeneration.current &&
          isIntegrationsScopeCurrent(scope) &&
          sourceGeneration === sourcesGeneration.current
        ) {
          queryClient.setQueryData(serversQuery.queryKey, servers);
          setMcpServers(servers);
          setMcpError(null);
        }
      })
      .catch((reason) => {
        if (
          mounted.current &&
          focus === focusGeneration.current &&
          isIntegrationsScopeCurrent(scope) &&
          sourceGeneration === sourcesGeneration.current
        )
          setMcpError(errorText(reason, t("Could not load MCP servers")));
      });
    void rpc("capabilities/list")
      .then((installs) => {
        if (
          mounted.current &&
          isIntegrationsScopeCurrent(scope) &&
          sourceGeneration === sourcesGeneration.current
        ) {
          queryClient.setQueryData(installsQuery.queryKey, installs);
          setSources(
            installs.filter(
              (item) => item.kind === "mcp" || item.kind === "api" || item.kind === "graphql",
            ),
          );
          setPluginInstalls(installs.filter((item) => item.kind === "plugin"));
        }
      })
      .catch(() => undefined);
    void rpc("marketplace/catalog", { query: "" })
      .then((result) => {
        if (
          mounted.current &&
          isIntegrationsScopeCurrent(scope) &&
          sourceGeneration === sourcesGeneration.current
        ) {
          queryClient.setQueryData(marketplaceQuery.queryKey, result);
          setPluginEntries(result.entries);
          setPluginsState(result.unavailableRegistries.length ? "partial" : "ready");
        }
      })
      .catch(() => {
        if (mounted.current && sourceGeneration === sourcesGeneration.current)
          setPluginsState("partial");
      });
    setCatalogError(null);
    let next: IntegrationsSnapshot;
    try {
      // The catalog call reconciles connection rows, so list them after it.
      const catalog = await rpc("connections/catalog");
      const connections = await rpc("connections/list");
      next = { catalog, connections };
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
        sourcesGeneration.current += 1;
        connectionAttempt.current?.abort();
        setPending(null);
      };
    }, []),
  );

  useEffect(() => {
    // The OAuth callback lands in the browser, so refresh once the user comes back.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !oauthBrowserOpen.current || !mounted.current) return;
      oauthBrowserOpen.current = false;
      void retryRefresh();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!detailKey) {
      setTools([]);
      setToolsLoading(false);
      return;
    }
    let cancelled = false;
    setToolsLoading(true);
    void rpc("connections/tools", {
      connectorId: detailKey.connectorId,
      provider: detailKey.slug,
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
  }, [detailKey, toolsTick]);

  useEffect(() => {
    if (!appToOpen || !catalogReady) return;
    const item = catalog.find((entry) => catalogItemKey(entry) === appToOpen);
    if (item) openDetail(item);
    router.setParams({ app: undefined });
  }, [appToOpen, catalogReady, catalog]);

  function openPlugin(params: PluginParams) {
    router.push({ pathname: "/plugin", params });
  }

  function installedParams(install: CapabilityInstall): PluginParams {
    const entry = pluginEntries.find((row) => row.installedSource === install.source);
    return entry
      ? pluginParams(entry)
      : { source: install.source, installedSource: install.source, name: install.name };
  }

  function renderPluginRow(entry: PluginMarketplaceEntry) {
    const installed = installedSources.has(entry.installedSource);
    return (
      <GlassSurface
        key={entry.id}
        shape="roundedRectangle"
        cornerRadius={18}
        style={catalogColumns === 2 ? styles.catalogCell : undefined}
        fallbackStyle={styles.rowFallback}
      >
        <MotionPressable
          preset="row"
          highlightColor={native.fillPressed}
          accessibilityRole="button"
          accessibilityLabel={entry.displayName}
          onPress={() => openPlugin(pluginParams(entry))}
          style={styles.row}
        >
          <PluginIcon
            logo={entry.logo}
            name={entry.displayName}
            site={pluginSite(entry)}
            size={LOGO_SIZE}
          />
          <View style={styles.grow}>
            <Text numberOfLines={1} style={styles.title}>
              {entry.displayName}
            </Text>
            {entry.description ? (
              <Text numberOfLines={1} style={styles.secondary}>
                {entry.description}
              </Text>
            ) : null}
          </View>
          {installed ? <Text style={styles.secondary}>{t("Added")}</Text> : <Chevron />}
        </MotionPressable>
      </GlassSurface>
    );
  }

  function serverStatus(server: McpServer) {
    return !server.enabled
      ? t("Disabled")
      : server.health.code === MCP_OAUTH_CLIENT_REQUIRED && !server.oauthClientId
        ? t("Needs an OAuth client ID")
        : server.oauthStatus === "reconnect"
          ? t("OAuth expired")
          : server.oauthStatus === "connected"
            ? t("OAuth connected")
            : server.hasSecret
              ? t("Credential saved")
              : t("No auth");
  }

  function renderInstalledPlugin(install: CapabilityInstall, summary: string, signIn: boolean) {
    const params = installedParams(install);
    return (
      <GlassSurface
        key={install.id}
        shape="roundedRectangle"
        cornerRadius={18}
        fallbackStyle={styles.rowFallback}
      >
        <MotionPressable
          preset="row"
          highlightColor={native.fillPressed}
          testID="installed-plugin"
          accessibilityRole="button"
          accessibilityLabel={params.name}
          onPress={() => openPlugin(params)}
          style={styles.row}
        >
          <PluginIcon logo={params.logo} name={params.name} site={params.site} size={LOGO_SIZE} />
          <View style={styles.grow}>
            <Text numberOfLines={1} style={styles.title}>
              {params.name}
            </Text>
            <Text numberOfLines={1} style={styles.secondary}>
              {summary}
            </Text>
          </View>
          {signIn ? (
            <NativeActionButton
              fill={false}
              label={t("Sign in")}
              onPress={() => openPlugin(params)}
              prominence="secondary"
              variant="text"
            />
          ) : null}
        </MotionPressable>
      </GlassSurface>
    );
  }

  /** What this account already has: apps it can reach, then skills it follows. */
  function renderSavedServer(server: McpServer) {
    return (
      <GlassSurface
        key={server.id}
        testID="registered-mcp-server"
        shape="roundedRectangle"
        cornerRadius={18}
        style={styles.row}
        fallbackStyle={styles.rowFallback}
      >
        <ConnectorIcon name={server.name} size={LOGO_SIZE} />
        <Text numberOfLines={1} style={[styles.title, styles.grow]}>
          {server.name}
        </Text>
        <Text style={styles.secondary}>{serverStatus(server)}</Text>
        {server.enabled && (server.oauthStatus === "reconnect" || server.id === oauthServerId) ? (
          <NativeActionButton
            label={t("Connect OAuth")}
            fill={false}
            busy={pending === `oauth:${server.id}`}
            onPress={() => void authorizeMcp(server.id)}
            prominence="secondary"
            variant="text"
          />
        ) : null}
      </GlassSurface>
    );
  }

  function renderConnected() {
    const apps = connectorPlugins.length + standaloneServers.length + sources.length;
    return (
      <>
        {apps || mcpError ? (
          <View testID="connected-apps" style={styles.catalogStack}>
            <Text style={styles.section}>{t("Apps")}</Text>
            {mcpError ? (
              <View>
                <Text style={styles.error}>{mcpError}</Text>
                <NativeActionButton
                  label={t("Retry")}
                  fill={false}
                  onPress={() => void retryRefresh()}
                  prominence="secondary"
                />
              </View>
            ) : null}
            {connectorPlugins.map((install) => {
              const servers = mcpServers.filter((server) => server.installId === install.id);
              return renderInstalledPlugin(
                install,
                servers.length === 1
                  ? t("1 connector")
                  : t("{count} connectors", { count: servers.length }),
                !servers.every(mcpServerReady),
              );
            })}
            {standaloneServers.map(renderSavedServer)}
            {sources.map((source) => (
              <GlassSurface
                key={source.id}
                testID="tool-source"
                shape="roundedRectangle"
                cornerRadius={18}
                style={styles.row}
                fallbackStyle={styles.rowFallback}
              >
                <ConnectorIcon name={source.name} size={LOGO_SIZE} />
                <View style={styles.grow}>
                  <Text numberOfLines={1} style={styles.title}>
                    {source.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.secondary}>
                    {source.kind === "api"
                      ? "OpenAPI"
                      : source.kind === "graphql"
                        ? "GraphQL"
                        : "MCP"}
                  </Text>
                </View>
                <NativeActionButton
                  fill={false}
                  label={pending === source.id ? t("Removing…") : t("Remove")}
                  onPress={() => void removeSource(source)}
                  prominence="destructive"
                />
              </GlassSurface>
            ))}
          </View>
        ) : null}
      </>
    );
  }

  function renderPlugins() {
    if (pluginsState === "loading") {
      return catalogReady ? (
        <ActivityIndicator color={native.secondaryLabel} accessibilityLabel={t("Loading…")} />
      ) : null;
    }
    const failed =
      pluginsState === "partial" ? (
        <View style={styles.catalogStack}>
          <Text style={styles.secondary}>{t("Some plugins could not be loaded.")}</Text>
          <NativeActionButton
            label={t("Retry")}
            fill={false}
            onPress={() => {
              setPluginsState("loading");
              void retryRefresh();
            }}
            prominence="secondary"
          />
        </View>
      ) : null;
    if (filtering) {
      return (
        <>
          {failed}
          {pluginMatches.length || brandMatches.length ? (
            <View
              testID="plugin-results"
              style={catalogColumns === 2 ? styles.catalogGrid : styles.catalogStack}
            >
              {brandMatches.map(({ item }) => renderCatalogTile(item, item.name))}
              {pluginMatches.slice(0, pluginCount).map(renderPluginRow)}
            </View>
          ) : null}
          {pluginCount < pluginMatches.length ? (
            <NativeActionButton
              label={t("Show more")}
              onPress={() => setPluginCount((count) => count + PLUGIN_PAGE_SIZE)}
              prominence="secondary"
            />
          ) : null}
        </>
      );
    }
    const uncategorized = plugins.filter((entry) => !entry.category);
    const sections: Array<[string, PluginMarketplaceEntry[]]> = [
      ...categories.map((name): [string, PluginMarketplaceEntry[]] => [
        name,
        plugins.filter((entry) => entry.category === name),
      ]),
      ...(uncategorized.length
        ? [[OTHER_PLUGINS, uncategorized] as [string, PluginMarketplaceEntry[]]]
        : []),
    ].filter(([, entries]) => entries.length);
    return (
      <>
        {failed}
        {sections.map(([name, entries]) => (
          <View key={name} testID="plugin-section" style={styles.catalogStack}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {name === OTHER_PLUGINS ? t("More") : categoryLabel(name)}
              </Text>
              {entries.length > SECTION_SIZE ? (
                <MotionPressable
                  preset="inline"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => {
                    setCategory(name);
                    setPluginCount(PLUGIN_PAGE_SIZE);
                  }}
                >
                  <Text style={styles.link}>{t("View all")}</Text>
                </MotionPressable>
              ) : null}
            </View>
            <View style={catalogColumns === 2 ? styles.catalogGrid : styles.catalogStack}>
              {entries.slice(0, SECTION_SIZE).map(renderPluginRow)}
            </View>
          </View>
        ))}
      </>
    );
  }

  function closeAdding() {
    setAdding(null);
    setSourceKind(null);
    setSourceError(null);
    setName("");
    setUrl("");
    setCredential("");
  }

  function openDetail(item: ConnectionCatalogItem) {
    setCatalogError(null);
    setToolsOpen(true);
    setDetailKey({ connectorId: item.connectorId, slug: item.slug });
  }

  function closeDetail() {
    setDetailKey(null);
    setTools([]);
  }

  function accountsFor(item: Pick<ConnectionCatalogItem, "connectorId" | "slug">) {
    return catalogItemAccounts(connections, item);
  }

  function itemConnected(item: ConnectionCatalogItem) {
    return isCatalogItemConnected(connections, item);
  }

  async function notifyAppConnected(item: ConnectionCatalogItem, isCurrent: () => boolean) {
    const botId = lastBotId || (await loadLastBotId());
    if (!botId || !isCurrent()) return;
    if (botId !== lastBotId) setLastBotId(botId);
    void rpc("onboarding/appConnected", {
      botId,
      provider: item.slug,
      connectorId: item.connectorId,
    }).catch(() => undefined);
  }

  async function connect(item: ConnectionCatalogItem) {
    const isCurrent = captureConnectionScope();
    if (!isCurrent()) return;
    connectionAttempt.current?.abort();
    const controller = new AbortController();
    connectionAttempt.current = controller;
    const key = catalogItemKey(item);
    setPending(key);
    setCatalogError(null);
    try {
      const result = await connectCatalogItem(item, connections, {
        begin: (input) => rpc("connections/begin", input),
        complete: (input) => rpc("connections/complete", input),
        openUrl: (url) => Linking.openURL(url),
        signal: controller.signal,
        isCurrent,
      });
      if (result.status === "aborted") return;
      if (result.status === "connected") {
        if (result.row) updateAccount(result.row);
        void notifyAppConnected(item, isCurrent);
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

  async function uninstall(item: ConnectionCatalogItem) {
    const isCurrent = captureConnectionScope();
    if (!isCurrent()) return;
    const matches = accountsFor(item);
    const key = catalogItemKey(item);
    if (matches.length === 0) {
      closeDetail();
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
      if (isCurrent()) closeDetail();
    } catch (reason) {
      if (!isCurrent()) return;
      setCatalogError(errorText(reason, t("Could not revoke connection")));
      await refresh().catch(() => undefined);
    } finally {
      if (isCurrent()) setPending(null);
    }
  }

  function beginSource(kind: SourceKind) {
    setAdding("source");
    setSourceKind(kind);
    setSourceError(null);
    setName(kind === "treg" ? "Treg" : kind === "executor" ? "Executor" : "");
    setUrl(kind === "treg" ? "https://treg.to/mcp/" : "");
    setCredential("");
    setSourceAuth(kind === "treg" || kind === "executor" ? "bearer" : "none");
    setAuthHeader("x-api-key");
  }

  async function authorizeMcp(serverId: string) {
    const isCurrent = captureConnectionScope();
    if (!isCurrent()) return;
    setPending(`oauth:${serverId}`);
    setMcpError(null);
    try {
      // The API picks the registered web callback; native clients cannot supply one.
      const result = await mcpReturn.begin(serverId);
      if (!isCurrent()) return;
      if (result.status === "authorization_required") {
        oauthBrowserOpen.current = true;
        await Linking.openURL(result.authorizationUrl);
      } else {
        await refresh();
      }
    } catch (reason) {
      if (isCurrent()) setMcpError(errorText(reason, t("Could not start MCP OAuth")));
    } finally {
      if (isCurrent()) setPending(null);
    }
  }

  async function addSource() {
    if (!sourceKind) return;
    const isCurrent = captureConnectionScope();
    if (!isCurrent()) return;
    setPending("source");
    setSourceError(null);
    const displayName =
      name.trim() ||
      (sourceKind === "treg"
        ? "Treg"
        : sourceKind === "executor"
          ? "Executor"
          : sourceKind === "graphql"
            ? "GraphQL"
            : t("Custom connector"));
    const auth =
      sourceAuth === "header"
        ? { type: "header", name: authHeader.trim() }
        : { type: sourceAuth === "bearer" ? "bearer" : "none" };
    let created: McpServer | null = null;
    try {
      if (sourceAuth === "oauth") {
        created = await rpc("mcp/servers/create", {
          slug: `integration-${newClientId().slice(0, 8)}`,
          name: displayName,
          transport: "streamable_http",
          endpoint: url.trim(),
        });
        if (!isCurrent()) return;
        setOauthServerId(created.id);
      } else {
        await rpc("capabilities/install", {
          kind: sourceKind === "treg" || sourceKind === "executor" ? "mcp" : sourceKind,
          name: displayName,
          source: url.trim(),
          credential: (sourceAuth !== "none" && credential.trim()) || undefined,
          config:
            sourceKind === "treg"
              ? { preset: "treg", auth: { type: "bearer" } }
              : sourceKind === "api"
                ? { openApi: true, auth }
                : sourceKind === "graphql"
                  ? { auth }
                  : { preset: "custom", auth },
        });
        if (!isCurrent()) return;
      }
      setCredential("");
      setSourceKind(null);
      setAdding(null);
      await refresh();
      if (created) await authorizeMcp(created.id);
    } catch (reason) {
      if (isCurrent()) setSourceError(errorText(reason, t("Could not add source")));
    } finally {
      if (isCurrent()) setPending(null);
    }
  }

  async function removeSource(source: CapabilityInstall) {
    setPending(source.id);
    setSourceError(null);
    try {
      await rpc("capabilities/remove", { id: source.id });
      setSources((current) => current.filter((item) => item.id !== source.id));
    } catch (reason) {
      setSourceError(errorText(reason, t("Could not remove source")));
    } finally {
      setPending(null);
    }
  }

  function renderCatalogActions(item: ConnectionCatalogItem, label: string) {
    const key = catalogItemKey(item);
    const connected = itemConnected(item);
    const connecting = pending === key;
    if (connected) {
      return (
        <NativeActionButton
          accessibilityLabel={t("Added")}
          disabled={connecting}
          fill={false}
          label={connecting ? t("Working…") : t("Added")}
          onPress={() => openDetail(item)}
          prominence="secondary"
          variant="text"
        />
      );
    }
    return (
      <NativeActionButton
        accessibilityLabel={t("Add {name}", { name: label })}
        disabled={connecting}
        fill={false}
        label={connecting ? t("Working…") : t("Add")}
        onPress={() => void connect(item)}
        prominence="secondary"
        variant="text"
      />
    );
  }

  function renderCatalogTile(item: ConnectionCatalogItem, label: string) {
    const connected = itemConnected(item);
    const brandPlugin = pluginForApp.get(catalogItemKey(item));
    const body = (
      <>
        <ConnectorIcon logo={item.logo} name={label} size={LOGO_SIZE} />
        <View style={styles.grow}>
          <Text numberOfLines={1} style={styles.title}>
            {label}
          </Text>
        </View>
      </>
    );
    const tileStyle = catalogColumns === 2 ? styles.catalogCell : undefined;
    if (connected || brandPlugin) {
      return (
        <GlassSurface
          key={catalogItemKey(item)}
          shape="roundedRectangle"
          cornerRadius={18}
          style={[styles.row, tileStyle]}
          fallbackStyle={styles.rowFallback}
        >
          <MotionPressable
            preset="card"
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() =>
              brandPlugin ? openPlugin(managedPluginParams(brandPlugin, item)) : openDetail(item)
            }
            style={styles.catalogTileBody}
          >
            {body}
          </MotionPressable>
          {renderCatalogActions(item, label)}
        </GlassSurface>
      );
    }
    return (
      <GlassSurface
        key={catalogItemKey(item)}
        shape="roundedRectangle"
        cornerRadius={18}
        style={[styles.row, tileStyle]}
        fallbackStyle={styles.rowFallback}
      >
        {body}
        {renderCatalogActions(item, label)}
      </GlassSurface>
    );
  }

  function renderDetail(item: ConnectionCatalogItem) {
    const accounts = accountsFor(item);
    const key = catalogItemKey(item);
    const connecting = pending === key;
    const uninstalling = pending === `uninstall:${key}`;
    const toolCount = tools.length;

    return (
      <View style={styles.detail}>
        <View style={styles.detailHeader}>
          <View style={styles.detailTitleRow}>
            <MotionPressable
              preset="inline"
              accessibilityRole="button"
              accessibilityLabel={t("Back")}
              onPress={closeDetail}
              style={styles.backButton}
            >
              <Text style={styles.link}>{t("Back")}</Text>
            </MotionPressable>
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
    );
  }

  const addOptions: Array<{ id: "github" | SourceKind; label: string }> = [
    { id: "github", label: t("From GitHub") },
    { id: "mcp", label: t("MCP server") },
    { id: "api", label: "OpenAPI" },
    { id: "graphql", label: "GraphQL" },
    { id: "executor", label: "Executor" },
    { id: "treg", label: "Treg" },
  ];

  function startAdding(id: "github" | SourceKind) {
    closeDetail();
    setSourceError(null);
    if (id === "github") {
      setSourceKind(null);
      setAdding("github");
    } else beginSource(id);
  }

  useLayoutEffect(() => {
    if (!iosAtLeast(26)) return;
    navigation.setOptions({
      unstable_headerRightItems: () => [
        {
          type: "menu" as const,
          hidesSharedBackground: true,
          label: t("Add custom"),
          accessibilityLabel: t("Add custom"),
          icon: { type: "sfSymbol" as const, name: "plus" },
          menu: {
            items: addOptions.map((option) => ({
              type: "action" as const,
              label: option.label,
              onPress: () => startAdding(option.id),
            })),
          },
        },
      ],
    } satisfies NativeStackNavigationOptions);
  }, [navigation, t]);

  function renderAddMenuFallback() {
    if (iosAtLeast(26)) return null;
    return (
      <MenuView
        colorScheme={scheme}
        title={t("Add custom")}
        actions={addOptions.map((option) => ({ id: option.id, title: option.label }))}
        onPressAction={({ nativeEvent }) => startAdding(nativeEvent.event as "github" | SourceKind)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Add custom")}
          hitSlop={8}
          style={styles.addCustom}
        >
          <NativeSymbol ios="plus" android="add" size={20} />
        </Pressable>
      </MenuView>
    );
  }

  function renderAdding() {
    const credentialLabel =
      sourceKind === "treg"
        ? t("Treg token")
        : sourceKind === "executor"
          ? t("Executor token")
          : sourceAuth === "header"
            ? t("API key")
            : t("Bearer token");
    return (
      <View style={styles.catalogStack}>
        <NativeActionButton
          fill={false}
          label={t("Back")}
          onPress={closeAdding}
          prominence="secondary"
        />
        {adding === "github" ? (
          <GlassSurface
            testID="plugin-git-import"
            shape="roundedRectangle"
            cornerRadius={20}
            style={styles.card}
            fallbackStyle={styles.cardFallback}
          >
            <Text style={styles.fieldLabel}>{t("Plugin GitHub URL")}</Text>
            <TextInput
              value={gitUrl}
              onChangeText={setGitUrl}
              accessibilityLabel={t("Plugin GitHub URL")}
              placeholder="https://github.com/owner/plugin"
              placeholderTextColor={
                native.tertiaryLabel ?? (scheme === "light" ? "#8C857A" : "#8A919E")
              }
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              maxLength={2048}
              style={styles.input}
            />
            <NativeActionButton
              disabled={!gitUrl.trim()}
              label={t("Preview")}
              onPress={() => openPlugin(gitImportParams(gitUrl))}
              prominence="secondary"
            />
          </GlassSurface>
        ) : null}
        {sourceError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {sourceError}
          </Text>
        ) : null}
        {adding === "source" && sourceKind ? (
          <GlassSurface
            shape="roundedRectangle"
            cornerRadius={20}
            style={styles.card}
            fallbackStyle={styles.cardFallback}
          >
            <Text style={styles.title}>
              {sourceKind === "treg"
                ? t("Connect Treg")
                : sourceKind === "executor"
                  ? t("Connect Executor")
                  : sourceKind === "mcp"
                    ? t("Remote MCP server")
                    : sourceKind === "graphql"
                      ? t("GraphQL endpoint")
                      : t("OpenAPI JSON")}
            </Text>
            <Text style={styles.fieldLabel}>{t("Display name")}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              accessibilityLabel={t("Display name")}
              style={styles.input}
            />
            {sourceKind !== "treg" ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t("Server URL")}</Text>
                <TextInput
                  value={url}
                  onChangeText={setUrl}
                  accessibilityLabel={t("Server URL")}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={
                    sourceKind === "mcp"
                      ? t("https://example.com/mcp")
                      : sourceKind === "executor"
                        ? t("https://executor.example/mcp")
                        : sourceKind === "graphql"
                          ? t("https://example.com/graphql")
                          : t("https://example.com/openapi.json")
                  }
                  placeholderTextColor={
                    native.tertiaryLabel ?? (scheme === "light" ? "#8C857A" : "#8A919E")
                  }
                  style={styles.input}
                />
              </View>
            ) : null}
            {sourceKind !== "treg" && sourceKind !== "executor" ? (
              <MenuPicker
                label={t("Authentication")}
                plain
                value={sourceAuth}
                choices={[
                  { key: "none", label: t("No auth") },
                  { key: "bearer", label: t("Bearer") },
                  { key: "header", label: t("API key") },
                  ...(sourceKind === "mcp" ? [{ key: "oauth", label: t("OAuth") }] : []),
                ]}
                onChange={(key) => setSourceAuth(key as SourceAuth)}
              />
            ) : null}
            {sourceAuth === "header" ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t("API key header name")}</Text>
                <TextInput
                  value={authHeader}
                  onChangeText={setAuthHeader}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel={t("API key header name")}
                  placeholder="x-api-key"
                  placeholderTextColor={
                    native.tertiaryLabel ?? (scheme === "light" ? "#8C857A" : "#8A919E")
                  }
                  style={styles.input}
                />
              </View>
            ) : null}
            {sourceAuth === "bearer" || sourceAuth === "header" ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{credentialLabel}</Text>
                <TextInput
                  value={credential}
                  onChangeText={setCredential}
                  accessibilityLabel={credentialLabel}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>
            ) : null}
            <View style={styles.accountActions}>
              <NativeActionButton
                busy={pending === "source"}
                label={t("Verify and add")}
                onPress={() => void addSource()}
                prominence="primary"
              />
              <NativeActionButton
                label={t("Cancel")}
                onPress={closeAdding}
                prominence="secondary"
              />
            </View>
          </GlassSurface>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaView edges={bottomClaimed ? [] : ["bottom"]} style={styles.screen}>
      <MainNavigationHeader onBack={adding ? closeAdding : detailKey ? closeDetail : undefined} />
      <ScrollView
        style={sideInsets}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <McpOAuthReturn flow={mcpReturn} onCompleted={() => void retryRefresh()} />
        {adding ? (
          renderAdding()
        ) : (
          <>
            {!detailItem ? renderAddMenuFallback() : null}
            {!detailItem ? (
              <GlassSurface
                shape="roundedRectangle"
                cornerRadius={16}
                fallbackStyle={styles.inputFallback}
              >
                <TextInput
                  value={query}
                  onChangeText={(value) => {
                    setQuery(value);
                    setVisibleCount(CONNECTION_CATALOG_PAGE_SIZE);
                    setPluginCount(PLUGIN_PAGE_SIZE);
                  }}
                  accessibilityLabel={t("Search apps")}
                  placeholder={t("Search apps")}
                  placeholderTextColor={
                    native.tertiaryLabel ?? (scheme === "light" ? "#8C857A" : "#8A919E")
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  style={styles.searchInput}
                />
              </GlassSurface>
            ) : null}

            {!detailItem && (categories.length >= 2 || category) ? (
              <View style={styles.categoryPicker}>
                <MenuPicker
                  label={t("Category")}
                  showLabel={false}
                  plain
                  choices={[
                    { key: "", label: t("All") },
                    ...categories.map((name) => ({ key: name, label: categoryLabel(name) })),
                  ]}
                  value={category}
                  onChange={(key) => {
                    setCategory(key);
                    setPluginCount(PLUGIN_PAGE_SIZE);
                  }}
                />
              </View>
            ) : null}

            {!detailItem && !filtering ? renderConnected() : null}
            {!detailItem && savedServerMatches.length ? (
              <View testID="connected-apps" style={styles.catalogStack}>
                {savedServerMatches.map(renderSavedServer)}
              </View>
            ) : null}

            {catalogError ? (
              <View style={styles.catalogStack}>
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

            {detailItem ? (
              renderDetail(detailItem)
            ) : (
              <>
                {!catalogReady && !catalogError ? (
                  <View
                    testID="integrations-loading"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={catalogColumns === 2 ? styles.catalogGrid : styles.catalogStack}
                  >
                    {Array.from({ length: 8 }, (_, index) => (
                      <View
                        key={index}
                        style={[
                          styles.row,
                          styles.rowFallback,
                          catalogColumns === 2 ? styles.catalogCell : null,
                        ]}
                      >
                        <View style={styles.logoPlaceholder} />
                        <View style={styles.grow}>
                          <View style={styles.titlePlaceholder} />
                        </View>
                        <View style={styles.pillPlaceholder} />
                      </View>
                    ))}
                  </View>
                ) : null}

                {catalogReady && catalog.length === 0 ? (
                  <Text style={styles.secondary}>{t(EMPTY_PLUGIN_CATALOG_MESSAGE)}</Text>
                ) : null}

                {catalogReady && catalog.length > 0 && !category ? (
                  <View style={catalogColumns === 2 ? styles.catalogGrid : styles.catalogStack}>
                    {showFeatured
                      ? featuredTiles.map((tile) => {
                          const item = tile.item;
                          const key = item ? catalogItemKey(item) : tile.id;
                          const disabled = tile.missing || !item;
                          if (item && !tile.missing) {
                            return renderCatalogTile(item, tile.label);
                          }
                          return (
                            <View
                              key={key}
                              style={[
                                styles.row,
                                styles.rowFallback,
                                catalogColumns === 2 ? styles.catalogCell : null,
                                disabled ? { opacity: 0.7 } : null,
                              ]}
                            >
                              <ConnectorIcon logo={item?.logo} name={tile.label} size={LOGO_SIZE} />
                              <View style={styles.grow}>
                                <Text numberOfLines={1} style={styles.title}>
                                  {tile.label}
                                </Text>
                                {disabled ? (
                                  <Text style={styles.secondary}>
                                    {t("Not in the plugin catalog")}
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                          );
                        })
                      : null}
                    {renderedApps.map((item) => renderCatalogTile(item, item.name))}
                  </View>
                ) : null}

                {catalogReady &&
                catalogApps.length === 0 &&
                pluginMatches.length === 0 &&
                brandMatches.length === 0 &&
                savedServerMatches.length === 0 &&
                pluginsState !== "loading" &&
                filtering ? (
                  <Text style={styles.secondary}>{t("No apps match your search.")}</Text>
                ) : null}

                {!category && renderedApps.length < catalogApps.length ? (
                  <NativeActionButton
                    label={t("Show more")}
                    onPress={() => setVisibleCount((count) => count + CONNECTION_CATALOG_PAGE_SIZE)}
                    prominence="secondary"
                  />
                ) : null}

                {renderPlugins()}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function isLightSurface(background?: string): boolean {
  if (!background || !background.startsWith("#") || background.length < 7) return true;
  return Number.parseInt(background.slice(1, 3), 16) >= 128;
}

function createIntegrationsStyles(
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
    explanation: { color: secondaryInk, fontSize: 14, lineHeight: 20 },
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
    field: { gap: 8 },
    fieldLabel: { color: secondaryInk, fontSize: 14, lineHeight: 20 },
    input: {
      minHeight: 48,
      borderRadius: 16,
      backgroundColor: chipBg,
      borderWidth: hairline,
      borderColor: chipBorder,
      color: labelInk,
      paddingHorizontal: 14,
      fontSize: 16,
    },
    inputFallback: {
      backgroundColor: cardBg,
      borderRadius: 16,
      borderWidth: hairline,
      borderColor: cardBorder,
      shadowColor: "#26231F",
      shadowOpacity: isLight ? 0.022 : 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    searchInput: { minHeight: 48, color: labelInk, paddingHorizontal: 16, fontSize: 16 },
    catalogGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    catalogStack: { gap: 10 },
    catalogCell: { flexGrow: 1, flexBasis: "47%", maxWidth: "49%" },
    catalogTileBody: {
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    row: {
      minHeight: 60,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 18,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    rowFallback: {
      backgroundColor: cardBg,
      experimental_backgroundImage: cardGradient(isLight, "rose"),
      overflow: "hidden",
      borderRadius: 18,
      borderWidth: hairline,
      borderColor: cardBorder,
      shadowColor: "#26231F",
      shadowOpacity: isLight ? 0.022 : 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    logoPlaceholder: {
      width: LOGO_SIZE,
      height: LOGO_SIZE,
      borderRadius: 10,
      backgroundColor: chipBg,
    },
    titlePlaceholder: {
      width: "65%",
      height: 14,
      borderRadius: 6,
      backgroundColor: chipBg,
    },
    pillPlaceholder: {
      width: 52,
      height: 30,
      borderRadius: 15,
      backgroundColor: chipBg,
    },
    grow: { flex: 1, gap: 3, minWidth: 0 },
    title: { color: labelInk, fontSize: 17, lineHeight: 22, fontWeight: "600" },
    secondary: { color: secondaryInk, fontSize: 14, lineHeight: 20 },
    pressed: { backgroundColor: chipBg },
    categoryPicker: { alignSelf: "flex-start" },
    sectionHeader: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sectionTitle: { color: labelInk, fontSize: 16, fontWeight: "600" },
    accountActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 8,
    },
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
    link: { color: labelInk, fontSize: 14, fontWeight: "600" },
    error: { color: destructive, fontSize: 14 },
    detail: { gap: 14 },
    detailHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    detailTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
    backButton: { paddingVertical: 4 },
    detailTitle: { flex: 1, color: labelInk, fontSize: 17, lineHeight: 22, fontWeight: "600" },
    toolsToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    toolsBody: { gap: 8, paddingTop: 4 },
    toolName: { color: labelInk, fontSize: 14 },
    addCustom: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignSelf: "flex-end",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: cardBg,
      borderWidth: hairline,
      borderColor: cardBorder,
    },
  });
}
