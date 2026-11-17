import type { ProjectWorkspaceCursor, RpcOutput } from "@rakazo/contracts";
import { newClientId } from "@rakazo/core";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { GlassSurface } from "../components/glass-surface";
import { NativeActionButton } from "../components/native-action-button";
import { ProjectFolderCard } from "../components/project-folder-card";
import {
  captureApiRequestContext,
  isSpaceSelectionPending,
  rpc,
} from "../lib/api";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens } from "../lib/native";
import { projectScopeKey, subscribeProjectScope } from "../lib/project-scope";
import { useSideInsets } from "../lib/side-insets";
import { errorText } from "../lib/user-error";

export default function Projects() {
  const scopeKey = useSyncExternalStore(subscribeProjectScope, projectScopeKey);
  return <ProjectBrowser key={scopeKey} scopeKey={scopeKey} />;
}

function ProjectBrowser({ scopeKey }: { scopeKey: string }) {
  const router = useRouter();
  const { locale } = useI18n();
  const text = (chinese: string, english: string) => locale.startsWith("zh") ? chinese : english;
  const tokens = useMobileTokens();
  const sideInsets = useSideInsets();
  const [page, setPage] = useState<RpcOutput<"projectWorkspaces/list"> | null>(null);
  const [cursors, setCursors] = useState<ProjectWorkspaceCursor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createAvailable, setCreateAvailable] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createAttempt = useRef<{ name: string; id: string } | null>(null);
  const createInFlight = useRef(false);
  const focused = useRef(false);
  const focusGeneration = useRef(0);
  const after = cursors.at(-1);

  const createProject = async () => {
    const name = projectName.trim();
    if (!name || !createAvailable || createInFlight.current || !focused.current ||
      scopeKey !== projectScopeKey() || isSpaceSelectionPending()) return;
    const generation = focusGeneration.current;
    const current = () => focused.current && focusGeneration.current === generation &&
      scopeKey === projectScopeKey() && !isSpaceSelectionPending();
    createInFlight.current = true;
    setCreating(true);
    setCreateError(null);
    try {
      const requestContext = await captureApiRequestContext();
      if (!current()) return;
      if (createAttempt.current?.name !== name)
        createAttempt.current = { name, id: newClientId() };
      const project = await rpc("projectWorkspaces/create", { id: createAttempt.current.id, name }, {
        requestContext,
        skipSpaceAuthRecovery: true,
      });
      if (!current()) return;
      createAttempt.current = null;
      setProjectName("");
      router.push({ pathname: "/projects/[workspaceId]", params: { workspaceId: project.id, scope: scopeKey } });
    } catch (cause) {
      if (current())
        setCreateError(errorText(cause, text("无法创建项目", "Could not create project")));
    } finally {
      createInFlight.current = false;
      if (focused.current) setCreating(false);
    }
  };

  useFocusEffect(useCallback(() => {
    if (isSpaceSelectionPending()) return;
    let active = true;
    focused.current = true;
    focusGeneration.current += 1;
    if (!createInFlight.current) setCreating(false);
    const controller = new AbortController();
    const current = () => active && scopeKey === projectScopeKey() && !isSpaceSelectionPending();
    setLoading(true);
    setError(null);
    setCreateAvailable(false);
    void (async () => {
      try {
        const requestContext = await captureApiRequestContext();
        if (!current()) return;
        const options = { requestContext, signal: controller.signal, skipSpaceAuthRecovery: true };
        void rpc("projectWorkspaces/capabilities", undefined, options)
          .then((capabilities) => { if (current()) setCreateAvailable(capabilities.create === true); })
          .catch(() => { if (current()) setCreateAvailable(false); });
        const next = await rpc("projectWorkspaces/list", { after }, options);
        if (current()) setPage(next);
      } catch (cause) {
        if (current()) setError(errorText(cause, text("无法加载项目", "Could not load projects")));
      } finally {
        if (current()) setLoading(false);
      }
    })();
    return () => { active = false; focused.current = false; controller.abort(); };
  }, [scopeKey, after, attempt, locale]));

  return (
    <>
      <Stack.Screen options={{ title: text("项目", "Projects") }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic"
        style={[{ flex: 1, backgroundColor: tokens.background }, sideInsets]}
        contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: tokens.mutedForeground }}>
          {createAvailable
            ? text("项目内 Bot 和群聊尚未开放。", "Project bots and group chats are not available yet.")
            : text("项目创建及项目内 Bot 和群聊尚未开放。", "Project creation, bots and group chats are not available yet.")}
        </Text>
        <GlassSurface shape="roundedRectangle" cornerRadius={12}
          style={{ borderRadius: 12, padding: 14, gap: 12 }}
          fallbackStyle={{ backgroundColor: tokens.card, borderWidth: 1, borderColor: tokens.border }}>
          <Text accessibilityRole="header" style={{ color: tokens.foreground, fontWeight: "600" }}>
            {text("新建项目", "New project")}
          </Text>
          <TextInput
            value={projectName}
            maxLength={80}
            onChangeText={setProjectName}
            editable={createAvailable && !creating}
            placeholder={text("项目名称", "Project name")}
            placeholderTextColor={tokens.mutedForeground}
            returnKeyType="done"
            style={{ color: tokens.foreground, backgroundColor: native.fill, borderRadius: 10, padding: 12 }}
          />
          {createError ? <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>{createError}</Text> : null}
          <NativeActionButton label={creating ? text("正在创建…", "Creating…") : text("创建项目", "Create project")}
            disabled={!createAvailable || creating || !projectName.trim() || isSpaceSelectionPending()}
            onPress={() => void createProject()} />
        </GlassSurface>
        {isSpaceSelectionPending() ? <Text style={{ color: tokens.foreground }}>{text("正在切换空间…", "Switching space…")}</Text> : loading ? (
          <Text style={{ color: tokens.foreground }}>{text("正在加载项目…", "Loading projects…")}</Text>
        ) : error ? <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>{error}</Text> : (
          <View style={{ gap: 12 }}>
            {page?.items.length === 0 ? <Text style={{ color: tokens.mutedForeground }}>{text("此页没有项目。", "No projects on this page.")}</Text> : null}
            {page?.items.map((project) => (
              <ProjectFolderCard
                key={project.id}
                label={project.name}
                subtitle={text("打开项目", "Open project")}
                disabled={isSpaceSelectionPending()}
                onPress={() => {
                  if (scopeKey !== projectScopeKey() || isSpaceSelectionPending()) return;
                  router.push({ pathname: "/projects/[workspaceId]", params: { workspaceId: project.id, scope: scopeKey } });
                }}
              />
            ))}
          </View>
        )}
        {!isSpaceSelectionPending() ? <NativeActionButton label={text("刷新", "Refresh")} disabled={loading}
          prominence="quiet" onPress={() => setAttempt((old) => old + 1)} /> : null}
        <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
          {cursors.length ? <NativeActionButton label={text("上一页", "Previous page")} disabled={loading}
            prominence="quiet" onPress={() => setCursors((old) => old.slice(0, -1))} /> : null}
          {page?.nextCursor && !error ? <NativeActionButton label={text("下一页", "Next page")} disabled={loading}
            prominence="quiet" onPress={() => {
              const nextCursor = page?.nextCursor;
              if (nextCursor) setCursors((old) => [...old, nextCursor]);
            }} /> : null}
        </View>
      </ScrollView>
    </>
  );
}
