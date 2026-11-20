import { AI_DATA_DISCLOSURES, ProjectWorkspaceIdInput } from "@rakazo/contracts";
import { pendingProjectApproval, projectActiveRuns } from "@rakazo/core";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "../../../components/glass-surface";
import { glassHeaderOptions } from "../../../components/glass-title";
import { NativeActionButton } from "../../../components/native-action-button";
import { selectableMobileMessageText } from "../../../lib/api";
import { mobileBubbleSurfaceStyle, useMobileChatAppearance } from "../../../lib/chat-appearance";
import { useI18n } from "../../../lib/i18n";
import { useMobileTokens } from "../../../lib/native";
import { projectScopeKey, subscribeProjectScope } from "../../../lib/project-scope";
import { useSideInsets } from "../../../lib/side-insets";
import type { ProjectChatTarget } from "../../../lib/use-project-thread";
import { useProjectThread } from "../../../lib/use-project-thread";

export default function ProjectChatRoute() {
  const params = useLocalSearchParams<{
    workspaceId: string;
    botId?: string;
    groupId?: string;
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
      target={botId ? { botId } : { groupId: groupId ?? "" }}
      scope={scope}
      enabled={enabled}
    />
  );
}

function ProjectChat({
  projectId,
  target,
  scope,
  enabled,
}: {
  projectId: string;
  target: ProjectChatTarget;
  scope: string;
  enabled: boolean;
}) {
  const chat = useProjectThread(projectId, target, scope, enabled);
  const tokens = useMobileTokens();
  const chatAppearance = useMobileChatAppearance();
  const sideInsets = useSideInsets();
  const insets = useSafeAreaInsets();
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
  const [draft, setDraft] = useState("");
  const missing = chat.consent?.recipients.filter((recipient) => !recipient.allowed) ?? [];
  const errorStyle = { color: tokens.destructive, fontSize: 14 };
  const mutedStyle = { color: tokens.mutedForeground, fontSize: 13 };
  const disabled = !enabled || !chat.snapshot || chat.sending || chat.consenting;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: tokens.background }}
    >
      <Stack.Screen
        options={glassHeaderOptions(chat.snapshot?.groupName ?? text("项目会话", "Project chat"))}
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
            const bubble = mobileBubbleSurfaceStyle(chatAppearance, role, {
              backgroundColor: role === "user" ? tokens.chatUser : tokens.muted,
            });
            const foreground =
              (role === "user"
                ? chatAppearance.bubble?.userForeground
                : chatAppearance.bubble?.botForeground) ?? tokens.foreground;
            return (
              <GlassSurface
                key={message.id}
                shape="roundedRectangle"
                cornerRadius={bubble.borderRadius}
                tint={bubble.backgroundColor}
                style={{ padding: 14, gap: 6 }}
                fallbackStyle={bubble}
              >
                <Text style={mutedStyle}>
                  {message.role === "user"
                    ? text("我", "You")
                    : message.botId
                      ? (chat.snapshot?.members?.find((member) => member.botId === message.botId)
                          ?.name ?? "Bot")
                      : "Bot"}
                </Text>
                {approval ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: tokens.foreground, fontWeight: "600" }}>{approval.title}</Text>
                    <Text selectable style={mutedStyle}>{approval.detail}</Text>
                    {approval.decisions.map((decision) => (
                      <NativeActionButton
                        key={decision}
                        label={decision === "allow" ? text("允许本次", "Allow once") : text("拒绝", "Deny")}
                        prominence={decision === "deny" ? "secondary" : "primary"}
                        disabled={chat.answeringEffectId !== null}
                        onPress={() => void chat.answerApproval(message.id, decision)}
                      />
                    ))}
                  </View>
                ) : (
                  <Text selectable style={{ color: foreground, fontSize: 16, lineHeight: 23 }}>
                  {selectableMobileMessageText(message) ||
                    text("（非文字消息）", "(Non-text message)")}
                  </Text>
                )}
                {message.blocks.flatMap((block) => block.kind === "file" ? [
                  <NativeActionButton
                    key={block.artifactId}
                    label={`${text("下载", "Download")} ${block.name}`}
                    prominence="secondary"
                    busy={chat.downloadingArtifactId === block.artifactId}
                    disabled={chat.downloadingArtifactId !== null}
                    onPress={() => void chat.downloadArtifact(block.artifactId)}
                  />,
                ] : [])}
              </GlassSurface>
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
              const member = chat.snapshot?.members?.find((entry) => entry.botId === run.botId);
              return (
                <NativeActionButton
                  key={run.id}
                  label={
                    member
                      ? text(`取消 ${member.name} 的任务`, `Cancel ${member.name}'s run`)
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
            {text("审批结果未确认，请查看任务状态。", "Approval was not confirmed. Check the run status.")}
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
        <TextInput
          accessibilityLabel={text("项目消息", "Project message")}
          multiline
          value={draft}
          onChangeText={setDraft}
          editable={!disabled}
          placeholder={text("输入项目消息…", "Message this project…")}
          placeholderTextColor={tokens.mutedForeground}
          style={{
            color: tokens.foreground,
            borderColor: tokens.border,
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            minHeight: 48,
            maxHeight: 150,
          }}
        />
        <NativeActionButton
          label={text("发送", "Send")}
          busy={chat.sending}
          disabled={disabled || !draft.trim() || missing.length > 0}
          onPress={() => {
            const submitted = draft;
            void chat.send(submitted).then((sent) => {
              if (sent) setDraft((current) => (current === submitted ? "" : current));
            });
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
