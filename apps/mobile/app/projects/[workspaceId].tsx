import type { ProjectWorkspace, RpcOutput } from "@rakazo/contracts";
import { ProjectWorkspaceIdInput } from "@rakazo/contracts";
import { isRetryableError } from "@rakazo/core";
import type { Href } from "expo-router";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BotActionsModal } from "../../components/bot-actions-modal";
import { BotAvatar } from "../../components/bot-avatar";
import { CreateBotModal } from "../../components/create-bot-modal";
import { GlassSurface } from "../../components/glass-surface";
import { glassHeaderOptions } from "../../components/glass-title";
import { GroupAvatar } from "../../components/group-avatar";
import { ConversationRow, FALLBACK_COLOR } from "../../components/inbox-rows";
import { MotionPressable } from "../../components/motion-pressable";
import { NativeActionButton } from "../../components/native-action-button";
import { NativeSymbol } from "../../components/native-symbol";
import { ProjectDirectory } from "../../components/project-directory";
import type { ProjectGroupAttempt } from "../../components/project-group-modal";
import { ProjectGroupModal } from "../../components/project-group-modal";
import { captureApiRequestContext, isSpaceSelectionPending, rpc } from "../../lib/api";
import {
  conversationStatusLabel,
  conversationStatusTone,
  isConversationActiveStatus,
} from "../../lib/conversation-status";
import type { InboxBotIdentity } from "../../lib/create-inbox-bot";
import { inboxBotInput } from "../../lib/create-inbox-bot";
import { t, useI18n } from "../../lib/i18n";
import { formatThreadTime } from "../../lib/inbox";
import { native, useMobileTokens, useResolvedAppearance } from "../../lib/native";
import { iosAtLeast } from "../../lib/native-controls";
import { clearPageState, usePageScroll, usePageState } from "../../lib/page-state";
import { ACTIVE_INBOX_POLL_INTERVAL_MS } from "../../lib/poll-cadence";
import { previewSnippet } from "../../lib/preview";
import { projectScopeKey, subscribeProjectScope } from "../../lib/project-scope";
import { useScreenBackground } from "../../lib/scoped-theme-context";
import { useSideInsets } from "../../lib/side-insets";
import { projectThreadSessionScope, threadSessionCache } from "../../lib/thread-session-cache";
import type { ProjectActionTarget } from "../../lib/use-project-chat-actions";
import { useProjectChatActions } from "../../lib/use-project-chat-actions";
import { errorText } from "../../lib/user-error";

const PROJECT_SYNC_INTERVAL_MS = 15_000;
type ProjectRemoveMode = "remove" | "removeEmpty" | null;

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
  const screenBackground = useScreenBackground(tokens.background);
  const appearance = useResolvedAppearance();
  const insets = useSafeAreaInsets();
  const sideInsets = useSideInsets();
  const router = useRouter();
  const [project, setProject] = usePageState<ProjectWorkspace | null>(
    scopeKey,
    ["project", workspaceId, "info"],
    null,
  );
  const [showArchived, setShowArchived] = usePageState(
    scopeKey,
    ["project", workspaceId, "archived"],
    false,
  );
  const [botCursors, setBotCursors] = usePageState<string[]>(
    scopeKey,
    ["project", workspaceId, "botCursors"],
    [],
  );
  const [groupCursors, setGroupCursors] = usePageState<string[]>(
    scopeKey,
    ["project", workspaceId, "groupCursors"],
    [],
  );
  const afterBotId = botCursors.at(-1);
  const afterGroupId = groupCursors.at(-1);
  const scroll = usePageScroll(scopeKey, [
    "project",
    workspaceId,
    "contents",
    showArchived,
    afterBotId,
    afterGroupId,
  ]);
  type Roster = RpcOutput<"projectWorkspaces/roster">;
  type RosterBot = Roster["bots"][number] &
    Partial<ProjectActionTarget> & {
      status?: string;
      unread?: boolean;
      preview?: string;
      updatedAt?: string;
    };
  type RosterGroup = Roster["groups"][number] &
    Partial<ProjectActionTarget> & {
      status?: string;
      unread?: boolean;
      preview?: string;
      updatedAt?: string;
    };
  const [roster, setRoster] = usePageState<
    | (Omit<Roster, "bots" | "groups"> & {
        bots: RosterBot[];
        groups: RosterGroup[];
      })
    | null
  >(scopeKey, ["project", workspaceId, "roster", showArchived, afterBotId, afterGroupId], null);
  const threadRevision = useSyncExternalStore(
    threadSessionCache.subscribe,
    threadSessionCache.getRevision,
  );
  const cacheScope = useMemo(
    () => (workspaceId ? projectThreadSessionScope(scopeKey, workspaceId) : null),
    [scopeKey, workspaceId],
  );
  const [canManage, setCanManage] = usePageState(
    scopeKey,
    ["project", workspaceId, "canManage"],
    false,
  );
  const [menuTarget, setMenuTarget] = useState<ProjectActionTarget>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [removeMode, setRemoveMode] = usePageState<ProjectRemoveMode>(
    scopeKey,
    ["project", workspaceId, "removeMode"],
    null,
  );
  const [canCreateBot, setCanCreateBot] = usePageState(
    scopeKey,
    ["project", workspaceId, "canCreateBot"],
    false,
  );
  const [canChangeBotSettings, setCanChangeBotSettings] = usePageState(
    scopeKey,
    ["project", workspaceId, "canChangeBotSettings"],
    false,
  );
  const [creatingBot, setCreatingBot] = useState(false);
  const [canCreateGroup, setCanCreateGroup] = usePageState(
    scopeKey,
    ["project", workspaceId, "canCreateGroup"],
    false,
  );
  const [creatingGroup, setCreatingGroup] = useState(false);
  const groupAttempt = useRef<ProjectGroupAttempt | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const removeInFlight = useRef(false);
  const focused = useRef(false);
  const refreshInProgress = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const liveProjectBots = useMemo<RosterBot[]>(() => {
    const items = roster?.bots ?? [];
    if (!cacheScope) return items;
    return items.map((bot) => {
      const status = threadSessionCache.botStatus(cacheScope, bot.id, bot.status ?? "idle");
      const unread = threadSessionCache.unreadState(
        cacheScope,
        { botId: bot.id },
        Boolean(bot.unread),
      );
      return status === (bot.status ?? "idle") && unread === Boolean(bot.unread)
        ? bot
        : { ...bot, status, unread };
    });
  }, [roster?.bots, cacheScope, threadRevision]);
  const liveProjectGroups = useMemo<RosterGroup[]>(() => {
    const items = roster?.groups ?? [];
    if (!cacheScope) return items;
    return items.map((group) => {
      const status = threadSessionCache.groupStatus(cacheScope, group.id, group.status ?? "idle");
      const unread = threadSessionCache.unreadState(
        cacheScope,
        { groupId: group.id },
        Boolean(group.unread),
      );
      return status === (group.status ?? "idle") && unread === Boolean(group.unread)
        ? group
        : { ...group, status, unread };
    });
  }, [roster?.groups, cacheScope, threadRevision]);
  const hasActiveProjectWork = useMemo(
    () =>
      liveProjectBots.some((bot) => isConversationActiveStatus(bot.status)) ||
      liveProjectGroups.some((group) => isConversationActiveStatus(group.status)),
    [liveProjectBots, liveProjectGroups],
  );
  const pollIntervalRef = useRef(PROJECT_SYNC_INTERVAL_MS);
  pollIntervalRef.current = hasActiveProjectWork
    ? ACTIVE_INBOX_POLL_INTERVAL_MS
    : PROJECT_SYNC_INTERVAL_MS;
  const reschedulePollRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    reschedulePollRef.current?.();
  }, [hasActiveProjectWork]);
  const actionMenu = useProjectChatActions({
    projectId: workspaceId ?? "",
    scope: scopeKey,
    target: menuTarget,
    enabled: Boolean(workspaceId) && !scopeChanged && canManage,
    onChanged: () => {
      setMenuOpen(false);
      setAttempt((old) => old + 1);
    },
  });
  const showActions = (kind: "bot" | "group", id: string) => {
    const target =
      kind === "bot"
        ? roster?.bots.find((bot) => bot.id === id)
        : roster?.groups.find((group) => group.id === id);
    if (!target || !canManage) return;
    setMenuTarget({ ...target, kind });
    setMenuOpen(true);
  };

  useFocusEffect(
    useCallback(() => {
      if (!workspaceId || scopeChanged || isSpaceSelectionPending()) return;
      let active = true;
      focused.current = true;
      if (!removeInFlight.current) setRemoving(false);
      const controller = new AbortController();
      const current = () => active && scopeKey === projectScopeKey() && !isSpaceSelectionPending();
      refreshInProgress.current = true;
      setFailed(false);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let lastCompletedAt: number | null = null;
      const schedulePoll = (delayMs: number) => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = undefined;
          if (current() && AppState.currentState !== "background" && !refreshInProgress.current)
            setAttempt((old) => old + 1);
        }, delayMs);
      };
      reschedulePollRef.current = () => {
        if (!current() || refreshInProgress.current || lastCompletedAt === null) return;
        const remaining = Math.max(0, pollIntervalRef.current - (Date.now() - lastCompletedAt));
        schedulePoll(remaining);
      };
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
              if (current()) {
                setRemoveMode(
                  capabilities.remove === true
                    ? "remove"
                    : capabilities.removeEmpty === true
                      ? "removeEmpty"
                      : null,
                );
              }
            })
            .catch(() => {
              if (current()) setRemoveMode(null);
            });
          void rpc("projectWorkspaces/groupCreationCapability", undefined, options)
            .then((capabilities) => {
              if (current()) setCanCreateGroup(capabilities.createGroup === true);
            })
            .catch(() => {
              if (current()) setCanCreateGroup(false);
            });
          const [result, capabilities] = await Promise.all([
            rpc("projectWorkspaces/get", { id: workspaceId }, options),
            rpc("projectWorkspaces/conversationCapabilities", undefined, options).catch(() => null),
          ]);
          if (!current()) return;
          const manage = capabilities?.chatManagement === true;
          setCanCreateBot(capabilities?.createBot === true);
          setCanChangeBotSettings(capabilities?.botSettings === true);
          setCanManage(manage);
          const requestThreadRevision = threadSessionCache.getRequestRevision();
          const projectRoster = manage
            ? {
                ...(await rpc(
                  "projectWorkspaces/conversations",
                  { projectId: workspaceId, archived: showArchived },
                  options,
                )),
                nextBotId: null,
                nextGroupId: null,
              }
            : await rpc(
                "projectWorkspaces/roster",
                { id: workspaceId, afterBotId, afterGroupId },
                options,
              );
          if (current()) {
            setProject(result);
            setRoster(projectRoster);
            if (cacheScope && !showArchived) {
              threadSessionCache.reconcileRoster(cacheScope, requestThreadRevision, {
                bots: projectRoster.bots as RosterBot[],
                groups: projectRoster.groups as RosterGroup[],
              });
            }
          }
        } catch (cause) {
          if (current()) {
            if (!isRetryableError(cause)) {
              clearPageState(scopeKey, ["project", workspaceId]);
              setProject(null);
              setRoster(null);
            }
            setFailed(true);
          }
        } finally {
          refreshInProgress.current = false;
          if (current()) {
            setRefreshing(false);
            lastCompletedAt = Date.now();
            schedulePoll(pollIntervalRef.current);
          }
        }
      })();
      const foreground = AppState.addEventListener("change", (state) => {
        if (state !== "background" && current() && !refreshInProgress.current)
          setAttempt((old) => old + 1);
      });
      return () => {
        active = false;
        focused.current = false;
        reschedulePollRef.current = null;
        controller.abort();
        if (timer !== undefined) clearTimeout(timer);
        foreground.remove();
      };
    }, [
      workspaceId,
      scopeKey,
      scopeChanged,
      attempt,
      afterBotId,
      afterGroupId,
      showArchived,
      cacheScope,
    ]),
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
    const bot = await rpc(
      "projectWorkspaces/createBot",
      {
        projectId: workspaceId,
        bot: inboxBotInput(identity),
      },
      { requestContext, skipSpaceAuthRecovery: true },
    );
    return current() ? conversationHref(workspaceId, "bot", bot.id) : null;
  }

  async function removeProject(mode: "remove" | "removeEmpty") {
    if (
      !workspaceId ||
      removeMode !== mode ||
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
      if (mode === "remove") {
        await rpc(
          "projectWorkspaces/remove",
          { id: workspaceId, confirmRemoveAppData: true },
          {
            requestContext,
            skipSpaceAuthRecovery: true,
          },
        );
      } else {
        await rpc(
          "projectWorkspaces/removeEmpty",
          { id: workspaceId, confirmRemoveAppData: true },
          {
            requestContext,
            skipSpaceAuthRecovery: true,
          },
        );
      }
      if (current()) router.dismissTo("/projects");
    } catch (cause) {
      if (current())
        setRemoveError(
          mode === "remove"
            ? errorText(
                cause,
                text(
                  "无法删除项目，请求结果可能尚未确认。请刷新后查看。",
                  "Could not remove the project. The result may be unknown; refresh to check.",
                ),
              )
            : text(
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
    if (!removeMode || removing || !focused.current) return;
    const mode = removeMode;
    Alert.alert(
      mode === "remove"
        ? text("删除项目？", "Remove project?")
        : text("删除空项目？", "Remove empty project?"),
      mode === "remove"
        ? text(
            "将永久删除此项目及其中在 Sydney 中的小伙伴、群聊和聊天记录，不会删除你电脑中的本地文件。",
            "This removes the project along with its bots, group chats, and chat history in Sydney. Local files on your computer are not deleted.",
          )
        : text(
            "只删除空项目记录，不删除电脑中的文件。",
            "Only an empty project record is removed; files on your computer are not deleted.",
          ),
      [
        { text: text("取消", "Cancel"), style: "cancel" },
        {
          text: text("删除", "Remove"),
          style: "destructive",
          onPress: () => void removeProject(mode),
        },
      ],
    );
  }

  const unavailable = scopeChanged || !workspaceId;
  const switchLabel = text("切换项目", "Switch project");
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
  const conversationHref = (id: string, kind: "bot" | "group", conversationId: string): Href => ({
    pathname: "/projects/[workspaceId]/chat",
    params: {
      workspaceId: id,
      scope: scopeKey,
      ...(project?.name ? { projectName: project.name } : {}),
      ...(kind === "bot" ? { botId: conversationId } : { groupId: conversationId }),
    },
  });
  const openConversation = (kind: "bot" | "group", id: string) => {
    if (
      !workspaceId ||
      scopeChanged ||
      !focused.current ||
      scopeKey !== projectScopeKey() ||
      isSpaceSelectionPending()
    )
      return;
    router.push(conversationHref(workspaceId, kind, id));
  };
  const openBotSettings = (botId: string) => {
    if (!workspaceId || scopeChanged || scopeKey !== projectScopeKey() || isSpaceSelectionPending())
      return;
    router.push({
      pathname: "/bot-settings",
      params: { botId, projectId: workspaceId, scope: scopeKey },
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
                    hidesSharedBackground: true,
                    label: switchLabel,
                    accessibilityLabel: switchLabel,
                    icon: { type: "sfSymbol" as const, name: "folder" },
                    onPress: () => router.dismissTo("/projects"),
                  },
                ],
              }
            : {
                headerRight: () => (
                  <MotionPressable
                    preset="control"
                    accessibilityRole="button"
                    accessibilityLabel={switchLabel}
                    onPress={() => router.dismissTo("/projects")}
                    hitSlop={8}
                    style={{
                      backgroundColor: cardBg,
                      borderRadius: 999,
                      borderWidth: hairline,
                      borderColor: cardBorder,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: fg, fontSize: 13.5, fontWeight: "600" }}>
                      {switchLabel}
                    </Text>
                  </MotionPressable>
                ),
              }),
        }}
      />
      <ScrollView
        {...scroll}
        contentInsetAdjustmentBehavior="automatic"
        style={[{ flex: 1, backgroundColor: screenBackground }, sideInsets]}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: Math.max(insets.bottom, 28),
          gap: 16,
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
            colors={[mutedFg]}
            progressBackgroundColor={tokens?.muted ?? chipBg}
          />
        }
      >
        {failed && project ? (
          <Text accessibilityRole="alert" style={{ color: destructive }}>
            {text(
              "项目刷新失败，当前显示上次内容，可下拉重试。",
              "Could not refresh. Showing the last content; pull to retry.",
            )}
          </Text>
        ) : null}
        {unavailable ? (
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
        ) : failed && !project ? (
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
            <ActivityIndicator color={mutedFg} />
            <Text style={{ color: mutedFg }}>{text("正在加载项目…", "Loading project…")}</Text>
          </View>
        ) : (
          <>
            <GlassSurface
              shape="roundedRectangle"
              cornerRadius={22}
              style={{
                borderRadius: 22,
                padding: 20,
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
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
                  width: 48,
                  height: 48,
                  borderRadius: 15,
                  backgroundColor: chipBg,
                  borderWidth: hairline,
                  borderColor: chipBorder,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <NativeSymbol ios="folder.fill" android="folder" size={23} color={accentTaupe} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                <Text
                  accessibilityRole="header"
                  numberOfLines={1}
                  style={{ fontSize: 20, fontWeight: "700", color: fg }}
                >
                  {project.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: accentTaupe,
                    }}
                  />
                  <Text style={{ color: mutedFg, fontSize: 13 }}>
                    {text("独立项目工作区", "Independent project workspace")}
                  </Text>
                </View>
              </View>
            </GlassSurface>

            <ProjectDirectory
              key={JSON.stringify([scopeKey, project.id])}
              projectId={project.id}
              scopeKey={scopeKey}
              enabled={!scopeChanged}
            />

            {canManage ? (
              <NativeActionButton
                label={text(
                  showArchived ? "返回聊天列表" : "已归档的聊天",
                  showArchived ? "Back to chats" : "Archived chats",
                )}
                prominence="secondary"
                fill={false}
                onPress={() => {
                  setMenuOpen(false);
                  setMenuTarget(undefined);
                  setBotCursors([]);
                  setGroupCursors([]);
                  setShowArchived((old) => !old);
                }}
              />
            ) : null}
            {!roster ? (
              <View style={{ paddingVertical: 20, alignItems: "center", gap: 8 }}>
                <ActivityIndicator color={mutedFg} />
                <Text style={{ color: mutedFg }}>
                  {text("正在加载项目成员…", "Loading project members…")}
                </Text>
              </View>
            ) : (
              <>
                <ProjectConversationSection
                  title={text("小伙伴", "Bots")}
                  emptyLabel={
                    showArchived
                      ? text("暂无已归档的 Bot", "No archived bots")
                      : text("暂无项目 Bot", "No project bots yet")
                  }
                  action={text("新建 Bot", "New bot")}
                  kind="bot"
                  items={liveProjectBots}
                  onSettings={
                    canManage
                      ? (id) => showActions("bot", id)
                      : canChangeBotSettings
                        ? openBotSettings
                        : undefined
                  }
                  hasPrevious={botCursors.length > 0}
                  next={roster.nextBotId}
                  actionEnabled={canCreateBot && !showArchived}
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
                  emptyLabel={
                    showArchived
                      ? text("暂无已归档的群聊", "No archived group chats")
                      : text("暂无项目群聊", "No project group chats yet")
                  }
                  action={text("新建群聊", "New group chat")}
                  kind="group"
                  items={liveProjectGroups}
                  hasPrevious={groupCursors.length > 0}
                  next={roster.nextGroupId}
                  actionEnabled={canCreateGroup && !showArchived}
                  onSettings={canManage ? (id) => showActions("group", id) : undefined}
                  onAction={() => setCreatingGroup(true)}
                  onOpen={canCreateGroup ? (id) => openConversation("group", id) : undefined}
                  onPrevious={() =>
                    setGroupCursors((old) => (old.at(-1) === afterGroupId ? old.slice(0, -1) : old))
                  }
                  onNext={(cursor) =>
                    setGroupCursors((old) => (old.at(-1) === afterGroupId ? [...old, cursor] : old))
                  }
                />
                <Text style={{ color: mutedFg, fontSize: 13, textAlign: "center" }}>
                  {canCreateBot || canCreateGroup
                    ? text(
                        "点击项目 Bot 或群聊进入独立文字会话。",
                        "Choose a project bot or group to open its text conversation.",
                      )
                    : text("项目会话暂未开放。", "Project conversations are not available yet.")}
                </Text>
              </>
            )}

            {removeMode ? (
              <NativeActionButton
                label={
                  removing
                    ? text("正在删除…", "Removing…")
                    : removeMode === "remove"
                      ? text("删除项目", "Remove project")
                      : text("删除空项目", "Remove empty project")
                }
                disabled={removing}
                prominence="destructive"
                fill={false}
                onPress={confirmRemoveProject}
              />
            ) : null}
            {removeError ? (
              <Text accessibilityRole="alert" style={{ color: destructive }}>
                {removeError}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
      {menuOpen ? (
        <BotActionsModal actions={actionMenu.actions} onClose={() => setMenuOpen(false)} />
      ) : null}
      {creatingBot ? (
        <CreateBotModal
          onClose={() => setCreatingBot(false)}
          onCreate={createProjectBot}
          onCreated={(destination) => {
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
            if (destination) router.push(destination);
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
          onCreated={(groupId) => {
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
            router.push(conversationHref(workspaceId, "group", groupId));
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
  onSettings,
}: {
  title: string;
  emptyLabel: string;
  action: string;
  kind: "bot" | "group";
  items: ReadonlyArray<{
    id: string;
    name: string;
    color?: RpcOutput<"projectWorkspaces/roster">["bots"][number]["color"];
    avatarSet?: RpcOutput<"projectWorkspaces/roster">["bots"][number]["avatarSet"];
    members?: RpcOutput<"projectWorkspaces/roster">["groups"][number]["members"];
    status?: string;
    unread?: boolean;
    preview?: string;
    updatedAt?: string;
  }>;
  hasPrevious: boolean;
  next: string | null;
  onPrevious: () => void;
  onNext: (cursor: string) => void;
  actionEnabled?: boolean;
  onAction?: () => void;
  onOpen?: (id: string) => void;
  onSettings?: (id: string) => void;
}) {
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const i18n = useI18n();
  const { locale } = i18n;
  const translate = i18n.t ?? t;
  const isLight = appearance === "light";
  const hairline = StyleSheet.hairlineWidth ?? 0.5;
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder = isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const fg = tokens?.foreground ?? (isLight ? "#26231F" : "#F5F4F0");
  const mutedFg = tokens?.mutedForeground ?? (isLight ? "#6E675E" : "#B8B3AA");

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
          <Text accessibilityRole="header" style={{ color: fg, fontSize: 18, fontWeight: "600" }}>
            {title}
          </Text>
          <View
            style={{
              backgroundColor: chipBg,
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderWidth: hairline,
              borderColor: chipBorder,
            }}
          >
            <Text
              style={{
                color: mutedFg,
                fontSize: 12.5,
                fontWeight: "600",
                fontVariant: ["tabular-nums"],
              }}
            >
              {items.length}
            </Text>
          </View>
        </View>
        {actionEnabled ? (
          <MotionPressable
            preset="control"
            accessibilityRole="button"
            accessibilityLabel={action}
            onPress={() => onAction?.()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 13,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: chipBg,
              borderWidth: hairline,
              borderColor: chipBorder,
            }}
          >
            <NativeSymbol ios="plus" android="add" size={14} color={fg} />
            <Text style={{ color: fg, fontSize: 13, fontWeight: "600" }}>{action}</Text>
          </MotionPressable>
        ) : null}
      </View>

      <GlassSurface
        shape="roundedRectangle"
        cornerRadius={20}
        style={{ borderRadius: 20, overflow: "hidden" }}
        fallbackStyle={{
          backgroundColor: cardBg,
          borderRadius: 20,
          borderWidth: hairline,
          borderColor: cardBorder,
        }}
      >
        {items.length === 0 ? (
          <Text style={{ padding: 20, color: mutedFg, fontSize: 14 }}>{emptyLabel}</Text>
        ) : (
          items.map((item, index) => {
            const statusLabel = conversationStatusLabel(item.status, translate);
            const statusTone = statusLabel ? conversationStatusTone(item.status) : undefined;
            const preview =
              statusLabel || (item.preview ? previewSnippet(item.preview, 40) : "") || "";
            const time = item.updatedAt ? formatThreadTime(item.updatedAt) : "";
            const accessibilityLabel = [
              item.name,
              item.unread ? translate("unread") : null,
              time,
              preview,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <View
                key={item.id}
                style={{
                  paddingHorizontal: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  borderBottomWidth: index < items.length - 1 ? hairline : 0,
                  borderBottomColor: cardBorder,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <ConversationRow
                    wrapTitle
                    roster
                    title={item.name}
                    preview={preview}
                    previewTone={statusTone}
                    time={time}
                    unread={item.unread}
                    accessibilityLabel={accessibilityLabel}
                    onPress={onOpen ? () => onOpen(item.id) : undefined}
                    onLongPress={onSettings ? () => onSettings(item.id) : undefined}
                    avatar={
                      kind === "group" ? (
                        <GroupAvatar
                          members={item.members ?? []}
                          size={44}
                          status={item.status}
                          unread={item.unread}
                        />
                      ) : (
                        <BotAvatar
                          color={item.color || FALLBACK_COLOR}
                          avatarSet={item.avatarSet}
                          identity={item.id}
                          size={44}
                          status={item.status}
                          unread={item.unread}
                          motion="lazy"
                        />
                      )
                    }
                  />
                </View>
                {onSettings ? (
                  <MotionPressable
                    preset="icon"
                    highlightColor={chipBg}
                    accessibilityRole="button"
                    accessibilityLabel={
                      locale.startsWith("zh")
                        ? `聊天操作 ${item.name}`
                        : `Chat actions for ${item.name}`
                    }
                    onPress={() => onSettings(item.id)}
                    style={{
                      width: 40,
                      minHeight: 40,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <NativeSymbol
                      ios="ellipsis"
                      android="ellipsis-horizontal"
                      size={18}
                      color={mutedFg}
                    />
                  </MotionPressable>
                ) : null}
              </View>
            );
          })
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
