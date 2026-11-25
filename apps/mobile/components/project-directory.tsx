import { Alert, Text, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { useProjectDirectory } from "../lib/use-project-directory";
import { NativeActionButton } from "./native-action-button";
import { ProjectCloudDirectory } from "./project-cloud-directory";

export function ProjectDirectory({
  projectId,
  scopeKey,
  enabled,
}: {
  projectId: string;
  scopeKey: string;
  enabled: boolean;
}) {
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => (locale.startsWith("zh") ? chinese : english);
  const tokens = useMobileTokens();
  const state = useProjectDirectory(projectId, scopeKey, enabled);
  const statuses = {
    unknown: text(
      "尚未连接项目目录，请在桌面端选择本机目录。",
      "No folder is bound. Choose a local folder in the desktop app.",
    ),
    online: text("本机目录已授权，设备在线", "Local folder authorized; device online"),
    offline: text("绑定设备离线", "Bound device is offline"),
    unauthorized: text(
      "目录授权已失效，请撤销后在桌面端重新选择。",
      "Folder authorization expired. Revoke the binding and select again on the desktop.",
    ),
    unavailable: text(
      "无法确认目录授权或目录已不可用",
      "Folder authorization could not be checked, or the folder is unavailable",
    ),
  };
  return (
    <>
    <View
      style={{ gap: 10, padding: 16, borderWidth: 1, borderColor: tokens.border, borderRadius: 16 }}
    >
      <Text accessibilityRole="header" style={{ color: tokens.foreground, fontWeight: "600" }}>
        {text("项目目录", "Project folder")}
      </Text>
      <Text
        accessibilityRole={state.failed ? "alert" : undefined}
        style={{ color: tokens.mutedForeground }}
      >
        {state.failed
          ? text(
              "目录操作或状态读取未确认，请刷新后查看。",
              "The folder result is unconfirmed. Refresh to check.",
            )
          : state.loading
            ? text("正在读取目录状态…", "Loading folder status…")
            : !state.available
              ? text(
                  "服务器尚未开放项目目录绑定。",
                  "Project folder binding is not available on this server yet.",
                )
              : state.snapshot
                ? statuses[state.snapshot.status]
                : ""}
      </Text>
      {!state.failed && state.snapshot?.binding ? (
        <Text style={{ color: tokens.foreground }}>
          {state.snapshot.deviceName ?? text("绑定的电脑", "Bound computer")} ·{" "}
          {state.snapshot.binding.directoryName} ·{" "}
          {state.snapshot.binding.intent === "read-write"
            ? text("可读取、修改文本并新建 Markdown", "Read and update text files, and create Markdown")
            : text("只读", "Read only")}
        </Text>
      ) : null}
      <NativeActionButton
        label={text("刷新目录状态", "Refresh folder status")}
        prominence="secondary"
        fill={false}
        disabled={state.loading || state.working}
        onPress={state.refresh}
      />
      {state.snapshot?.binding ? (
        <NativeActionButton
          label={text("撤销目录绑定", "Revoke folder binding")}
          prominence="secondary"
          fill={false}
          disabled={state.loading || state.working || state.failed}
          onPress={() =>
            Alert.alert(
              text("撤销目录绑定？", "Revoke folder binding?"),
              text(
                "只移除授权绑定，不删除电脑中的目录或文件。",
                "Only the authorization binding is removed. Folders and files are kept.",
              ),
              [
                { text: text("取消", "Cancel"), style: "cancel" },
                {
                  text: text("撤销绑定", "Revoke binding"),
                  style: "destructive",
                  onPress: () => void state.remove(),
                },
              ],
            )
          }
        />
      ) : null}
      {state.revocation ? (
        <Text style={{ color: tokens.mutedForeground }}>
          {state.revocation === "confirmed"
            ? text("目录绑定与本机授权已撤销。", "The binding and local grant were revoked.")
            : text(
                "服务器绑定已移除；本机撤销未确认，重启桌面端后原授权失效。",
                "The server binding was removed. Local revocation is unconfirmed; the old grant expires when the desktop restarts.",
              )}
        </Text>
      ) : null}
      <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
        {text(
          "目录路径留在执行电脑；文件操作逐项审批，任意命令未开放。",
          "The path stays on the execution computer. File operations require approval; arbitrary commands are not available.",
        )}
      </Text>
    </View>
    <ProjectCloudDirectory projectId={projectId} scopeKey={scopeKey} enabled={enabled} windowsBound={Boolean(state.snapshot?.binding)} />
    </>
  );
}
