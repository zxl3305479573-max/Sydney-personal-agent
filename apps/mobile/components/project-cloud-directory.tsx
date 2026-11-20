import type { ProjectCloudDirectoryStatus, ProjectDirectoryIntent } from "@rakazo/contracts";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { captureApiRequestContext, isSpaceSelectionPending, rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { projectScopeKey } from "../lib/project-scope";
import { NativeActionButton } from "./native-action-button";

export function ProjectCloudDirectory({
  projectId, scopeKey, enabled, windowsBound,
}: {
  projectId: string;
  scopeKey: string;
  enabled: boolean;
  windowsBound: boolean;
}) {
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => locale.startsWith("zh") ? chinese : english;
  const tokens = useMobileTokens();
  const [status, setStatus] = useState<ProjectCloudDirectoryStatus | null>(null);
  const [computerId, setComputerId] = useState("");
  const [path, setPath] = useState("");
  const [intent, setIntent] = useState<ProjectDirectoryIntent>("read-only");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const lifecycle = useRef<AbortController | null>(null);
  const operation = useRef<AbortController | null>(null);
  const load = useCallback(async (controller: AbortController) => {
    const active = () => !controller.signal.aborted && projectScopeKey() === scopeKey && !isSpaceSelectionPending();
    try {
      const requestContext = await captureApiRequestContext();
      if (!active()) return;
      const result = await rpc("projectWorkspaces/cloudDirectory", { id: projectId }, {
        requestContext, signal: controller.signal, skipSpaceAuthRecovery: true,
      });
      if (active()) setStatus(result);
    } catch {
      if (active()) setStatus(null);
    }
  }, [projectId, scopeKey]);

  useFocusEffect(useCallback(() => {
    if (!enabled || projectScopeKey() !== scopeKey || isSpaceSelectionPending()) return;
    const controller = new AbortController();
    lifecycle.current = controller;
    setBusy(false);
    setFailed(false);
    void load(controller);
    const timer = setInterval(() => {
      if (!operation.current) void load(controller);
    }, 15_000);
    return () => {
      controller.abort();
      operation.current?.abort();
      operation.current = null;
      if (lifecycle.current === controller) lifecycle.current = null;
      clearInterval(timer);
    };
  }, [enabled, load, scopeKey]));
  if (!enabled || !status?.available) return null;
  const binding = status.binding;
  const selected = status.computers.find(({ id }) => id === (binding?.computerId ?? computerId));
  const readOnly = text("只读", "Read only");
  const readWrite = text("读取并新建 Markdown", "Read and create Markdown");
  const caption = { color: tokens.mutedForeground, fontSize: 13 };
  async function change() {
    const focused = lifecycle.current;
    if (!focused || operation.current || projectScopeKey() !== scopeKey || isSpaceSelectionPending()) return;
    const controller = new AbortController();
    operation.current = controller;
    const active = () => lifecycle.current === focused && projectScopeKey() === scopeKey &&
      !controller.signal.aborted && !isSpaceSelectionPending();
    setBusy(true);
    setFailed(false);
    try {
      const requestContext = await captureApiRequestContext();
      if (!active()) return;
      const options = { requestContext, signal: controller.signal, skipSpaceAuthRecovery: true };
      if (binding)
        await rpc("projectWorkspaces/unbindCloudDirectory", { id: projectId, grantId: binding.grantId }, options);
      else
        await rpc("projectWorkspaces/bindCloudDirectory", { projectId, computerId, path: path.trim(), intent }, options);
    } catch {
      if (active()) setFailed(true);
    } finally {
      if (active()) {
        await load(focused);
        if (active()) setBusy(false);
      }
      if (operation.current === controller) operation.current = null;
    }
  }

  return (
    <View style={{ gap: 10, padding: 16, borderWidth: 1, borderColor: tokens.border, borderRadius: 16 }}>
      <Text accessibilityRole="header" style={{ color: tokens.foreground, fontWeight: "600" }}>
        {text("云电脑目录", "Cloud computer folder")}
      </Text>
      {binding ? (
        <>
          <Text selectable style={caption}>
            {selected?.name ?? text("绑定的云电脑", "Bound cloud computer")} · {binding.path} ·{" "}
            {binding.intent === "read-only" ? readOnly : readWrite} ·{" "}
            {status.status === "online" ? text("在线", "Online") : text("不可用", "Unavailable")}
          </Text>
          <NativeActionButton
            label={text("撤销云电脑目录", "Revoke cloud folder")}
            prominence="secondary"
            disabled={busy}
            onPress={() => void change()}
          />
        </>
      ) : windowsBound ? (
        <Text style={caption}>{text("撤销 Windows 目录后可选择云电脑目录。", "Revoke the Windows folder to select a cloud folder.")}</Text>
      ) : status.computers.length ? (
        <>
          <Text style={caption}>{text("选择专属云电脑", "Select a dedicated cloud computer")}</Text>
          {status.computers.map((computer) => (
            <NativeActionButton key={computer.id} label={computer.name}
              prominence={computerId === computer.id ? "primary" : "secondary"}
              disabled={busy} onPress={() => setComputerId(computer.id)} />
          ))}
          <TextInput
            accessibilityLabel={text("专属工作区内已有目录的相对路径", "Existing folder path relative to the dedicated workspace")}
            placeholder={text("目录相对路径", "Relative folder path")}
            placeholderTextColor={tokens.mutedForeground}
            autoCapitalize="none" autoCorrect={false}
            editable={!busy} value={path} onChangeText={setPath}
            style={{ borderWidth: 1, borderRadius: 12, borderColor: tokens.border, color: tokens.foreground, padding: 12 }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <NativeActionButton label={readOnly} fill={false} disabled={busy}
              prominence={intent === "read-only" ? "primary" : "secondary"} onPress={() => setIntent("read-only")} />
            <NativeActionButton label={readWrite} fill={false} disabled={busy}
              prominence={intent === "read-write" ? "primary" : "secondary"} onPress={() => setIntent("read-write")} />
          </View>
          <Text style={caption}>
            {text("文件读取仍需在会话内确认，允许后文件文本会发送给任务使用的 AI 模型。", "File reads require chat approval. Approved text is shared with the AI model used for the task.")}
          </Text>
          <NativeActionButton label={text("授权云电脑目录", "Authorize cloud folder")} busy={busy}
            disabled={busy || !selected || !path.trim()} onPress={() => void change()} />
        </>
      ) : (
        <Text style={caption}>{text("当前没有在线的专属云电脑。", "No dedicated cloud computer is online.")}</Text>
      )}
      {failed ? <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
        {text("云电脑目录操作未确认，请核对电脑、路径及现有绑定。", "Folder operation unconfirmed. Check the computer, path, and active binding.")}
      </Text> : null}
    </View>
  );
}
