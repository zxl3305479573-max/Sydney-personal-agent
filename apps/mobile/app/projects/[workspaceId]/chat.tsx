import { AI_DATA_DISCLOSURES, ProjectWorkspaceIdInput } from "@rakazo/contracts";
import {
  DEFAULT_BOT_AVATAR_COLOR,
  liveMessageComposing,
  pendingProjectApproval,
  projectActiveRuns,
  projectMemberName,
} from "@rakazo/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  AppState,
  I18nManager,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { BotActionsModal } from "../../../components/bot-actions-modal";
import { BotAvatar } from "../../../components/bot-avatar";
import { ChatTitleContent } from "../../../components/chat-title-content";
import { glassHeaderOptions } from "../../../components/glass-title";
import { NativeActionButton } from "../../../components/native-action-button";
import { MessageTextCard } from "../../../components/thread/message-bubble";
import { ThreadComposerDock } from "../../../components/thread/thread-composer-dock";
import type { ThreadComposerHandle } from "../../../components/thread-composer";
import { ThreadComposer } from "../../../components/thread-composer";
import { threadHeaderRight } from "../../../components/thread-header-right";
import {
  conversationStatusColor,
  conversationStatusLabel,
  isConversationActiveStatus,
} from "../../../lib/conversation-status";
import { useI18n } from "../../../lib/i18n";
import { useMobileTokens } from "../../../lib/native";
import { projectScopeKey, subscribeProjectScope } from "../../../lib/project-scope";
import { useScopedTheme } from "../../../lib/scoped-theme-context";
import { useSideInsets } from "../../../lib/side-insets";
import {
  threadColumnPadding,
  threadEdgeOptions,
  threadHeaderClearance,
  threadHeaderFloats,
} from "../../../lib/thread-edges";
import { threadKeyboardAvoidance } from "../../../lib/thread-keyboard-offset";
import { threadSnapshotStatus } from "../../../lib/thread-session-cache";
import { useProjectChatActions } from "../../../lib/use-project-chat-actions";
import { useProjectChatDetails } from "../../../lib/use-project-chat-details";
import { useProjectReplyVoice } from "../../../lib/use-project-reply-voice";
import type { ProjectChatTarget } from "../../../lib/use-project-thread";
import { useProjectThread } from "../../../lib/use-project-thread";

function isLightSurface(background?: string): boolean {
  if (!background || !background.startsWith("#") || background.length < 7) return true;
  return Number.parseInt(background.slice(1, 3), 16) >= 128;
}

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
  const scopedTheme = useScopedTheme();
  const sideInsets = useSideInsets();
  const nativeHeaderHeight = useHeaderHeight();
  const floatingHeader = threadHeaderFloats();
  const headerClearance = threadHeaderClearance(floatingHeader ? nativeHeaderHeight : 0);
  const { locale, t } = useI18n();
  const text = (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
  const composerRef = useRef<ThreadComposerHandle>(null);
  const botId = "botId" in target ? target.botId : undefined;
  const groupId = "groupId" in target ? target.groupId : undefined;
  const details = useProjectChatDetails(projectId, botId, groupId, scope, enabled);
  useProjectReplyVoice(details.bot, chat.snapshot, scope, enabled && Boolean(botId));
  const { projectName, botIdentity, groupIdentity, canEditBot } = details;
  const [dockHeight, setDockHeight] = useState(170);
  const [actionsOpen, setActionsOpen] = useState(false);
  const columnPadding = threadColumnPadding(
    { left: sideInsets.paddingLeft, right: sideInsets.paddingRight },
    I18nManager.isRTL,
  );
  const displayName = botIdentity?.name ?? groupIdentity?.name ?? (botId ? t("Bot") : t("Group"));
  const identity = botIdentity ?? groupIdentity;
  const archived = Boolean(identity?.archivedAt);
  const activeRuns = projectActiveRuns(chat.snapshot);
  const rawConversationStatus = chat.snapshot ? threadSnapshotStatus(chat.snapshot) : undefined;
  const headerStatus =
    chat.sending && !isConversationActiveStatus(rawConversationStatus)
      ? "queued"
      : rawConversationStatus;
  const composing = (chat.snapshot?.messages ?? []).some(
    (message) => message.id.startsWith("progress:") && liveMessageComposing(message.blocks),
  );
  const runStatusLabel = chat.snapshot?.run
    ? conversationStatusLabel(chat.snapshot.run.status, t, { includeTerminal: true }) ||
      chat.snapshot.run.status
    : "";
  const runStatusColor = chat.snapshot?.run
    ? conversationStatusColor(chat.snapshot.run.status, tokens ?? {})
    : undefined;

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") chat.markRead?.();
    });
    return () => subscription.remove();
  }, [enabled, chat.markRead]);
  const actionMenu = useProjectChatActions({
    projectId,
    scope,
    enabled: enabled && details.canManage,
    target: {
      kind: botId ? "bot" : "group",
      id: botId ?? groupId!,
      name: displayName,
      pinned: identity?.pinned,
      notifyOnFinish: botIdentity?.notifyOnFinish,
      archivedAt: identity?.archivedAt,
    },
    onChanged: (action) => {
      if (action === "archive" || action === "remove")
        router.dismissTo({
          pathname: "/projects/[workspaceId]",
          params: { workspaceId: projectId, scope },
        });
      else {
        void details.refresh();
        if (action === "clear" || action === "restore") chat.retry();
      }
    },
  });

  const openBotSettings = () => {
    if (!enabled || !botId || scope !== projectScopeKey()) return;
    router.push({ pathname: "/bot-settings", params: { botId, projectId, scope } });
  };
  const missing = chat.consent?.recipients.filter((recipient) => !recipient.allowed) ?? [];
  const isLight = isLightSurface(tokens?.background);
  const canvasBg = tokens?.background ?? (isLight ? "#F3F1EC" : "#15171C");
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder = isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const fg = tokens?.foreground ?? (isLight ? "#26231F" : "#F5F4F0");
  const mutedFg = tokens?.mutedForeground ?? (isLight ? "#6E675E" : "#B8B3AA");
  const destructive = tokens?.destructive ?? (isLight ? "#C4272D" : "#FF8F8C");
  const porcelainCardStyle = {
    backgroundColor: cardBg,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: cardBorder,
    padding: 16,
    shadowColor: "#26231F",
    shadowOpacity: isLight ? 0.028 : 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  } as const;
  const errorStyle = { color: destructive, fontSize: 14 };
  const mutedStyle = { color: mutedFg, fontSize: 13 };
  const disabled = !enabled || archived || !chat.snapshot || chat.sending || chat.consenting;
  const send = async () => {
    if (disabled || missing.length) return;
    const submitted = composerRef.current?.snapshot().promptText ?? "";
    const sent = await chat.send(submitted);
    if (sent && composerRef.current?.snapshot().promptText === submitted)
      composerRef.current.reset();
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      {...threadKeyboardAvoidance({ os: Platform.OS, floatingHeader, nativeHeaderHeight })}
      style={{
        flex: 1,
        backgroundColor: scopedTheme?.background ? "transparent" : canvasBg,
      }}
    >
      <View style={{ flex: 1 }}>
        <Stack.Screen
          options={{
            ...glassHeaderOptions(enabled ? displayName : text("项目", "Project")),
            ...threadEdgeOptions(),
            headerTitleAlign: "center",
            headerBackTitle: projectName || initialProjectName,
            headerTitle: () => (
              <ChatTitleContent
                name={enabled ? displayName : text("项目", "Project")}
                bot={
                  enabled && botIdentity?.color
                    ? { ...botIdentity, color: botIdentity.color }
                    : undefined
                }
                members={
                  groupId ? (groupIdentity?.members ?? chat.snapshot?.members ?? []) : undefined
                }
                status={enabled ? headerStatus : undefined}
                composing={enabled && composing}
                accessibilityLabel={canEditBot ? t("Settings") : displayName}
                onPress={
                  enabled && botId && canEditBot
                    ? details.canManage
                      ? actionMenu.openProfile
                      : openBotSettings
                    : undefined
                }
              />
            ),
            ...(enabled && (details.canManage || (botId && canEditBot))
              ? threadHeaderRight({
                  inGroup: false,
                  readOnly: false,
                  hasBot: true,
                  t,
                  color: fg,
                  onGroupSettings: openBotSettings,
                  onBotActions: () =>
                    details.canManage ? setActionsOpen(true) : openBotSettings(),
                  menuActions: details.canManage
                    ? actionMenu.actions
                    : [{ text: t("Settings"), onPress: openBotSettings }],
                })
              : {}),
          }}
        />
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            ...columnPadding,
            paddingTop: headerClearance.padding,
            paddingBottom: dockHeight + 16,
            gap: 14,
          }}
        >
          {archived ? (
            <NativeActionButton
              label={t("Restore")}
              onPress={() =>
                actionMenu.actions.find((action) => action.text === t("Restore"))?.onPress()
              }
            />
          ) : null}
          {!enabled ? (
            <View style={{ ...porcelainCardStyle, gap: 8 }}>
              <Text accessibilityRole="alert" style={errorStyle}>
                {text(
                  "项目入口已失效，请返回项目列表重新选择。",
                  "This project link is no longer active. Reopen it from Projects.",
                )}
              </Text>
            </View>
          ) : null}
          {enabled && chat.loading ? <ActivityIndicator color={mutedFg} /> : null}
          {enabled && details.identityError ? (
            <Text accessibilityRole="alert" style={errorStyle}>
              {text(
                "头像与名称同步中断，正在重新连接。",
                "Avatar and name sync interrupted. Reconnecting.",
              )}
            </Text>
          ) : null}
          {chat.readError && enabled ? (
            <View style={{ ...porcelainCardStyle, gap: 10 }}>
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
                  groupIdentity?.members?.find((entry) => entry.botId === senderId) ??
                  chat.snapshot?.members?.find((entry) => entry.botId === senderId) ??
                  (botIdentity?.botId === senderId ? botIdentity : undefined);
                const senderName =
                  projectMemberName(chat.snapshot?.members, senderId) ?? member?.name ?? "Bot";
                return (
                  <View
                    key={message.id}
                    style={{
                      flexDirection: "column",
                      alignItems: role === "user" ? "flex-end" : "flex-start",
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
                        <View style={{ ...porcelainCardStyle, gap: 10 }}>
                          <Text style={mutedStyle}>{senderName}</Text>
                          <Text style={{ color: fg, fontWeight: "600", fontSize: 15 }}>
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
                          speaker={role === "bot" && groupId ? senderName : undefined}
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
          {enabled && chat.snapshot?.run && runStatusLabel ? (
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: chipBg,
                borderRadius: 999,
                borderWidth: 0.5,
                borderColor: chipBorder,
                paddingHorizontal: 12,
                paddingVertical: 5,
              }}
            >
              <Text
                style={[
                  mutedStyle,
                  runStatusColor ? { color: runStatusColor, fontWeight: "500" } : null,
                ]}
              >
                {text("任务状态：", "Run status: ")}
                {runStatusLabel}
              </Text>
            </View>
          ) : null}
          {enabled
            ? activeRuns.map((run) => {
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
            <View style={{ ...porcelainCardStyle, gap: 12 }}>
              <Text style={{ color: fg, fontWeight: "600", fontSize: 16 }}>
                {text("发送前确认 AI 数据共享", "Review AI data sharing before sending")}
              </Text>
              {missing.map((recipient) => (
                <View
                  key={recipient.key}
                  style={{
                    backgroundColor: chipBg,
                    borderRadius: 14,
                    padding: 12,
                    borderWidth: 0.5,
                    borderColor: chipBorder,
                  }}
                >
                  <Text selectable style={mutedStyle}>
                    {recipient.name}
                    {"\n"}
                    {recipient.detail}
                    {"\n"}
                    {AI_DATA_DISCLOSURES[recipient.use]}
                  </Text>
                </View>
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
        <ThreadComposerDock
          hidden={false}
          columnPadding={columnPadding}
          notice={
            details.modelError ? (
              <Text accessibilityRole="alert" style={errorStyle}>
                {details.modelError}
              </Text>
            ) : null
          }
          onHeight={setDockHeight}
          replyTarget={null}
          replyAuthor=""
          replyQuote={null}
          onDismissReply={() => {}}
          attachmentNotice={null}
          attachments={[]}
          onRemoveAttachment={() => {}}
        >
          <ThreadComposer
            ref={composerRef}
            textOnly
            disabled={disabled || missing.length > 0}
            agentSkills={[]}
            composerMentionTargets={[]}
            composerPrompt={t("Message {name}", { name: displayName })}
            replyQuote={null}
            attachmentIds={[]}
            onCall={false}
            working={activeRuns.length > 0}
            sending={chat.sending}
            actionLabel={text("更多操作", "More actions")}
            attachActions={canEditBot && botId ? [{ id: "settings", title: t("Settings") }] : []}
            attachFrom={openBotSettings}
            modelLabel={details.modelLabel}
            modelActions={details.modelActions}
            onModelSelect={(key) => void details.selectModel(key)}
            send={send}
            stop={async () => {
              const run = activeRuns[0];
              if (run) await chat.cancelRun(run.id);
            }}
            startVoiceCall={async () => {}}
            onSlashAction={() => {}}
          />
        </ThreadComposerDock>
        {actionsOpen ? (
          <BotActionsModal actions={actionMenu.actions} onClose={() => setActionsOpen(false)} />
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}
