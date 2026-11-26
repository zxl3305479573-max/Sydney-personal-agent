import { botColors } from "@rakazo/ui-tokens";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BotAvatar } from "../components/bot-avatar";
import { glassHeaderOptions } from "../components/glass-title";
import { MotionPressable } from "../components/motion-pressable";
import { NativeSwitch } from "../components/native-switch";
import { NativeSymbol } from "../components/native-symbol";
import { SettingsGroup, SettingsRow } from "../components/settings-group";
import type { MobileBot } from "../lib/api";
import { rpc, selectedSpaceId } from "../lib/api";
import type { CompanionScreenState } from "../lib/companion-activity";
import {
  companionAvailable,
  companionScreenState,
  presentCompanionScreen,
  stopCompanionScreen,
  subscribeCompanionScreenState,
  takeCompanionScreenText,
} from "../lib/companion-activity";
import { buildCompanionCaptureUrl } from "../lib/companion-capture";
import {
  startCompanionScreenAuto,
  stopCompanionScreenAuto,
  useCompanionScreenAuto,
} from "../lib/companion-screen-auto";
import {
  captureScreenSendScope,
  screenSendScopeCurrent,
  sendReviewedScreenText,
} from "../lib/companion-screen-send";
import {
  companionStatusDisplay,
  loadCompanionPreferences,
  startUnifiedCompanion,
  stopUnifiedCompanion,
  switchUnifiedCompanionBot,
  updateCompanionPreferences,
  useCompanionSession,
} from "../lib/companion-session";
import { confirmAndLaunchCompanionVoiceCall } from "../lib/companion-voice-launch";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens, useResolvedAppearance } from "../lib/native";
import { previewSnippet } from "../lib/preview";
import { useScreenBackground } from "../lib/scoped-theme-context";
import { currentSessionGeneration } from "../lib/session";
import { useSideInsets } from "../lib/side-insets";
import { errorText } from "../lib/user-error";

const FALLBACK_COLOR = botColors[3];

export default function CompanionConsoleScreen() {
  const router = useRouter();
  const insets = useSideInsets();
  const tokens = useMobileTokens();
  const appearance = useResolvedAppearance();
  const screenBackground = useScreenBackground(native.groupedPage);
  const { locale, t } = useI18n();
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const copy = (zhHans: string, zhHant: string, en: string) =>
    chinese ? (traditional ? zhHant : zhHans) : en;

  const session = useCompanionSession();
  const screenAuto = useCompanionScreenAuto();
  const [bots, setBots] = useState<MobileBot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [screenState, setScreenState] = useState<CompanionScreenState>("unsupported");
  const [busy, setBusy] = useState(false);
  const [copiedShortcut, setCopiedShortcut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const focusedRef = useRef(false);

  const available = companionAvailable();
  const active = session.active;
  const prefs = session.preferences;

  useEffect(() => {
    void loadCompanionPreferences();
  }, []);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      let mounted = true;
      const loadBots = () => {
        void rpc("spaces/list")
          .then((result) => {
            if (mounted && Array.isArray(result.current.bots)) {
              setBots(result.current.bots);
            }
          })
          .catch(() => undefined);
      };
      loadBots();

      let offScreen: () => void = () => undefined;
      if (available) {
        offScreen = subscribeCompanionScreenState((state) => {
          if (mounted) setScreenState(state);
        });
        void companionScreenState()
          .then((state) => {
            if (mounted) setScreenState(state);
          })
          .catch(() => {
            if (mounted) setScreenState("unsupported");
          });
      } else {
        setScreenState("unsupported");
      }

      const appSub = AppState.addEventListener("change", (next) => {
        if (next === "active") {
          loadBots();
          if (available) {
            void companionScreenState()
              .then((state) => {
                if (mounted) setScreenState(state);
              })
              .catch(() => undefined);
          }
        }
      });

      return () => {
        mounted = false;
        focusedRef.current = false;
        offScreen();
        appSub.remove();
      };
    }, [available]),
  );

  const targetBot = useMemo(() => {
    if (active) {
      return (
        bots.find((bot) => bot.id === active.botId) ?? {
          id: active.botId,
          name: active.botName,
          color: active.botColor,
          avatarSet: active.botAvatarSet ?? undefined,
          status: "idle" as const,
          unread: false,
          pinned: false,
        }
      );
    }
    if (selectedBotId) {
      const explicit = bots.find((bot) => bot.id === selectedBotId);
      if (explicit) return explicit;
    }
    if (prefs.preferredBotId) {
      const preferred = bots.find((bot) => bot.id === prefs.preferredBotId);
      if (preferred) return preferred;
    }
    return bots[0] ?? null;
  }, [active, bots, prefs.preferredBotId, selectedBotId]);

  const isLight = appearance === "light";
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder = isLight ? "rgba(38, 35, 31, 0.06)" : "rgba(245, 244, 240, 0.10)";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const statusInfo = companionStatusDisplay(session.runtime.detailStatus, locale);
  const statusColor =
    statusInfo.tone === "error"
      ? isLight
        ? "#B42318"
        : "#F97066"
      : statusInfo.tone === "busy"
        ? isLight
          ? "#9A5B02"
          : "#F5C469"
        : statusInfo.tone === "voice"
          ? isLight
            ? "#245A8D"
            : "#8EC5FC"
          : isLight
            ? "#2E6F4E"
            : "#8ADBA9";

  const handleToggleCompanion = async () => {
    if (busy || !targetBot) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      if (active) {
        await stopUnifiedCompanion();
      } else {
        await startUnifiedCompanion({
          botId: targetBot.id,
          botName: targetBot.name,
          botColor: targetBot.color || FALLBACK_COLOR,
          botAvatarSet: targetBot.avatarSet,
          spaceId: selectedSpaceId(),
          showReply: prefs.showReply,
          initialReply: "preview" in targetBot ? targetBot.preview : null,
        });
      }
    } catch (error) {
      setErrorMessage(errorText(error, t("Try again.")));
    } finally {
      setBusy(false);
    }
  };

  const handleSelectBot = async (bot: MobileBot) => {
    if (busy) return;
    setSelectedBotId(bot.id);
    setErrorMessage(null);
    void updateCompanionPreferences({ preferredBotId: bot.id });
    if (!active || active.botId === bot.id) return;
    setBusy(true);
    try {
      await switchUnifiedCompanionBot({
        botId: bot.id,
        botName: bot.name,
        botColor: bot.color || FALLBACK_COLOR,
        botAvatarSet: bot.avatarSet,
        spaceId: selectedSpaceId(),
        showReply: prefs.showReply,
        initialReply: bot.preview ?? null,
      });
    } catch (error) {
      setErrorMessage(errorText(error, t("Try again.")));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleShowReply = async (next: boolean) => {
    await updateCompanionPreferences({ showReply: next });
    if (active && active.mode === "live-activity" && targetBot) {
      setBusy(true);
      try {
        await startUnifiedCompanion({
          botId: targetBot.id,
          botName: targetBot.name,
          botColor: targetBot.color || FALLBACK_COLOR,
          botAvatarSet: targetBot.avatarSet,
          spaceId: active.spaceId,
          showReply: next,
          initialReply:
            session.runtime.latestReply ?? ("preview" in targetBot ? targetBot.preview : null),
        });
      } catch (error) {
        setErrorMessage(errorText(error, t("Try again.")));
      } finally {
        setBusy(false);
      }
    }
  };

  const handleToggleScreen = () => {
    if (!active || !available || screenState === "stopping") return;
    if (screenState !== "idle") {
      stopCompanionScreenAuto();
      void stopCompanionScreen().catch((error) =>
        Alert.alert(copy("停止失败", "停止失敗", "Stop failed"), errorText(error, t("Try again."))),
      );
      return;
    }
    let scope: ReturnType<typeof captureScreenSendScope>;
    try {
      scope = captureScreenSendScope(active.botId);
    } catch (error) {
      Alert.alert(
        copy("无法开启屏幕识别", "無法開啟螢幕辨識", "Screen capture unavailable"),
        errorText(error, copy("请重新开启陪伴。", "請重新開啟陪伴。", "Restart companion first.")),
      );
      return;
    }
    const generation = currentSessionGeneration();
    const spaceId = selectedSpaceId();
    Alert.alert(
      copy("本机屏幕识别预览", "本機螢幕辨識預覽", "On-device screen preview"),
      copy(
        "系统会让你选择共享的画面，画面可能包含个人信息。文字在手机上识别；你可以查看后发送，也可以另行授权自动回应。不录音，可随时停止。",
        "系統會讓你選擇共享的畫面，畫面可能包含個人資訊。文字在手機上辨識；你可以查看後發送，也可以另行授權自動回應。不錄音，可隨時停止。",
        "Choose a screen to share. Text is recognized on-device; nothing is sent until you review or explicitly enable auto-response.",
      ),
      [
        { text: copy("取消", "取消", "Cancel"), style: "cancel" },
        {
          text: copy("选择共享画面", "選擇共享畫面", "Choose screen"),
          onPress: () => {
            if (
              !focusedRef.current ||
              generation !== currentSessionGeneration() ||
              spaceId !== selectedSpaceId() ||
              !screenSendScopeCurrent(scope)
            ) {
              Alert.alert(
                copy("会话已切换", "會話已切換", "Session changed"),
                copy(
                  "请重新开启屏幕识别。",
                  "請重新開啟螢幕辨識。",
                  "Try starting screen capture again.",
                ),
              );
              return;
            }
            void presentCompanionScreen(active.botId, spaceId).catch((error) =>
              Alert.alert(
                copy("无法开启屏幕识别", "無法開啟螢幕辨識", "Could not start screen capture"),
                errorText(error, t("Try again.")),
              ),
            );
          },
        },
      ],
    );
  };

  const handlePreviewScreenText = async () => {
    if (!active) return;
    const generation = currentSessionGeneration();
    const spaceId = selectedSpaceId();
    try {
      const scope = captureScreenSendScope(active.botId);
      const text = await takeCompanionScreenText();
      if (
        !focusedRef.current ||
        generation !== currentSessionGeneration() ||
        spaceId !== selectedSpaceId()
      )
        return;
      if (!text) {
        Alert.alert(
          copy("本机识别预览", "本機辨識預覽", "Screen text preview"),
          copy(
            "当前没有可用的新文字，请稍后重试。",
            "目前沒有可用的新文字，請稍後重試。",
            "No new text recognized yet.",
          ),
        );
        return;
      }
      Alert.alert(
        copy("确认分享屏幕文字", "確認分享螢幕文字", "Share recognized text"),
        `${text}\n\n${copy(
          "发送后，以上文字会作为聊天消息保存，并发送到当前后台及 Bot 所用模型服务。",
          "發送後，以上文字會作為聊天訊息保存，並發送到目前後台及 Bot 所用模型服務。",
          "Sending saves this text as a chat message and sends it to the server and bot model.",
        )}`,
        [
          { text: copy("取消", "取消", "Cancel"), style: "cancel" },
          {
            text: copy("发送给 Bot", "發送給 Bot", "Send to bot"),
            onPress: () => {
              void sendReviewedScreenText(scope, text)
                .then(() => {
                  router.push({
                    pathname: "/thread",
                    params: {
                      botId: active.botId,
                      name: active.botName,
                      ...(spaceId ? { spaceId } : {}),
                    },
                  });
                })
                .catch((error) =>
                  Alert.alert(
                    copy("发送失败", "發送失敗", "Send failed"),
                    errorText(error, t("Try again.")),
                  ),
                );
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        copy("无法读取预览", "無法讀取預覽", "Preview failed"),
        errorText(error, t("Try again.")),
      );
    }
  };

  const handleToggleScreenAuto = () => {
    if (!active) return;
    if (screenAuto.phase === "active" || screenAuto.phase === "starting") {
      stopCompanionScreenAuto();
      return;
    }
    let scope: ReturnType<typeof captureScreenSendScope>;
    try {
      scope = captureScreenSendScope(active.botId);
    } catch (error) {
      Alert.alert(
        copy("无法开启自动回应", "無法開啟自動回應", "Auto-response unavailable"),
        errorText(error, copy("请重新开启陪伴。", "請重新開啟陪伴。", "Restart companion first.")),
      );
      return;
    }
    const generation = currentSessionGeneration();
    Alert.alert(
      copy(
        "开启屏幕自动回应（实验功能）",
        "開啟螢幕自動回應（實驗功能）",
        "Screen auto-response (Experimental)",
      ),
      copy(
        "开启后，识别出的屏幕文字会发送到当前后台和模型服务，最多持续五分钟且可随时停止。请避免共享敏感内容。",
        "開啟後，辨識出的螢幕文字會發送到目前後台和模型服務，最多持續五分鐘且可隨時停止。請避免共享敏感內容。",
        "Recognized screen text will be sent to the server and model for up to 5 minutes. Avoid sensitive screens.",
      ),
      [
        { text: copy("取消", "取消", "Cancel"), style: "cancel" },
        {
          text: copy("仅文字", "僅文字", "Text only"),
          onPress: () => {
            if (generation === currentSessionGeneration() && screenSendScopeCurrent(scope)) {
              void startCompanionScreenAuto(active.botId, false).catch((error) =>
                Alert.alert(
                  copy("无法开启自动回应", "無法開啟自動回應", "Failed"),
                  errorText(error),
                ),
              );
            }
          },
        },
        {
          text: copy("同意并播报", "同意並播報", "Text + Voice"),
          onPress: () => {
            if (generation === currentSessionGeneration() && screenSendScopeCurrent(scope)) {
              void startCompanionScreenAuto(active.botId, true).catch((error) =>
                Alert.alert(
                  copy("无法开启自动回应", "無法開啟自動回應", "Failed"),
                  errorText(error),
                ),
              );
            }
          },
        },
      ],
    );
  };

  const shortcutUrl = buildCompanionCaptureUrl({
    source: "clipboard",
    speak: true,
  });

  const handleCopyShortcutUrl = async () => {
    try {
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(shortcutUrl);
      setCopiedShortcut(true);
      setTimeout(() => setCopiedShortcut(false), 2_000);
    } catch {
      setErrorMessage(
        copy("复制失败，请手动抄写链接。", "複製失敗，請手動抄寫連結。", "Copy failed."),
      );
    }
  };

  const liveReplyPreview =
    active && prefs.showReply && session.runtime.latestReply
      ? previewSnippet(session.runtime.latestReply, 120)
      : null;

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: screenBackground }}>
      <Stack.Screen
        options={glassHeaderOptions(copy("后台陪伴", "背景陪伴", "Background Companion"))}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={insets}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 40,
          gap: 20,
        }}
      >
        {/* Hero Status Card */}
        <View
          testID="companion-console-hero"
          style={{
            backgroundColor: cardBg,
            borderRadius: 24,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: cardBorder,
            padding: 20,
            gap: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            {targetBot ? (
              <BotAvatar
                color={targetBot.color || FALLBACK_COLOR}
                avatarSet={targetBot.avatarSet}
                identity={targetBot.id}
                size={54}
                status={
                  active && session.runtime.detailStatus === "thinking"
                    ? "running"
                    : targetBot.status
                }
                motion="lazy"
              />
            ) : (
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  backgroundColor: chipBg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <NativeSymbol
                  ios="sparkles"
                  android="sparkles-outline"
                  size={24}
                  color={tokens.mutedForeground}
                />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: tokens.foreground,
                  fontSize: 19,
                  lineHeight: 24,
                  fontWeight: "700",
                }}
              >
                {targetBot?.name ?? copy("暂无可用伙伴", "暫無可用夥伴", "No bot available")}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 3.5,
                    backgroundColor: active ? statusColor : tokens.mutedForeground,
                  }}
                />
                <Text
                  style={{
                    color: active ? statusColor : tokens.mutedForeground,
                    fontSize: 13.5,
                    lineHeight: 18,
                    fontWeight: "600",
                  }}
                >
                  {active
                    ? `${statusInfo.label} · ${
                        active.mode === "live-activity"
                          ? copy("灵动岛 + 应用内", "動態島 + 應用內", "Live Activity + In-App")
                          : copy("应用内模式", "應用內模式", "In-App mode")
                      }`
                    : copy("尚未开启陪伴", "尚未開啟陪伴", "Companion is off")}
                </Text>
              </View>
            </View>
          </View>

          {active ? (
            <View
              style={{
                backgroundColor: chipBg,
                borderRadius: 16,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: chipBorder,
                paddingHorizontal: 14,
                paddingVertical: 11,
                gap: 4,
              }}
            >
              <Text style={{ color: tokens.mutedForeground, fontSize: 11.5, fontWeight: "600" }}>
                {copy("最新动态", "最新動態", "Latest")}
              </Text>
              <Text style={{ color: tokens.foreground, fontSize: 14, lineHeight: 20 }}>
                {liveReplyPreview ??
                  (!prefs.showReply
                    ? copy(
                        "已开启隐私模式，不展示回复摘要。",
                        "已開啟隱私模式，不顯示回覆摘要。",
                        "Privacy mode enabled — reply text hidden.",
                      )
                    : copy(
                        "正在静候新消息或任务进展…",
                        "正在靜候新訊息或任務進展…",
                        "Standing by for new replies or task updates…",
                      ))}
              </Text>
            </View>
          ) : null}

          {errorMessage ? (
            <Text
              accessibilityRole="alert"
              style={{ color: isLight ? "#B42318" : "#F97066", fontSize: 13, lineHeight: 18 }}
            >
              {errorMessage}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <MotionPressable
              preset="control"
              testID="companion-console-toggle"
              accessibilityRole="button"
              disabled={busy || !targetBot}
              onPress={() => void handleToggleCompanion()}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: active ? chipBg : isLight ? "#2E2B27" : "#E7E4DD",
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: active ? chipBorder : "transparent",
                opacity: busy || !targetBot ? 0.45 : 1,
              }}
            >
              <Text
                style={{
                  color: active ? tokens.foreground : isLight ? "#FAF8F4" : "#15171C",
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                {active
                  ? copy("停止陪伴", "停止陪伴", "Stop companion")
                  : copy("开启陪伴", "開啟陪伴", "Start companion")}
              </Text>
            </MotionPressable>

            {targetBot ? (
              <>
                <MotionPressable
                  preset="control"
                  testID="companion-console-open-chat"
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/thread",
                      params: {
                        botId: targetBot.id,
                        name: targetBot.name,
                        ...(selectedSpaceId() ? { spaceId: selectedSpaceId()! } : {}),
                      },
                    })
                  }
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: chipBg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: chipBorder,
                  }}
                >
                  <Text style={{ color: tokens.foreground, fontSize: 13.5, fontWeight: "500" }}>
                    {copy("进入对话", "進入對話", "Open chat")}
                  </Text>
                </MotionPressable>

                <MotionPressable
                  preset="control"
                  testID="companion-console-capture"
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/companion-capture",
                      params: {
                        botId: targetBot.id,
                        source: "clipboard",
                        speak: "1",
                        ...(selectedSpaceId() ? { spaceId: selectedSpaceId()! } : {}),
                      },
                    })
                  }
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: chipBg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: chipBorder,
                  }}
                >
                  <NativeSymbol
                    ios="camera.viewfinder"
                    android="scan-outline"
                    size={14}
                    color={tokens.foreground}
                  />
                  <Text style={{ color: tokens.foreground, fontSize: 13.5, fontWeight: "500" }}>
                    {copy("截屏提问", "截圖提問", "Screenshot & Ask")}
                  </Text>
                </MotionPressable>

                <MotionPressable
                  preset="control"
                  testID="companion-console-voice-call"
                  accessibilityRole="button"
                  onPress={() =>
                    confirmAndLaunchCompanionVoiceCall(
                      {
                        botId: targetBot.id,
                        botName: targetBot.name,
                        botColor: targetBot.color || FALLBACK_COLOR,
                        botAvatarSet: targetBot.avatarSet,
                      },
                      {
                        locale,
                        onOpenVoiceSettings: () => router.push("/voice"),
                        onError: (msg) => setErrorMessage(msg),
                      },
                    )
                  }
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: chipBg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: chipBorder,
                  }}
                >
                  <NativeSymbol
                    ios="waveform"
                    android="mic-outline"
                    size={14}
                    color={tokens.foreground}
                  />
                  <Text style={{ color: tokens.foreground, fontSize: 13.5, fontWeight: "500" }}>
                    {copy("语音通话", "語音通話", "Voice call")}
                  </Text>
                </MotionPressable>
              </>
            ) : null}
          </View>
        </View>

        {/* Bot Selector */}
        {bots.length > 0 ? (
          <SettingsGroup label={copy("选择陪伴伙伴", "選擇陪伴夥伴", "Companion Partner")}>
            {bots.map((bot) => {
              const selected = targetBot?.id === bot.id;
              return (
                <SettingsRow
                  key={bot.id}
                  accessibilityRole="button"
                  title={bot.name}
                  detail={
                    active?.botId === bot.id
                      ? copy("当前正在陪伴", "目前正在陪伴", "Active companion")
                      : bot.preview
                        ? previewSnippet(bot.preview, 44)
                        : undefined
                  }
                  leading={
                    <BotAvatar
                      color={bot.color || FALLBACK_COLOR}
                      avatarSet={bot.avatarSet}
                      identity={bot.id}
                      size={30}
                      status={bot.status}
                      motion="lazy"
                    />
                  }
                  trailing={
                    selected ? (
                      <NativeSymbol
                        ios="checkmark.circle.fill"
                        android="checkmark-circle"
                        size={19}
                        color={statusColor}
                      />
                    ) : undefined
                  }
                  onPress={() => void handleSelectBot(bot)}
                />
              );
            })}
          </SettingsGroup>
        ) : null}

        {/* Companion Preferences */}
        <SettingsGroup
          label={copy("陪伴偏好", "陪伴偏好", "Preferences")}
          footer={copy(
            "本地提醒受「设置 → 消息通知」权限与总开关约束；语音播报在通话开始或停止陪伴时自动静音。",
            "本機提醒受「設定 → 訊息通知」權限與總開關約束；語音播報在通話開始或停止陪伴時自動靜音。",
            "Local alerts follow Settings → Notifications. Speech readout stops automatically during voice calls or when companion stops.",
          )}
        >
          <SettingsRow
            title={copy("显示最新短回复", "顯示最新短回覆", "Show latest reply")}
            detail={copy(
              "关闭后卡片、悬浮条与锁屏仅显示伙伴状态，隐藏正文",
              "關閉後卡片、懸浮條與鎖屏僅顯示夥伴狀態，隱藏正文",
              "Hide reply previews on card, floating bar, and Lock Screen",
            )}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy("显示最新短回复", "顯示最新短回覆", "Show latest reply")}
                disabled={busy}
                value={prefs.showReply}
                onValueChange={(value) => void handleToggleShowReply(value)}
              />
            }
          />
          <SettingsRow
            title={copy("跨页悬浮陪伴胶囊", "跨頁懸浮陪伴膠囊", "Floating companion bar")}
            detail={copy(
              "切换到聊天列表、项目、地图等页面时保持紧凑状态栏",
              "切換到聊天列表、專案、地圖等頁面時保持緊湊狀態欄",
              "Show compact companion bar while browsing other screens",
            )}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy(
                  "跨页悬浮陪伴胶囊",
                  "跨頁懸浮陪伴膠囊",
                  "Floating companion bar",
                )}
                value={prefs.showFloatingBar}
                onValueChange={(value) =>
                  void updateCompanionPreferences({ showFloatingBar: value })
                }
              />
            }
          />
          <SettingsRow
            title={copy("新回复与待处理本地提醒", "新回覆與待處理本機提醒", "Local reply alerts")}
            detail={copy(
              "不在陪伴对话页时弹出本机通知，点击直达会话",
              "不在陪伴對話頁時彈出本機通知，點擊直達會話",
              "Send local notification when a new reply or prompt arrives",
            )}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy(
                  "新回复与待处理本地提醒",
                  "新回覆與待處理本機提醒",
                  "Local reply alerts",
                )}
                value={prefs.notifyOnReply}
                onValueChange={(value) => void updateCompanionPreferences({ notifyOnReply: value })}
              />
            }
          />
          <SettingsRow
            title={copy("新回复本机语音播报", "新回覆本機語音播報", "Speak new replies")}
            detail={copy(
              "收到新回复时通过手机本机语音朗读，默认关闭",
              "收到新回覆時透過手機本機語音朗讀，預設關閉",
              "Read incoming replies aloud using on-device speech",
            )}
            trailing={
              <NativeSwitch
                accessibilityLabel={copy(
                  "新回复本机语音播报",
                  "新回覆本機語音播報",
                  "Speak new replies",
                )}
                value={prefs.speakReplies}
                onValueChange={(value) => void updateCompanionPreferences({ speakReplies: value })}
              />
            }
          />
          <SettingsRow
            accessibilityRole="button"
            chevron="right"
            title={copy("消息通知设置", "訊息通知設定", "Notification settings")}
            detail={copy(
              "管理通知总开关、提示音与系统权限",
              "管理通知總開關、提示音與系統權限",
              "Manage notification permissions and sound",
            )}
            onPress={() => router.push("/notifications")}
          />
        </SettingsGroup>

        {/* Shortcuts / Back Tap Screenshot Companion */}
        <SettingsGroup
          label={copy(
            "背面轻点 / 快捷指令一键截屏",
            "背面輕點 / 捷徑一鍵截圖",
            "Back Tap / Shortcuts Screenshot",
          )}
          footer={copy(
            "在 iPhone「快捷指令」新建 3 步流程：① 截屏 → ② 拷贝到剪贴板 → ③ 打开下方 URL（如需先输文字可加「请求输入」并拼接 &prompt=文本），然后在「设置 → 辅助功能 → 触控 → 轻点背面」或「操作按钮」绑定该快捷指令，即可在任意应用一键截屏并同步输入发给陪伴伙伴且语音回复。",
            "在 iPhone「捷徑」新建 3 步流程：① 截圖 → ② 拷貝到剪貼簿 → ③ 開啟下方 URL（如需先輸文字可加「要求輸入」並拼接 &prompt=文本），再於「設定 → 輔助使用 → 觸控 → 背面輕點」或「動作按鈕」綁定該捷徑，即可在任意 App 一鍵截圖並同步輸入發給陪伴夥伴且語音回覆。",
            "In Apple Shortcuts, add 3 actions: 1) Take Screenshot -> 2) Copy to Clipboard -> 3) Open the URL below. Bind it to Back Tap or Action Button to send screenshots with optional text from any app and hear spoken replies.",
          )}
        >
          <SettingsRow
            accessibilityRole="button"
            title={copy("复制快捷指令链接", "複製捷徑連結", "Copy Shortcuts URL")}
            detail={shortcutUrl}
            value={copiedShortcut ? copy("已复制", "已複製", "Copied") : undefined}
            onPress={() => void handleCopyShortcutUrl()}
          />
          <SettingsRow
            accessibilityRole="button"
            chevron="right"
            title={copy("立即打开截屏提问", "立即開啟截圖提問", "Open Screenshot & Ask")}
            detail={copy(
              "粘贴最新截屏、同时输入问题并发给当前陪伴伙伴",
              "貼上最新截圖、同時輸入問題並發給目前陪伴夥伴",
              "Paste screenshot, type a prompt, and send to active companion",
            )}
            onPress={() =>
              router.push({
                pathname: "/companion-capture",
                params: {
                  source: "clipboard",
                  speak: "1",
                  ...(targetBot ? { botId: targetBot.id } : {}),
                  ...(selectedSpaceId() ? { spaceId: selectedSpaceId()! } : {}),
                },
              })
            }
          />
        </SettingsGroup>

        {/* Screen Companion & Capability Boundary */}
        {available && screenState !== "unsupported" ? (
          <SettingsGroup
            label={copy(
              "屏幕陪伴（实验功能）",
              "螢幕陪伴（實驗功能）",
              "Screen Companion (Experimental)",
            )}
          >
            <SettingsRow
              accessibilityRole="button"
              title={
                screenState === "idle"
                  ? copy(
                      "开启屏幕识别（本机预览）",
                      "開啟螢幕辨識（本機預覽）",
                      "Start screen capture",
                    )
                  : copy("停止屏幕识别", "停止螢幕辨識", "Stop screen capture")
              }
              detail={
                screenState === "capturing"
                  ? copy("屏幕识别进行中", "螢幕辨識進行中", "Capturing screen")
                  : screenState === "paused"
                    ? copy("共享内容暂不可用，可点击停止", "共享內容暫不可用，可點擊停止", "Paused")
                    : undefined
              }
              disabled={!active && screenState === "idle"}
              onPress={handleToggleScreen}
            />
            {screenState === "capturing" && active ? (
              <>
                <SettingsRow
                  accessibilityRole="button"
                  title={copy("查看本机识别预览", "查看本機辨識預覽", "Preview recognized text")}
                  onPress={() => void handlePreviewScreenText()}
                />
                <SettingsRow
                  accessibilityRole="button"
                  title={
                    screenAuto.phase === "active" || screenAuto.phase === "starting"
                      ? copy("停止屏幕自动回应", "停止螢幕自動回應", "Stop auto-response")
                      : copy(
                          "开启屏幕自动回应（实验）",
                          "開啟螢幕自動回應（實驗）",
                          "Enable auto-response",
                        )
                  }
                  detail={screenAuto.error ?? screenAuto.reply}
                  onPress={handleToggleScreenAuto}
                />
              </>
            ) : null}
          </SettingsGroup>
        ) : (
          <SettingsGroup
            label={copy("当前版本能力说明", "目前版本能力說明", "Build Capabilities")}
            footer={copy(
              "当前侧载版本支持应用内跨页陪伴、实时断连重连、悬浮陪伴胶囊、本地通知提醒与本机语音播报；iOS 灵动岛 Live Activity 与跨应用屏幕识别需带扩展的实验 IPA 构建。",
              "目前側載版本支援應用內跨頁陪伴、即時斷線重連、懸浮陪伴膠囊、本機通知提醒與本機語音播報；iOS 動態島 Live Activity 與跨應用螢幕辨識需帶擴充的實驗 IPA 建置。",
              "This build supports in-app cross-screen companion, live SSE reconnect, floating bar, local alerts, and speech readout. Dynamic Island Live Activity and ScreenCaptureKit require the experimental IPA build.",
            )}
          >
            <SettingsRow
              title={copy("运行模式", "運行模式", "Mode")}
              value={copy("应用内跨页陪伴", "應用內跨頁陪伴", "In-App Companion")}
            />
          </SettingsGroup>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
