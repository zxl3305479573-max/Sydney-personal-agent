import { useLingui } from "@lingui/react/macro";
import type { ProjectDirectoryIntent } from "@rakazo/contracts";
import { Button, Input } from "@rakazo/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { useSpaceQueries } from "../lib/query";
import { createSpaceRpc, selectedSpaceId } from "../lib/rpc";

export function ProjectCloudDirectory({
  projectId,
  spaceId,
  windowsBound,
}: {
  projectId: string;
  spaceId: string | null;
  windowsBound: boolean;
}) {
  const { i18n } = useLingui();
  const text = (chinese: string, english: string) => i18n.locale.startsWith("zh") ? chinese : english;
  const queries = useSpaceQueries();
  const status = useQuery({
    ...queries.projectWorkspaces.cloudDirectory.queryOptions({ input: { id: projectId } }),
    retry: false,
    refetchInterval: 15_000,
  });
  const [computerId, setComputerId] = useState("");
  const [path, setPath] = useState("");
  const [intent, setIntent] = useState<ProjectDirectoryIntent>("read-only");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pathInputId = useId();
  const activity = useRef<AbortController | null>(null);
  useEffect(() => () => activity.current?.abort(), []);
  const binding = status.data?.binding;
  if (!status.data?.available) return null;

  async function change() {
    if (activity.current || selectedSpaceId() !== spaceId) return;
    const controller = new AbortController();
    activity.current = controller;
    const options = { signal: controller.signal };
    setBusy(true);
    setFailed(false);
    try {
      const projects = createSpaceRpc(spaceId).projectWorkspaces;
      if (binding)
        await projects.unbindCloudDirectory({ id: projectId, grantId: binding.grantId }, options);
      else
        await projects.bindCloudDirectory({ projectId, computerId, path: path.trim(), intent }, options);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted && selectedSpaceId() === spaceId) {
        await status.refetch();
        if (!controller.signal.aborted) setBusy(false);
      }
      if (activity.current === controller) activity.current = null;
    }
  }
  const readOnly = text("只读", "Read only");
  const readWrite = text("读取并新建 Markdown", "Read and create Markdown");
  const selected = status.data.computers.find(({ id }) => id === (binding?.computerId ?? computerId));
  return (
    <section className="mt-4 space-y-3 rounded-xl border p-4">
      <h3 className="font-medium">{text("云电脑目录", "Cloud computer folder")}</h3>
      {binding ? (
        <>
          <p className="break-words text-sm">
            {selected?.name ?? text("绑定的云电脑", "Bound cloud computer")} · {binding.path} ·{" "}
            {binding.intent === "read-only" ? readOnly : readWrite} ·{" "}
            {status.data.status === "online" ? text("在线", "Online") : text("不可用", "Unavailable")}
          </p>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void change()}>
            {text("撤销云电脑目录", "Revoke cloud folder")}
          </Button>
        </>
      ) : windowsBound ? (
        <p className="text-sm text-muted-foreground">
          {text("撤销 Windows 目录后可选择云电脑目录。", "Revoke the Windows folder to select a cloud folder.")}
        </p>
      ) : status.data.computers.length ? (
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void change(); }}>
          <label className="grid gap-1 text-sm">
            {text("专属云电脑", "Dedicated cloud computer")}
            <select className="rounded-md border bg-background p-2" value={computerId} onChange={(event) => setComputerId(event.target.value)}>
              <option value="">{text("请选择", "Select")}</option>
              {status.data.computers.map((computer) => <option key={computer.id} value={computer.id}>{computer.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm" htmlFor={pathInputId}>
            {text("专属工作区内已有目录的相对路径", "Existing folder path relative to the dedicated workspace")}
            <Input id={pathInputId} value={path} onChange={(event) => setPath(event.target.value)} required />
          </label>
          <label className="grid gap-1 text-sm">
            {text("允许的操作", "Allowed actions")}
            <select className="rounded-md border bg-background p-2" value={intent} onChange={(event) =>
              setIntent(event.target.value === "read-write" ? "read-write" : "read-only")
            }>
              <option value="read-only">{readOnly}</option>
              <option value="read-write">{readWrite}</option>
            </select>
          </label>
          <p className="text-sm text-muted-foreground">
            {text("文件读取仍需在会话内确认，允许后文件文本会发送给任务使用的 AI 模型。", "File reads require chat approval. Approved text is shared with the AI model used for the task.")}
          </p>
          <Button type="submit" disabled={busy || !selected || !path.trim()}>
            {text("授权云电脑目录", "Authorize cloud folder")}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">{text("当前没有在线的专属云电脑。", "No dedicated cloud computer is online.")}</p>
      )}
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {text("云电脑目录操作未确认，请核对电脑、路径及现有绑定。", "Folder operation unconfirmed. Check the computer, path, and active binding.")}
        </p>
      ) : null}
    </section>
  );
}
