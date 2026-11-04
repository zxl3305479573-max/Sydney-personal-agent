import { Trans, useLingui } from "@lingui/react/macro";
import type { TaskGrantSchema } from "@rakazo/contracts";
import { Button, Input, Textarea } from "@rakazo/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type * as z from "zod";
import { rpc, selectedSpaceId } from "../lib/rpc";
import { errorText } from "../lib/user-error";
import { WindowChrome } from "./WindowChrome";

type Grant = z.infer<typeof TaskGrantSchema>;
type Submission = {
  taskId: string;
  expectedVersion: number;
  clientNonce: string;
  retry: boolean;
  expiresAt: number;
  modelDataConsent: true;
  scopes: Grant[];
};

export function taskGrants(input: {
  taskId: string;
  botId: string;
  pageUrl: string;
  read: boolean;
  write: boolean;
  desktop: boolean;
  memory: boolean;
  ask: boolean;
}): Grant[] {
  const scopes: Grant[] = [];
  const add = (tool: string, resource: string) =>
    scopes.push({ tool, action: "execute", resource });
  if (input.read) {
    add("read_file", "workspace");
    add("list_files", "workspace");
  }
  if (input.write) add("write_file", "workspace");
  if (input.pageUrl.trim()) {
    const url = new URL(input.pageUrl.trim());
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new Error("Enter a public HTTPS URL without credentials");
    }
    url.hash = "";
    add("web_fetch", url.href);
  }
  if (input.desktop) {
    add("shell", `computer:${input.botId}`);
    add("computer_observe", `computer:${input.botId}`);
    add("computer_act", `computer:${input.botId}`);
  }
  if (input.memory) add("remember", `memory:${input.botId}`);
  if (input.ask) add("ask_user", `task:${input.taskId}`);
  if (!scopes.length) throw new Error("Select at least one permission");
  return scopes;
}

export function TasksPage() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const spaceId = selectedSpaceId();
  const tasksKey = ["managed-tasks", spaceId];
  const bots = useQuery({
    queryKey: ["managed-task-bots", spaceId],
    queryFn: () => rpc.bots.list(),
  });
  const tasks = useQuery({
    queryKey: tasksKey,
    queryFn: () => rpc.tasks.list({}),
    refetchInterval: 5_000,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const details = useQuery({
    queryKey: ["managed-task", spaceId, selected],
    queryFn: () => rpc.tasks.inspect({ taskId: selected! }),
    enabled: selected !== null,
    refetchInterval: 3_000,
  });
  const [botId, setBotId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [read, setRead] = useState(true);
  const [write, setWrite] = useState(true);
  const [desktop, setDesktop] = useState(false);
  const [memory, setMemory] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ imageBase64: string; mimeType: string } | null>(null);
  const draftNonce = useRef(crypto.randomUUID());
  const pendingDispatch = useRef<Submission | null>(null);
  const task = details.data?.task;
  const state = details.data;
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: tasksKey }),
      queryClient.invalidateQueries({ queryKey: ["managed-task", spaceId, selected] }),
    ]);
  };
  const perform = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
      await refresh();
    } catch (cause) {
      setError(errorText(cause));
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const create = () =>
    perform(async () => {
      const created = await rpc.tasks.create({
        botId,
        prompt,
        clientNonce: draftNonce.current,
        budget: {
          maxRuns: 3,
          maxToolCalls: 30,
          maxModelCalls: 8,
          maxReservedTokens: 100_000,
          timeoutMs: 900_000,
        },
      });
      draftNonce.current = crypto.randomUUID();
      setSelected(created.id);
      setPrompt("");
      setConsent(false);
      pendingDispatch.current = null;
    });
  const dispatch = () =>
    perform(async () => {
      if (!task || !state || !consent) return;
      const scopes = taskGrants({
        taskId: task.id,
        botId: task.botId,
        pageUrl,
        read,
        write,
        desktop,
        memory,
        ask: false,
      });
      const previous = pendingDispatch.current;
      const submission: Submission =
        previous?.taskId === task.id && JSON.stringify(previous.scopes) === JSON.stringify(scopes)
          ? previous
          : {
              taskId: task.id,
              expectedVersion: task.execution.version,
              clientNonce: crypto.randomUUID(),
              retry: state.runs.length > 0,
              expiresAt: Date.now() + 15 * 60_000,
              modelDataConsent: true,
              scopes,
            };
      pendingDispatch.current = submission;
      await rpc.tasks.dispatch(submission);
      pendingDispatch.current = null;
      setConsent(false);
    });
  const taskMutation = (
    operation: (input: { taskId: string; expectedVersion: number }) => Promise<unknown>,
  ) =>
    perform(async () => {
      if (!task) return;
      await operation({ taskId: task.id, expectedVersion: task.execution.version });
    });

  return (
    <div className="flex h-full flex-col bg-background">
      <WindowChrome />
      <main className="rk-scroll mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <Link className="text-sm text-muted-foreground underline" to="/app">
              <Trans>Back to chat</Trans>
            </Link>
            <h1 className="mt-2 text-2xl font-semibold">
              <Trans>Tasks</Trans>
            </h1>
          </div>
          <Link className="text-sm underline" to="/app?settings=memory">
            <Trans>Memory</Trans>
          </Link>
        </div>
        {error || tasks.error || bots.error || details.error ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error || errorText(tasks.error ?? bots.error ?? details.error)}
          </p>
        ) : null}
        <section className="mb-6 rounded-lg border border-border p-4">
          <h2 className="mb-3 font-semibold">
            <Trans>New task</Trans>
          </h2>
          <label className="mb-2 block text-sm" htmlFor="task-bot">
            <Trans>Agent</Trans>
          </label>
          <select
            id="task-bot"
            value={botId}
            onChange={(event) => setBotId(event.target.value)}
            className="mb-3 w-full rounded-md border border-border bg-background p-2"
          >
            <option value="">{t`Select an agent`}</option>
            {(bots.data ?? []).map((bot) => (
              <option key={bot.id} value={bot.id}>
                {bot.name}
              </option>
            ))}
          </select>
          <label className="mb-2 block text-sm" htmlFor="task-prompt">
            <Trans>Request</Trans>
          </label>
          <Textarea
            id="task-prompt"
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              draftNonce.current = crypto.randomUUID();
            }}
            rows={3}
          />
          <Button
            className="mt-3"
            disabled={busy || !botId || !prompt.trim()}
            onClick={() => void create()}
          >
            <Trans>Create</Trans>
          </Button>
        </section>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section>
            <h2 className="mb-3 font-semibold">
              <Trans>Recent tasks</Trans>
            </h2>
            <div className="space-y-2">
              {(tasks.data ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="block w-full rounded-md border border-border p-3 text-start"
                  aria-pressed={selected === item.id}
                  onClick={() => {
                    setSelected(item.id);
                    setPreview(null);
                    setConsent(false);
                    pendingDispatch.current = null;
                  }}
                >
                  <span className="block truncate text-sm">{item.prompt}</span>
                  <span className="text-xs text-muted-foreground">{item.status}</span>
                </button>
              ))}
            </div>
          </section>
          {task && state ? (
            <section className="space-y-4 rounded-lg border border-border p-4">
              <h2 className="whitespace-pre-wrap font-semibold">{task.prompt}</h2>
              <p className="text-sm">
                <Trans>State</Trans>: {state.state}
                {state.reason ? ` (${state.reason})` : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                <Trans>Reserved tokens</Trans>: {task.execution.reservedTokens} /{" "}
                {task.execution.budget.maxReservedTokens}
                {" · "}
                <Trans>Model calls</Trans>: {task.execution.modelCalls} /{" "}
                {task.execution.budget.maxModelCalls}
              </p>
              <div className="flex flex-wrap gap-2 text-sm">
                <Link className="underline" to={`/app/${task.botId}`}>
                  <Trans>Open chat and approvals</Trans>
                </Link>
                <Link className="underline" to="/app/artifacts">
                  <Trans>Files and artifacts</Trans>
                </Link>
                <Link className="underline" to="/app?settings=usage">
                  <Trans>Measured usage</Trans>
                </Link>
              </div>
              {state.runs.map((run) => (
                <p key={run.id} className="text-xs text-muted-foreground">
                  {run.id}: {run.status} · <Trans>Attempts</Trans>: {run.attempts}
                </p>
              ))}
              {state.historyComplete &&
              ((state.state === "queued" && !state.runs.length && !task.execution.currentRunId) ||
              state.state === "failed" ||
              state.state === "paused") ? (
                <div className="space-y-3 border-t border-border pt-4">
                  <h3 className="font-semibold">
                    <Trans>Authorize execution</Trans>
                  </h3>
                  <label className="block text-sm" htmlFor="task-url">
                    <Trans>Allowed HTTPS page</Trans>
                  </label>
                  <Input
                    id="task-url"
                    value={pageUrl}
                    onChange={(event) => setPageUrl(event.target.value)}
                    placeholder="https://example.org/page"
                  />
                  <label className="block text-sm">
                    <input
                      type="checkbox"
                      checked={read}
                      onChange={(event) => setRead(event.target.checked)}
                    />{" "}
                    <Trans>Read workspace files</Trans>
                  </label>
                  <label className="block text-sm">
                    <input
                      type="checkbox"
                      checked={write}
                      onChange={(event) => setWrite(event.target.checked)}
                    />{" "}
                    <Trans>Write workspace files</Trans>
                  </label>
                  <label className="block text-sm">
                    <input
                      type="checkbox"
                      checked={desktop}
                      onChange={(event) => setDesktop(event.target.checked)}
                    />{" "}
                    <Trans>
                      Run commands and operate the desktop with the desktop user’s file and network
                      access
                    </Trans>
                  </label>
                  <label className="block text-sm">
                    <input
                      type="checkbox"
                      checked={memory}
                      onChange={(event) => setMemory(event.target.checked)}
                    />{" "}
                    <Trans>Save memory</Trans>
                  </label>
                  <p className="text-sm text-muted-foreground">
                    <Trans>Questions during managed tasks are not available yet.</Trans>
                  </p>
                  <label className="block text-sm">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                    />{" "}
                    <Trans>
                      I allow the configured model to receive the request, relevant history, and
                      tool results.
                    </Trans>
                  </label>
                  <Button
                    disabled={
                      busy ||
                      !consent ||
                      !task.execution.control.quiesced ||
                      state.reason === "unknown_effects"
                    }
                    onClick={() => void dispatch()}
                  >
                    {state.runs.length ? (
                      <Trans>Retry with these permissions</Trans>
                    ) : (
                      <Trans>Start with these permissions</Trans>
                    )}
                  </Button>
                </div>
              ) : null}
              {task.execution.currentRunId &&
              task.execution.control.intent === "continue" &&
              !["succeeded", "cancelled"].includes(state.state) ? (
                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void taskMutation((input) => rpc.tasks.control({ ...input, intent: "pause" }))
                    }
                  >
                    <Trans>Pause</Trans>
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void taskMutation((input) =>
                        rpc.tasks.control({ ...input, intent: "cancel" }),
                      )
                    }
                  >
                    <Trans>Cancel</Trans>
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void taskMutation((input) => rpc.tasks.revoke(input))}
                  >
                    <Trans>Revoke authorization</Trans>
                  </Button>
                </div>
              ) : null}
              {task.execution.control.intent !== "continue" &&
              !task.execution.control.quiesced &&
              task.execution.currentRunId ? (
                <div className="space-y-2">
                  <p className="text-sm">
                    <Trans>
                      Stopping is not confirmed. Server-side verification of background work is
                      not available yet.
                    </Trans>
                  </p>
                </div>
              ) : null}
              {task.execution.control.quiesced && task.execution.control.intent !== "continue"
                ? [...state.unresolvedEffects, ...state.pendingEffects].map((effectId) => (
                    <div
                      key={effectId}
                      className="space-y-2 rounded-md border border-border p-3 text-sm"
                    >
                      <p>
                        <Trans>Inspect this effect before recording its outcome</Trans>: {effectId}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void taskMutation((input) =>
                              rpc.tasks.reconcile({
                                ...input,
                                effectId,
                                outcome: "completed",
                                examined: true,
                              }),
                            )
                          }
                        >
                          <Trans>I checked: completed</Trans>
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void taskMutation((input) =>
                              rpc.tasks.reconcile({
                                ...input,
                                effectId,
                                outcome: "not_applied",
                                examined: true,
                              }),
                            )
                          }
                        >
                          <Trans>I checked: not applied</Trans>
                        </Button>
                      </div>
                    </div>
                  ))
                : null}
              {task.execution.control.intent === "pause" &&
              task.execution.control.quiesced &&
              !state.unresolvedEffects.length &&
              !state.pendingEffects.length ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void taskMutation((input) => rpc.tasks.finishReview(input))}
                >
                  <Trans>Finish review</Trans>
                </Button>
              ) : null}
              {state.historyComplete && state.reason === "completion_unverified" && task.execution.currentRunId ? (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void taskMutation((input) =>
                      rpc.tasks.verify({ ...input, runId: task.execution.currentRunId! }),
                    )
                  }
                >
                  <Trans>I checked the result</Trans>
                </Button>
              ) : null}
              {(state.state === "waiting_input" || state.state === "waiting_takeover") &&
              task.execution.currentRunId ? (
                <div className="space-y-2">
                  <label className="block text-sm">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                    />{" "}
                    <Trans>
                      I allow the configured model to receive the request, relevant history, and
                      tool results.
                    </Trans>
                  </label>
                  <Button
                    variant="outline"
                    disabled={busy || !consent}
                    onClick={() =>
                      void taskMutation((input) =>
                        rpc.tasks.renew({
                          ...input,
                          runId: task.execution.currentRunId!,
                          expiresAt: Date.now() + 15 * 60_000,
                          modelDataConsent: true,
                        }),
                      )
                    }
                  >
                    <Trans>Renew existing authorization</Trans>
                  </Button>
                </div>
              ) : null}
              <div className="border-t border-border pt-4">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      setPreview(await rpc.tasks.preview({ botId: task.botId }));
                    })
                  }
                >
                  <Trans>Refresh desktop preview</Trans>
                </Button>
                {preview ? (
                  <img
                    className="mt-3 w-full rounded border border-border"
                    src={`data:${preview.mimeType};base64,${preview.imageBase64}`}
                    alt={t`Desktop preview`}
                  />
                ) : null}
              </div>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Trans>Select a task</Trans>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
