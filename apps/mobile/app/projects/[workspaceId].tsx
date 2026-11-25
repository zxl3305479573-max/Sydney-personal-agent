import { DEFAULT_NEW_BOT_AVATAR_SET, ProjectWorkspaceIdInput, type ProjectWorkspace, type RpcOutput } from "@rakazo/contracts";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { CreateBotModal } from "../../components/create-bot-modal";
import { GlassSurface } from "../../components/glass-surface";
import { NativeActionButton } from "../../components/native-action-button";
import { NativeSymbol } from "../../components/native-symbol";
import { ProjectGroupModal, type ProjectGroupAttempt } from "../../components/project-group-modal";
import { captureApiRequestContext, isSpaceSelectionPending, rpc } from "../../lib/api";
import type { InboxBotIdentity } from "../../lib/create-inbox-bot";
import { useI18n } from "../../lib/i18n";
import { useMobileTokens } from "../../lib/native";
import { projectScopeKey, subscribeProjectScope } from "../../lib/project-scope";
import { useSideInsets } from "../../lib/side-insets";
import { errorText } from "../../lib/user-error";

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

function ProjectContents({ workspaceId, scopeKey, scopeChanged }: {
  workspaceId: string | null;
  scopeKey: string;
  scopeChanged: boolean;
}) {
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => locale.startsWith("zh") ? chinese : english;
  const tokens = useMobileTokens();
  const sideInsets = useSideInsets();
  const router = useRouter();
  const [project, setProject] = useState<ProjectWorkspace | null>(null);
  const [roster, setRoster] = useState<RpcOutput<"projectWorkspaces/roster"> | null>(null);
  const [failed, setFailed] = useState(false);
  const [removeMode, setRemoveMode] = useState<ProjectRemoveMode>(null);
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

  useFocusEffect(useCallback(() => {
    if (!workspaceId || scopeChanged || isSpaceSelectionPending()) return;
    let active = true;
    focused.current = true;
    if (!removeInFlight.current) setRemoving(false);
    const controller = new AbortController();
    const current = () => active && scopeKey === projectScopeKey() && !isSpaceSelectionPending();
    setRoster(null);
    setFailed(false);
    setRemoveMode(null);
    setCanCreateBot(false);
    setCanCreateGroup(false);
    void (async () => {
      try {
        const requestContext = await captureApiRequestContext();
        if (!current()) return;
        const options = { requestContext, signal: controller.signal, skipSpaceAuthRecovery: true };
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
          .catch(() => { if (current()) setRemoveMode(null); });
        void rpc("projectWorkspaces/conversationCapabilities", undefined, options)
          .then((capabilities) => { if (current()) setCanCreateBot(capabilities.createBot === true); })
          .catch(() => { if (current()) setCanCreateBot(false); });
        void rpc("projectWorkspaces/groupCreationCapability", undefined, options)
          .then((capabilities) => { if (current()) setCanCreateGroup(capabilities.createGroup === true); })
          .catch(() => { if (current()) setCanCreateGroup(false); });
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
      }
    })();
    return () => { active = false; focused.current = false; controller.abort(); };
  }, [workspaceId, scopeKey, scopeChanged, attempt, afterBotId, afterGroupId]));

  async function createProjectBot(identity: InboxBotIdentity) {
    const current = () => focused.current && !scopeChanged &&
      scopeKey === projectScopeKey() && !isSpaceSelectionPending();
    if (!workspaceId || !canCreateBot || !current())
      throw new Error(text("项目已改变，请返回后重新打开。", "The project changed. Return and try again."));
    const requestContext = await captureApiRequestContext();
    if (!current()) throw new Error(text("项目已改变，请返回后重新打开。", "The project changed. Return and try again."));
    await rpc("projectWorkspaces/createBot", {
      projectId: workspaceId,
      bot: { ...identity, notifyOnFinish: true, avatarSet: DEFAULT_NEW_BOT_AVATAR_SET, computerMode: "team" },
    }, { requestContext, skipSpaceAuthRecovery: true });
    return null;
  }

  async function removeProject(mode: "remove" | "removeEmpty") {
    if (!workspaceId || removeMode !== mode || removeInFlight.current || !focused.current ||
      scopeChanged || scopeKey !== projectScopeKey() || isSpaceSelectionPending()) return;
    removeInFlight.current = true;
    setRemoving(true);
    setRemoveError(null);
    const current = () => focused.current && scopeKey === projectScopeKey() && !isSpaceSelectionPending();
    try {
      const requestContext = await captureApiRequestContext();
      if (!current()) return;
      if (mode === "remove") {
        await rpc("projectWorkspaces/remove", { id: workspaceId, confirmRemoveAppData: true }, {
          requestContext, skipSpaceAuthRecovery: true,
        });
      } else {
        await rpc("projectWorkspaces/removeEmpty", { id: workspaceId, confirmRemoveAppData: true }, {
          requestContext, skipSpaceAuthRecovery: true,
        });
      }
      if (current()) router.dismissTo("/projects");
    } catch (cause) {
      if (current()) {
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
      }
    } finally {
      removeInFlight.current = false;
      if (current()) setRemoving(false);
    }
  }

  function confirmRemoveProject() {
    if (!removeMode || removing || !focused.current) return;
    const mode = removeMode;
    Alert.alert(
      mode === "remove" ? text("删除项目？", "Remove project?") : text("删除空项目？", "Remove empty project?"),
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
        { text: text("删除", "Remove"), style: "destructive", onPress: () => void removeProject(mode) },
      ],
    );
  }

  const unavailable = scopeChanged || !workspaceId;
  return (
    <>
      <Stack.Screen options={{ title: project?.name ?? text("项目", "Project") }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic"
        style={[{ flex: 1, backgroundColor: tokens.background }, sideInsets]}
        contentContainerStyle={{ padding: 20, gap: 20 }}>
        <NativeActionButton label={text("切换项目", "Switch project")} prominence="quiet"
          onPress={() => router.dismissTo("/projects")} />
        {unavailable ? (
          <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
            {text("项目入口已失效，请返回列表重新选择项目。", "This project link is no longer active. Choose a project from the list again.")}
          </Text>
        ) : failed ? (
          <View style={{ gap: 12 }}>
            <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
              {text("无法打开项目，项目可能已移除或连接不可用。", "Could not open this project. It may have been removed or the connection is unavailable.")}
            </Text>
            <NativeActionButton label={text("重试", "Retry")} onPress={() => setAttempt((old) => old + 1)} />
          </View>
        ) : !project ? (
          <Text style={{ color: tokens.foreground }}>{text("正在加载项目…", "Loading project…")}</Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <NativeSymbol ios="folder.fill" android="folder" size={32} color={tokens.primary} />
              <Text accessibilityRole="header" style={{ flex: 1, fontSize: 24, fontWeight: "600", color: tokens.foreground }}>{project.name}</Text>
            </View>
            <Text style={{ color: tokens.mutedForeground }}>{text("尚未连接项目目录", "Project folder is not connected")}</Text>
            {!roster ? <Text style={{ color: tokens.mutedForeground }}>
              {text("正在加载项目成员…", "Loading project members…")}
            </Text> : <>
            <ProjectConversationSection title={text("小伙伴", "Bots")} action={text("新建 Bot", "New bot")}
              description={canCreateBot
                ? text("实验创建功能；项目对话暂未开放。", "Experimental creation; project conversations are not available yet.")
                : text("项目会话暂未开放。", "Project conversations are not available yet.")}
              items={roster.bots} hasPrevious={botCursors.length > 0} next={roster.nextBotId}
              actionEnabled={canCreateBot} onAction={() => setCreatingBot(true)}
              onPrevious={() => setBotCursors((old) => old.at(-1) === afterBotId ? old.slice(0, -1) : old)}
              onNext={(cursor) => setBotCursors((old) => old.at(-1) === afterBotId ? [...old, cursor] : old)} />
            <ProjectConversationSection title={text("群聊", "Group chats")} action={text("新建群聊", "New group chat")}
              description={canCreateGroup
                ? text("实验创建功能；项目对话暂未开放。", "Experimental creation; project conversations are not available yet.")
                : text("项目会话暂未开放。", "Project conversations are not available yet.")}
              items={roster.groups} hasPrevious={groupCursors.length > 0} next={roster.nextGroupId}
              actionEnabled={canCreateGroup} onAction={() => setCreatingGroup(true)}
              onPrevious={() => setGroupCursors((old) => old.at(-1) === afterGroupId ? old.slice(0, -1) : old)}
              onNext={(cursor) => setGroupCursors((old) => old.at(-1) === afterGroupId ? [...old, cursor] : old)} />
            </>}
            {removeMode ? <NativeActionButton
              label={removing
                ? text("正在删除…", "Removing…")
                : removeMode === "remove"
                  ? text("删除项目", "Remove project")
                  : text("删除空项目", "Remove empty project")}
              disabled={removing} prominence="quiet" onPress={confirmRemoveProject} /> : null}
            {removeError ? <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>{removeError}</Text> : null}
          </>
        )}
      </ScrollView>
      {creatingBot ? <CreateBotModal
        onClose={() => setCreatingBot(false)}
        onCreate={createProjectBot}
        onCreated={() => {
          setCreatingBot(false);
          if (!focused.current || scopeChanged || scopeKey !== projectScopeKey() || isSpaceSelectionPending()) return;
          setBotCursors([]);
          setAttempt((old) => old + 1);
        }} /> : null}
      {creatingGroup && workspaceId ? <ProjectGroupModal
        projectId={workspaceId}
        current={() => focused.current && !scopeChanged && scopeKey === projectScopeKey() && !isSpaceSelectionPending()}
        attempt={groupAttempt}
        onClose={() => setCreatingGroup(false)}
        onCreated={() => {
          setCreatingGroup(false);
          if (!focused.current || scopeChanged || scopeKey !== projectScopeKey() || isSpaceSelectionPending()) return;
          setGroupCursors([]);
          setAttempt((old) => old + 1);
        }} /> : null}
    </>
  );
}

function ProjectConversationSection({ title, action, description, items, hasPrevious, next, onPrevious, onNext, actionEnabled = false, onAction }: {
  title: string;
  action: string;
  description: string;
  items: ReadonlyArray<{ id: string; name: string }>;
  hasPrevious: boolean;
  next: string | null;
  onPrevious: () => void;
  onNext: (cursor: string) => void;
  actionEnabled?: boolean;
  onAction?: () => void;
}) {
  const tokens = useMobileTokens();
  const { locale } = useI18n();
  return (
    <GlassSurface shape="roundedRectangle" cornerRadius={16}
      style={{ borderRadius: 16, padding: 16, gap: 12 }} fallbackStyle={{ backgroundColor: tokens.card }}>
      <Text accessibilityRole="header" style={{ color: tokens.foreground, fontSize: 20, fontWeight: "600" }}>{title}</Text>
      {items.map((item) => <Text key={item.id} style={{ color: tokens.foreground }}>{item.name}</Text>)}
      <View style={{ flexDirection: "row", gap: 12 }}>
        {hasPrevious ? <NativeActionButton label={locale.startsWith("zh") ? "上一页" : "Previous"}
          prominence="quiet" onPress={onPrevious} /> : null}
        {next ? <NativeActionButton label={locale.startsWith("zh") ? "下一页" : "Next"}
          prominence="quiet" onPress={() => onNext(next)} /> : null}
      </View>
      <Text style={{ color: tokens.mutedForeground }}>{description}</Text>
      <NativeActionButton label={action} disabled={!actionEnabled} onPress={() => onAction?.()} />
    </GlassSurface>
  );
}
