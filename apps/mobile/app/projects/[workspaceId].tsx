import type { ProjectWorkspace, RpcOutput } from "@rakazo/contracts";
import { DEFAULT_NEW_BOT_AVATAR_SET, ProjectWorkspaceIdInput } from "@rakazo/contracts";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CreateBotModal } from "../../components/create-bot-modal";
import { ProjectDirectory } from "../../components/project-directory";
import { GlassSurface } from "../../components/glass-surface";
import { glassHeaderOptions } from "../../components/glass-title";
import { NativeActionButton } from "../../components/native-action-button";
import { NativeSymbol } from "../../components/native-symbol";
import type { ProjectGroupAttempt } from "../../components/project-group-modal";
import { ProjectGroupModal } from "../../components/project-group-modal";
import { captureApiRequestContext, isSpaceSelectionPending, rpc } from "../../lib/api";
import type { InboxBotIdentity } from "../../lib/create-inbox-bot";
import { useI18n } from "../../lib/i18n";
import { native, useMobileTokens, useResolvedAppearance } from "../../lib/native";
import { iosAtLeast } from "../../lib/native-controls";
import { projectScopeKey, subscribeProjectScope } from "../../lib/project-scope";
import { useSideInsets } from "../../lib/side-insets";

export default function ProjectDetail() {
  const { workspaceId, scope } = useLocalSearchParams<{ workspaceId: string; scope?: string }>();
  const scopeKey = useSyncExternalStore(subscribeProjectScope, projectScopeKey);
  const [openedScope] = useState(scope ?? scopeKey);
  const validId = ProjectWorkspaceIdInput.safeParse({ id: workspaceId });
  return (
    <ProjectContents
      key={JSON.stringify([scopeKey, workspaceId])}
      workspaceId={validId.success ? validId.data.id : null}
      scopeKey={scopeKey}
      scopeChanged={scopeKey !== openedScope}
    />
  );
}

function ProjectContents({
  workspaceId,
  scopeKey,
  scopeChanged,
}: {
  workspaceId: string | null;
  scopeKey: string;
  scopeChanged: boolean;
}) {
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const insets = useSafeAreaInsets();
  const sideInsets = useSideInsets();
  const router = useRouter();
  const [project, setProject] = useState<ProjectWorkspace | null>(null);
  const [roster, setRoster] = useState<RpcOutput<"projectWorkspaces/roster"> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [canRemove, setCanRemove] = useState(false);
  const [canCreateBot, setCanCreateBot] = useState(false);
  const [creatingBot, setCreatingBot] = useState(false);
  const [canCreateGroup, setCanCreateGroup] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const groupAttempt = useRef<ProjectGroupAttempt | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const removeInFlight = useRef(false);
  const focused = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [botCursors, setBotCursors] = useState<string[]>([]);
  const [groupCursors, setGroupCursors] = useState<string[]>([]);
  const afterBotId = botCursors.at(-1);
  const afterGroupId = groupCursors.at(-1);

  useFocusEffect(
    useCallback(() => {
      if (!workspaceId || scopeChanged || isSpaceSelectionPending()) return;
      let active = true;
      focused.current = true;
      if (!removeInFlight.current) setRemoving(false);
      const controller = new AbortController();
      const current = () => active && scopeKey === projectScopeKey() && !isSpaceSelectionPending();
      setFailed(false);
      setCanRemove(false);
      setCanCreateBot(false);
      setCanCreateGroup(false);
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
              if (current()) setCanRemove(capabilities.removeEmpty === true);
            })
            .catch(() => {
              if (current()) setCanRemove(false);
            });
          void rpc("projectWorkspaces/conversationCapabilities", undefined, options)
            .then((capabilities) => {
              if (current()) setCanCreateBot(capabilities.createBot === true);
            })
            .catch(() => {
              if (current()) setCanCreateBot(false);
            });
          void rpc("projectWorkspaces/groupCreationCapability", undefined, options)
            .then((capabilities) => {
              if (current()) setCanCreateGroup(capabilities.createGroup === true);
            })
            .catch(() => {
              if (current()) setCanCreateGroup(false);
            });
          const [result, projectRoster] = await Promise.all([
            rpc("projectWorkspaces/get", { id: workspaceId }, options),
            rpc("projectWorkspaces/roster", { id: workspaceId, afterBotId, afterGroupId }, options),
          ]);
          if (current()) {
            setProject(result);
            setRoster(projectRoster);
          }
        } catch {
          if (current()) setFailed(true);
        } finally {
          if (current()) setRefreshing(false);
        }
      })();
      return () => {
        active = false;
        focused.current = false;
        controller.abort();
      };
    }, [workspaceId, scopeKey, scopeChanged, attempt, afterBotId, afterGroupId]),
  );

  async function createProjectBot(identity: InboxBotIdentity) {
    const current = () =>
      focused.current &&
      !scopeChanged &&
      scopeKey === projectScopeKey() &&
      !isSpaceSelectionPending();
    if (!workspaceId || !canCreateBot || !current())
      throw new Error(
        text("项目已改变，请返回后重新打开。", "The project changed. Return and try again."),
      );
    const requestContext = await captureApiRequestContext();
    if (!current())
      throw new Error(
        text("项目已改变，请返回后重新打开。", "The project changed. Return and try again."),
      );
    await rpc(
      "projectWorkspaces/createBot",
      {
        projectId: workspaceId,
        bot: {
          ...identity,
          notifyOnFinish: true,
          avatarSet: DEFAULT_NEW_BOT_AVATAR_SET,
          computerMode: "team",
        },
      },
      { requestContext, skipSpaceAuthRecovery: true },
    );
    return null;
  }

  async function removeProject() {
    if (
      !workspaceId ||
      !canRemove ||
      removeInFlight.current ||
      !focused.current ||
      scopeChanged ||
      scopeKey !== projectScopeKey() ||
      isSpaceSelectionPending()
    )
      return;
    removeInFlight.current = true;
    setRemoving(true);
    setRemoveError(null);
    const current = () =>
      focused.current && scopeKey === projectScopeKey() && !isSpaceSelectionPending();
    try {
      const requestContext = await captureApiRequestContext();
      if (!current()) return;
      await rpc(
        "projectWorkspaces/removeEmpty",
        { id: workspaceId, confirmRemoveAppData: true },
        {
          requestContext,
          skipSpaceAuthRecovery: true,
        },
      );
      if (current()) router.dismissTo("/projects");
    } catch {
      if (current())
        setRemoveError(
          text(
            "无法删除项目；项目可能包含内容，或请求结果尚未确认。请刷新后查看。",
            "Could not remove the project. It may contain data or the result may be unknown; refresh to check.",
          ),
        );
    } finally {
      removeInFlight.current = false;
      if (current()) setRemoving(false);
    }
  }

  function confirmRemoveProject() {
    if (!canRemove || removing || !focused.current) return;
    Alert.alert(
      text("删除空项目？", "Remove empty project?"),
      text(
        "只删除空项目记录，不删除电脑中的文件。",
        "Only an empty project record is removed; files on your computer are not deleted.",
      ),
      [
        { text: text("取消", "Cancel"), style: "cancel" },
        {
          text: text("删除", "Remove"),
          style: "destructive",
          onPress: () => void removeProject(),
        },
      ],
    );
  }

  const unavailable = scopeChanged || !workspaceId;
  const switchLabel = text("切换项目", "Switch project");
  const openConversation = (kind: "bot" | "group", id: string) => {
    if (
      !workspaceId ||
      scopeChanged ||
      !focused.current ||
      scopeKey !== projectScopeKey() ||
      isSpaceSelectionPending()
    )
      return;
    router.push({
      pathname: "/projects/[workspaceId]/chat",
      params: {
        workspaceId,
        scope: scopeKey,
        ...(kind === "bot" ? { botId: id } : { groupId: id }),
      },
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          ...glassHeaderOptions(project?.name ?? text("项目", "Project")),
          ...(iosAtLeast(26)
            ? {
                unstable_headerRightItems: () => [
                  {
                    type: "button" as const,
                    label: switchLabel,
                    accessibilityLabel: switchLabel,
                    icon: { type: "sfSymbol" as const, name: "folder" },
                    onPress: () => router.dismissTo("/projects"),
                  },
                ],
              }
            : {
                headerRight: () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={switchLabel}
                    onPress={() => router.dismissTo("/projects")}
                    hitSlop={8}
                    style={{ paddingHorizontal: 8, paddingVertical: 6 }}
                  >
                    <Text style={{ color: tokens.primary, fontSize: 15, fontWeight: "500" }}>
                      {switchLabel}
                    </Text>
                  </Pressable>
                ),
              }),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={[{ flex: 1, backgroundColor: tokens.background }, sideInsets]}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: Math.max(insets.bottom, 28),
          gap: 18,
        }}
        indicatorStyle={appearance === "dark" ? "white" : "black"}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              if (unavailable || isSpaceSelectionPending()) return;
              setRefreshing(true);
              setAttempt((old) => old + 1);
            }}
            tintColor={native.secondaryLabel}
            colors={[tokens.mutedForeground]}
            progressBackgroundColor={tokens.muted}
          />
        }
      >
        {unavailable ? (
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
              {text(
                "项目入口已失效，请返回列表重新选择项目。",
                "This project link is no longer active. Choose a project from the list again.",
              )}
            </Text>
            <NativeActionButton
              label={switchLabel}
              prominence="secondary"
              fill={false}
              onPress={() => router.dismissTo("/projects")}
            />
          </GlassSurface>
        ) : failed ? (
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
              {text(
                "无法打开项目，项目可能已移除或连接不可用。",
                "Could not open this project. It may have been removed or the connection is unavailable.",
              )}
            </Text>
            <NativeActionButton
              label={text("重试", "Retry")}
              onPress={() => setAttempt((old) => old + 1)}
            />
          </GlassSurface>
        ) : !project ? (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 10 }}>
            <ActivityIndicator color={tokens.mutedForeground} />
            <Text style={{ color: tokens.mutedForeground }}>
              {text("正在加载项目…", "Loading project…")}
            </Text>
          </View>
        ) : (
          <>
            <GlassSurface
              shape="roundedRectangle"
              cornerRadius={18}
              style={{
                borderRadius: 18,
                padding: 18,
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
              }}
              fallbackStyle={{
                backgroundColor: tokens.card,
                borderWidth: 1,
                borderColor: tokens.border,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: native.fill,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <NativeSymbol ios="folder.fill" android="folder" size={26} color={tokens.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <Text
                  accessibilityRole="header"
                  numberOfLines={1}
                  style={{ fontSize: 20, fontWeight: "700", color: tokens.foreground }}
                >
                  {project.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: tokens.mutedForeground,
                    }}
                  />
                  <Text style={{ color: tokens.mutedForeground, fontSize: 13 }}>
                    {text("独立项目工作区", "Independent project workspace")}
                  </Text>
                </View>
              </View>
            </GlassSurface>

            <ProjectDirectory key={JSON.stringify([scopeKey, project.id])} projectId={project.id} scopeKey={scopeKey} enabled={!scopeChanged} />

            {!roster ? (
              <View style={{ paddingVertical: 20, alignItems: "center", gap: 8 }}>
                <ActivityIndicator color={tokens.mutedForeground} />
                <Text style={{ color: tokens.mutedForeground }}>
                  {text("正在加载项目成员…", "Loading project members…")}
                </Text>
              </View>
            ) : (
              <>
                <ProjectConversationSection
                  title={text("小伙伴", "Bots")}
                  emptyLabel={text("暂无项目 Bot", "No project bots yet")}
                  action={text("新建 Bot", "New bot")}
                  kind="bot"
                  items={roster.bots}
                  hasPrevious={botCursors.length > 0}
                  next={roster.nextBotId}
                  actionEnabled={canCreateBot}
                  onAction={() => setCreatingBot(true)}
                  onOpen={canCreateBot ? (id) => openConversation("bot", id) : undefined}
                  onPrevious={() =>
                    setBotCursors((old) => (old.at(-1) === afterBotId ? old.slice(0, -1) : old))
                  }
                  onNext={(cursor) =>
                    setBotCursors((old) => (old.at(-1) === afterBotId ? [...old, cursor] : old))
                  }
                />
                <ProjectConversationSection
                  title={text("群聊", "Group chats")}
                  emptyLabel={text("暂无项目群聊", "No project group chats yet")}
                  action={text("新建群聊", "New group chat")}
                  kind="group"
                  items={roster.groups}
                  hasPrevious={groupCursors.length > 0}
                  next={roster.nextGroupId}
                  actionEnabled={canCreateGroup}
                  onAction={() => setCreatingGroup(true)}
                  onOpen={canCreateGroup ? (id) => openConversation("group", id) : undefined}
                  onPrevious={() =>
                    setGroupCursors((old) => (old.at(-1) === afterGroupId ? old.slice(0, -1) : old))
                  }
                  onNext={(cursor) =>
                    setGroupCursors((old) => (old.at(-1) === afterGroupId ? [...old, cursor] : old))
                  }
                />
                <Text style={{ color: tokens.mutedForeground, fontSize: 13, textAlign: "center" }}>
                  {canCreateBot || canCreateGroup
                    ? text(
                        "点击项目 Bot 或群聊进入独立文字会话。",
                        "Choose a project bot or group to open its text conversation.",
                      )
                    : text("项目会话暂未开放。", "Project conversations are not available yet.")}
                </Text>
              </>
            )}

            {canRemove ? (
              <NativeActionButton
                label={
                  removing
                    ? text("正在删除…", "Removing…")
                    : text("删除空项目", "Remove empty project")
                }
                disabled={removing}
                prominence="destructive"
                fill={false}
                onPress={confirmRemoveProject}
              />
            ) : null}
            {removeError ? (
              <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
                {removeError}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
      {creatingBot ? (
        <CreateBotModal
          onClose={() => setCreatingBot(false)}
          onCreate={createProjectBot}
          onCreated={() => {
            setCreatingBot(false);
            if (
              !focused.current ||
              scopeChanged ||
              scopeKey !== projectScopeKey() ||
              isSpaceSelectionPending()
            )
              return;
            setBotCursors([]);
            setAttempt((old) => old + 1);
          }}
        />
      ) : null}
      {creatingGroup && workspaceId ? (
        <ProjectGroupModal
          projectId={workspaceId}
          current={() =>
            focused.current &&
            !scopeChanged &&
            scopeKey === projectScopeKey() &&
            !isSpaceSelectionPending()
          }
          attempt={groupAttempt}
          onClose={() => setCreatingGroup(false)}
          onCreated={() => {
            setCreatingGroup(false);
            if (
              !focused.current ||
              scopeChanged ||
              scopeKey !== projectScopeKey() ||
              isSpaceSelectionPending()
            )
              return;
            setGroupCursors([]);
            setAttempt((old) => old + 1);
          }}
        />
      ) : null}
    </>
  );
}

function ProjectConversationSection({
  title,
  emptyLabel,
  action,
  kind,
  items,
  hasPrevious,
  next,
  onPrevious,
  onNext,
  actionEnabled = false,
  onAction,
  onOpen,
}: {
  title: string;
  emptyLabel: string;
  action: string;
  kind: "bot" | "group";
  items: ReadonlyArray<{ id: string; name: string }>;
  hasPrevious: boolean;
  next: string | null;
  onPrevious: () => void;
  onNext: (cursor: string) => void;
  actionEnabled?: boolean;
  onAction?: () => void;
  onOpen?: (id: string) => void;
}) {
  const tokens = useMobileTokens();
  const { locale } = useI18n();
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 4,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            accessibilityRole="header"
            style={{ color: tokens.foreground, fontSize: 18, fontWeight: "600" }}
          >
            {title}
          </Text>
          <Text style={{ color: tokens.mutedForeground, fontSize: 14 }}>{items.length}</Text>
        </View>
        {actionEnabled ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action}
            onPress={() => onAction?.()}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: native.fill,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <NativeSymbol ios="plus" android="add" size={15} color={tokens.primary} />
            <Text style={{ color: tokens.primary, fontSize: 14, fontWeight: "600" }}>{action}</Text>
          </Pressable>
        ) : null}
      </View>

      <GlassSurface
        shape="roundedRectangle"
        cornerRadius={16}
        style={{ borderRadius: 16, overflow: "hidden" }}
        fallbackStyle={{
          backgroundColor: tokens.card,
          borderWidth: 1,
          borderColor: tokens.border,
        }}
      >
        {items.length === 0 ? (
          <Text style={{ padding: 18, color: tokens.mutedForeground, fontSize: 14 }}>
            {emptyLabel}
          </Text>
        ) : (
          items.map((item, index) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              disabled={!onOpen}
              onPress={() => onOpen?.(item.id)}
              style={{
                minHeight: 54,
                paddingHorizontal: 16,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderBottomWidth: index < items.length - 1 ? StyleSheet.hairlineWidth : 0,
                borderBottomColor: tokens.border,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: native.fill,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <NativeSymbol
                  ios={kind === "group" ? "person.2.fill" : "person.fill"}
                  android={kind === "group" ? "people" : "person"}
                  size={16}
                  color={tokens.mutedForeground}
                />
              </View>
              <Text
                numberOfLines={1}
                style={{ flex: 1, color: tokens.foreground, fontSize: 16, fontWeight: "500" }}
              >
                {item.name}
              </Text>
            </Pressable>
          ))
        )}
      </GlassSurface>

      {hasPrevious || next ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          {hasPrevious ? (
            <NativeActionButton
              label={locale.startsWith("zh") ? "上一页" : "Previous"}
              prominence="quiet"
              onPress={onPrevious}
            />
          ) : (
            <View />
          )}
          {next ? (
            <NativeActionButton
              label={locale.startsWith("zh") ? "下一页" : "Next"}
              prominence="quiet"
              onPress={() => onNext(next)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
