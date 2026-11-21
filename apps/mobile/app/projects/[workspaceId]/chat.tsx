import { AI_DATA_DISCLOSURES, ProjectWorkspaceIdInput } from "@rakazo/contracts";
import {
  DEFAULT_BOT_AVATAR_COLOR,
  loadProjectBotIdentity,
  pendingProjectApproval,
  projectActiveRuns,
  projectMemberName,
} from "@rakazo/core";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BotAvatar } from "../../../components/bot-avatar";
import { glassHeaderOptions } from "../../../components/glass-title";
import { NativeActionButton } from "../../../components/native-action-button";
import { MessageTextCard } from "../../../components/thread/message-bubble";
import type { ThreadComposerHandle } from "../../../components/thread-composer";
import { ThreadComposer } from "../../../components/thread-composer";
import { threadHeaderRight } from "../../../components/thread-header-right";
import { rpc } from "../../../lib/api";
import { useI18n } from "../../../lib/i18n";
import { useMobileTokens } from "../../../lib/native";
import {
  projectRequestOptions,
  projectScopeKey,
  subscribeProjectScope,
} from "../../../lib/project-scope";
import { useSideInsets } from "../../../lib/side-insets";
import type { ProjectChatTarget } from "../../../lib/use-project-thread";
import { useProjectThread } from "../../../lib/use-project-thread";

const PROJECT_SYNC_INTERVAL_MS = 15_000;

export default function ProjectChatRoute() {
  const params = useLocalSearchParams<{
    workspaceId: string;
    botId?: string;
    groupId?: string;
    projectName?: string;
    scope?: string;
  }>();
  const scope = useSyncExternalStore(subscribeProjectScope, projectScopeKey);
  const [openedScope] = useState(params.scope ?? scope);
  const project = ProjectWorkspaceIdInput.safeParse({ id: params.workspaceId });
  const botId = typeof params.botId === "string" && params.botId ? params.botId : undefined;
  const groupId = typeof params.groupId === "string" && params.groupId ? params.groupId : undefined;
  const enabled = project.success && Boolean(botId) !== Boolean(groupId) && openedScope === scope;
  return (
    <ProjectChat
      key={JSON.stringify([scope, params.workspaceId, botId, groupId])}
      projectId={project.success ? project.data.id : ""}
      initialProjectName={typeof params.projectName === "string" ? params.projectName : undefined}
      target={botId ? { botId } : { groupId: groupId ?? "" }}
      scope={scope}
      enabled={enabled}
    />
  );
}

function ProjectChat({
  projectId,
  initialProjectName,
  target,
  scope,
  enabled,
}: {
  projectId: string;
  initialProjectName?: string;
  target: ProjectChatTarget;
  scope: string;
  enabled: boolean;
}) {
  const chat = useProjectThread(projectId, target, scope, enabled);
  const router = useRouter();
  const tokens = useMobileTokens();
  const sideInsets = useSideInsets();
  const insets = useSafeAreaInsets();
  const { locale, t } = useI18n();
  const text = (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
  const composerRef = useRef<ThreadComposerHandle>(null);
  const [projectName, setProjectName] = useState<string>();
  const [botIdentity, setBotIdentity] =
    useState<Awaited<ReturnType<typeof loadProjectBotIdentity>>>();
  const [canEditBot, setCanEditBot] = useState(false);
  const botId = "botId" in target ? target.botId : undefined;

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const controller = new AbortController();
      let projectReadInProgress = false;
      let identityReadInProgress = false;
      let timer: ReturnType<typeof setInterval> | undefined;
      let foreground: ReturnType<typeof AppState.addEventListener> | undefined;
      const current = () => !controller.signal.aborted && scope === projectScopeKey();
      void projectRequestOptions(scope)
        .then((options) => {
          if (!current()) return;
          const request = { ...options, signal: controller.signal };
          const refreshProject = () => {
            if (!current() || projectReadInProgress) return;
            projectReadInProgress = true;
            void rpc("projectWorkspaces/get", { id: projectId }, request)
              .then((project) => {
                if (current()) setProjectName(project.name);
              })
              .catch(() => undefined)
              .finally(() => {
                projectReadInProgress = false;
              });
          };
          const refreshIdentity = () => {
            if (!current() || !botId || identityReadInProgress) return;
            identityReadInProgress = true;
            void loadProjectBotIdentity(
              botId,
              (afterBotId) =>
                rpc("projectWorkspaces/roster", { id: projectId, afterBotId }, request),
              controller.signal,
            )
              .then((bot) => {
                if (current()) setBotIdentity(bot);
              })
              .catch(() => undefined)
              .finally(() => {
                identityReadInProgress = false;
              });
          };
          refreshProject();
          refreshIdentity();
          if (botId) {
            void rpc("projectWorkspaces/conversationCapabilities", undefined, request)
              .then((capabilities) => {
                if (current()) setCanEditBot(capabilities.botSettings === true);
              })
              .catch(() => undefined);
          }
          timer = setInterval(() => {
            if (AppState.currentState !== "background") {
              refreshProject();
              refreshIdentity();
            }
          }, PROJECT_SYNC_INTERVAL_MS);
          foreground = AppState.addEventListener("change", (state) => {
            if (state !== "background") {
              refreshProject();
              refreshIdentity();
            }
          });
        })
        .catch(() => undefined);
      return () => {
        controller.abort();
        if (timer) clearInterval(timer);
        foreground?.remove();
      };
    }, [botId, enabled, projectId, scope]),
  );

  const openBotSettings = () => {
    if (!enabled || !botId || scope !== projectScopeKey()) return;
    router.push({ pathname: "/bot-settings", params: { botId, projectId, scope } });
  };
  const missing = chat.consent?.recipients.filter((recipient) => !recipient.allowed) ?? [];
  const errorStyle = { color: tokens.destructive, fontSize: 14 };
  const mutedStyle = { color: tokens.mutedForeground, fontSize: 13 };
  const disabled = !enabled || !chat.snapshot || chat.sending || chat.consenting;
  const send = async () => {
    if (disabled || missing.length) return;
    const submitted = composerRef.current?.snapshot().promptText ?? "";
    const sent = await chat.send(submitted);
    if (sent && composerRef.current?.snapshot().promptText === submitted)
      composerRef.current.reset();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: tokens.background }}
    >
      <Stack.Screen
        options={{
          ...glassHeaderOptions(
            (enabled ? projectName || initialProjectName : undefined) ?? text("项目", "Project"),
          ),
          ...(enabled && botId && canEditBot
            ? threadHeaderRight({
                inGroup: false,
                readOnly: false,
                hasBot: true,
                t,
                color: tokens.foreground,
                onGroupSettings: openBotSettings,
                onBotActions: openBotSettings,
                menuActions: [{ text: t("Settings"), onPress: openBotSettings }],
              })
            : {}),
        }}
      />
      <ScrollView
        style={sideInsets}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 14 }}
      >
        {!enabled ? (
          <Text accessibilityRole="alert" style={errorStyle}>
            {text(
              "项目入口已失效，请返回项目列表重新选择。",
              "This project link is no longer active. Reopen it from Projects.",
            )}
          </Text>
        ) : null}
        {enabled && chat.loading ? <ActivityIndicator color={tokens.primary} /> : null}
        {chat.readError && enabled ? (
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="alert" style={errorStyle}>
              {text(
                "会话同步中断，已显示的内容可能不是最新状态。",
                "Chat sync interrupted. Displayed messages may be out of date.",
              )}
            </Text>
            <NativeActionButton
              label={text("重新连接", "Reconnect")}
              onPress={chat.retry}
              prominence="secondary"
            />
          </View>
        ) : null}
        {enabled
          ? chat.snapshot?.messages.map((message) => {
              const approval = pendingProjectApproval(chat.snapshot, message);
              const role = message.role === "user" ? "user" : "bot";
              const senderId = message.botId ?? botId;
              const member =
                chat.snapshot?.members?.find((entry) => entry.botId === senderId) ??
                (botIdentity?.botId === senderId ? botIdentity : undefined);
              const senderName =
                projectMemberName(chat.snapshot?.members, senderId) ?? member?.name ?? "Bot";
              return (
                <View
                  key={message.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    justifyContent: role === "user" ? "flex-end" : "flex-start",
                    gap: 8,
                  }}
                >
                  {role === "bot" ? (
                    <BotAvatar
                      color={member?.color ?? DEFAULT_BOT_AVATAR_COLOR}
                      avatarSet={member?.avatarSet}
                      identity={senderId}
                      activity="idle"
                      size={"groupId" in target ? 20 : 28}
                    />
                  ) : null}
                  <View
                    style={{
                      flexShrink: 1,
                      minWidth: 0,
                      maxWidth: role === "user" ? "88%" : "100%",
                      gap: 8,
                    }}
                  >
                    {approval ? (
                      <View style={{ gap: 8 }}>
                        <Text style={mutedStyle}>{senderName}</Text>
                        <Text style={{ color: tokens.foreground, fontWeight: "600" }}>
                          {approval.title}
                        </Text>
                        <Text selectable style={mutedStyle}>
                          {approval.detail}
                        </Text>
                        {approval.decisions.map((decision) => (
                          <NativeActionButton
                            key={decision}
                            label={
                              decision === "allow"
                                ? text("允许本次", "Allow once")
                                : text("拒绝", "Deny")
                            }
                            prominence={decision === "deny" ? "secondary" : "primary"}
                            disabled={chat.answeringEffectId !== null}
                            onPress={() => void chat.answerApproval(message.id, decision)}
                          />
                        ))}
                      </View>
                    ) : (
                      <MessageTextCard
                        message={{
                          ...message,
                          blocks: message.blocks.filter(
                            (block) => block.kind === "text" || block.kind === "progress",
                          ),
                        }}
                        speaker={role === "bot" ? senderName : undefined}
                        actionProps={{}}
                      />
                    )}
                    {message.blocks.flatMap((block) =>
                      block.kind === "file"
                        ? [
                            <NativeActionButton
                              key={block.artifactId}
                              label={`${text("下载", "Download")} ${block.name}`}
                              prominence="secondary"
                              busy={chat.downloadingArtifactId === block.artifactId}
                              disabled={chat.downloadingArtifactId !== null}
                              onPress={() => void chat.downloadArtifact(block.artifactId)}
                            />,
                          ]
                        : [],
                    )}
                  </View>
                </View>
              );
            })
          : null}
        {enabled && chat.snapshot?.olderCursor != null ? (
          <Text style={mutedStyle}>
            {text(
              "当前展示最近的消息，较早记录暂未加载。",
              "Recent messages are shown. Earlier history is not loaded yet.",
            )}
          </Text>
        ) : null}
        {enabled && chat.snapshot?.run ? (
          <Text style={mutedStyle}>
            {text("任务状态：", "Run status: ")}
            {chat.snapshot.run.status}
          </Text>
        ) : null}
        {enabled
          ? projectActiveRuns(chat.snapshot).map((run) => {
              const memberName = projectMemberName(chat.snapshot?.members, run.botId);
              return (
                <NativeActionButton
                  key={run.id}
                  label={
                    memberName
                      ? text(`取消 ${memberName} 的任务`, `Cancel ${memberName}'s run`)
                      : text("取消任务", "Cancel run")
                  }
                  busy={chat.cancellingRunId === run.id}
                  disabled={chat.cancellingRunId !== null}
                  prominence="secondary"
                  onPress={() => void chat.cancelRun(run.id)}
                />
              );
            })
          : null}
        {enabled && chat.cancelError ? (
          <Text accessibilityRole="alert" style={errorStyle}>
            {text(
              "取消结果未确认，请查看任务状态。",
              "Cancellation was not confirmed. Check the run status.",
            )}
          </Text>
        ) : null}
        {enabled && chat.answerError ? (
          <Text accessibilityRole="alert" style={errorStyle}>
            {text(
              "审批结果未确认，请查看任务状态。",
              "Approval was not confirmed. Check the run status.",
            )}
          </Text>
        ) : null}
        {enabled && chat.downloadError ? (
          <Text accessibilityRole="alert" style={errorStyle}>
            {text("无法下载项目文件。", "Could not download the project file.")}
          </Text>
        ) : null}
        {missing.length ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: tokens.foreground, fontWeight: "600" }}>
              {text("发送前确认 AI 数据共享", "Review AI data sharing before sending")}
            </Text>
            {missing.map((recipient) => (
              <Text key={recipient.key} selectable style={mutedStyle}>
                {recipient.name}
                {"\n"}
                {recipient.detail}
                {"\n"}
                {AI_DATA_DISCLOSURES[recipient.use]}
              </Text>
            ))}
            <NativeActionButton
              label={text("允许这些接收方", "Allow these recipients")}
              busy={chat.consenting}
              disabled={chat.sending || chat.consenting}
              onPress={() => void chat.allow()}
            />
          </View>
        ) : null}
        {chat.sendError ? (
          <Text accessibilityRole="alert" style={errorStyle}>
            {text(
              "发送未确认，草稿已保留。重试相同文字会使用原请求标识。",
              "Sending was not confirmed. Your draft is kept; retrying the same text reuses its request ID.",
            )}
          </Text>
        ) : null}
      </ScrollView>
      <View
        style={[{ padding: 16, paddingBottom: Math.max(insets.bottom, 16), gap: 10 }, sideInsets]}
      >
        <ThreadComposer
          ref={composerRef}
          textOnly
          disabled={disabled || missing.length > 0}
          agentSkills={[]}
          composerMentionTargets={[]}
          composerPrompt={text("输入项目消息…", "Message this project…")}
          replyQuote={null}
          attachmentIds={[]}
          onCall={false}
          working={false}
          sending={chat.sending}
          attachActions={[]}
          attachFrom={() => {}}
          send={send}
          stop={async () => {}}
          startVoiceCall={async () => {}}
          onSlashAction={() => {}}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
