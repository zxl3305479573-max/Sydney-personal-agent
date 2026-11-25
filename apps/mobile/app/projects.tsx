import type { ProjectWorkspaceCursor, RpcOutput } from "@rakazo/contracts";
import { isRetryableError, newClientId } from "@rakazo/core";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "../components/glass-surface";
import { glassHeaderOptions } from "../components/glass-title";
import { MainNavigationHeader } from "../components/main-navigation-header";
import { MotionPressable } from "../components/motion-pressable";
import { NativeActionButton } from "../components/native-action-button";
import { NativeSymbol } from "../components/native-symbol";
import { ProjectFolderCard } from "../components/project-folder-card";
import { captureApiRequestContext, isSpaceSelectionPending, rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens, useResolvedAppearance } from "../lib/native";
import { iosAtLeast } from "../lib/native-controls";
import { clearPageState, usePageScroll, usePageState } from "../lib/page-state";
import { projectScopeKey, subscribeProjectScope } from "../lib/project-scope";
import { useScreenBackground } from "../lib/scoped-theme-context";
import { useBottomSafeAreaClaimed, useSideInsets } from "../lib/side-insets";
import { errorText } from "../lib/user-error";

const PROJECT_SYNC_INTERVAL_MS = 15_000;

export default function Projects() {
  const scopeKey = useSyncExternalStore(subscribeProjectScope, projectScopeKey);
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
  const [cursors, setCursors] = usePageState<ProjectWorkspaceCursor[]>(
    scopeKey,
    ["projects", "cursors"],
    [],
  );
  const after = cursors.at(-1);
  const scroll = usePageScroll(scopeKey, ["projects", "list", after]);
  const [page, setPage] = usePageState<RpcOutput<"projectWorkspaces/list"> | null>(
    scopeKey,
    ["projects", "list", after],
    null,
  );
  const [loading, setLoading] = useState(!page);
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
  const focused = useRef(false);
  const refreshInProgress = useRef(false);
  const focusGeneration = useRef(0);

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
      setLoading(page === null);
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
          const next = await rpc("projectWorkspaces/list", { after }, options);
          if (current()) setPage(next);
        } catch (cause) {
          if (current()) {
            if (!isRetryableError(cause)) {
              clearPageState(scopeKey, ["projects"]);
              setPage(null);
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
    }, [scopeKey, after, attempt, locale]),
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

  return (
    <>
      <MainNavigationHeader />
      <Stack.Screen
        options={{
          ...glassHeaderOptions(text("项目", "Projects")),
          ...(createAvailable
            ? iosAtLeast(26)
              ? {
                  unstable_headerRightItems: () => [
                    {
                      type: "button" as const,
                      hidesSharedBackground: true,
                      label: newProjectLabel,
                      accessibilityLabel: newProjectLabel,
                      icon: { type: "sfSymbol" as const, name: "plus" },
                      onPress: openCreateModal,
                    },
                  ],
                }
              : {
                  headerRight: () => (
                    <MotionPressable
                      preset="icon"
                      accessibilityRole="button"
                      accessibilityLabel={newProjectLabel}
                      onPress={openCreateModal}
                      hitSlop={8}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: cardBg,
                        borderWidth: hairline,
                        borderColor: cardBorder,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <NativeSymbol ios="plus" android="add" size={20} color={fg} />
                    </MotionPressable>
                  ),
                }
            : { headerRight: undefined, unstable_headerRightItems: undefined }),
        }}
      />
      <ScrollView
        {...scroll}
        contentInsetAdjustmentBehavior="automatic"
        style={[{ flex: 1, backgroundColor: screenBackground }, sideInsets]}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: bottomClaimed ? 28 : Math.max(insets.bottom, 28),
          gap: 14,
        }}
        keyboardShouldPersistTaps="handled"
        indicatorStyle={appearance === "dark" ? "white" : "black"}
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
      >
        {error && page ? (
          <Text accessibilityRole="alert" style={{ color: destructive }}>
            {error}
          </Text>
        ) : null}
        {isSpaceSelectionPending() ? (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 10 }}>
            <ActivityIndicator color={mutedFg} />
            <Text style={{ color: mutedFg }}>{text("正在切换空间…", "Switching space…")}</Text>
          </View>
        ) : loading && !page ? (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 10 }}>
            <ActivityIndicator color={mutedFg} />
            <Text style={{ color: mutedFg }}>{text("正在加载项目…", "Loading projects…")}</Text>
          </View>
        ) : error && !page ? (
          <GlassSurface
            shape="roundedRectangle"
            cornerRadius={22}
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
        ) : page?.items.length === 0 ? (
          <GlassSurface
            shape="roundedRectangle"
            cornerRadius={22}
            style={{ borderRadius: 22, padding: 26, alignItems: "center", gap: 12 }}
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
                width: 56,
                height: 56,
                borderRadius: 18,
                backgroundColor: chipBg,
                borderWidth: hairline,
                borderColor: chipBorder,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <NativeSymbol ios="folder" android="folder-outline" size={25} color={accentTaupe} />
            </View>
            <Text style={{ color: fg, fontSize: 17, fontWeight: "600" }}>
              {cursors.length
                ? text("此页没有更多项目", "No more projects on this page")
                : text("还没有项目工作区", "No project workspaces yet")}
            </Text>
            <Text
              style={{
                color: mutedFg,
                fontSize: 14,
                textAlign: "center",
                lineHeight: 20,
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
              <View style={{ alignSelf: "stretch", marginTop: 4 }}>
                <NativeActionButton label={newProjectLabel} onPress={openCreateModal} />
              </View>
            ) : null}
          </GlassSurface>
        ) : (
          <View style={{ gap: 12 }}>
            {page?.items.map((project) => (
              <ProjectFolderCard
                key={project.id}
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
            ))}
          </View>
        )}

        {cursors.length || (page?.nextCursor && !error) ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            {cursors.length ? (
              <NativeActionButton
                label={text("上一页", "Previous page")}
                disabled={loading}
                prominence="quiet"
                onPress={() => setCursors((old) => old.slice(0, -1))}
              />
            ) : (
              <View />
            )}
            {page?.nextCursor && !error ? (
              <NativeActionButton
                label={text("下一页", "Next page")}
                disabled={loading}
                prominence="quiet"
                onPress={() => {
                  const nextCursor = page?.nextCursor;
                  if (nextCursor) setCursors((old) => [...old, nextCursor]);
                }}
              />
            ) : null}
          </View>
        ) : null}

        {page && page.items.length > 0 ? (
          <Text style={{ color: mutedFg, fontSize: 13, textAlign: "center" }}>
            {createAvailable
              ? text("点击右上角 ＋ 可新建项目。", "Tap + in the top right to create a project.")
              : text(
                  "项目创建与项目内对话暂未开放。",
                  "Project creation and project conversations are not available yet.",
                )}
          </Text>
        ) : null}
      </ScrollView>

      {createOpen ? (
        <Modal transparent animationType="slide" onRequestClose={closeCreateModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{
              flex: 1,
              justifyContent: "flex-end",
              backgroundColor:
                tokens?.overlay ?? (isLight ? "rgba(24, 22, 18, 0.24)" : "rgba(8, 10, 14, 0.45)"),
            }}
          >
            <Pressable
              accessibilityLabel={text("关闭", "Close")}
              disabled={creating}
              onPress={closeCreateModal}
              style={{ flex: 1 }}
            />
            <View
              accessibilityViewIsModal
              style={{
                backgroundColor: canvasBg,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                borderTopWidth: hairline,
                borderColor: cardBorder,
                paddingTop: 10,
                paddingHorizontal: 20,
                paddingBottom: Math.max(insets.bottom, 20),
                gap: 14,
              }}
            >
              <View
                accessible={false}
                style={{
                  alignSelf: "center",
                  width: 38,
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: isLight ? "rgba(38, 35, 31, 0.18)" : "rgba(245, 244, 240, 0.22)",
                }}
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  accessibilityRole="header"
                  style={{ color: fg, fontSize: 20, fontWeight: "700" }}
                >
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
                label={
                  creating ? text("正在创建…", "Creating…") : text("创建项目", "Create project")
                }
                disabled={creating || !projectName.trim() || isSpaceSelectionPending()}
                busy={creating}
                onPress={() => void createProject()}
              />
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}
    </>
  );
}
