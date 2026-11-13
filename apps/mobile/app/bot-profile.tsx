import type { ComputerStatus } from "@rakazo/contracts";
import { displayName } from "@rakazo/core";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert, AppState, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { BotAvatar } from "../components/bot-avatar";
import { glassHeaderOptions } from "../components/glass-title";
import { NativeActionButton } from "../components/native-action-button";
import { NativeSymbol } from "../components/native-symbol";
import {
  SettingsGroup,
  SettingsRow,
  SettingsSwitch,
  useStackedSettings,
} from "../components/settings-group";
import type { MobileBot } from "../lib/api";
import {
  currentApiBase, isSpaceSelectionPending, loadSessionToken, rpc, selectedSpaceId,
  spaceSelectionSeq, subscribeSpaceSelection,
} from "../lib/api";
import {
  activeCompanionIdentity,
  companionAvailable,
  companionScreenState,
  presentCompanionScreen,
  startCompanion,
  stopCompanion,
  stopCompanionScreen,
  subscribeCompanionScreenState,
  takeCompanionScreenText,
  type CompanionScreenState,
} from "../lib/companion-activity";
import { captureScreenSendScope, screenSendScopeCurrent, sendReviewedScreenText } from "../lib/companion-screen-send";
import { startCompanionScreenAuto, stopCompanionScreenAuto, useCompanionScreenAuto } from "../lib/companion-screen-auto";
import { useI18n } from "../lib/i18n";
import { afterChatNotifyChange } from "../lib/live-notifications";
import { native, useMobileTokens, useThemedStyles } from "../lib/native";
import { createQueuedSave } from "../lib/queued-save";
import { useBotRoutines } from "../lib/routine-store";
import { currentSessionGeneration } from "../lib/session";
import { useSideInsets } from "../lib/side-insets";
import { errorText } from "../lib/user-error";

export default function BotProfile() {
  const sideInsets = useSideInsets();
  const { t } = useI18n();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const tokens = useMobileTokens();
  const stacked = useStackedSettings();
  const { botId = "", name: nameParam } = useLocalSearchParams<{ botId?: string; name?: string }>();
  const [bot, setBot] = useState<MobileBot | null>(null);
  const [computer, setComputer] = useState<ComputerStatus | null>(null);
  const [companion, setCompanion] = useState<ReturnType<typeof activeCompanionIdentity>>(null);
  const [companionBusy, setCompanionBusy] = useState(false);
  const [screenState, setScreenState] = useState<CompanionScreenState>("unsupported");
  const screenAuto = useCompanionScreenAuto();
  const profileFocused = useRef(false);
  const activeProfileBot = useRef(botId);
  activeProfileBot.current = botId;
  const name = displayName(bot?.name ?? nameParam, t("Bot"));
  const companionMatches = companion?.botId === botId && companion.spaceId === selectedSpaceId();
  const { routines } = useBotRoutines(botId);
  // Counts switch saves as they start and end, so a reload can tell it overlapped one.
  const notifySaves = useRef(0);
  const notifyQueue = useRef<ReturnType<typeof createQueuedSave<boolean>> | null>(null);

  // Reload on focus so edits made in Chat settings or a routine show on return.
  useFocusEffect(
    useCallback(() => {
      if (!botId) return;
      profileFocused.current = true;
      const unsubscribeSpace = subscribeSpaceSelection(() => setCompanion(activeCompanionIdentity()));
      let current = true;
      let screenRevision = 0;
      const unsubscribeScreen = subscribeCompanionScreenState((state) => {
        screenRevision += 1;
        if (current) setScreenState(state);
      });
      const refreshCompanion = () => {
        if (!current) return;
        setCompanion(activeCompanionIdentity());
        const revision = ++screenRevision;
        void companionScreenState().then((state) => {
          if (current && screenRevision === revision) setScreenState(state);
        }).catch(() => {
          if (current && screenRevision === revision) setScreenState("unsupported");
        });
      };
      const appState = AppState.addEventListener("change", (next) => {
        if (next === "active") refreshCompanion();
      });
      refreshCompanion();
      const saves = notifySaves.current;
      void rpc("bots/get", { botId })
        .then((next) => {
          if (!current) return;
          // A read that overlapped a save may predate it; keep the switch as the user left it.
          const overlapped = saves % 2 === 1 || saves !== notifySaves.current;
          if (!overlapped) notifyQueue.current?.reset(next.notifyOnFinish);
          setBot((shown) =>
            overlapped && shown ? { ...next, notifyOnFinish: shown.notifyOnFinish } : next,
          );
        })
        .catch(() => undefined);
      void rpc("computer/status", { botId })
        .then((next) => {
          if (current) setComputer(next);
        })
        // A stale Running or Asleep is worse than no state.
        .catch(() => {
          if (current) setComputer(null);
        });
      return () => {
        current = false;
        profileFocused.current = false;
        appState.remove();
        unsubscribeScreen();
        unsubscribeSpace();
      };
    }, [botId]),
  );

  // The chat list's Silence notifications saves the same setting. The switch moves
  // first and moves back if the save fails.
  const setNotifyOnFinish = (notifyOnFinish: boolean) => {
    if (!bot) return;
    notifyQueue.current ??= createQueuedSave(bot.notifyOnFinish, {
      onChange: (notifyOnFinish) => setBot((current) => current && { ...current, notifyOnFinish }),
      save: async (notifyOnFinish) => {
        await rpc("bots/update", { botId, notifyOnFinish });
      },
      onSavingChange: () => {
        notifySaves.current += 1;
      },
      onSaved: async (notify) => {
        try {
          await afterChatNotifyChange(
            currentApiBase(),
            await loadSessionToken(),
            selectedSpaceId() ?? "",
            { botId, threadId: bot.threadId, notify },
          );
        } catch {
          // The server save succeeded; device reconciliation can retry later.
        }
      },
      onError: (error) =>
        Alert.alert(t("Could not update notifications"), errorText(error, t("Try again."))),
    });
    notifyQueue.current.update(notifyOnFinish);
  };

  const changeCompanion = async (
    showReply: boolean, generation: number, spaceId: string | null, activityId: string | null,
    selection: number,
  ) => {
    if (companionBusy || !bot) return;
    const isScopeCurrent = () =>
      generation === currentSessionGeneration() && spaceId === selectedSpaceId() &&
      !isSpaceSelectionPending() && selection === spaceSelectionSeq();
    const isCurrent = () => isScopeCurrent() && (activeCompanionIdentity()?.id ?? null) === activityId;
    if (
      !profileFocused.current || activeProfileBot.current !== botId ||
      !isCurrent()
    ) {
      Alert.alert("会话已切换", "请在当前账号和工作区重新开启陪伴。");
      return;
    }
    setCompanionBusy(true);
    try {
      const active = activeCompanionIdentity();
      if (active?.botId === botId && active.spaceId === spaceId) {
        stopCompanionScreenAuto();
        await stopCompanion(isCurrent);
      } else {
        await startCompanion(botId, name, spaceId, showReply, {
          color: bot.color,
          avatarSet: bot.avatarSet,
        }, isCurrent, isScopeCurrent);
      }
      setCompanion(activeCompanionIdentity());
    } catch (error) {
      setCompanion(activeCompanionIdentity());
      Alert.alert("陪伴状态更新失败", errorText(error, t("Try again.")));
    } finally {
      setCompanionBusy(false);
    }
  };

  const toggleCompanion = () => {
    if (companionBusy || !bot) return;
    const generation = currentSessionGeneration();
    const spaceId = selectedSpaceId();
    const selection = spaceSelectionSeq();
    const activity = activeCompanionIdentity();
    if (activity?.botId === botId && activity.spaceId === spaceId) {
      void changeCompanion(false, generation, spaceId, activity.id, selection);
      return;
    }
    Alert.alert(
      "开启灵动岛陪伴",
      "是否在灵动岛和锁屏显示 Bot 的简短回复？锁屏内容可能被他人看到。你可以随时停止并重新选择。",
      [
        { text: "取消", style: "cancel" },
        { text: "仅显示状态", onPress: () => void changeCompanion(false, generation, spaceId, activity?.id ?? null, selection) },
        { text: "显示回复", onPress: () => void changeCompanion(true, generation, spaceId, activity?.id ?? null, selection) },
      ],
    );
  };

  const toggleScreen = () => {
    if (screenState === "stopping") return;
    if (screenState !== "idle") {
      stopCompanionScreenAuto();
      void stopCompanionScreen().catch((error) =>
        Alert.alert("停止失败", errorText(error, t("Try again."))),
      );
      return;
    }
    let scope: ReturnType<typeof captureScreenSendScope>;
    try {
      scope = captureScreenSendScope(botId);
    } catch (error) {
      Alert.alert("无法开启屏幕识别", errorText(error, "请重新开启陪伴。"));
      return;
    }
    const generation = currentSessionGeneration();
    const spaceId = selectedSpaceId();
    Alert.alert(
      "本机屏幕识别预览",
      "系统会让你选择共享的画面，画面可能包含个人信息。文字在手机上识别；你可以查看后发送，也可以另行授权自动回应。不录音，可随时停止。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "选择共享画面",
          onPress: () => {
            if (
              !profileFocused.current || activeProfileBot.current !== botId ||
              generation !== currentSessionGeneration() || spaceId !== selectedSpaceId() ||
              !screenSendScopeCurrent(scope)
            ) {
              Alert.alert("会话已切换", "请重新开启屏幕识别。");
              return;
            }
            void presentCompanionScreen(botId, spaceId).catch((error) =>
              Alert.alert("无法开启屏幕识别", errorText(error, t("Try again."))),
            );
          },
        },
      ],
    );
  };

  const toggleScreenAuto = () => {
    if (screenAuto.phase === "active" || screenAuto.phase === "starting") {
      stopCompanionScreenAuto();
      return;
    }
    let scope: ReturnType<typeof captureScreenSendScope>;
    try {
      scope = captureScreenSendScope(botId);
    } catch (error) {
      Alert.alert("无法开启自动回应", errorText(error, "请重新开启陪伴。"));
      return;
    }
    const generation = currentSessionGeneration();
    let submitted = false;
    Alert.alert(
      "开启屏幕自动回应（实验功能）",
      "开启后，识别出的屏幕文字及 Bot 名称、部分设定会发送到当前后台和 Bot 使用的模型服务，可能产生费用。请避免共享敏感内容。自动回应最多持续五分钟，到期后需要重新开启；系统可能暂停后台运行。可选择本机语音播报；通话或其他播报进行时会跳过。可随时停止，灵动岛回复遵循陪伴的隐私选择。",
      [
        { text: "取消", style: "cancel" },
        ...([false, true] as const).map((speakReplies) => ({
          text: speakReplies ? "同意并播报" : "仅文字",
          onPress: () => {
            if (submitted) return;
            submitted = true;
            if (!profileFocused.current || activeProfileBot.current !== botId ||
              generation !== currentSessionGeneration() ||
              !screenSendScopeCurrent(scope)) {
              Alert.alert("会话已切换", "请重新确认屏幕自动回应。");
              return;
            }
            void startCompanionScreenAuto(botId, speakReplies).catch((error) =>
              Alert.alert("无法开启自动回应", errorText(error, "请检查实验服务和授权。")),
            );
          },
        })),
      ],
    );
  };

  const previewScreenText = async () => {
    const generation = currentSessionGeneration();
    const spaceId = selectedSpaceId();
    try {
      const scope = captureScreenSendScope(botId);
      const text = await takeCompanionScreenText();
      if (
        !profileFocused.current || activeProfileBot.current !== botId ||
        generation !== currentSessionGeneration() || spaceId !== selectedSpaceId()
      ) return;
      if (!text) {
        Alert.alert("本机识别预览", "当前没有可用的新文字，请稍后重试。");
        return;
      }
      let submitted = false;
      Alert.alert(
        "确认分享屏幕文字",
        `${text}\n\n发送后，以上文字会作为聊天消息保存，并发送到当前后台及 Bot 所用模型服务。`,
        [
          { text: "取消", style: "cancel" },
          {
            text: "发送给 Bot",
            onPress: () => {
              if (submitted) return;
              submitted = true;
              if (
                !profileFocused.current || activeProfileBot.current !== botId ||
                generation !== currentSessionGeneration() || spaceId !== selectedSpaceId()
              ) {
                Alert.alert("会话已切换", "请重新查看屏幕内容。");
                return;
              }
              void sendReviewedScreenText(scope, text).then(() => {
                if (profileFocused.current && activeProfileBot.current === botId &&
                  generation === currentSessionGeneration() && spaceId === selectedSpaceId()) {
                  router.push({ pathname: "/thread", params: { botId, name, ...(spaceId ? { spaceId } : {}) } });
                }
              }).catch((error) =>
                Alert.alert("发送失败", errorText(error, "请检查连接并重新查看屏幕内容。")),
              );
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert("无法读取预览", errorText(error, t("Try again.")));
    }
  };

  return (
    <ScrollView
      style={[styles.screen, sideInsets]}
      contentContainerStyle={[styles.content, stacked && styles.compactContent]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen
        options={{
          ...glassHeaderOptions(name),
          // The avatar and name below name the page; the bar title stays for the back menu.
          ...(Platform.OS === "ios" ? { headerTitle: "" } : null),
        }}
      />
      <View style={styles.identity}>
        {bot ? (
          <BotAvatar
            color={bot.color}
            avatarSet={bot.avatarSet}
            identity={bot.id}
            size={96}
            status={bot.status}
          />
        ) : (
          <View style={styles.avatarSpace} />
        )}
        <Text accessibilityRole="header" style={styles.name}>
          {name}
        </Text>
        <NativeActionButton
          label={t("Edit")}
          prominence="secondary"
          style={styles.edit}
          onPress={() => router.push({ pathname: "/bot-settings", params: { botId } })}
        />
      </View>
      <SettingsGroup>
        {companionAvailable() && bot ? (
          <SettingsRow
            accessibilityRole="button"
            title={companionMatches ? "停止灵动岛陪伴" : "开启灵动岛陪伴"}
            value={companionBusy ? "处理中" : undefined}
            leading={<NativeSymbol ios="sparkles" android="sparkles-outline" color={tokens.mutedForeground} />}
            onPress={toggleCompanion}
          />
        ) : null}
        {companionAvailable() && screenState !== "unsupported" && (companionMatches || screenState !== "idle") ? (
          <>
            <SettingsRow
              accessibilityRole="button"
              title={screenState === "idle" ? "开启屏幕识别（本机预览）" : "停止屏幕识别"}
              detail={
                screenState === "capturing" && !companionMatches ? "陪伴已变化，请停止屏幕识别并检查系统共享状态" :
                screenState === "capturing" && screenAuto.phase === "active" ? "自动回应已开启，识别文字会发送给模型" :
                screenState === "capturing" && screenAuto.phase === "starting" ? "正在开启自动回应，识别文字可能发送给模型" :
                screenState === "capturing" ? "识别中，等待你选择分享" :
                screenState === "paused" ? "共享内容暂不可用，自动回应已停止；可点击停止共享" :
                screenState === "failed" ? "出现异常，请点击停止后检查系统共享状态" :
                screenState === "stopping" ? "正在停止，请等待系统确认" :
                screenState === "starting" ? "正在启动" :
                screenState === "choosing" ? "等待选择共享画面" : undefined
              }
              onPress={toggleScreen}
            />
            {screenState === "capturing" && companionMatches ? (
              <>
                <SettingsRow
                  accessibilityRole="button"
                  title="查看本机识别预览"
                  onPress={() => void previewScreenText()}
                />
                <SettingsRow
                  accessibilityRole="button"
                  title={screenAuto.phase === "active" || screenAuto.phase === "starting" ? "停止屏幕自动回应" : "开启屏幕自动回应（实验）"}
                  detail={screenAuto.botId === botId ? screenAuto.error ?? screenAuto.reply ?? (screenAuto.phase === "starting" ? "正在开启" : undefined) : undefined}
                  onPress={toggleScreenAuto}
                />
              </>
            ) : null}
          </>
        ) : null}
        <SettingsRow
          key="routines"
          accessibilityRole="button"
          chevron="right"
          title={t("Routines")}
          leading={
            <NativeSymbol ios="clock" android="time-outline" color={tokens.mutedForeground} />
          }
          // Counts the routines that are switched on; nothing until the first read lands.
          value={
            routines
              ? t("{count} on", { count: routines.filter((routine) => routine.active).length })
              : undefined
          }
          onPress={() => router.push({ pathname: "/routines", params: { botId, name } })}
        />
        <SettingsRow
          key="artifacts"
          accessibilityRole="button"
          chevron="right"
          title={t("Artifacts")}
          leading={
            <NativeSymbol ios="folder" android="folder-outline" color={tokens.mutedForeground} />
          }
          onPress={() => router.push({ pathname: "/artifacts", params: { botId } })}
        />
        <SettingsRow
          key="computer"
          accessibilityRole="button"
          chevron="right"
          title={t("Computer")}
          leading={
            <NativeSymbol
              ios="desktopcomputer"
              android="desktop-outline"
              color={tokens.mutedForeground}
            />
          }
          value={
            computer?.state === "running"
              ? t("Running")
              : computer?.state === "suspended"
                ? t("Asleep")
                : undefined
          }
          onPress={() => router.push({ pathname: "/computer", params: { botId, name } })}
        />
      </SettingsGroup>
      {bot ? (
        <SettingsGroup footer={t("Get notified when this Bot finishes or needs input")}>
          <SettingsSwitch
            key="notifications"
            label={t("Notifications")}
            value={bot.notifyOnFinish}
            onChange={setNotifyOnFinish}
          />
        </SettingsGroup>
      ) : null}
    </ScrollView>
  );
}

function createStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: native.groupedPage },
    content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 28 },
    compactContent: { paddingHorizontal: 8 },
    identity: { alignItems: "center", gap: 8 },
    edit: { alignSelf: "center", marginTop: 4 },
    avatarSpace: { width: 96, height: 96 },
    name: { color: native.label, fontSize: 22, fontWeight: "600", textAlign: "center" },
  });
}
