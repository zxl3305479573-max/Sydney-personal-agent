import type { RpcInput, RpcPath, SpaceBot, SpaceGroup } from "@rakazo/contracts";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useState } from "react";
import { Alert } from "react-native";
import type { BotOrganizationUpdate } from "../components/bot-organize-modal";
import type {
  ApiRequestContext,
  MobileBot,
  MobileBotSection,
  MobileGroup,
  MobileSpace,
  RpcArgs,
} from "./api";
import {
  captureApiRequestContext,
  currentApiBase,
  loadSessionToken,
  rpc,
  selectedSpaceId,
} from "./api";
import { notifyArchivedChatsChanged } from "./archived-chats";
import { confirmDeleteBot, confirmDeleteGroup } from "./bot-lifecycle";
import { confirmDeleteSection } from "./confirm-delete-section";
import { useI18n } from "./i18n";
import type { InboxChatKind, InboxRowAction, PinOverride } from "./inbox-swipe";
import { chatTarget, createLatestQueue, unreadOverrideKey } from "./inbox-swipe";
import { afterChatNotifyChange, dismissThreadNotifications } from "./live-notifications";
import { removeFromSearchInbox } from "./search-inbox";
import { promptSectionName } from "./section-name-prompt";
import { currentSessionGeneration } from "./session";
import { threadSessionCache } from "./thread-session-cache";
import { errorText } from "./user-error";

/** Sends a request about a chat to that chat's space without switching to it. */
async function chatRequestContext(
  spaceId: string | undefined,
): Promise<ApiRequestContext | undefined> {
  if (!spaceId || spaceId === selectedSpaceId()) return undefined;
  const context = await captureApiRequestContext();
  return { ...context, headers: { ...context.headers, "x-rakazo-space-id": spaceId } };
}

export async function chatRpc<P extends RpcPath>(
  spaceId: string | undefined,
  proc: P,
  body: RpcInput<P>,
) {
  const requestContext = await chatRequestContext(spaceId);
  return requestContext
    ? rpc(proc, ...([body, { requestContext, skipSpaceAuthRecovery: true }] as RpcArgs<P>))
    : rpc(proc, ...([body] as RpcArgs<P>));
}

type ListUpdate<T> = Dispatch<SetStateAction<T[]>>;

/** Row actions on inbox chats: read state, pin, archive, delete, organize and sections. */
export function useInboxChatActions({
  loadBots,
  setBots,
  setGroups,
  setSpaces,
  botSections,
  userId,
}: {
  loadBots: () => Promise<unknown>;
  setBots: ListUpdate<MobileBot>;
  setGroups: ListUpdate<MobileGroup>;
  setSpaces: ListUpdate<MobileSpace>;
  botSections: MobileBotSection[];
  userId?: string;
}) {
  const { t } = useI18n();
  const [unreadOverrides, setUnreadOverrides] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );
  // Chats whose archive is in flight, by unreadOverrideKey; hidden until it settles.
  const [archiving, setArchiving] = useState<ReadonlySet<string>>(() => new Set());
  // One path for the long-press sheet and the swipe actions.
  const [sendReadState] = useState(() => createLatestQueue<boolean>());
  const [pinOverrides, setPinOverrides] = useState<ReadonlyMap<string, PinOverride>>(
    () => new Map(),
  );
  const [sendPinState] = useState(() => createLatestQueue<boolean>());
  const updatePin = useCallback(
    (kind: InboxChatKind, chat: MobileBot | MobileGroup | SpaceBot | SpaceGroup, pinned: boolean) => {
      const key = unreadOverrideKey(kind, chat.id);
      const generation = currentSessionGeneration();
      const apiBase = currentApiBase();
      const spaceId = chat.spaceId ?? selectedSpaceId() ?? undefined;
      const queueKey = JSON.stringify([generation, apiBase, spaceId, key]);
      const matches = (entry: PinOverride | undefined) =>
        entry?.generation === generation && entry.apiBase === apiBase && entry.spaceId === spaceId;
      const isCurrent = () =>
        generation === currentSessionGeneration() && apiBase === currentApiBase();
      setPinOverrides((current) =>
        new Map(current).set(key, { pinned, generation, apiBase, spaceId }),
      );
      void sendPinState(
        queueKey,
        pinned,
        async (nextPinned) => {
          const context = await captureApiRequestContext();
          if (!isCurrent() || context.sessionGeneration !== generation) return;
          const headers = { ...context.headers };
          if (spaceId) headers["x-rakazo-space-id"] = spaceId;
          else delete headers["x-rakazo-space-id"];
          await rpc(`${kind}s/update`, { ...chatTarget(kind, chat.id), pinned: nextPinned }, {
            requestContext: { ...context, headers },
            skipSpaceAuthRecovery: true,
          });
          if (!isCurrent()) return;
          const patch = <T extends { id: string; pinned?: boolean }>(items: T[]) =>
            items.map((item) => (item.id === chat.id ? { ...item, pinned: nextPinned } : item));
          if (!spaceId || selectedSpaceId() === spaceId) {
            if (kind === "bot") setBots(patch);
            else setGroups(patch);
          }
          setSpaces((current) =>
            current.map((space) =>
              space.id !== spaceId
                ? space
                : kind === "bot"
                  ? { ...space, bots: patch(space.bots) }
                  : { ...space, groups: patch(space.groups) },
            ),
          );
        },
        () => {
          if (isCurrent()) void loadBots().catch(() => undefined);
          setPinOverrides((current) => {
            if (!matches(current.get(key))) return current;
            const next = new Map(current);
            next.delete(key);
            return next;
          });
        },
      ).catch((error: unknown) => {
        if (isCurrent()) Alert.alert(t("Could not update chat"), errorText(error, t("Try again.")));
      });
    },
    [loadBots, sendPinState, setBots, setGroups, setSpaces, t],
  );
  const updateChat = useCallback(
    async (
      kind: InboxChatKind,
      chat: MobileBot | MobileGroup | SpaceBot | SpaceGroup,
      update: BotOrganizationUpdate,
    ) => {
      if (update.pinned !== undefined && Object.keys(update).length === 1) {
        updatePin(kind, chat, update.pinned);
        return;
      }
      await chatRpc(chat.spaceId, `${kind}s/update`, { ...chatTarget(kind, chat.id), ...update });
      if (kind === "bot" && update.notifyOnFinish !== undefined) {
        await afterChatNotifyChange(
          currentApiBase(),
          await loadSessionToken(),
          selectedSpaceId() ?? "",
          {
            botId: chat.id,
            threadId: "threadId" in chat ? chat.threadId : undefined,
            notify: update.notifyOnFinish,
          },
        );
      }
      await loadBots();
    },
    [loadBots, updatePin],
  );
  const runRowAction = useCallback(
    async (
      kind: InboxChatKind,
      chat: MobileBot | MobileGroup | SpaceBot | SpaceGroup,
      action: InboxRowAction,
    ) => {
      if (action === "read" || action === "unread") {
        const key = unreadOverrideKey(kind, chat.id);
        // Queued changes belong to the session and the chat's own Space.
        const spaceId = chat.spaceId ?? selectedSpaceId();
        const session = currentSessionGeneration();
        const apiBase = currentApiBase();
        const target = chatTarget(kind, chat.id);
        const cacheScope =
          userId && spaceId ? { apiBase, sessionGeneration: session, userId, spaceId } : null;
        const unreadToken = cacheScope
          ? threadSessionCache.beginUnreadWrite(cacheScope, target, action === "unread")
          : null;
        setUnreadOverrides((current) => new Map(current).set(key, action === "unread"));
        if (action === "read") {
          void dismissThreadNotifications(
            kind === "group"
              ? { groupId: chat.id }
              : "threadId" in chat && chat.threadId
                ? { threadId: chat.threadId }
                : { botId: chat.id },
          ).catch(() => undefined);
        }
        await sendReadState(
          key,
          action === "unread",
          async (unread) => {
            const context = await captureApiRequestContext();
            if (context.sessionGeneration !== session) return;
            const headers = { ...context.headers };
            if (spaceId) headers["x-rakazo-space-id"] = spaceId;
            else delete headers["x-rakazo-space-id"];
            await rpc(unread ? "threads/markUnread" : "threads/markRead", target, {
              requestContext: { ...context, headers },
            });
            const mark = <T extends { id: string; unread: boolean }>(chats: T[]) =>
              chats.map((item) => (item.id === chat.id ? { ...item, unread } : item));
            if (!spaceId || selectedSpaceId() === spaceId) {
              if (kind === "bot") setBots(mark);
              else setGroups(mark);
            }
            if (spaceId) {
              setSpaces((current) =>
                current.map((space) =>
                  space.id !== spaceId
                    ? space
                    : kind === "bot"
                      ? { ...space, bots: mark(space.bots) }
                      : { ...space, groups: mark(space.groups) },
                ),
              );
            }
            if (cacheScope && unreadToken !== null) {
              threadSessionCache.finishUnreadWrite(cacheScope, target, unreadToken);
            }
            await loadBots();
          },
          // The override stays until the last queued change for this chat is done.
          () =>
            setUnreadOverrides((current) => {
              const next = new Map(current);
              next.delete(key);
              return next;
            }),
        ).catch((err) => {
          if (cacheScope && unreadToken !== null) {
            threadSessionCache.abortUnreadWrite(cacheScope, target, unreadToken);
          }
          // A change from a session that has since ended is dropped quietly.
          if (session !== currentSessionGeneration()) return;
          Alert.alert(t("Could not update chat"), errorText(err, t("Try again.")));
        });
        return;
      }
      // The row goes at the tap. A failure puts it back where it was; a success drops it here
      // too, so the row stays gone even if the reload after it fails.
      if (action === "archive") {
        const key = unreadOverrideKey(kind, chat.id);
        const settle = () =>
          setArchiving((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        setArchiving((current) => new Set(current).add(key));
        try {
          await chatRpc(chat.spaceId, `${kind}s/archive`, chatTarget(kind, chat.id));
          const others = <T extends { id: string }>(chats: T[]) =>
            chats.filter((item) => item.id !== chat.id);
          if (kind === "bot") setBots(others);
          else setGroups(others);
          setSpaces((current) =>
            current.map((space) =>
              kind === "bot"
                ? { ...space, bots: others(space.bots) }
                : { ...space, groups: others(space.groups) },
            ),
          );
          removeFromSearchInbox(chat.id);
          notifyArchivedChatsChanged();
        } catch (err) {
          settle();
          Alert.alert(
            kind === "bot" ? t("Could not archive bot") : t("Could not update chat"),
            errorText(err, t("Try again.")),
          );
        }
        try {
          await loadBots();
        } finally {
          settle();
        }
        return;
      }
      // The same confirmation as the chat's own menu; the row goes once the server deletes it.
      if (action === "delete") {
        const deleted = () => {
          notifyArchivedChatsChanged();
          void loadBots();
        };
        if (kind === "bot") confirmDeleteBot({ id: chat.id, name: chat.name }, deleted);
        else confirmDeleteGroup({ id: chat.id, name: chat.name }, deleted);
        return;
      }
      await updateChat(kind, chat, { pinned: action === "pin" }).catch((err) =>
        Alert.alert(t("Could not update chat"), errorText(err, t("Try again."))),
      );
    },
    [loadBots, sendReadState, setBots, setGroups, setSpaces, t, updateChat, userId],
  );
  const botAction = useCallback(
    (action: InboxRowAction, bot: MobileBot | SpaceBot) => void runRowAction("bot", bot, action),
    [runRowAction],
  );
  const groupAction = useCallback(
    (action: InboxRowAction, group: MobileGroup | SpaceGroup) =>
      void runRowAction("group", group, action),
    [runRowAction],
  );
  const createSection = useCallback(
    async (kind: InboxChatKind, chatId: string, name: string, spaceId?: string) => {
      await chatRpc(spaceId, "botSections/create", { [`${kind}Id`]: chatId, name });
      await loadBots();
    },
    [loadBots],
  );
  const renameSection = useCallback(
    async (sectionId: string, name: string, spaceId?: string) => {
      await chatRpc(spaceId, "botSections/update", { sectionId, name });
      await loadBots();
    },
    [loadBots],
  );
  // The iOS row menu changes the chat in place, so failures use the native alert.
  const organizeFromMenu = useCallback(
    (
      kind: InboxChatKind,
      chat: MobileBot | MobileGroup | SpaceBot | SpaceGroup,
      update: BotOrganizationUpdate,
    ) =>
      void updateChat(kind, chat, update).catch((err) =>
        Alert.alert(t("Could not update chat"), errorText(err, t("Try again."))),
      ),
    [t, updateChat],
  );
  const editSectionFromMenu = useCallback(
    (
      kind: InboxChatKind,
      chat: MobileBot | MobileGroup | SpaceBot | SpaceGroup,
      mode: "create" | "rename",
    ) => {
      const current =
        mode === "rename" ? botSections.find((section) => section.id === chat.sectionId) : null;
      if (mode === "rename" && !current) return;
      promptSectionName({
        title: current ? t("Rename section") : t("New section"),
        cancelLabel: t("Cancel"),
        submitLabel: current ? t("Save") : t("Create"),
        defaultValue: current?.name,
        onSubmit: (name) =>
          void (
            current ? renameSection(current.id, name) : createSection(kind, chat.id, name)
          ).catch((err) =>
            Alert.alert(t("Could not update chat"), errorText(err, t("Try again."))),
          ),
      });
    },
    [botSections, createSection, renameSection, t],
  );

  const deleteSection = useCallback(
    (section: { id: string; name: string }) => {
      confirmDeleteSection(section, t, () => {
        void (async () => {
          try {
            await rpc("botSections/remove", { sectionId: section.id });
            await loadBots();
          } catch (err) {
            Alert.alert(t("Could not delete section"), errorText(err, t("Try again.")));
          }
        })();
      });
    },
    [loadBots, t],
  );
  return {
    unreadOverrides,
    pinOverrides,
    archiving,
    updateChat,
    runRowAction,
    botAction,
    groupAction,
    createSection,
    renameSection,
    organizeFromMenu,
    editSectionFromMenu,
    deleteSection,
  };
}
