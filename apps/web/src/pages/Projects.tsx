import { useLingui } from "@lingui/react/macro";
import type { ProjectWorkspaceCursor } from "@rakazo/contracts";
import { newClientId } from "@rakazo/core";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Button, Input,
} from "@rakazo/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Folder, FolderOpen, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { queryClient, useQueryUserId, useSpaceQueries } from "../lib/query";
import { createSpaceRpc, selectedSpaceId } from "../lib/rpc";
import { errorText } from "../lib/user-error";
import { WindowChrome } from "./WindowChrome";
import { ProjectGroupCreation } from "./ProjectGroupCreation";
import { ProjectDirectory } from "./ProjectDirectory";
import type { CreateBotDialogInput } from "./shell/create-bot-dialog";
import { CreateBotDialog } from "./shell/create-bot-dialog";

export function ProjectsPage() {
  const userId = useQueryUserId();
  const spaceId = selectedSpaceId();
  return <ProjectBrowser key={JSON.stringify([userId, spaceId])} spaceId={spaceId} />;
}

function ProjectBrowser({ spaceId }: { spaceId: string | null }) {
  const { i18n } = useLingui();
  const text = (chinese: string, english: string) => i18n.locale.startsWith("zh") ? chinese : english;
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const location = useLocation();
  const queries = useSpaceQueries();
  const navigate = useNavigate();
  const mounted = useRef(false);
  const creatingRef = useRef(false);
  const removingRef = useRef(false);
  const currentWorkspace = useRef(workspaceId);
  currentWorkspace.current = workspaceId;
  const currentLocation = useRef(location.key);
  currentLocation.current = location.key;
  const attempt = useRef<{ name: string; id: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [cursors, setCursors] = useState<ProjectWorkspaceCursor[]>([]);
  const after = cursors.at(-1);
  const list = useQuery({
    ...queries.projectWorkspaces.list.queryOptions({ input: { after } }),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const capabilities = useQuery(queries.projectWorkspaces.capabilities.queryOptions());
  const canCreate = !capabilities.error && capabilities.data?.create === true;
  const canRemove = !capabilities.error && capabilities.data?.removeEmpty === true;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function createProject() {
    const trimmed = name.trim();
    if (!trimmed || !canCreate || creatingRef.current || selectedSpaceId() !== spaceId) return;
    const openedLocation = currentLocation.current;
    creatingRef.current = true;
    setCreating(true);
    setCreateError(null);
    try {
      if (attempt.current?.name !== trimmed) attempt.current = { name: trimmed, id: newClientId() };
      const project = await createSpaceRpc(spaceId).projectWorkspaces.create({
        id: attempt.current.id,
        name: trimmed,
      });
      if (!mounted.current || selectedSpaceId() !== spaceId) return;
      attempt.current = null;
      setName("");
      setShowCreate(false);
      void list.refetch();
      if (currentLocation.current === openedLocation)
        navigate(`/app/projects/${encodeURIComponent(project.id)}`);
    } catch (cause) {
      if (mounted.current && selectedSpaceId() === spaceId)
        setCreateError(errorText(cause, text("无法创建项目", "Could not create project")));
    } finally {
      creatingRef.current = false;
      if (mounted.current) setCreating(false);
    }
  }

  async function removeProject() {
    const target = removeTarget;
    if (!target || !canRemove || removingRef.current || currentWorkspace.current !== target.id ||
      selectedSpaceId() !== spaceId) return;
    removingRef.current = true;
    setRemoving(true);
    setRemoveError(null);
    try {
      await createSpaceRpc(spaceId).projectWorkspaces.removeEmpty({
        id: target.id, confirmRemoveAppData: true,
      });
      if (!mounted.current || selectedSpaceId() !== spaceId) return;
      setRemoveTarget(null);
      void list.refetch();
      if (currentWorkspace.current === target.id) navigate("/app/projects");
    } catch {
      if (mounted.current && selectedSpaceId() === spaceId && currentWorkspace.current === target.id)
        setRemoveError(text(
          "无法删除项目；项目可能包含内容，或请求结果尚未确认。请刷新后查看。",
          "Could not remove the project. It may contain data or the result may be unknown; refresh to check.",
        ));
    } finally {
      removingRef.current = false;
      if (mounted.current) setRemoving(false);
    }
  }
  const detail = useQuery({
    ...queries.projectWorkspaces.get.queryOptions({ input: { id: workspaceId ?? "" } }),
    enabled: Boolean(workspaceId),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  return (
    <main className="flex h-full min-h-0 flex-col" data-project-browser>
      <header className="app-drag flex shrink-0 flex-wrap items-center gap-4 border-b px-5 py-4">
        <WindowChrome />
        <Link to="/app" className="app-no-drag inline-flex min-h-11 items-center gap-2 rounded-xl px-3 hover:bg-muted">
          <ArrowLeft size={18} aria-hidden="true" />
          {text("首页", "Home")}
        </Link>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Folder size={22} aria-hidden="true" />{text("项目", "Projects")}
        </h1>
        <div className="app-no-drag ms-auto">
          <Button type="button" disabled={!canCreate || creating} aria-describedby="project-creation-status"
            onClick={() => setShowCreate((current) => !current)}>
            <Plus size={16} aria-hidden="true" />{text("新建项目", "New project")}
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <p id="project-creation-status" className="mb-5 text-sm text-muted-foreground" role="status">
          {canCreate
            ? text("选择项目后可查看独立成员与会话。", "Choose a project to view its members and conversations.")
            : text("项目创建和项目内对话暂未开放。", "Project creation and project conversations are not available yet.")}
        </p>
        {showCreate && canCreate ? (
          <form className="mb-5 flex flex-wrap items-end gap-3"
            onSubmit={(event) => { event.preventDefault(); void createProject(); }}>
            <label htmlFor="project-name" className="flex min-w-48 flex-col gap-2">
              {text("项目名称", "Project name")}
              <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)}
                maxLength={80} disabled={creating} />
            </label>
            <Button type="submit" disabled={creating || !name.trim()}>
              {creating ? text("正在创建…", "Creating…") : text("创建项目", "Create project")}
            </Button>
            {createError ? <p role="alert">{createError}</p> : null}
          </form>
        ) : null}
        <div className="grid gap-5 md:grid-cols-[minmax(220px,320px)_minmax(0,1fr)]">
          <section aria-label={text("项目列表", "Project list")} className="min-w-0 space-y-3">
            {list.isPending ? <p role="status">{text("正在加载项目…", "Loading projects…")}</p> : null}
            {list.error ? (
              <div role="alert" className="space-y-3">
                <p>{errorText(list.error, text("无法加载项目", "Could not load projects"))}</p>
                <Button type="button" variant="secondary" onClick={() => void list.refetch()}>{text("重试", "Retry")}</Button>
              </div>
            ) : null}
            {!list.isPending && !list.error && list.data?.items.length === 0 ? (
              <p className="text-muted-foreground">{text("此页没有项目。", "No projects on this page.")}</p>
            ) : null}
            {!list.error ? list.data?.items.map((project) => (
              <Link key={project.id} to={`/app/projects/${encodeURIComponent(project.id)}`}
                aria-current={workspaceId === project.id ? "page" : undefined}
                className={`sydney-list-surface flex min-h-16 items-center gap-3 rounded-2xl border p-4 hover:bg-muted ${workspaceId === project.id ? "border-primary" : "border-border"}`}>
                {workspaceId === project.id ? <FolderOpen size={28} aria-hidden="true" /> : <Folder size={28} aria-hidden="true" />}
                <span className="min-w-0 break-words font-medium" dir="auto">{project.name}</span>
              </Link>
            )) : null}
            <div className="flex flex-wrap gap-2">
              {cursors.length ? <Button type="button" variant="secondary" disabled={list.isFetching}
                onClick={() => setCursors((old) => old.slice(0, -1))}>{text("上一页", "Previous page")}</Button> : null}
              {list.data?.nextCursor && !list.error ? <Button type="button" variant="secondary" disabled={list.isFetching}
                onClick={() => {
                  const nextCursor = list.data?.nextCursor;
                  if (nextCursor) setCursors((old) => [...old, nextCursor]);
                }}>{text("下一页", "Next page")}</Button> : null}
            </div>
          </section>
          <section aria-label={text("项目详情", "Project details")} className="sydney-list-surface min-w-0 rounded-2xl border p-5">
            {!workspaceId ? <p className="text-muted-foreground">{text("选择一个项目查看。", "Choose a project to view.")}</p> : detail.isPending ? (
              <p role="status">{text("正在加载项目…", "Loading project…")}</p>
            ) : detail.error ? (
              <div role="alert" className="space-y-3">
                <p>{text("无法打开此项目，项目可能已移除或无权访问。", "This project could not be opened. It may have been removed or access may have changed.")}</p>
                <Button type="button" variant="secondary" onClick={() => void detail.refetch()}>{text("重试", "Retry")}</Button>
              </div>
            ) : detail.data ? (
              <>
                <h2 className="break-words text-xl font-semibold" dir="auto">{detail.data.name}</h2>
                <ProjectDirectory key={JSON.stringify([spaceId, detail.data.id])} projectId={detail.data.id} spaceId={spaceId} />
                <ProjectRoster key={detail.data.id} workspaceId={detail.data.id} />
                <div className="mt-5 flex flex-wrap gap-3">
                  <ProjectBotCreation key={detail.data.id} workspaceId={detail.data.id} spaceId={spaceId} />
                  <ProjectGroupCreation key={detail.data.id} workspaceId={detail.data.id} spaceId={spaceId} />
                  {canRemove ? <Button type="button" variant="secondary" disabled={removing}
                    onClick={() => { setRemoveError(null); setRemoveTarget({ id: detail.data.id, name: detail.data.name }); }}>
                    {text("删除空项目", "Remove empty project")}
                  </Button> : null}
                </div>
                <p className="mt-5 text-sm text-muted-foreground">
                  {text("点击项目 Bot 或群聊进入独立文字会话；入口由服务器能力控制。", "Choose a project bot or group for its text conversation when enabled by the server.")}
                </p>
              </>
            ) : null}
          </section>
        </div>
      </div>
      <AlertDialog open={Boolean(removeTarget && removeTarget.id === workspaceId)}
        onOpenChange={(open) => { if (!open && !removingRef.current) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{text("删除空项目？", "Remove empty project?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {text("只删除空项目记录，不删除电脑中的文件。", "Only an empty project record is removed; files on your computer are not deleted.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="break-words" dir="auto">{removeTarget?.name}</p>
          {removeError ? <p role="alert">{removeError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>{text("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={removing || !canRemove} onClick={(event) => {
              event.preventDefault();
              void removeProject();
            }}>
              {removing ? text("正在删除…", "Removing…") : text("删除", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function ProjectBotCreation({ workspaceId, spaceId }: { workspaceId: string; spaceId: string | null }) {
  const { i18n } = useLingui();
  const text = (chinese: string, english: string) => i18n.locale.startsWith("zh") ? chinese : english;
  const queries = useSpaceQueries();
  const capability = useQuery(queries.projectWorkspaces.conversationCapabilities.queryOptions());
  const canCreate = !capability.error && capability.data?.createBot === true;
  const [open, setOpen] = useState(false);
  const mounted = useRef(false);
  const creating = useRef(false);
  const attempt = useRef<{ fingerprint: string; spawnKey: string } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function createBot(identity: CreateBotDialogInput) {
    if (!canCreate || creating.current || selectedSpaceId() !== spaceId)
      throw new Error(text("项目不可用，请返回后重试。", "The project is unavailable. Return and try again."));
    const fingerprint = JSON.stringify([workspaceId, identity]);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, spawnKey: `desktop-create-${newClientId()}` };
    creating.current = true;
    try {
      await createSpaceRpc(spaceId).projectWorkspaces.createBot({
        projectId: workspaceId,
        bot: { ...identity, spawnKey: attempt.current.spawnKey, notifyOnFinish: true, computerMode: "team" },
      });
      if (!mounted.current || selectedSpaceId() !== spaceId) return;
      attempt.current = null;
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: queries.projectWorkspaces.roster.key() });
    } finally {
      creating.current = false;
    }
  }

  return (
    <>
      <Button type="button" disabled={!canCreate} onClick={() => setOpen(true)}>
        {text("新建 Bot", "New bot")}
      </Button>
      {open && canCreate ? <CreateBotDialog onCancel={() => setOpen(false)} onCreate={createBot} /> : null}
    </>
  );
}

function ProjectRoster({ workspaceId }: { workspaceId: string }) {
  const { i18n } = useLingui();
  const text = (chinese: string, english: string) => i18n.locale.startsWith("zh") ? chinese : english;
  const queries = useSpaceQueries();
  const capability = useQuery(queries.projectWorkspaces.conversationCapabilities.queryOptions());
  const canChat = !capability.error && capability.data?.createBot === true;
  const [botCursors, setBotCursors] = useState<string[]>([]);
  const [groupCursors, setGroupCursors] = useState<string[]>([]);
  const roster = useQuery({
    ...queries.projectWorkspaces.roster.queryOptions({
      input: { id: workspaceId, afterBotId: botCursors.at(-1), afterGroupId: groupCursors.at(-1) },
    }),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  if (roster.isPending) return <p className="mt-4" role="status">{text("正在加载项目成员…", "Loading project members…")}</p>;
  if (roster.error) return (
    <div className="mt-4" role="alert">
      <p>{text("无法加载项目成员。", "Could not load project members.")}</p>
      <Button type="button" variant="secondary" onClick={() => void roster.refetch()}>{text("重试", "Retry")}</Button>
    </div>
  );
  if (!roster.data) return null;
  const sections = [
    { kind: "botId", title: text("小伙伴", "Bots"), items: roster.data.bots, cursors: botCursors, setCursors: setBotCursors, next: roster.data.nextBotId },
    { kind: "groupId", title: text("群聊", "Group chats"), items: roster.data.groups, cursors: groupCursors, setCursors: setGroupCursors, next: roster.data.nextGroupId },
  ];
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {sections.map((section) => (
        <section key={section.title}>
          <h3 className="font-semibold">{section.title}</h3>
          <ul>{section.items.map((item) => <li key={item.id} className="break-words">
            {canChat ? <Link className="block rounded-lg px-2 py-2 hover:bg-muted"
              to={`/app/projects/${encodeURIComponent(workspaceId)}/chat?${section.kind}=${encodeURIComponent(item.id)}`}>
              {item.name}
            </Link> : <span className="block px-2 py-2">{item.name}</span>}
          </li>)}</ul>
          <div className="flex flex-wrap gap-2">
            {section.cursors.length ? <Button type="button" variant="secondary" disabled={roster.isFetching}
              onClick={() => section.setCursors((old) => old.slice(0, -1))}>{text("上一页", "Previous")}</Button> : null}
            {section.next ? <Button type="button" variant="secondary" disabled={roster.isFetching}
              onClick={() => {
                if (section.next) section.setCursors((old) => [...old, section.next!]);
              }}>{text("下一页", "Next")}</Button> : null}
          </div>
        </section>
      ))}
    </div>
  );
}
