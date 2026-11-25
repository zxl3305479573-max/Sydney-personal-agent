import type { ProjectCloudDirectoryStatus, ProjectDirectoryIntent } from "@rakazo/contracts";
import { isRetryableError } from "@rakazo/core";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { captureApiRequestContext, isSpaceSelectionPending, rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { usePageState } from "../lib/page-state";
import { projectScopeKey } from "../lib/project-scope";
import { GlassSurface } from "./glass-surface";
import { NativeActionButton } from "./native-action-button";
import { NativeSymbol } from "./native-symbol";

function isLightSurface(background?: string): boolean {
  if (!background || !background.startsWith("#") || background.length < 7) return true;
  return Number.parseInt(background.slice(1, 3), 16) >= 128;
}

export function ProjectCloudDirectory({
  projectId,
  scopeKey,
  enabled,
  windowsBound,
}: {
  projectId: string;
  scopeKey: string;
  enabled: boolean;
  windowsBound: boolean;
}) {
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
  const tokens = useMobileTokens();
  const [status, setStatus] = usePageState<ProjectCloudDirectoryStatus | null>(
    scopeKey,
    ["project", projectId, "cloudDirectory"],
    null,
  );
  const [computerId, setComputerId] = useState("");
  const [path, setPath] = useState("");
  const [intent, setIntent] = useState<ProjectDirectoryIntent>("read-only");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const lifecycle = useRef<AbortController | null>(null);
  const operation = useRef<AbortController | null>(null);
  const load = useCallback(
    async (controller: AbortController) => {
      const active = () =>
        !controller.signal.aborted && projectScopeKey() === scopeKey && !isSpaceSelectionPending();
      try {
        const requestContext = await captureApiRequestContext();
        if (!active()) return;
        const result = await rpc(
          "projectWorkspaces/cloudDirectory",
          { id: projectId },
          {
            requestContext,
            signal: controller.signal,
            skipSpaceAuthRecovery: true,
          },
        );
        if (active()) setStatus(result);
      } catch (cause) {
        if (active()) {
          if (!isRetryableError(cause)) setStatus(null);
          setFailed(true);
        }
      }
    },
    [projectId, scopeKey],
  );

  useFocusEffect(
    useCallback(() => {
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
    }, [enabled, load, scopeKey]),
  );
  if (!enabled || !status?.available) return null;
  const binding = status.binding;
  const selected = status.computers.find(({ id }) => id === (binding?.computerId ?? computerId));
  const readOnly = text("只读", "Read only");
  const readWrite = text(
    "读取、修改文本并新建 Markdown",
    "Read and update text files, and create Markdown",
  );
  const isLight = isLightSurface(tokens?.background);
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder = isLight ? "rgba(38, 35, 31, 0.055)" : "rgba(245, 244, 240, 0.09)";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.07)" : "rgba(245, 244, 240, 0.10)";
  const accentTaupe = isLight ? "#6E675E" : "#B8B3AA";
  const fg = tokens?.foreground ?? (isLight ? "#26231F" : "#F5F4F0");
  const mutedFg = tokens?.mutedForeground ?? accentTaupe;
  const destructive = tokens?.destructive ?? (isLight ? "#C4272D" : "#FF8F8C");
  const caption = { color: mutedFg, fontSize: 13.5, lineHeight: 19 };
  async function change() {
    const focused = lifecycle.current;
    if (
      !focused ||
      operation.current ||
      projectScopeKey() !== scopeKey ||
      isSpaceSelectionPending()
    )
      return;
    const controller = new AbortController();
    operation.current = controller;
    const active = () =>
      lifecycle.current === focused &&
      projectScopeKey() === scopeKey &&
      !controller.signal.aborted &&
      !isSpaceSelectionPending();
    setBusy(true);
    setFailed(false);
    try {
      const requestContext = await captureApiRequestContext();
      if (!active()) return;
      const options = { requestContext, signal: controller.signal, skipSpaceAuthRecovery: true };
      if (binding)
        await rpc(
          "projectWorkspaces/unbindCloudDirectory",
          { id: projectId, grantId: binding.grantId },
          options,
        );
      else
        await rpc(
          "projectWorkspaces/bindCloudDirectory",
          { projectId, computerId, path: path.trim(), intent },
          options,
        );
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
    <GlassSurface
      shape="roundedRectangle"
      cornerRadius={20}
      style={{ borderRadius: 20, padding: 18, gap: 12 }}
      fallbackStyle={{
        backgroundColor: cardBg,
        borderRadius: 20,
        borderWidth: 0.5,
        borderColor: cardBorder,
        shadowColor: "#26231F",
        shadowOpacity: isLight ? 0.028 : 0.16,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 5 },
        elevation: 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            backgroundColor: chipBg,
            borderWidth: 0.5,
            borderColor: chipBorder,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <NativeSymbol ios="icloud" android="cloud-outline" size={17} color={accentTaupe} />
        </View>
        <Text accessibilityRole="header" style={{ color: fg, fontSize: 16, fontWeight: "600" }}>
          {text("云电脑目录", "Cloud computer folder")}
        </Text>
      </View>
      {binding ? (
        <>
          <View
            style={{
              backgroundColor: chipBg,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderWidth: 0.5,
              borderColor: chipBorder,
            }}
          >
            <Text selectable style={{ color: fg, fontSize: 14, lineHeight: 20 }}>
              {selected?.name ?? text("绑定的云电脑", "Bound cloud computer")} · {binding.path} ·{" "}
              {binding.intent === "read-only" ? readOnly : readWrite} ·{" "}
              {status.status === "online" ? text("在线", "Online") : text("不可用", "Unavailable")}
            </Text>
          </View>
          <NativeActionButton
            label={text("撤销云电脑目录", "Revoke cloud folder")}
            prominence="secondary"
            disabled={busy}
            onPress={() => void change()}
          />
        </>
      ) : windowsBound ? (
        <Text style={caption}>
          {text(
            "撤销 Windows 目录后可选择云电脑目录。",
            "Revoke the Windows folder to select a cloud folder.",
          )}
        </Text>
      ) : status.computers.length ? (
        <>
          <Text style={caption}>{text("选择专属云电脑", "Select a dedicated cloud computer")}</Text>
          {status.computers.map((computer) => (
            <NativeActionButton
              key={computer.id}
              label={computer.name}
              prominence={computerId === computer.id ? "primary" : "secondary"}
              disabled={busy}
              onPress={() => setComputerId(computer.id)}
            />
          ))}
          <TextInput
            accessibilityLabel={text(
              "专属工作区内已有目录的相对路径",
              "Existing folder path relative to the dedicated workspace",
            )}
            placeholder={text("目录相对路径", "Relative folder path")}
            placeholderTextColor={mutedFg}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            value={path}
            onChangeText={setPath}
            style={{
              backgroundColor: chipBg,
              borderWidth: 0.5,
              borderRadius: 16,
              borderColor: chipBorder,
              color: fg,
              minHeight: 46,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
            }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <NativeActionButton
              label={readOnly}
              fill={false}
              disabled={busy}
              prominence={intent === "read-only" ? "primary" : "secondary"}
              onPress={() => setIntent("read-only")}
            />
            <NativeActionButton
              label={readWrite}
              fill={false}
              disabled={busy}
              prominence={intent === "read-write" ? "primary" : "secondary"}
              onPress={() => setIntent("read-write")}
            />
          </View>
          <Text style={caption}>
            {text(
              "文件读取仍需在会话内确认，允许后文件文本会发送给任务使用的 AI 模型。",
              "File reads require chat approval. Approved text is shared with the AI model used for the task.",
            )}
          </Text>
          <NativeActionButton
            label={text("授权云电脑目录", "Authorize cloud folder")}
            busy={busy}
            disabled={busy || !selected || !path.trim()}
            onPress={() => void change()}
          />
        </>
      ) : (
        <Text style={caption}>
          {text("当前没有在线的专属云电脑。", "No dedicated cloud computer is online.")}
        </Text>
      )}
      {failed ? (
        <Text accessibilityRole="alert" style={{ color: destructive }}>
          {text(
            "云电脑目录操作未确认，请核对电脑、路径及现有绑定。",
            "Folder operation unconfirmed. Check the computer, path, and active binding.",
          )}
        </Text>
      ) : null}
    </GlassSurface>
  );
}
