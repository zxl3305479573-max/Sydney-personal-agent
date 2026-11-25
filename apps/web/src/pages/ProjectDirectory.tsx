import { useLingui } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { desktopBridge } from "../lib/desktop";
import { useSpaceQueries } from "../lib/query";
import { createSpaceRpc, selectedSpaceId } from "../lib/rpc";
import { ProjectCloudDirectory } from "./ProjectCloudDirectory";

export function ProjectDirectory({
  projectId,
  spaceId,
}: {
  projectId: string;
  spaceId: string | null;
}) {
  const { i18n } = useLingui();
  const text = (chinese: string, english: string) =>
    i18n.locale.startsWith("zh") ? chinese : english;
  const queries = useSpaceQueries();
  const capability = useQuery(queries.projectWorkspaces.directoryCapability.queryOptions());
  const available = capability.data?.localDevice === true && !capability.error;
  const directory = useQuery({
    ...queries.projectWorkspaces.directory.queryOptions({ input: { id: projectId } }),
    enabled: available,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const active = useRef(false);
  const running = useRef(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const current = () => active.current && selectedSpaceId() === spaceId;

  async function change(operation: "choose" | "remove") {
    if (!current() || running.current || !available || !spaceId) return;
    running.current = true;
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      if (operation === "choose") {
        const chooser = desktopBridge()?.projectDirectory;
        if (!chooser) return;
        const result = await chooser.choose({ spaceId, projectId });
        if (result === null) return;
      } else {
        const binding = directory.data?.binding;
        if (!binding) return;
        const result = await createSpaceRpc(spaceId).projectWorkspaces.unbindDirectory({
          id: projectId,
          grantId: binding.grantId,
        });
        if (current())
          setNotice(
            result.localRevocation === "confirmed"
              ? text("目录绑定与本机授权已撤销。", "The binding and local grant were revoked.")
              : text(
                  "服务器绑定已移除；本机授权撤销未确认，重启桌面端后原授权失效。",
                  "The server binding was removed. Local revocation is unconfirmed; the old grant expires when the desktop restarts.",
                ),
          );
      }
      if (current()) await directory.refetch();
    } catch {
      if (current()) {
        setError(
          text(
            "操作结果未确认，请刷新目录状态后重试。",
            "The result is unconfirmed. Refresh the folder status before trying again.",
          ),
        );
        void directory.refetch();
      }
    } finally {
      running.current = false;
      if (current()) setWorking(false);
    }
  }

  const statuses = {
    unknown: text("尚未连接项目目录", "Project folder is not connected"),
    online: text("本机目录已授权，设备在线", "Local folder authorized; device online"),
    offline: text("绑定设备离线", "Bound device is offline"),
    unauthorized: text(
      "目录授权已失效，请撤销绑定后重新选择",
      "Folder authorization expired. Remove the binding and select again.",
    ),
    unavailable: text(
      "无法确认目录授权或目录已不可用",
      "Folder authorization could not be checked, or the folder is unavailable",
    ),
  };
  return (
    <>
      <section
        className="mt-4 space-y-3 rounded-xl border p-4"
        aria-label={text("项目目录", "Project folder")}
      >
        <h3 className="font-medium">{text("项目目录", "Project folder")}</h3>
        <p role="status" className="text-sm text-muted-foreground">
          {capability.isPending
            ? text("正在读取目录能力…", "Checking folder support…")
            : !available
              ? text(
                  "服务器尚未开放项目目录绑定。",
                  "Project folder binding is not available on this server yet.",
                )
              : directory.error
                ? text(
                    "目录状态读取失败，请刷新。",
                    "Could not load the folder status. Refresh to retry.",
                  )
                : directory.data
                  ? statuses[directory.data.status]
                  : text("正在读取目录状态…", "Loading folder status…")}
        </p>
        {!directory.error && available && directory.data?.binding ? (
          <p className="break-words text-sm" dir="auto">
            {directory.data.deviceName ?? text("绑定的电脑", "Bound computer")} ·{" "}
            {directory.data.binding.directoryName} ·{" "}
            {directory.data.binding.intent === "read-write"
              ? text(
                  "可读取、修改文本并新建 Markdown",
                  "Read and update text files, and create Markdown",
                )
              : text("只读", "Read only")}
          </p>
        ) : null}
        {available ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={working || directory.isFetching}
              onClick={() => void directory.refetch()}
            >
              {text("刷新目录状态", "Refresh folder status")}
            </Button>
            {directory.data?.binding ? (
              <Button
                type="button"
                variant="secondary"
                disabled={working || directory.isFetching || Boolean(directory.error)}
                onClick={() => void change("remove")}
              >
                {text("撤销目录绑定", "Revoke folder binding")}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={
                  working ||
                  !directory.data ||
                  Boolean(directory.error) ||
                  !desktopBridge()?.projectDirectory
                }
                onClick={() => void change("choose")}
              >
                {working
                  ? text("正在选择…", "Selecting…")
                  : text("选择本机目录", "Choose local folder")}
              </Button>
            )}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {text(
            "完整路径仅保存在本机；文件操作逐项审批，任意命令未开放。撤销不删除目录。",
            "The full path stays on this computer. File operations require approval; arbitrary commands are not available. Revoking does not delete the folder.",
          )}
        </p>
        {notice ? (
          <p role="status" className="text-sm">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm">
            {error}
          </p>
        ) : null}
      </section>
      <ProjectCloudDirectory
        projectId={projectId}
        spaceId={spaceId}
        windowsBound={Boolean(directory.data?.binding)}
      />
    </>
  );
}
