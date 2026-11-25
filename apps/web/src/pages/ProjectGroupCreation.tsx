import { useLingui } from "@lingui/react/macro";
import {
  defaultGroupName,
  GROUP_MEMBER_MAX,
  GROUP_MEMBER_MIN,
  GROUP_NAME_MAX_LENGTH,
} from "@rakazo/contracts";
import { newClientId } from "@rakazo/core";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@rakazo/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { queryClient, useSpaceQueries } from "../lib/query";
import { createSpaceRpc, selectedSpaceId } from "../lib/rpc";

type Member = { id: string; name: string };

export function ProjectGroupCreation({
  workspaceId,
  spaceId,
}: {
  workspaceId: string;
  spaceId: string | null;
}) {
  const { i18n } = useLingui();
  const text = (chinese: string, english: string) =>
    i18n.locale.startsWith("zh") ? chinese : english;
  const queries = useSpaceQueries();
  const capability = useQuery(queries.projectWorkspaces.groupCreationCapability.queryOptions());
  const canCreate = !capability.error && capability.data?.createGroup === true;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null);
  const after = cursors.at(-1);
  const roster = useQuery({
    ...queries.projectWorkspaces.roster.queryOptions({
      input: { id: workspaceId, afterBotId: after },
    }),
    enabled: open && canCreate,
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function createGroup() {
    if (
      !canCreate ||
      inFlight.current ||
      selectedSpaceId() !== spaceId ||
      selected.length < GROUP_MEMBER_MIN ||
      selected.length > GROUP_MEMBER_MAX
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const group = {
      name: name.trim() || defaultGroupName(selected.map((member) => member.name)),
      botIds: selected.map((member) => member.id),
    };
    const fingerprint = JSON.stringify([workspaceId, group]);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, id: newClientId() };
    const requestId = attempt.current.id;
    try {
      await createSpaceRpc(spaceId).projectWorkspaces.createGroup({
        projectId: workspaceId,
        requestId,
        group,
      });
      if (!mounted.current || selectedSpaceId() !== spaceId) return;
      attempt.current = null;
      setSelected([]);
      setName("");
      setCursors([]);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: queries.projectWorkspaces.roster.key() });
    } catch {
      if (mounted.current && selectedSpaceId() === spaceId)
        setError(
          text(
            "创建未确认。请使用相同内容重试，或返回项目名单确认。",
            "Creation was not confirmed. Retry with the same details or check the project list.",
          ),
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" disabled={!canCreate} onClick={() => setOpen(true)}>
        {text("新建群聊", "New group chat")}
      </Button>
      <Dialog
        open={open && canCreate}
        onOpenChange={(next) => {
          if (!inFlight.current) setOpen(next);
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>{text("新建项目群聊", "New project group")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {text(
              `选择 ${GROUP_MEMBER_MIN}–${GROUP_MEMBER_MAX} 个项目 Bot，已选 ${selected.length} 个。`,
              `Choose ${GROUP_MEMBER_MIN}–${GROUP_MEMBER_MAX} project bots; ${selected.length} selected.`,
            )}
          </p>
          {roster.isPending ? <p role="status">{text("正在加载…", "Loading…")}</p> : null}
          {roster.error ? (
            <div role="alert">
              <p>{text("无法加载项目成员。", "Could not load project members.")}</p>
              <Button type="button" variant="secondary" onClick={() => void roster.refetch()}>
                {text("重试", "Retry")}
              </Button>
            </div>
          ) : null}
          {!roster.error
            ? roster.data?.bots.map((member) => {
                const checked = selected.some((item) => item.id === member.id);
                return (
                  <label key={member.id} className="flex items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy || (!checked && selected.length >= GROUP_MEMBER_MAX)}
                      onChange={() =>
                        setSelected((old) =>
                          checked ? old.filter((item) => item.id !== member.id) : [...old, member],
                        )
                      }
                    />
                    <span className="break-words">{member.name}</span>
                  </label>
                );
              })
            : null}
          <div className="flex flex-wrap gap-2">
            {cursors.length ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy || roster.isFetching}
                onClick={() => setCursors((old) => (old.at(-1) === after ? old.slice(0, -1) : old))}
              >
                {text("上一页", "Previous")}
              </Button>
            ) : null}
            {roster.data?.nextBotId && !roster.error ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy || roster.isFetching}
                onClick={() => {
                  const next = roster.data?.nextBotId;
                  if (next) setCursors((old) => (old.at(-1) === after ? [...old, next] : old));
                }}
              >
                {text("下一页", "Next")}
              </Button>
            ) : null}
          </div>
          <label htmlFor="project-group-name" className="flex flex-col gap-2">
            {text("群聊名称（可选）", "Group name (optional)")}
            <Input
              id="project-group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={GROUP_NAME_MAX_LENGTH}
              disabled={busy}
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {text("取消", "Cancel")}
            </Button>
            <Button
              type="button"
              disabled={
                busy ||
                roster.isFetching ||
                Boolean(roster.error) ||
                selected.length < GROUP_MEMBER_MIN
              }
              onClick={() => void createGroup()}
            >
              {busy ? text("正在创建…", "Creating…") : text("创建群聊", "Create group")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
