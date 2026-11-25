import type { AgentSkillCatalogEntry } from "@rakazo/contracts";
import {
  buildComposerMentionOptions,
  channelMessageSender,
  chatUserBubbleColors,
  isRunWaitingOnUser,
  isRunWorking,
  liveActivityLine,
  liveMessageComposing,
  memberName,
  newClientId,
  parseModelOptionKey,
  displayName as safeDisplayName,
} from "@rakazo/core";
import { fetchFresh, writeSaved } from "@rakazo/core/query";
import { botColors } from "@rakazo/ui-tokens";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, I18nManager, ImageBackground, Platform, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { readableGutters } from "../../lib/adaptive-layout";
import {
  captureApiRequestContext,
  currentApiBase,
  isSpaceSelectionPending,
  rpc,
  selectedSpaceId,
  spaceSelectionSeq,
} from "../../lib/api";
import { useAppForeground } from "../../lib/app-foreground";
import type { MobileArtifactTarget } from "../../lib/artifact-open";
import { useCallSession } from "../../lib/call-session";
import { useMobileChatAppearance } from "../../lib/chat-appearance";
import {
  chatModelDisplayName,
  chatModelPickerChoices,
  chatModelSelectionKey,
} from "../../lib/chat-model";
import { chatModelMenuActions } from "../../lib/chat-model-menu";
import { activeCompanionIdentity } from "../../lib/companion-activity";
import { canStartCompanionVoice, companionVoiceLinkMatches } from "../../lib/companion-voice-guard";
import { composerDraftScope } from "../../lib/composer-draft";
import {
  aggregateConversationStatus,
  conversationStatusLabel,
  isConversationActiveStatus,
} from "../../lib/conversation-status";
import { cronLabels } from "../../lib/cron";
import { useI18n } from "../../lib/i18n";
import { useMobileTokens, useThemedStyles } from "../../lib/native";
import { queryClient, rpcQuery } from "../../lib/query";
import { useScopedTheme } from "../../lib/scoped-theme-context";
import { useInboxBot, useInboxGroup } from "../../lib/search-inbox";
import { currentSessionGeneration } from "../../lib/session";
import { useSplitView } from "../../lib/split-view";
import { useIncomingShareImport, useThreadAttachments } from "../../lib/thread-attachments";
import { useThreadBots } from "../../lib/thread-bots";
import {
  threadColumnPadding,
  threadHeaderClearance,
  threadHeaderFloats,
} from "../../lib/thread-edges";
import { useThreadFeedback } from "../../lib/thread-feedback";
import { useThreadFocus } from "../../lib/thread-focus";
import { useThreadSnapshot } from "../../lib/thread-history";
import { threadKeyboardAvoidance } from "../../lib/thread-keyboard-offset";
import { useThreadListScroll } from "../../lib/thread-list-scroll";
import { useThreadMentionCatalog } from "../../lib/thread-mention-catalog";
import { useThreadPaging } from "../../lib/thread-paging";
import { useThreadRead } from "../../lib/thread-read";
import {
  isOwnThreadMessage,
  latestArrivalMessage,
  latestThreadRowKey,
} from "../../lib/thread-scroll";
import { useThreadSend } from "../../lib/thread-send";
import { threadSnapshotStatus } from "../../lib/thread-session-cache";
import { threadGroupMembers } from "../../lib/thread-snapshot";
import { useThreadSync } from "../../lib/thread-sync";
import { useThreadTranscript } from "../../lib/thread-transcript";
import { useAutoSpeakReply, useSpeakMessages, useThreadVoiceCall } from "../../lib/thread-voice";
import { liveEndRunError } from "../../lib/thread-window";
import { UiModeScreenHost } from "../../lib/ui-mode-slots";
import { errorText } from "../../lib/user-error";
import type { ThreadUiModeController } from "../../ui-modes/controllers";
import { FailedSendBubble } from "../failed-send-bubble";
import type { MarkdownArtifactPreviewTarget } from "../markdown-artifact-preview";
import { MarkdownArtifactPreview } from "../markdown-artifact-preview";
import { RunErrorSheet } from "../run-error-sheet";
import { SelectTextSheet } from "../select-text-sheet";
import { ThreadComposer } from "../thread-composer";
import { ThreadErrorNotice, ThreadFetchErrorNotice } from "../thread-error-notice";
import { createThreadHeaderStyles } from "../thread-header-styles";
import { QuoteSheet } from "./quote-sheet";
import { ThreadComposerDock } from "./thread-composer-dock";
import { BotActionsModal, useThreadHeader } from "./thread-header";
import { LoadEarlierButton, ThreadWorkingFooter } from "./thread-list-controls";
import { ThreadMessageList } from "./thread-message-list";
import { useLatestRowActions, useThreadRows } from "./thread-rows";
import { useThreadRunError } from "./thread-run-error";

function isActiveStatus(status: string | undefined): boolean {
  return isRunWorking(status) || isRunWaitingOnUser(status);
}

/**
 * The chat screen. Hook order is effect order: the snapshot, scroll, sync and send hooks run their
 * effects at the positions the screen ran them before they were split out.
 */
export function Thread({ sessionEpoch, userId }: { sessionEpoch: number; userId: string }) {
  const tokens = useMobileTokens();
  const scopedTheme = useScopedTheme();
  const cardLayout = scopedTheme?.layout === "cards";
  const chatAppearance = useMobileChatAppearance();
  const styles = useThemedStyles(createThreadHeaderStyles);
  const { t, locale } = useI18n();
  const focused = useIsFocused();
  const foreground = useAppForeground();
  const router = useRouter();
  // Beside the chat list on a wide window, the chat has only the width the list leaves.
  const { inboxShown, contentWidth: windowWidth } = useSplitView();
  const nativeHeaderHeight = useHeaderHeight();
  const headerHeight = threadHeaderFloats() ? nativeHeaderHeight : 0;
  const headerClearance = threadHeaderClearance(headerHeight);
  const insets = useSafeAreaInsets();
  // An unfolded or tablet window keeps messages and the composer in a centred reading column.
  const columnInsets = readableGutters(windowWidth, {
    left: inboxShown ? 0 : insets.left,
    right: insets.right,
  });
  const columnWidth = windowWidth - columnInsets.left - columnInsets.right;
  const columnPadding = useMemo(
    () => threadColumnPadding(columnInsets, I18nManager.isRTL),
    [columnInsets.left, columnInsets.right],
  );
  const {
    botId,
    groupId,
    name,
    messageId,
    threadId,
    companionVoice,
    companionToken,
    readOnly: readOnlyParam,
  } = useLocalSearchParams<{
    botId?: string;
    groupId?: string;
    name?: string;
    messageId?: string;
    threadId?: string;
    companionVoice?: string;
    companionToken?: string;
    readOnly?: string;
  }>();
  const readOnly = readOnlyParam === "1";
  const requestedThreadId = typeof threadId === "string" && threadId ? threadId : undefined;
  const inGroup = Boolean(groupId);
  const call = useCallSession();
  const onCall = Boolean(botId) && call?.botId === botId;
  // The composer floats over the list, which scrolls underneath; this keeps the newest message
  // clear of it. A read-only chat has no composer.
  const [dockHeight, setDockHeight] = useState(0);
  const bottomInset = Math.max(dockHeight, readOnly ? insets.bottom : 0);
  const activeBotId = useRef(botId);
  activeBotId.current = botId;
  const activeGroupId = useRef(groupId);
  activeGroupId.current = groupId;
  // Until the chat's own roster arrives, the bot/group as the inbox last loaded it.
  const inboxBot = useInboxBot(botId);
  const inboxGroup = useInboxGroup(groupId);
  const sessionSpaceId = selectedSpaceId() ?? inboxBot?.spaceId ?? inboxGroup?.spaceId ?? "";
  const sessionScope = useMemo(
    () => ({
      apiBase: currentApiBase(),
      sessionGeneration: currentSessionGeneration(),
      userId,
      spaceId: sessionSpaceId,
    }),
    [sessionSpaceId, userId, sessionEpoch],
  );
  const {
    threadKey,
    activeThreadId,
    readVisit,
    readVisibleTarget,
    readBoundary,
    setReadBoundary,
    markedUnreadMessageId,
    markUnreadFrom,
    markReadIfVisible,
  } = useThreadRead({ botId, groupId, focused, readOnly, sessionScope });
  const markCaughtUp = () => setReadBoundary({ visit: readVisit.current.visit, seq: null });
  const artifactTarget: MobileArtifactTarget | undefined = groupId
    ? { groupId }
    : botId
      ? { botId }
      : undefined;
  const history = useThreadSnapshot({
    scope: sessionScope,
    botId,
    groupId,
    messageId,
  });
  const { snap, composingBots, showingSaved } = history;
  const [agentSkills, setAgentSkills] = useState<AgentSkillCatalogEntry[]>([]);
  const modelSaving = useRef(false);
  const spaceId = selectedSpaceId() ?? undefined;
  const modelBotId = inGroup || readOnly ? undefined : botId;
  const me = useQuery({ ...rpcQuery("me", undefined, spaceId), enabled: false }, queryClient).data;
  const catalog = useQuery(
    { ...rpcQuery("models/list", undefined, spaceId), enabled: false },
    queryClient,
  ).data;
  const modelBot = useQuery(
    { ...rpcQuery("bots/get", { botId: modelBotId ?? "" }, spaceId), enabled: false },
    queryClient,
  ).data;
  const modelCredentials = useQuery(
    { ...rpcQuery("models/credentials", undefined, spaceId), enabled: false },
    queryClient,
  ).data;
  // Re-read on focus so returning from Models settings updates unsent missing-model messages.
  useFocusEffect(
    useCallback(() => {
      const reuse = { reuse: true };
      void fetchFresh(queryClient, rpcQuery("me", undefined, spaceId), reuse).catch(
        () => undefined,
      );
      if (modelBotId) {
        void fetchFresh(
          queryClient,
          rpcQuery("bots/get", { botId: modelBotId }, spaceId),
          reuse,
        ).catch(() => undefined);
        void queryClient
          .fetchQuery(rpcQuery("models/list", undefined, spaceId))
          .catch(() => undefined);
        void fetchFresh(
          queryClient,
          rpcQuery("models/credentials", undefined, spaceId),
          reuse,
        ).catch(() => undefined);
      }
    }, [modelBotId, spaceId]),
  );

  const { mentionBots, mentionBotsRef, mentionGroups, refreshMentionBots } = useThreadBots({
    botId,
    groupId,
    name,
    activeBotId,
  });
  const {
    routines: mentionRoutines,
    connectors: mentionConnectors,
    onMentionRequested,
  } = useThreadMentionCatalog(
    JSON.stringify([userId, sessionEpoch, botId, groupId, requestedThreadId]),
    mentionBots,
  );
  const attachments = useThreadAttachments({ botId, groupId, readOnly, uploadConfig: me });
  const draftScope = useMemo(
    () => composerDraftScope(userId, botId, groupId),
    [userId, botId, groupId],
  );
  const echoed = useMemo(
    () =>
      snap && (snap.groupId ?? snap.botId) === threadKey
        ? new Set(
            snap.messages.flatMap((message) =>
              message.role === "user" && message.seq !== undefined ? [message.seq] : [],
            ),
          )
        : undefined,
    [snap, threadKey],
  );
  const feedback = useThreadFeedback(threadKey, newClientId, echoed);
  const { error, setError } = feedback;
  const [selectableText, setSelectableText] = useState<string | null>(null);
  const [markdownPreview, setMarkdownPreview] = useState<MarkdownArtifactPreviewTarget | null>(
    null,
  );
  const transcript = useThreadTranscript(snap?.messages, inGroup);
  const { reactionView, peerTranscript, setExpandedPeerMarkers } = transcript;
  const visibleMessages = transcript.visibleMessages;
  const latestMessage = latestArrivalMessage(reactionView.visibleMessages, peerTranscript.markerOf);
  const composerMentionTargets = useMemo(
    () =>
      buildComposerMentionOptions({
        query: "",
        includeEveryone: inGroup,
        currentGroupId: groupId,
        bots: mentionBots.map((bot) => ({
          id: bot.id,
          name: bot.name,
          color: bot.color,
          avatarSet: bot.avatarSet,
        })),
        groups: mentionGroups.map((group) => ({ id: group.id, name: group.name })),
        routines: mentionRoutines.map((routine) => ({
          id: routine.id,
          name: routine.name,
          crons: routine.crons,
          botId: routine.botId,
          botName: routine.botName,
        })),
        connectors: mentionConnectors,
        cronLabels: cronLabels(locale),
      }),
    [groupId, inGroup, locale, mentionBots, mentionConnectors, mentionGroups, mentionRoutines],
  );
  const currentBot = botId ? mentionBots.find((bot) => bot.id === botId) : undefined;
  const titleBot = currentBot ?? inboxBot;
  const modelLabel = modelBotId
    ? chatModelDisplayName(
        me,
        catalog ?? [],
        modelBot ?? (titleBot && "modelId" in titleBot ? titleBot : undefined),
      )
    : undefined;
  const modelSelectionKey = modelBotId
    ? chatModelSelectionKey(
        catalog ?? [],
        modelBot ??
          (titleBot && "modelId" in titleBot ? titleBot : undefined) ?? {
            modelProvider: null,
            modelId: null,
          },
      )
    : "";
  const modelActions = modelBotId
    ? chatModelMenuActions(
        chatModelPickerChoices(
          me ?? null,
          catalog ?? [],
          modelCredentials ?? [],
          modelSelectionKey,
          t,
        ),
        modelSelectionKey,
      )
    : undefined;
  async function selectChatModel(key: string) {
    if (!modelBotId || modelSaving.current || key === modelSelectionKey) return;
    const selected = key ? parseModelOptionKey(key) : null;
    if (key && !selected) {
      Alert.alert(t("Could not load model settings"));
      return;
    }
    modelSaving.current = true;
    const botQuery = rpcQuery("bots/get", { botId: modelBotId }, spaceId);
    const selection = spaceSelectionSeq();
    try {
      const requestContext = await captureApiRequestContext(spaceId);
      if (selection !== spaceSelectionSeq() || spaceId !== (selectedSpaceId() ?? undefined))
        throw new Error(t("Space changed. Please try again."));
      const saved = await rpc(
        "bots/update",
        {
          botId: modelBotId,
          modelProvider: selected?.provider ?? null,
          modelId: selected?.modelId ?? null,
          thinkingLevel: null,
        },
        { requestContext },
      );
      await writeSaved(queryClient, botQuery.queryKey, () => saved);
    } catch (cause) {
      if (focused) Alert.alert(t("Could not save changes"), errorText(cause, t("Try again.")));
    } finally {
      modelSaving.current = false;
    }
  }
  // Use a cached name until the chat's own roster arrives.
  const titleName = [currentBot?.name, inboxBot?.name, name]
    .map((candidate) => safeDisplayName(candidate, ""))
    .find(Boolean);
  const displayName = safeDisplayName(titleName, inGroup ? t("Group") : t("Bot"));
  const composerPrompt = displayName ? t("Message {name}", { name: displayName }) : t("Message…");
  const notificationThreadId = snap?.threadId ?? requestedThreadId ?? currentBot?.threadId;
  activeThreadId.current = notificationThreadId;
  const hasSendingAttempt = feedback.unsentSends.some(
    (attempt) =>
      attempt.payload.plan.shouldSend &&
      (attempt.state === "pending" || attempt.state === "queued"),
  );
  // The group's members in its order, once the chat or its group list has loaded them; the
  // title seats the inbox's copy until then.
  const groupMembers = threadGroupMembers(groupId, snap, mentionGroups);
  const rawBotStatus = snap ? threadSnapshotStatus(snap) : titleBot?.status;
  const currentBotStatus = rawBotStatus;
  // Group conversation status comes strictly from the group's own thread snapshot or group.status,
  // never from member bots' global/DM statuses.
  const rawGroupStatus = snap
    ? threadSnapshotStatus(snap)
    : inboxGroup && "status" in inboxGroup && typeof inboxGroup.status === "string"
      ? inboxGroup.status
      : undefined;
  const rawHeaderStatus = inGroup ? rawGroupStatus : rawBotStatus;
  const currentConversationStatus =
    hasSendingAttempt && !isRunWorking(rawHeaderStatus) && rawHeaderStatus !== "waiting_takeover"
      ? "queued"
      : rawHeaderStatus;
  // Only reply text being written replaces the footer; earlier sentences above a tool call don't.
  const hasLiveProgress = visibleMessages.some(
    (message) => message.id.startsWith("progress:") && liveMessageComposing(message.blocks),
  );
  const activityLine = liveActivityLine(snap?.messages ?? []);
  const userBubble = useMemo(
    () => (!inGroup && titleBot ? chatUserBubbleColors(titleBot.color, titleBot.id) : undefined),
    [inGroup, titleBot?.color, titleBot?.id],
  );
  const activeGroupBots = useMemo(() => {
    if (!inGroup) return [];
    const active = snap?.activeRuns ?? (snap?.run ? [snap.run] : []);
    const statusesByBot = new Map<string, string[]>();
    for (const run of active) {
      if (!run.botId || !isActiveStatus(run.status)) continue;
      const list = statusesByBot.get(run.botId);
      if (list) list.push(run.status);
      else statusesByBot.set(run.botId, [run.status]);
    }
    const entries: Array<
      NonNullable<NonNullable<typeof snap>["members"]>[number] & { status: string }
    > = [];
    for (const [memberBotId, statuses] of statusesByBot.entries()) {
      const member = snap?.members?.find((candidate) => candidate.botId === memberBotId);
      if (!member) continue;
      entries.push({ ...member, status: aggregateConversationStatus(statuses) });
    }
    return entries.sort((left, right) => Number(isRunWorking(right.status)) - Number(isRunWorking(left.status)));
  }, [inGroup, snap?.activeRuns, snap?.members, snap?.run]);
  const working = inGroup ? activeGroupBots.length > 0 : isActiveStatus(currentConversationStatus);

  const speakFinishedReplyRef = useAutoSpeakReply({
    botId,
    inGroup,
    currentBot,
    snap,
    showingSaved,
  });

  useEffect(() => {
    void rpc("agentSkills/list")
      .then(setAgentSkills)
      .catch(() => setAgentSkills([]));
  }, []);

  const scroll = useThreadListScroll({
    history,
    threadKey,
    botId,
    groupId,
    anchor: headerClearance.anchor,
    visibleBottomInset: bottomInset,
    latestRowKey: latestThreadRowKey(
      latestMessage?.id ?? null,
      feedback.unsentSends.map((attempt) => attempt.clientNonce),
      isOwnThreadMessage(latestMessage, userId),
    ),
  });

  const { botActions, botActionsOpen, closeBotActions } = useThreadHeader({
    botId,
    groupId,
    inGroup,
    readOnly,
    displayName,
    titleBot,
    titleName,
    groupMembers,
    currentBotStatus: currentConversationStatus,
    composingBots,
    styles,
    onCleared: history.clear,
  });

  useThreadFocus({
    botId,
    readOnly,
    notificationThreadId,
    refreshMentionBots,
    markReadIfVisible,
    speakFinishedReplyRef,
  });

  const { isCurrentTarget, refresh, applyMessageJump, showLatest } = useThreadSync({
    history,
    scroll,
    botId,
    groupId,
    messageId,
    readOnly,
    foreground,
    sessionEpoch,
    activeBotId,
    activeGroupId,
    readVisibleTarget,
    setExpandedPeerMarkers,
    setError,
    onRefreshed: feedback.refreshed,
    refreshMentionBots,
    markReadIfVisible,
  });

  const paging = useThreadPaging({
    history,
    scroll,
    botId,
    groupId,
    visibleMessages,
    anchor: headerClearance.anchor,
    setError,
    showLatest,
  });

  const composer = useThreadSend({
    botId,
    groupId,
    readOnly,
    threadKey,
    history,
    scroll,
    feedback,
    attachments,
    mentionBotsRef,
    activeBotId,
    activeGroupId,
    isCurrentTarget,
    refresh,
    showLatest,
    markCaughtUp,
    // The voice hook below owns bot switching; a send only switches after this render.
    openBotChat: (target, ring) => openBotChat(target, ring),
  });
  const { replyTarget, setReplyTarget, replyQuote, setReplyQuote, quoteTarget, setQuoteTarget } =
    composer;
  useIncomingShareImport({
    attachments,
    composerRef: composer.composerRef,
    readOnly,
    threadKey,
    uploadConfig: me,
  });

  const openBot = useCallback(
    (id: string, botName: string) =>
      router.push({ pathname: "/thread", params: { botId: id, name: botName } }),
    [router],
  );

  const openComputer = useCallback(
    (id: string, botName: string) =>
      router.push({ pathname: "/computer", params: { botId: id, name: botName } }),
    [router],
  );

  const speak = useSpeakMessages({
    visibleMessages,
    botId,
    members: snap?.members,
    displayName,
    mentionBots,
  });

  const { startVoiceCall, openBotChat } = useThreadVoiceCall({
    botId,
    readOnly,
    displayName,
    mentionBots,
    mentionBotsRef,
    activeBotId,
  });

  const companionVoiceHandled = useRef(false);
  const companionVoiceFocused = useRef(focused);
  companionVoiceFocused.current = focused;
  useEffect(
    () => () => {
      companionVoiceFocused.current = false;
    },
    [],
  );
  useEffect(() => {
    if (companionVoice !== "1") {
      companionVoiceHandled.current = false;
      return;
    }
    if (!botId || inGroup || readOnly || !focused || companionVoiceHandled.current) return;
    companionVoiceHandled.current = true;
    const requestedBot = botId;
    const generation = currentSessionGeneration();
    const spaceId = selectedSpaceId();
    const activity = activeCompanionIdentity();
    const spaceSelection = spaceSelectionSeq();
    router.setParams({
      companionVoice: undefined,
      companionToken: undefined,
      companionLink: undefined,
    });
    if (
      !activity ||
      !companionVoiceLinkMatches(companionToken, activity, requestedBot, spaceId) ||
      isSpaceSelectionPending()
    )
      return;
    Alert.alert("语音对话", "开始后将按照系统授权使用麦克风。", [
      { text: "取消", style: "cancel" },
      {
        text: "开始",
        onPress: () => {
          if (
            canStartCompanionVoice({
              focused: companionVoiceFocused.current,
              requestedBot,
              activeBot: activeBotId.current,
              requestGeneration: generation,
              currentGeneration: currentSessionGeneration(),
              requestSpace: spaceId,
              currentSpace: selectedSpaceId(),
              requestActivityId: activity.id,
              activeActivity: activeCompanionIdentity(),
              requestSpaceSelection: spaceSelection,
              currentSpaceSelection: spaceSelectionSeq(),
              spaceSelectionPending: isSpaceSelectionPending(),
            })
          )
            void startVoiceCall(false, generation);
        },
      },
    ]);
  }, [companionVoice, companionToken, botId, inGroup, readOnly, focused]);

  const { runError, normalizedRunError, runErrorAction, detailsOpen, setDetailsOpen } =
    useThreadRunError(snap?.run, botId);

  // Event actions read the latest committed screen state without invalidating settled rows.
  const rowActions = useLatestRowActions({
    helperToggle: scroll.helperToggle,
    reply: (message) => {
      setReplyTarget(message);
      setReplyQuote(null);
    },
    quote: setQuoteTarget,
    select: setSelectableText,
    speak,
    react: composer.react,
    markUnread: markUnreadFrom,
    answer: composer.answer,
    openBot,
    openComputer,
    previewMarkdown: setMarkdownPreview,
    previewImage: (target) =>
      router.push({
        pathname: "/image",
        params: { ...target, ...(groupId ? { groupId } : { botId }) },
      }),
    jump: (messageId) => {
      void applyMessageJump({
        botId,
        groupId,
        messageId: reactionView.foldedInto.get(messageId) ?? messageId,
      }).catch(() => undefined);
    },
    dismissChoice: transcript.dismissChoice,
    openPeerChat: (peer) => {
      if (!botId) return;
      router.push({
        pathname: "/peer-chat",
        params: {
          botId,
          botName: displayName,
          botColor: currentBot?.color,
          peerBotColor: mentionBots.find((bot) => bot.id === peer.peerBotId)?.color,
          ...peer,
        },
      });
    },
    layout: scroll.layoutJumpRow,
  });

  const { liveItems, renderMessageRow, renderItem } = useThreadRows({
    snap,
    userId,
    transcript,
    rowActions,
    botId,
    groupId,
    inGroup,
    readOnly,
    onCall,
    displayName,
    mentionBots,
    currentBot: titleBot,
    currentBotStatus,
    userBubble,
    columnWidth,
    readSeq: readBoundary?.visit === readVisit.current.visit ? readBoundary.seq : null,
    markedUnreadMessageId,
    highlightedMessageId: scroll.highlightedMessageId,
  });

  const composingIds = useMemo(
    () => new Set(composingBots ? composingBots.split(",") : []),
    [composingBots],
  );
  const footerBots = useMemo(() => {
    if (!inGroup) {
      if (!isConversationActiveStatus(currentConversationStatus) || hasLiveProgress) return [];
      const id = titleBot?.id ?? botId;
      if (!id) return [];
      return [
        {
          id,
          name: titleBot?.name ?? displayName,
          color: titleBot?.color || botColors[3],
          avatarSet: titleBot?.avatarSet,
          status: currentConversationStatus,
        },
      ];
    }
    const liveGroupBots = activeGroupBots
      .filter((bot) => !composingIds.has(bot.botId))
      .map((bot) => ({
        id: bot.botId,
        name: bot.name,
        color: bot.color,
        avatarSet: bot.avatarSet,
        status: bot.status,
      }));
    if (liveGroupBots.length > 0) return liveGroupBots;
    if (hasSendingAttempt && !hasLiveProgress) {
      const firstMember = (groupMembers ?? inboxGroup?.members)?.[0];
      if (firstMember) {
        return [
          {
            id: firstMember.botId,
            name: firstMember.name,
            color: firstMember.color || botColors[3],
            avatarSet: firstMember.avatarSet,
            status: "queued",
          },
        ];
      }
    }
    return [];
  }, [
    inGroup,
    currentConversationStatus,
    hasLiveProgress,
    titleBot,
    botId,
    displayName,
    activeGroupBots,
    composingIds,
    hasSendingAttempt,
    groupMembers,
    inboxGroup?.members,
  ]);
  const footerStatus = inGroup
    ? aggregateConversationStatus(footerBots.map((bot) => bot.status))
    : currentConversationStatus;
  const footerLabel =
    (isRunWorking(footerStatus) ? activityLine : undefined) ??
    (conversationStatusLabel(footerStatus, t) || t("Working…"));
  const workingFooter = (
    <ThreadWorkingFooter
      bots={footerBots.map((bot) => ({
        ...bot,
        composing: composingIds.has(bot.id),
      }))}
      atBottom={!scroll.state.detached}
      label={footerLabel}
    />
  );

  const loadEarlierControl =
    snap?.olderCursor != null ? (
      <LoadEarlierButton
        loading={paging.loadingOlder}
        onPress={() => void paging.loadOlderMessages()}
      />
    ) : null;

  const failedSendBubbles = feedback.unsentSends.map((attempt) => (
    <FailedSendBubble
      key={attempt.clientNonce}
      attempt={attempt}
      needsModel={me?.needsModel}
      onRetry={() => composer.retry(attempt)}
      onDelete={() => feedback.discard(attempt)}
      userBubble={userBubble}
    />
  ));

  // Fetch failures stay visible at either paging edge; provider recovery belongs to the live end.
  const visibleRunError = liveEndRunError(normalizedRunError, scroll.pinnedNewerCursor);
  const errorNotice = (
    <ThreadErrorNotice
      error={null}
      summary={visibleRunError?.summary ?? null}
      resetAt={visibleRunError?.resetAt}
      onDetails={() => setDetailsOpen(true)}
      action={visibleRunError ? runErrorAction : null}
    />
  );

  const controller: ThreadUiModeController = {
    botId,
    groupId,
    userId,
    displayName,
    readOnly,
    snapshot: snap,
    messages: visibleMessages,
    error,
    showingSaved,
    working,
    composer,
    attachments,
    paging,
    showLatest,
    openBot,
    openComputer,
  };
  const hasUserBackground = Boolean(chatAppearance.backgroundUri);
  const hasThemeBackground = Boolean(scopedTheme?.background);
  const classicContent = (
    <View style={[{ flex: 1 }, cardLayout ? { paddingHorizontal: 8, paddingTop: 8 } : null]}>
      <ImageBackground
        source={chatAppearance.backgroundUri ? { uri: chatAppearance.backgroundUri } : undefined}
        resizeMode={chatAppearance.backgroundFit}
        imageStyle={{ opacity: chatAppearance.backgroundOpacity }}
        style={{ flex: 1, backgroundColor: hasUserBackground ? tokens.background : "transparent" }}
      >
        {hasUserBackground ? (
          <View
            pointerEvents="none"
            style={{
              ...StyleSheet.absoluteFill,
              backgroundColor: "#000",
              opacity: chatAppearance.overlayOpacity,
            }}
          />
        ) : null}
        <KeyboardAvoidingView
          // Padding always settles to zero. "height" stays shrunk when the keyboard hides without
          // move frames, such as when a pushed screen closes with its own keyboard up.
          behavior="padding"
          {...threadKeyboardAvoidance({
            os: Platform.OS,
            floatingHeader: threadHeaderFloats(),
            nativeHeaderHeight,
          })}
          style={{
            flex: 1,
            backgroundColor:
              hasUserBackground || hasThemeBackground ? "transparent" : tokens.background,
            ...(cardLayout
              ? {
                  borderRadius: scopedTheme.geometry.cardRadius,
                  overflow: "hidden" as const,
                  borderWidth: Math.max(1, scopedTheme.geometry.borderWidth),
                  borderColor: tokens.border,
                }
              : null),
          }}
        >
          {/* The keyboard's padding shrinks this, so the floating composer rides above it. */}
          <View style={{ flex: 1 }}>
            <ThreadMessageList
              scroll={scroll}
              pinnedListHandlers={paging.pinnedListHandlers}
              threadKey={threadKey}
              headerClearance={headerClearance}
              bottomInset={bottomInset}
              columnPadding={columnPadding}
              visibleMessages={visibleMessages}
              liveItems={liveItems}
              renderItem={renderItem}
              renderMessageRow={renderMessageRow}
              loadEarlierControl={loadEarlierControl}
              failedSendBubbles={failedSendBubbles}
              errorNotice={errorNotice}
              workingFooter={workingFooter}
              loadingNewer={paging.loadingNewer}
              showLatest={showLatest}
            />
            {/* Shrinks (the suggestion lists scroll) so the input and Send stay above the keyboard. */}
            <ThreadComposerDock
              hidden={readOnly}
              columnPadding={columnPadding}
              notice={
                <>
                  {feedback.outboxRestoreFailed ? (
                    <ThreadErrorNotice
                      error={t(
                        "Saved unsent messages could not be loaded. New messages that are not delivered may be lost when the app closes.",
                      )}
                      summary={null}
                    />
                  ) : null}
                  <ThreadFetchErrorNotice error={error} showingSaved={showingSaved} />
                </>
              }
              onHeight={setDockHeight}
              replyTarget={replyTarget}
              replyAuthor={
                replyTarget?.role === "user"
                  ? (channelMessageSender(replyTarget.blocks) ?? t("You"))
                  : (memberName(snap?.members, replyTarget?.botId) ?? displayName ?? t("Bot"))
              }
              replyQuote={replyQuote}
              threadTarget={artifactTarget}
              onDismissReply={() => {
                setReplyTarget(null);
                setReplyQuote(null);
              }}
              attachmentNotice={attachments.attachmentNotice}
              attachments={attachments.activePendingAttachments}
              onRemoveAttachment={(id) =>
                attachments.setPendingAttachments((current) =>
                  current.filter((item) => item.id !== id),
                )
              }
            >
              <ThreadComposer
                key={threadKey}
                ref={composer.composerRef}
                draftScope={draftScope}
                agentSkills={agentSkills}
                composerMentionTargets={composerMentionTargets}
                onMentionRequested={onMentionRequested}
                composerPrompt={composerPrompt}
                replyTargetId={replyTarget?.id}
                replyQuote={replyQuote}
                attachmentIds={attachments.activePendingAttachments.map(
                  (attachment) => attachment.id,
                )}
                botId={botId}
                modelLabel={modelLabel}
                modelActions={modelActions}
                onModelSelect={(key) => void selectChatModel(key)}
                onCall={onCall}
                working={working}
                sending={composer.sending || attachments.shareImporting}
                attachActions={attachments.attachActions}
                attachFrom={attachments.attachFrom}
                send={composer.send}
                stop={composer.stop}
                startVoiceCall={startVoiceCall}
                onSlashAction={composer.runSlashAction}
              />
            </ThreadComposerDock>
          </View>
          {botActionsOpen ? (
            <BotActionsModal actions={botActions} onClose={closeBotActions} />
          ) : null}
          {selectableText !== null ? (
            <SelectTextSheet text={selectableText} onClose={() => setSelectableText(null)} />
          ) : null}
          <RunErrorSheet
            details={detailsOpen ? runError : null}
            onClose={() => setDetailsOpen(false)}
            action={runErrorAction}
          />
          {markdownPreview && artifactTarget ? (
            <MarkdownArtifactPreview
              threadTarget={artifactTarget}
              target={markdownPreview}
              onClose={() => setMarkdownPreview(null)}
            />
          ) : null}
          {quoteTarget ? (
            <QuoteSheet
              message={quoteTarget}
              onCancel={() => setQuoteTarget(null)}
              onQuote={(excerpt) => {
                setReplyTarget(quoteTarget);
                setReplyQuote(excerpt);
                setQuoteTarget(null);
              }}
            />
          ) : null}
          {/* The header buttons float over the chat; only the clock gets a soft backdrop. */}
          {headerHeight > 0 ? (
            <View pointerEvents="none" style={[styles.statusBarFade, { height: insets.top }]} />
          ) : null}
        </KeyboardAvoidingView>
      </ImageBackground>
    </View>
  );
  return (
    <UiModeScreenHost
      slot={inGroup ? "groupThread" : "thread"}
      controller={controller}
      renderClassic={() => classicContent}
    />
  );
}
