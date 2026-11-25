import type { RpcInput } from "@rakazo/contracts";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import { Alert } from "react-native";
import type { ThreadHeaderAction } from "../components/thread-header-right";
import { rpc } from "./api";
import { confirmDeleteBot, confirmDeleteGroup } from "./bot-lifecycle";
import { useI18n } from "./i18n";
import { projectRequestOptions, projectScopeKey } from "./project-scope";
import { errorText } from "./user-error";

export type ProjectActionTarget = {
  kind: "bot" | "group";
  id: string;
  name: string;
  pinned?: boolean;
  notifyOnFinish?: boolean;
  archivedAt?: string | null;
};
type Action = RpcInput<"projectWorkspaces/conversationAction">["action"];

export function useProjectChatActions({
  projectId, scope, target, enabled, onChanged,
}: {
  projectId: string;
  scope: string;
  target?: ProjectActionTarget;
  enabled: boolean;
  onChanged: (action: Action | "update") => void;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const focused = useRef(false);
  const pending = useRef(false);
  const requestKey = JSON.stringify([projectId, scope, target?.kind, target?.id]);
  const activeKey = useRef<string | undefined>(undefined);
  activeKey.current = enabled ? requestKey : undefined;
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));
  const current = () => focused.current && scope === projectScopeKey() && activeKey.current === requestKey;
  const input = target?.kind === "bot" ? { botId: target.id } : { groupId: target?.id ?? "" };
  const perform = async (action: Action, deleteMemories = false) => {
    if (!target || !current() || pending.current) return;
    pending.current = true;
    try {
      const options = await projectRequestOptions(scope);
      if (!current()) return;
      const result = await rpc("projectWorkspaces/conversationAction", {
        projectId, ...input, action, deleteMemories,
      }, options);
      if (!current()) return;
      onChanged(action);
      const duplicate = result.bot ? { botId: result.bot.id } : result.group ? { groupId: result.group.id } : null;
      if (duplicate)
        router.push({ pathname: "/projects/[workspaceId]/chat", params: { workspaceId: projectId, scope, ...duplicate } });
    } finally {
      pending.current = false;
    }
  };
  const report = (work: () => Promise<unknown>) => {
    void work().catch((error) => {
      if (current()) Alert.alert(t("Could not update chat"), errorText(error, t("Try again.")));
    });
  };
  const update = (patch: { pinned?: boolean; notifyOnFinish?: boolean }) => report(async () => {
    if (!target || !current() || pending.current) return;
    pending.current = true;
    try {
      const options = await projectRequestOptions(scope);
      if (!current()) return;
      if (target.kind === "bot")
        await rpc("projectWorkspaces/updateBot", { projectId, bot: { botId: target.id, ...patch } }, options);
      else
        await rpc("projectWorkspaces/updateGroup", { projectId, group: { groupId: target.id, pinned: patch.pinned } }, options);
      if (current()) onChanged("update");
    } finally { pending.current = false; }
  });
  const openSettings = () => {
    if (!target || !current()) return;
    router.push({ pathname: target.kind === "bot" ? "/bot-settings" : "/group-settings", params: { ...input, projectId, scope } });
  };
  const actions: ThreadHeaderAction[] = [];
  const openProfile = () => {
    if (target?.kind !== "bot" || !current()) return;
    router.push({ pathname: "/bot-profile", params: { botId: target.id, name: target.name, projectId, scope } });
  };
  if (!target || !enabled) return { actions, openSettings, openProfile };
  if (target.archivedAt) {
    actions.push({ text: t("Restore"), onPress: () => report(() => perform("restore")) });
  } else {
    if (target.kind === "bot") actions.push({ text: t("Profile"), onPress: openProfile });
    actions.push(
      { text: t(target.kind === "bot" ? "Chat settings" : "Group settings"), onPress: openSettings },
      { text: t(target.pinned ? "Unpin" : "Pin"), onPress: () => update({ pinned: !target.pinned }) },
    );
    if (target.kind === "bot") actions.push({
      text: t(target.notifyOnFinish === false ? "Enable notifications" : "Silence notifications"),
      onPress: () => update({ notifyOnFinish: target.notifyOnFinish === false }),
    });
    actions.push(
      { text: t("Mark as unread"), onPress: () => report(() => perform("unread")) },
      { text: t("Duplicate"), onPress: () => report(() => perform("duplicate")) },
      {
        text: t("Clear conversation"), destructive: true,
        onPress: () => Alert.alert(t("Clear conversation?"), t("This removes every message and stops current work. The bot, computer, memory, and routines are kept."), [
          { text: t("Cancel"), style: "cancel" },
          { text: t("Clear"), style: "destructive", onPress: () => report(() => perform("clear")) },
        ]),
      },
      { text: t("Archive"), onPress: () => report(() => perform("archive")) },
    );
  }
  actions.push({
    text: t("Delete…"), destructive: true,
    onPress: () => {
      if (!current()) return;
      if (target.kind === "bot") confirmDeleteBot(target, () => {}, current, undefined, {
        remove: async (deleteMemories) => { await perform("remove", deleteMemories); },
        message: locale.startsWith("zh")
          ? "将永久删除此 Bot 的对话、应用内文件和定时任务，不删除项目绑定目录中的原文件。选择保留记忆会将此 Bot 的记忆归档到你在当前空间的个人记忆中；选择同时删除记忆则一并删除。"
          : "Its conversation, app files, and routines will be permanently deleted. Files in the bound project directory stay. Keeping memories moves this Bot’s memories to your personal memory in the current Space. Otherwise they are deleted too.",
      });
      else confirmDeleteGroup(target, () => {}, { remove: async () => { await perform("remove"); }, current });
    },
  });
  return { actions, openSettings, openProfile };
}
