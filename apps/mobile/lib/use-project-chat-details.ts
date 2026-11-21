import type { RpcOutput } from "@rakazo/contracts";
import { loadProjectBotIdentity, parseModelOptionKey } from "@rakazo/core";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { AppState } from "react-native";
import type { MobileMe, MobileModel, MobileModelCredential } from "./api";
import { rpc } from "./api";
import { chatModelDisplayName, chatModelPickerChoices, chatModelSelectionKey } from "./chat-model";
import { chatModelMenuActions } from "./chat-model-menu";
import { useI18n } from "./i18n";
import { projectRequestOptions, projectScopeKey } from "./project-scope";
import { errorText } from "./user-error";

type ProjectBot = RpcOutput<"projectWorkspaces/getBot">;
type ProjectBotIdentity = RpcOutput<"projectWorkspaces/roster">["bots"][number] & {
  botId: string;
  pinned?: boolean;
  notifyOnFinish?: boolean;
  archivedAt?: string | null;
};
type ProjectGroup = RpcOutput<"projectWorkspaces/conversations">["groups"][number];

export function useProjectChatDetails(
  projectId: string,
  botId: string | undefined,
  groupId: string | undefined,
  scope: string,
  enabled: boolean,
) {
  const { t } = useI18n();
  const [projectName, setProjectName] = useState<string>();
  const [botIdentity, setBotIdentity] = useState<ProjectBotIdentity>();
  const [groupIdentity, setGroupIdentity] = useState<ProjectGroup>();
  const [bot, setBot] = useState<ProjectBot>();
  const [canEditBot, setCanEditBot] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [me, setMe] = useState<MobileMe | null>(null);
  const [catalog, setCatalog] = useState<MobileModel[]>([]);
  const [credentials, setCredentials] = useState<MobileModelCredential[]>([]);
  const [modelError, setModelError] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState(false);
  const saving = useRef(false);
  const active = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      active.current = true;
      setCanEditBot(false);
      setCanManage(false);
      const controller = new AbortController();
      const current = () => !controller.signal.aborted && scope === projectScopeKey();
      let reading = false;
      let timer: ReturnType<typeof setInterval> | undefined;
      let foreground: ReturnType<typeof AppState.addEventListener> | undefined;
      void projectRequestOptions(scope)
        .then((options) => {
          if (!current()) return;
          const request = { ...options, signal: controller.signal };
          const refresh = async () => {
            if (!current() || reading) return;
            reading = true;
            try {
              void rpc("projectWorkspaces/get", { id: projectId }, request)
                .then((project) => {
                  if (current()) setProjectName(project.name);
                })
                .catch(() => undefined);
              if (botId) {
                const [identity, settings] = await Promise.all([
                  loadProjectBotIdentity(
                    botId,
                    (afterBotId) => rpc("projectWorkspaces/roster", { id: projectId, afterBotId }, request),
                    controller.signal,
                  ),
                  rpc("projectWorkspaces/getBot", { projectId, botId, includeArchived: true }, request),
                ]);
                if (current()) {
                  setBotIdentity({ ...settings, ...identity, botId: settings.id });
                  setBot(settings);
                }
              } else if (groupId) {
                const page = await rpc("projectWorkspaces/conversations", { projectId, archived: false }, request);
                let group = page.groups.find((entry) => entry.id === groupId);
                if (!group) {
                  const archived = await rpc("projectWorkspaces/conversations", { projectId, archived: true }, request);
                  group = archived.groups.find((entry) => entry.id === groupId);
                }
                if (current()) setGroupIdentity(group);
              }
              if (current()) setIdentityError(false);
            } catch {
              if (current()) setIdentityError(true);
            } finally {
              reading = false;
            }
          };
          refreshRef.current = refresh;
          void refresh();
          timer = setInterval(() => {
            if (AppState.currentState === "active") void refresh();
          }, 15_000);
          foreground = AppState.addEventListener("change", (state) => {
            if (state === "active") void refresh();
          });
          void rpc("projectWorkspaces/conversationCapabilities", undefined, request)
              .then(async (capabilities) => {
                if (!current()) return;
                setCanEditBot(capabilities.botSettings === true);
                setCanManage(capabilities.chatManagement === true);
                if (!botId || !capabilities.botSettings) return;
                const [profile, models, connected] = await Promise.all([
                  rpc("me", undefined, request),
                  rpc("models/list", undefined, request),
                  rpc("models/credentials", undefined, request),
                ]);
                if (!current()) return;
                setMe(profile);
                setCatalog(models);
                setCredentials(connected);
                setModelError(null);
              })
              .catch(() => {
                if (current()) {
                  setCanEditBot(false);
                  setCanManage(false);
                  setModelError(t("Could not load model settings"));
                }
              });
        })
        .catch(() => {
          if (current()) setIdentityError(true);
        });
      return () => {
        active.current = false;
        refreshRef.current = async () => {};
        controller.abort();
        if (timer) clearInterval(timer);
        foreground?.remove();
      };
    }, [botId, enabled, groupId, projectId, scope, t]),
  );

  const selectionKey = bot ? chatModelSelectionKey(catalog, bot) : "";
  async function selectModel(key: string) {
    if (!enabled || !botId || !canEditBot || !bot || saving.current || key === selectionKey) return;
    const selected = key ? parseModelOptionKey(key) : null;
    if (key && !selected) return;
    saving.current = true;
    try {
      const request = await projectRequestOptions(scope);
      if (!active.current || scope !== projectScopeKey()) return;
      const saved = await rpc(
        "projectWorkspaces/updateBot",
        {
          projectId,
          bot: {
            botId,
            modelProvider: selected?.provider ?? null,
            modelId: selected?.modelId ?? null,
            thinkingLevel: null,
          },
        },
        request,
      );
      if (active.current && scope === projectScopeKey()) {
        setBot(saved);
        setModelError(null);
      }
    } catch (cause) {
      if (active.current && scope === projectScopeKey())
        setModelError(errorText(cause, t("Could not save changes")));
    } finally {
      saving.current = false;
    }
  }
  return {
    bot,
    projectName,
    botIdentity,
    groupIdentity,
    canEditBot,
    canManage,
    refresh: () => refreshRef.current(),
    modelError,
    identityError,
    modelLabel: chatModelDisplayName(me, catalog, bot),
    modelActions:
      botId && bot && canEditBot
        ? chatModelMenuActions(
            chatModelPickerChoices(me, catalog, credentials, selectionKey, t),
            selectionKey,
          )
        : undefined,
    selectModel,
  };
}
