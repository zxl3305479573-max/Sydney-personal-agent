import type { ProjectWorkspaceCursor, RpcOutput } from "@rakazo/contracts";
import { isRetryableError, newClientId } from "@rakazo/core";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppModalSheet } from "../../components/app-modal-sheet";
import { FeatureDisabledView } from "../../components/feature-disabled-view";
import { GlassSurface } from "../../components/glass-surface";
import { MotionPressable } from "../../components/motion-pressable";
import { NativeActionButton } from "../../components/native-action-button";
import { NativeSymbol } from "../../components/native-symbol";
import { ProjectFolderCard } from "../../components/project-folder-card";
import { captureApiRequestContext, isSpaceSelectionPending, rpc } from "../../lib/api";
import { useFeatureAccess } from "../../lib/feature-access";
import { useI18n } from "../../lib/i18n";
import { native, useMobileTokens, useResolvedAppearance } from "../../lib/native";
import { clearPageState, usePageScroll, usePageState } from "../../lib/page-state";
import { projectScopeKey, subscribeProjectScope } from "../../lib/project-scope";
import { useScreenBackground } from "../../lib/scoped-theme-context";
import { useBottomSafeAreaClaimed, useSideInsets } from "../../lib/side-insets";
import { registerTabScrollToTop } from "../../lib/tab-scroll-to-top";
import { errorText } from "../../lib/user-error";

const PROJECT_SYNC_INTERVAL_MS = 15_000;

type ProjectItem = RpcOutput<"projectWorkspaces/list">["items"][number];
type ProjectsListState = {
  items: ProjectItem[];
  nextCursor: ProjectWorkspaceCursor | null;
};

function mergeProjects(existing: ProjectItem[], incoming: ProjectItem[]): ProjectItem[] {
  const seen = new Set(existing.map((item) => item.id));
  const merged = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

export default function Projects() {
  const { projects } = useFeatureAccess();
  const scopeKey = useSyncExternalStore(subscribeProjectScope, projectScopeKey);
  if (!projects) return <FeatureDisabledView feature="projects" />;
  return <ProjectBrowser key={scopeKey} scopeKey={scopeKey} />;
}

function ProjectBrowser({ scopeKey }: { scopeKey: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
  const tokens = useMobileTokens();
  const screenBackground = useScreenBackground(tokens.background);
  const appearance = useResolvedAppearance();
  const sideInsets = useSideInsets();
  const bottomClaimed = useBottomSafeAreaClaimed();
  const listRef = useRef<FlatList<ProjectItem>>(null);
  const scroll = usePageScroll(scopeKey, ["projects", "list"]);
  const [listState, setListState] = usePageState<ProjectsListState | null>(
    scopeKey,
    ["projects", "list"],
    null,
  );
  const [loading, setLoading] = useState(!listState);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createAvailable, setCreateAvailable] = usePageState(
    scopeKey,
    ["projects", "createAvailable"],
    false,
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const createAttempt = useRef<{ name: string; id: string } | null>(null);
  const createInFlight = useRef(false);
  const loadMoreInFlight = useRef(false);
  const focused = useRef(false);
  const refreshInProgress = useRef(false);
  const focusGeneration = useRef(0);
  const listStateRef = useRef(listState);
  listStateRef.current = listState;

  useEffect(
    () =>
      registerTabScrollToTop("/projects", () => {
        listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
      }),
    [],
  );

  const openCreateModal = () => {
    if (!createAvailable || isSpaceSelectionPending()) return;
    setCreateError(null);
    setCreateOpen(true);
  };

  const closeCreateModal = () => {
    if (creating) return;
    setCreateOpen(false);
    setCreateError(null);
  };

  const createProject = async () => {
    const name = projectName.trim();
    if (
      !name ||
      !createAvailable ||
      createInFlight.current ||
      !focused.current ||
      scopeKey !== projectScopeKey() ||
      isSpaceSelectionPending()
    )
      return;
    const generation = focusGeneration.current;
    const current = () =>
      focused.current &&
      focusGeneration.current === generation &&
      scopeKey === projectScopeKey() &&
      !isSpaceSelectionPending();
    createInFlight.current = true;
    setCreating(true);
    setCreateError(null);
    try {
      const requestContext = await captureApiRequestContext();
      if (!current()) return;
      if (createAttempt.current?.name !== name) createAttempt.current = { name, id: newClientId() };
      const project = await rpc(
        "projectWorkspaces/create",
        { id: createAttempt.current.id, name },
        {
          requestContext,
          skipSpaceAuthRecovery: true,
        },
      );
      if (!current()) return;
      createAttempt.current = null;
      setProjectName("");
      setCreateOpen(false);
      router.push({
        pathname: "/projects/[workspaceId]",
        params: { workspaceId: project.id, scope: scopeKey },
      });
    } catch (cause) {
      if (current())
        setCreateError(errorText(cause, text("无法创建项目", "Could not create project")));
    } finally {
      createInFlight.current = false;
      if (focused.current) setCreating(false);
    }
  };

  const loadMore = useCallback(async () => {
    const cursor = listStateRef.current?.nextCursor;
    if (
      !cursor ||
      loadMoreInFlight.current ||
      refreshInProgress.current ||
      !focused.current ||
      scopeKey !== projectScopeKey() ||
      isSpaceSelectionPending()
    )
      return;
    const generation = focusGeneration.current;
    const current = () =>
      focused.current &&
      focusGeneration.current === generation &&
      scopeKey === projectScopeKey() &&
      !isSpaceSelectionPending();
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    try {
      const requestContext = await captureApiRequestContext();
      if (!current()) return;
      const next = await rpc(
        "projectWorkspaces/list",
        { after: cursor },
        {
          requestContext,
          skipSpaceAuthRecovery: true,
        },
      );
      if (!current()) return;
      setListState((prev) => ({
        items: mergeProjects(prev?.items ?? [], next.items),
        nextCursor: next.nextCursor,
      }));
    } catch (cause) {
      if (current())
        setError(errorText(cause, text("无法加载更多项目", "Could not load more projects")));
    } finally {
      loadMoreInFlight.current = false;
      if (current()) setLoadingMore(false);
    }
  }, [scopeKey, setListState, locale]);

  useFocusEffect(
    useCallback(() => {
      if (isSpaceSelectionPending()) return;
      let active = true;
      focused.current = true;
      focusGeneration.current += 1;
      if (!createInFlight.current) setCreating(false);
      const controller = new AbortController();
      const current = () => active && scopeKey === projectScopeKey() && !isSpaceSelectionPending();
      refreshInProgress.current = true;
      setLoading(listStateRef.current === null);
      setError(null);
      void (async () => {
        try {
          const requestContext = await captureApiRequestContext();
          if (!current()) return;
          const options = {
            requestContext,
            signal: controller.signal,
            skipSpaceAuthRecovery: true,
          };
          void rpc("projectWorkspaces/capabilities", undefined, options)
            .then((capabilities) => {
              if (current()) setCreateAvailable(capabilities.create === true);
            })
            .catch(() => {
              if (current()) setCreateAvailable(false);
            });
          const firstPage = await rpc("projectWorkspaces/list", { after: undefined }, options);
          if (current()) {
            setListState((prev) => {
              if (!prev || refreshing) {
                return { items: firstPage.items, nextCursor: firstPage.nextCursor };
              }
              // Keep already-loaded later pages intact on background sync when page 1 still links forward.
              if (prev.items.length > firstPage.items.length && firstPage.nextCursor) {
                return {
                  items: mergeProjects(firstPage.items, prev.items),
                  nextCursor: prev.nextCursor,
                };
              }
              return { items: firstPage.items, nextCursor: firstPage.nextCursor };
            });
          }
        } catch (cause) {
          if (current()) {
            if (!isRetryableError(cause)) {
              clearPageState(scopeKey, ["projects"]);
              setListState(null);
              setCreateAvailable(false);
            }
            setError(errorText(cause, text("无法加载项目", "Could not load projects")));
          }
        } finally {
          refreshInProgress.current = false;
          if (current()) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      })();
      const timer = setInterval(() => {
        if (current() && AppState.currentState !== "background" && !refreshInProgress.current)
          setAttempt((old) => old + 1);
      }, PROJECT_SYNC_INTERVAL_MS);
      const foreground = AppState.addEventListener("change", (state) => {
        if (state !== "background" && current() && !refreshInProgress.current)
          setAttempt((old) => old + 1);
      });
      return () => {
        active = false;
        focused.current = false;
        controller.abort();
        clearInterval(timer);
        foreground.remove();
      };
    }, [scopeKey, attempt, locale]),
  );

  const newProjectLabel = text("新建项目", "New project");
  const isLight = appearance === "light";
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const canvasBg = tokens?.background ?? (isLight ? "#F3F1EC" : "#15171C");
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder = isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const accentTaupe = isLight ? "#6E675E" : "#B8B3AA";
  const fg = tokens?.foreground ?? (isLight ? "#26231F" : "#F5F4F0");
  const mutedFg = tokens?.mutedForeground ?? accentTaupe;
  const destructive = tokens?.destructive ?? (isLight ? "#C4272D" : "#FF8F8C");
  const cardShadow = {
    shadowColor: "#26231F",
    shadowOpacity: isLight ? 0.028 : 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  } as const;

  const items = isSpaceSelectionPending() || (error && !listState) ? [] : (listState?.items ?? []);
  const padLeft = 20 + (sideInsets?.paddingLeft ?? 0);
  const padRight = 20 + (sideInsets?.paddingRight ?? 0);
  const zhSerifTitle =
    Platform.OS === "ios" && locale.startsWith("zh") ? { fontFamily: "Songti SC" } : undefined;
  const headerEyebrow =
    items.length > 0
      ? text(`${items.length} 个工作区`, `${items.length} workspaces`)
      : text("项目工作区", "Project workspaces");

  return (
    <View style={{ flex: 1, backgroundColor: screenBackground }}>
      <View
        testID="projects-header"
        style={{
          paddingTop: Math.max(insets?.top ?? 0, 16) + 8,
          paddingLeft: padLeft,
          paddingRight: padRight,
          paddingBottom: 12,
          gap: 6,
        }}
      >
        <View
          style={{
            minHeight: 36,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              minWidth: 0,
              color: mutedFg,
              fontSize: 15,
              lineHeight: 20,
            }}
          >
            {headerEyebrow}
          </Text>
          {createAvailable ? (
            <MotionPressable
              preset="icon"
              accessibilityRole="button"
              accessibilityLabel={newProjectLabel}
              onPress={openCreateModal}
              hitSlop={6}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: cardBg,
                borderWidth: hairline,
                borderColor: cardBorder,
                alignItems: "center",
                justifyContent: "center",
                ...cardShadow,
              }}
            >
              <NativeSymbol ios="plus" android="add" size={18} color={fg} />
            </MotionPressable>
          ) : null}
        </View>
        <Text
          accessibilityRole="header"
          style={[
            {
              color: fg,
              fontSize: 30,
              lineHeight: 36,
              fontWeight: "700",
            },
            zhSerifTitle,
          ]}
        >
          {text("项目", "Projects")}
        </Text>
      </View>

      <FlatList<ProjectItem>
        ref={listRef}
        testID="projects-list"
        data={items}
        keyExtractor={(project) => project.id}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        {...scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingLeft: padLeft,
          paddingRight: padRight,
          paddingTop: 6,
          paddingBottom: bottomClaimed ? 28 : Math.max(insets?.bottom ?? 0, 28),
          gap: 12,
        }}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              if (isSpaceSelectionPending() || loading) return;
              setRefreshing(true);
              setAttempt((old) => old + 1);
            }}
            tintColor={native.secondaryLabel}
            colors={[mutedFg]}
            progressBackgroundColor={tokens?.muted ?? chipBg}
          />
        }
        ListHeaderComponent={
          error && listState ? (
            <Text accessibilityRole="alert" style={{ color: destructive, marginBottom: 4 }}>
              {error}
            </Text>
          ) : null
        }
        renderItem={({ item: project }) => (
          <ProjectFolderCard
            label={project.name}
            subtitle={text("进入项目空间", "Open workspace")}
            disabled={isSpaceSelectionPending()}
            onPress={() => {
              if (scopeKey !== projectScopeKey() || isSpaceSelectionPending()) return;
              router.push({
                pathname: "/projects/[workspaceId]",
                params: { workspaceId: project.id, scope: scopeKey },
              });
            }}
          />
        )}
        ListEmptyComponent={
          isSpaceSelectionPending() ? (
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                paddingVertical: 32,
                paddingBottom: 48,
                gap: 10,
              }}
            >
              <ActivityIndicator color={mutedFg} />
              <Text style={{ color: mutedFg }}>{text("正在切换空间…", "Switching space…")}</Text>
            </View>
          ) : loading && !listState ? (
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                paddingVertical: 32,
                paddingBottom: 48,
                gap: 10,
              }}
            >
              <ActivityIndicator color={mutedFg} />
              <Text style={{ color: mutedFg }}>{text("正在加载项目…", "Loading projects…")}</Text>
            </View>
          ) : error && !listState ? (
            <View style={{ flex: 1, justifyContent: "center", paddingBottom: 48 }}>
              <GlassSurface
                shape="roundedRectangle"
                cornerRadius={22}
                gradient="slate"
                style={{ borderRadius: 22, padding: 20, gap: 12 }}
                fallbackStyle={{
                  backgroundColor: cardBg,
                  borderRadius: 22,
                  borderWidth: hairline,
                  borderColor: cardBorder,
                  ...cardShadow,
                }}
              >
                <Text accessibilityRole="alert" style={{ color: destructive }}>
                  {error}
                </Text>
                <NativeActionButton
                  label={text("重试", "Retry")}
                  prominence="secondary"
                  fill={false}
                  onPress={() => {
                    setLoading(true);
                    setAttempt((old) => old + 1);
                  }}
                />
              </GlassSurface>
            </View>
          ) : listState ? (
            <View style={{ flex: 1, justifyContent: "center", paddingBottom: 48 }}>
              <GlassSurface
                shape="roundedRectangle"
                cornerRadius={22}
                gradient="slate"
                style={{
                  borderRadius: 22,
                  paddingHorizontal: 24,
                  paddingVertical: 28,
                  alignItems: "center",
                  gap: 12,
                }}
                fallbackStyle={{
                  backgroundColor: cardBg,
                  borderRadius: 22,
                  borderWidth: hairline,
                  borderColor: cardBorder,
                  ...cardShadow,
                }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    backgroundColor: chipBg,
                    borderWidth: hairline,
                    borderColor: chipBorder,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <NativeSymbol
                    ios="folder"
                    android="folder-outline"
                    size={24}
                    color={accentTaupe}
                  />
                </View>
                <Text
                  style={{
                    color: fg,
                    fontSize: 18,
                    lineHeight: 24,
                    fontWeight: "600",
                    textAlign: "center",
                  }}
                >
                  {text("还没有项目工作区", "No project workspaces yet")}
                </Text>
                <Text
                  style={{
                    color: mutedFg,
                    fontSize: 14,
                    lineHeight: 21,
                    textAlign: "center",
                    maxWidth: 264,
                  }}
                >
                  {createAvailable
                    ? text(
                        "创建独立项目工作区，将不同文件夹下的小伙伴与群聊分开管理。",
                        "Create a dedicated project workspace to keep bots and group chats organized by folder.",
                      )
                    : text(
                        "项目创建及项目内会话暂未在当前服务器开放。",
                        "Project creation and project conversations are not enabled on this server yet.",
                      )}
                </Text>
                {createAvailable ? (
                  <View style={{ marginTop: 6, alignItems: "center" }}>
                    <NativeActionButton
                      label={newProjectLabel}
                      fill={false}
                      onPress={openCreateModal}
                    />
                  </View>
                ) : null}
              </GlassSurface>
            </View>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 14, alignItems: "center" }}>
              <ActivityIndicator color={mutedFg} />
            </View>
          ) : items.length > 0 ? (
            <Text style={{ color: mutedFg, fontSize: 13, textAlign: "center", marginTop: 8 }}>
              {createAvailable
                ? text("点击右上角 ＋ 可新建项目。", "Tap + in the top right to create a project.")
                : text(
                    "项目创建与项目内对话暂未开放。",
                    "Project creation and project conversations are not available yet.",
                  )}
            </Text>
          ) : null
        }
      />

      <AppModalSheet
        visible={createOpen}
        onClose={closeCreateModal}
        preventDismiss={creating}
        accessibilityLabel={newProjectLabel}
        backgroundColor={canvasBg}
        bottomInset={insets?.bottom ?? 0}
        contentStyle={{ paddingHorizontal: 20, gap: 14 }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text accessibilityRole="header" style={{ color: fg, fontSize: 20, fontWeight: "700" }}>
            {newProjectLabel}
          </Text>
          <MotionPressable
            preset="icon"
            accessibilityRole="button"
            accessibilityLabel={text("关闭", "Close")}
            disabled={creating}
            onPress={closeCreateModal}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: chipBg,
              borderWidth: hairline,
              borderColor: chipBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <NativeSymbol ios="xmark" android="close" size={16} color={fg} />
          </MotionPressable>
        </View>
        <GlassSurface
          shape="roundedRectangle"
          cornerRadius={16}
          style={{ borderRadius: 16 }}
          fallbackStyle={{
            backgroundColor: cardBg,
            borderRadius: 16,
            borderWidth: hairline,
            borderColor: cardBorder,
          }}
        >
          <TextInput
            accessibilityLabel={text("项目名称", "Project name")}
            autoFocus
            value={projectName}
            maxLength={80}
            onChangeText={setProjectName}
            editable={!creating}
            placeholder={text("输入项目名称", "Enter project name")}
            placeholderTextColor={mutedFg}
            returnKeyType="done"
            onSubmitEditing={() => void createProject()}
            style={{
              color: fg,
              minHeight: 48,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 16,
            }}
          />
        </GlassSurface>
        {createError ? (
          <Text accessibilityRole="alert" style={{ color: destructive }}>
            {createError}
          </Text>
        ) : null}
        <NativeActionButton
          label={creating ? text("正在创建…", "Creating…") : text("创建项目", "Create project")}
          disabled={creating || !projectName.trim() || isSpaceSelectionPending()}
          busy={creating}
          onPress={() => void createProject()}
        />
      </AppModalSheet>
    </View>
  );
}
