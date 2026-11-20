import { useLingui } from "@lingui/react/macro";
import type { ThreadSnapshot } from "@rakazo/contracts";
import { AI_DATA_DISCLOSURES, ProjectWorkspaceIdInput } from "@rakazo/contracts";
import type { ProjectThreadState } from "@rakazo/core";
import {
  anySignal,
  createProjectThreadSession,
  IDLE_TIMEOUT_MS,
  pendingProjectApproval,
  projectActiveRuns,
} from "@rakazo/core";
import { Button, Textarea } from "@rakazo/ui-web";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { decodeArtifactBase64, downloadArtifactBytes } from "../lib/artifact-open";
import { useQueryUserId } from "../lib/query";
import { createSpaceRpc, selectedSpaceId } from "../lib/rpc";
import { reduceThreadSnapshot } from "../lib/thread-events";
import { WindowChrome } from "./WindowChrome";

type Session = ReturnType<typeof createProjectThreadSession<ThreadSnapshot>>;
const initialState: ProjectThreadState<ThreadSnapshot> = {
  snapshot: null,
  loading: true,
  sending: false,
  consenting: false,
  consent: null,
  readError: null,
  sendError: null,
  cancellingRunId: null,
  cancelError: null,
  answeringEffectId: null,
  answerError: null,
  downloadingArtifactId: null,
  downloadError: null,
};

export function ProjectThreadPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [params] = useSearchParams();
  const userId = useQueryUserId();
  const spaceId = selectedSpaceId();
  const project = ProjectWorkspaceIdInput.safeParse({ id: workspaceId });
  const botId = params.get("botId") || undefined;
  const groupId = params.get("groupId") || undefined;
  return (
    <ProjectThread
      key={JSON.stringify([userId, spaceId, workspaceId, botId, groupId])}
      projectId={project.success ? project.data.id : ""}
      spaceId={spaceId}
      botId={botId}
      groupId={groupId}
      enabled={project.success && Boolean(botId) !== Boolean(groupId)}
    />
  );
}

function ProjectThread({
  projectId,
  spaceId,
  botId,
  groupId,
  enabled,
}: {
  projectId: string;
  spaceId: string | null;
  botId?: string;
  groupId?: string;
  enabled: boolean;
}) {
  const { i18n } = useLingui();
  const text = (chinese: string, english: string) =>
    i18n.locale.startsWith("zh") ? chinese : english;
  const [state, setState] = useState(initialState);
  const [draft, setDraft] = useState("");
  const sessionRef = useRef<Session | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const rpc = createSpaceRpc(spaceId);
    const input = { projectId, botId, groupId };
    const session = createProjectThreadSession<ThreadSnapshot>({
      current: () => active && selectedSpaceId() === spaceId,
      load: (signal) => rpc.projectWorkspaces.threadSnapshot(input, { signal }),
      subscribe: async (cursor, receive, signal) => {
        const idle = new AbortController();
        const streamSignal = anySignal([signal, idle.signal]);
        let timer: ReturnType<typeof setTimeout>;
        const beat = () => {
          clearTimeout(timer);
          timer = setTimeout(
            () => idle.abort(new Error("Project stream timed out")),
            IDLE_TIMEOUT_MS,
          );
        };
        beat();
        try {
          const events = await rpc.projectWorkspaces.subscribe(
            { ...input, cursor },
            { signal: streamSignal },
          );
          for await (const event of events) {
            if (streamSignal.aborted) break;
            beat();
            receive(event);
          }
        } finally {
          clearTimeout(timer!);
        }
      },
      reduce: reduceThreadSnapshot,
      consentStatus: (signal) => rpc.projectWorkspaces.consentStatus(input, { signal }),
      consentAllow: (status, signal) =>
        rpc.projectWorkspaces.consentAllow(
          {
            ...input,
            scope: status.scope,
            version: status.version,
            keys: status.recipients.filter((recipient) => !recipient.allowed).map(({ key }) => key),
          },
          { signal },
        ),
      send: (value, clientNonce, signal) =>
        rpc.projectWorkspaces.sendText({ ...input, text: value, clientNonce }, { signal }),
      cancelRun: (runId, signal) =>
        rpc.projectWorkspaces.cancelRun({ ...input, runId }, { signal }),
      answerApproval: (answer, signal) =>
        rpc.projectWorkspaces.answerApproval({ ...input, ...answer }, { signal }),
      downloadArtifact: async (artifactId, signal) => {
        const artifact = await rpc.projectWorkspaces.getArtifact({ ...input, artifactId }, { signal });
        signal.throwIfAborted();
        if (!active || selectedSpaceId() !== spaceId) throw new Error("Project scope changed");
        downloadArtifactBytes(artifact.name, artifact.mimeType, decodeArtifactBase64(artifact.contentBase64));
      },
    });
    sessionRef.current = session;
    setState(session.getSnapshot());
    const unsubscribe = session.subscribe(() => setState(session.getSnapshot()));
    void session.start();
    return () => {
      active = false;
      unsubscribe();
      session.stop();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [projectId, botId, groupId, spaceId, enabled]);
  useEffect(() => {
    if (state.snapshot?.cursor !== undefined)
      endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [state.snapshot?.cursor]);
  const missing = state.consent?.recipients.filter((recipient) => !recipient.allowed) ?? [];
  const disabled = !enabled || !state.snapshot || state.sending || state.consenting;
  return (
    <main className="flex h-full min-h-0 flex-col" data-project-chat>
      <header className="app-drag flex shrink-0 items-center gap-4 border-b px-5 py-4">
        <WindowChrome />
        <Link
          className="app-no-drag rounded-xl px-3 py-2 hover:bg-muted"
          to={projectId ? `/app/projects/${encodeURIComponent(projectId)}` : "/app/projects"}
        >
          {text("返回项目", "Back to project")}
        </Link>
        <h1 className="text-lg font-semibold">
          {state.snapshot?.groupName ?? text("项目会话", "Project chat")}
        </h1>
      </header>
      <section
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
        aria-label={text("项目聊天记录", "Project chat history")}
      >
        {!enabled ? (
          <p role="alert">
            {text(
              "项目入口无效，请返回列表重新选择。",
              "Invalid project link. Reopen it from Projects.",
            )}
          </p>
        ) : null}
        {enabled && state.loading ? (
          <p role="status">{text("正在加载会话…", "Loading conversation…")}</p>
        ) : null}
        {enabled && state.readError ? (
          <div role="alert" className="space-y-2">
            <p>
              {text(
                "会话同步中断，已显示的内容可能不是最新状态。",
                "Chat sync interrupted. Displayed messages may be out of date.",
              )}
            </p>
            <Button variant="secondary" onClick={() => void sessionRef.current?.reconnect()}>
              {text("重新连接", "Reconnect")}
            </Button>
          </div>
        ) : null}
        {enabled
          ? state.snapshot?.messages.map((message) => {
            const approval = pendingProjectApproval(state.snapshot, message);
            return (
              <article key={message.id} className="sydney-list-surface rounded-2xl border p-4">
                <p className="mb-2 text-sm text-muted-foreground">
                  {message.role === "user"
                    ? text("我", "You")
                    : message.botId
                      ? (state.snapshot?.members?.find((member) => member.botId === message.botId)
                          ?.name ?? "Bot")
                      : "Bot"}
                </p>
                {approval ? (
                  <div className="space-y-2">
                    <p className="font-medium">{approval.title}</p>
                    <p className="whitespace-pre-wrap break-words">{approval.detail}</p>
                    <div className="flex gap-2">
                      {approval.decisions.map((decision) => (
                        <Button
                          key={decision}
                          variant={decision === "deny" ? "secondary" : "default"}
                          disabled={state.answeringEffectId !== null}
                          onClick={() => void sessionRef.current?.answerApproval(message.id, decision)}
                        >
                          {decision === "allow" ? text("允许本次", "Allow once") : text("拒绝", "Deny")}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : message.blocks.some((block) => block.kind === "text") ? (
                  <p className="whitespace-pre-wrap break-words" dir="auto">
                    {message.blocks
                    .flatMap((block) => (block.kind === "text" ? [block.text] : []))
                    .join("\n")}
                  </p>
                ) : null}
                {message.blocks.flatMap((block) => block.kind === "file" ? [
                  <Button
                    key={block.artifactId}
                    variant="secondary"
                    disabled={state.downloadingArtifactId !== null}
                    onClick={() => void sessionRef.current?.downloadArtifact(block.artifactId)}
                  >
                    {text("下载", "Download")} {block.name}
                  </Button>,
                ] : [])}
              </article>
            );
          })
          : null}
        {enabled && state.snapshot?.olderCursor != null ? (
          <p className="text-sm text-muted-foreground">
            {text(
              "当前展示最近的消息，较早记录暂未加载。",
              "Recent messages are shown. Earlier history is not loaded yet.",
            )}
          </p>
        ) : null}
        {enabled && state.snapshot?.run ? (
          <p className="text-sm text-muted-foreground" role="status">
            {text("任务状态：", "Run status: ")}
            {state.snapshot.run.status}
          </p>
        ) : null}
        {enabled
          ? projectActiveRuns(state.snapshot).map((run) => {
              const member = state.snapshot?.members?.find((entry) => entry.botId === run.botId);
              const buttonLabel = member
                ? text(`取消 ${member.name} 的任务`, `Cancel ${member.name}'s run`)
                : text("取消任务", "Cancel run");
              return (
                <Button
                  key={run.id}
                  variant="secondary"
                  disabled={state.cancellingRunId !== null}
                  onClick={() => void sessionRef.current?.cancelRun(run.id)}
                >
                  {state.cancellingRunId === run.id ? text("正在取消…", "Cancelling…") : buttonLabel}
                </Button>
              );
            })
          : null}
        {enabled && state.cancelError ? (
          <p role="alert">
            {text(
              "取消结果未确认，请查看任务状态。",
              "Cancellation was not confirmed. Check the run status.",
            )}
          </p>
        ) : null}
        {enabled && state.answerError ? (
          <p role="alert">{text("审批结果未确认，请查看任务状态。", "Approval was not confirmed. Check the run status.")}</p>
        ) : null}
        {enabled && state.downloadError ? (
          <p role="alert">{text("无法下载项目文件。", "Could not download the project file.")}</p>
        ) : null}
        {missing.length ? (
          <section className="space-y-3 rounded-2xl border p-4">
            <h2 className="font-semibold">
              {text("发送前确认 AI 数据共享", "Review AI data sharing before sending")}
            </h2>
            {missing.map((recipient) => (
              <div key={recipient.key}>
                <p className="font-medium">{recipient.name}</p>
                <p>{recipient.detail}</p>
                <p className="text-sm text-muted-foreground">
                  {AI_DATA_DISCLOSURES[recipient.use]}
                </p>
              </div>
            ))}
            <Button
              disabled={state.consenting || state.sending}
              onClick={() => void sessionRef.current?.allow()}
            >
              {text("允许这些接收方", "Allow these recipients")}
            </Button>
          </section>
        ) : null}
        {state.sendError ? (
          <p role="alert">
            {text(
              "发送未确认，草稿已保留。重试相同文字会使用原请求标识。",
              "Sending was not confirmed. Your draft is kept; retrying the same text reuses its request ID.",
            )}
          </p>
        ) : null}
        <div ref={endRef} />
      </section>
      <form
        className="flex shrink-0 items-end gap-3 border-t p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const submitted = draft;
          void sessionRef.current?.send(submitted).then((sent) => {
            if (sent) setDraft((current) => (current === submitted ? "" : current));
          });
        }}
      >
        <Textarea
          aria-label={text("项目消息", "Project message")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={disabled}
          className="max-h-40 min-h-12"
        />
        <Button type="submit" disabled={disabled || !draft.trim() || missing.length > 0}>
          {state.sending ? text("正在发送…", "Sending…") : text("发送", "Send")}
        </Button>
      </form>
    </main>
  );
}
