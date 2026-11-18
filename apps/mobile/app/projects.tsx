import type { ProjectWorkspaceCursor, RpcOutput } from "@rakazo/contracts";
import { newClientId } from "@rakazo/core";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "../components/glass-surface";
import { glassHeaderOptions } from "../components/glass-title";
import { NativeActionButton } from "../components/native-action-button";
import { NativeSymbol } from "../components/native-symbol";
import { ProjectFolderCard } from "../components/project-folder-card";
import { captureApiRequestContext, isSpaceSelectionPending, rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens, useResolvedAppearance } from "../lib/native";
import { iosAtLeast } from "../lib/native-controls";
import { projectScopeKey, subscribeProjectScope } from "../lib/project-scope";
import { useSideInsets } from "../lib/side-insets";
import { errorText } from "../lib/user-error";

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
  const appearance = useResolvedAppearance();
  const sideInsets = useSideInsets();
  const [page, setPage] = useState<RpcOutput<"projectWorkspaces/list"> | null>(null);
  const [cursors, setCursors] = useState<ProjectWorkspaceCursor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createAvailable, setCreateAvailable] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createAttempt = useRef<{ name: string; id: string } | null>(null);
  const createInFlight = useRef(false);
  const focused = useRef(false);
  const focusGeneration = useRef(0);
  const after = cursors.at(-1);

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
      setLoading((wasLoading) => wasLoading || page === null);
      setError(null);
      setCreateAvailable(false);
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
          if (current())
            setError(errorText(cause, text("无法加载项目", "Could not load projects")));
        } finally {
          if (current()) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      })();
      return () => {
        active = false;
        focused.current = false;
        controller.abort();
      };
    }, [scopeKey, after, attempt, locale]),
  );

  const newProjectLabel = text("新建项目", "New project");

  return (
    <>
      <Stack.Screen
        options={{
          ...glassHeaderOptions(text("项目", "Projects")),
          ...(createAvailable
            ? iosAtLeast(26)
              ? {
                  unstable_headerRightItems: () => [
                    {
                      type: "button" as const,
                      label: newProjectLabel,
                      accessibilityLabel: newProjectLabel,
                      icon: { type: "sfSymbol" as const, name: "plus" },
                      onPress: openCreateModal,
                    },
                  ],
                }
              : {
                  headerRight: () => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={newProjectLabel}
                      onPress={openCreateModal}
                      hitSlop={8}
                      style={{
                        width: 36,
                        height: 36,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <NativeSymbol ios="plus" android="add" size={22} color={tokens.foreground} />
                    </Pressable>
                  ),
                }
            : { headerRight: undefined, unstable_headerRightItems: undefined }),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={[{ flex: 1, backgroundColor: tokens.background }, sideInsets]}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: Math.max(insets.bottom, 28),
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
            colors={[tokens.mutedForeground]}
            progressBackgroundColor={tokens.muted}
          />
        }
      >
        {isSpaceSelectionPending() ? (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 10 }}>
            <ActivityIndicator color={tokens.mutedForeground} />
            <Text style={{ color: tokens.mutedForeground }}>
              {text("正在切换空间…", "Switching space…")}
            </Text>
          </View>
        ) : loading && !page ? (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 10 }}>
            <ActivityIndicator color={tokens.mutedForeground} />
            <Text style={{ color: tokens.mutedForeground }}>
              {text("正在加载项目…", "Loading projects…")}
            </Text>
          </View>
        ) : error ? (
          <GlassSurface
            shape="roundedRectangle"
            cornerRadius={16}
            style={{ borderRadius: 16, padding: 18, gap: 12 }}
            fallbackStyle={{
              backgroundColor: tokens.card,
              borderWidth: 1,
              borderColor: tokens.border,
            }}
          >
            <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
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
            cornerRadius={20}
            style={{ borderRadius: 20, padding: 24, alignItems: "center", gap: 12 }}
            fallbackStyle={{
              backgroundColor: tokens.card,
              borderWidth: 1,
              borderColor: tokens.border,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: native.fill,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <NativeSymbol
                ios="folder"
                android="folder-outline"
                size={26}
                color={tokens.primary}
              />
            </View>
            <Text style={{ color: tokens.foreground, fontSize: 17, fontWeight: "600" }}>
              {cursors.length
                ? text("此页没有更多项目", "No more projects on this page")
                : text("还没有项目工作区", "No project workspaces yet")}
            </Text>
            <Text
              style={{
                color: tokens.mutedForeground,
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
          <Text style={{ color: tokens.mutedForeground, fontSize: 13, textAlign: "center" }}>
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
            style={{ flex: 1, justifyContent: "flex-end", backgroundColor: tokens.overlay }}
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
                backgroundColor: tokens.background,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
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
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: tokens.mutedForeground,
                  opacity: 0.35,
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
                  style={{ color: tokens.foreground, fontSize: 20, fontWeight: "700" }}
                >
                  {newProjectLabel}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={text("关闭", "Close")}
                  disabled={creating}
                  onPress={closeCreateModal}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: native.fill,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <NativeSymbol ios="xmark" android="close" size={16} color={tokens.foreground} />
                </Pressable>
              </View>
              <GlassSurface
                shape="roundedRectangle"
                cornerRadius={14}
                style={{ borderRadius: 14 }}
                fallbackStyle={{
                  backgroundColor: tokens.card,
                  borderWidth: 1,
                  borderColor: tokens.border,
                }}
              >
                <TextInput
                  autoFocus
                  value={projectName}
                  maxLength={80}
                  onChangeText={setProjectName}
                  editable={!creating}
                  placeholder={text("输入项目名称", "Enter project name")}
                  placeholderTextColor={tokens.mutedForeground}
                  returnKeyType="done"
                  onSubmitEditing={() => void createProject()}
                  style={{
                    color: tokens.foreground,
                    minHeight: 48,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 16,
                  }}
                />
              </GlassSurface>
              {createError ? (
                <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
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
