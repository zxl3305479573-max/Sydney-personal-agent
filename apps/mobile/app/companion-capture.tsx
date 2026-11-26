import { botColors } from "@rakazo/ui-tokens";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BotAvatar } from "../components/bot-avatar";
import { glassHeaderOptions } from "../components/glass-title";
import { MotionPressable } from "../components/motion-pressable";
import { NativeSwitch } from "../components/native-switch";
import { NativeSymbol } from "../components/native-symbol";
import type { MobileBot } from "../lib/api";
import { rpc, selectedSpaceId } from "../lib/api";
import { activeCompanionIdentity } from "../lib/companion-activity";
import type { CapturedScreenshot } from "../lib/companion-capture";
import {
  parseClipboardImageDataUri,
  pickScreenshotFromLibrary,
  quickCapturePrompts,
  readClipboardScreenshot,
  sendCompanionCapture,
  waitForCompanionCaptureReply,
} from "../lib/companion-capture";
import { useCompanionSession } from "../lib/companion-session";
import { companionNavigationAllowed } from "../lib/companion-voice-guard";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens, useResolvedAppearance } from "../lib/native";
import { useScreenBackground } from "../lib/scoped-theme-context";
import { useSideInsets } from "../lib/side-insets";
import { errorText } from "../lib/user-error";
import { getVoicePlaybackState, speakWithDeviceVoice, stopSpeaking } from "../lib/voice";

const FALLBACK_COLOR = botColors[3];

function singleParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value) && value.length > 0) return value[0]?.trim() || undefined;
  return undefined;
}

export default function CompanionCaptureScreen() {
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

  const params = useLocalSearchParams<{
    botId?: string | string[];
    spaceId?: string | string[];
    source?: string | string[];
    prompt?: string | string[];
    speak?: string | string[];
    mode?: string | string[];
    companionLink?: string | string[];
    companionToken?: string | string[];
  }>();

  const paramBotId = singleParam(params.botId);
  const paramSource = singleParam(params.source);
  const paramPrompt = singleParam(params.prompt);
  const paramSpeak = singleParam(params.speak);
  const paramMode = singleParam(params.mode) === "message" ? "message" : "capture";

  const companionAllowed = companionNavigationAllowed({
    companionLink: params.companionLink,
    companionVoice: undefined,
    companionToken: params.companionToken,
    botId: params.botId,
    spaceId: params.spaceId,
    activity: activeCompanionIdentity(),
  });

  const session = useCompanionSession();
  const [bots, setBots] = useState<MobileBot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(paramBotId ?? null);
  const [screenshot, setScreenshot] = useState<CapturedScreenshot | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [text, setText] = useState(paramPrompt ?? "");
  const [speakReply, setSpeakReply] = useState(() =>
    paramSpeak === "0"
      ? false
      : paramSpeak === "1" || paramSource === "clipboard" || session.preferences.speakReplies,
  );
  const [phase, setPhase] = useState<"compose" | "sending" | "waiting" | "replied">("compose");
  const [waitingDetail, setWaitingDetail] = useState<"thinking" | "waiting_input">("thinking");
  const [replyText, setReplyText] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const waitAbortRef = useRef<AbortController | null>(null);
  const speechOwnerRef = useRef<symbol>(Symbol("companion-capture-speech"));

  const stopLocalSpeech = useCallback(() => {
    setSpeaking(false);
    try {
      stopSpeaking(speechOwnerRef.current);
    } catch {
      // Ignore speech stop errors during teardown.
    }
  }, []);

  const speakTextAloud = useCallback(async (botId: string, content: string) => {
    if (!content.trim()) return;
    try {
      if (getVoicePlaybackState().status !== "idle") return;
      setSpeaking(true);
      await speakWithDeviceVoice(content, botId, undefined, speechOwnerRef.current);
    } catch {
      // Keep text reply visible even if speech fails.
    } finally {
      setSpeaking(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void rpc("spaces/list")
      .then((result) => {
        if (mounted && Array.isArray(result.current.bots)) {
          setBots(result.current.bots);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!companionAllowed || paramSource !== "clipboard") return;
    let mounted = true;
    setLoadingImage(true);
    void readClipboardScreenshot()
      .then((captured) => {
        if (mounted && captured) setScreenshot(captured);
      })
      .finally(() => {
        if (mounted) setLoadingImage(false);
      });
    return () => {
      mounted = false;
    };
  }, [companionAllowed, paramSource]);

  useEffect(() => {
    return () => {
      waitAbortRef.current?.abort();
      stopLocalSpeech();
    };
  }, [stopLocalSpeech]);

  const targetBot = useMemo(() => {
    const requestedId =
      selectedBotId ?? paramBotId ?? session.active?.botId ?? session.preferences.preferredBotId;
    if (requestedId) {
      const found = bots.find((bot) => bot.id === requestedId);
      if (found) return found;
      if (session.active && session.active.botId === requestedId) {
        return {
          id: session.active.botId,
          name: session.active.botName,
          color: session.active.botColor,
          avatarSet: session.active.botAvatarSet ?? undefined,
          status: "idle" as const,
          unread: false,
          pinned: false,
        };
      }
    }
    return bots[0] ?? null;
  }, [bots, paramBotId, selectedBotId, session.active, session.preferences.preferredBotId]);

  const isLight = appearance === "light";
  const cardBg = isLight ? "#FFFEFC" : "#242933";
  const cardBorder = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const chipBg = isLight ? "#F8F6F2" : "#2A303B";
  const chipBorder = isLight ? "rgba(38, 35, 31, 0.08)" : "rgba(245, 244, 240, 0.12)";
  const primaryBg = isLight ? "#2E2B27" : "#E7E4DD";
  const primaryInk = isLight ? "#FAF8F4" : "#15171C";
  const errorInk = isLight ? "#B42318" : "#F97066";

  if (!companionAllowed) {
    return (
      <SafeAreaView
        edges={["bottom"]}
        style={{
          flex: 1,
          backgroundColor: screenBackground,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 14,
        }}
      >
        <Stack.Screen
          options={glassHeaderOptions(copy("快捷陪伴提问", "快捷陪伴提問", "Quick Companion"))}
        />
        <Text style={{ color: tokens.foreground, fontSize: 16, textAlign: "center" }}>
          {copy(
            "陪伴已结束或链接已失效，请重新开启陪伴。",
            "陪伴已結束或連結已失效，請重新開啟陪伴。",
            "Companion session ended or link expired.",
          )}
        </Text>
        <MotionPressable
          preset="control"
          accessibilityRole="button"
          onPress={() => router.replace("/")}
          style={{
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: primaryBg,
          }}
        >
          <Text style={{ color: primaryInk, fontSize: 14, fontWeight: "600" }}>
            {copy("返回首页", "返回首頁", "Return home")}
          </Text>
        </MotionPressable>
      </SafeAreaView>
    );
  }

  const handleReadClipboard = async () => {
    setLoadingImage(true);
    setErrorMessage(null);
    try {
      const captured = await readClipboardScreenshot();
      if (captured) {
        setScreenshot(captured);
      } else {
        setErrorMessage(
          copy(
            "剪贴板里暂时没有检测到图片，可以先截屏并拷贝，或从相册选择。",
            "剪貼簿中暫時沒有偵測到圖片，可先截圖並拷貝，或從相簿選擇。",
            "No image found in clipboard. Take a screenshot or pick from Photos.",
          ),
        );
      }
    } finally {
      setLoadingImage(false);
    }
  };

  const handlePickLibrary = async () => {
    setLoadingImage(true);
    setErrorMessage(null);
    try {
      const picked = await pickScreenshotFromLibrary();
      if (picked) setScreenshot(picked);
    } catch (error) {
      setErrorMessage(errorText(error, t("Try again.")));
    } finally {
      setLoadingImage(false);
    }
  };

  const handleSend = async () => {
    if (!targetBot || phase === "sending" || phase === "waiting") return;
    if (!text.trim() && !screenshot) {
      setErrorMessage(
        copy(
          "请添加截屏或输入你想说的内容。",
          "請加入截圖或輸入你想說的內容。",
          "Attach a screenshot or enter a message.",
        ),
      );
      return;
    }
    waitAbortRef.current?.abort();
    stopLocalSpeech();
    setErrorMessage(null);
    setReplyText(null);
    setPhase("sending");
    try {
      const sent = await sendCompanionCapture({
        botId: targetBot.id,
        text,
        screenshot,
        locale,
      });
      setPhase("waiting");
      setWaitingDetail("thinking");
      const controller = new AbortController();
      waitAbortRef.current = controller;
      const reply = await waitForCompanionCaptureReply({
        botId: targetBot.id,
        baselineMessageId: sent.baselineMessageId,
        initialCursor: sent.cursor,
        signal: controller.signal,
        onStatus: (nextDetail) => setWaitingDetail(nextDetail),
      });
      if (controller.signal.aborted) return;
      if (reply) {
        setReplyText(reply);
        setPhase("replied");
        if (speakReply) {
          void speakTextAloud(targetBot.id, reply);
        }
      } else {
        setPhase("compose");
      }
    } catch (error) {
      setPhase("compose");
      setErrorMessage(errorText(error, t("Try again.")));
    }
  };

  const canSend = Boolean(
    targetBot && (text.trim() || screenshot) && phase !== "sending" && phase !== "waiting",
  );
  const prompts = quickCapturePrompts(locale);
  const pasteControlAvailable = Platform.OS === "ios" && Boolean(Clipboard.isPasteButtonAvailable);

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: screenBackground }}>
      <Stack.Screen
        options={glassHeaderOptions(
          paramMode === "message"
            ? copy("快捷发消息", "快捷發訊息", "Quick Message")
            : copy("截屏分享与提问", "截圖分享與提問", "Screenshot & Ask"),
        )}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={insets}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 36,
            gap: 14,
          }}
        >
          {/* Target Bot Selector */}
          <View
            style={{
              backgroundColor: cardBg,
              borderRadius: 20,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: cardBorder,
              padding: 14,
              gap: 10,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: tokens.mutedForeground, fontSize: 12.5, fontWeight: "600" }}>
                {copy("发送给伙伴", "發送給夥伴", "Send to companion")}
              </Text>
              {session.active && targetBot?.id === session.active.botId ? (
                <Text
                  style={{
                    color: isLight ? "#2E6F4E" : "#8ADBA9",
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {copy("当前陪伴中", "目前陪伴中", "Active companion")}
                </Text>
              ) : null}
            </View>
            {bots.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {bots.map((bot) => {
                  const selected = targetBot?.id === bot.id;
                  return (
                    <MotionPressable
                      key={bot.id}
                      preset="control"
                      testID={`capture-bot-${bot.id}`}
                      accessibilityRole="button"
                      onPress={() => setSelectedBotId(bot.id)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: selected ? primaryBg : chipBg,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: selected ? "transparent" : chipBorder,
                      }}
                    >
                      <BotAvatar
                        color={bot.color || FALLBACK_COLOR}
                        avatarSet={bot.avatarSet}
                        identity={bot.id}
                        size={22}
                        motion="lazy"
                      />
                      <Text
                        numberOfLines={1}
                        style={{
                          color: selected ? primaryInk : tokens.foreground,
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {bot.name}
                      </Text>
                    </MotionPressable>
                  );
                })}
              </ScrollView>
            ) : targetBot ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <BotAvatar
                  color={targetBot.color || FALLBACK_COLOR}
                  avatarSet={targetBot.avatarSet}
                  identity={targetBot.id}
                  size={28}
                  motion="lazy"
                />
                <Text style={{ color: tokens.foreground, fontSize: 15, fontWeight: "600" }}>
                  {targetBot.name}
                </Text>
              </View>
            ) : (
              <Text style={{ color: tokens.mutedForeground, fontSize: 13.5 }}>
                {copy("暂无可用伙伴", "暫無可用夥伴", "No bots available")}
              </Text>
            )}
          </View>

          {/* Screenshot Card */}
          <View
            testID="companion-capture-image-card"
            style={{
              backgroundColor: cardBg,
              borderRadius: 22,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: cardBorder,
              padding: 14,
              gap: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <NativeSymbol
                  ios="camera.viewfinder"
                  android="scan-outline"
                  size={16}
                  color={tokens.foreground}
                />
                <Text style={{ color: tokens.foreground, fontSize: 15, fontWeight: "600" }}>
                  {copy("截屏画面", "截圖畫面", "Screenshot")}
                </Text>
              </View>
              {screenshot ? (
                <MotionPressable
                  preset="inline"
                  testID="capture-remove-image"
                  accessibilityRole="button"
                  onPress={() => setScreenshot(null)}
                >
                  <Text style={{ color: errorInk, fontSize: 13, fontWeight: "600" }}>
                    {copy("移除", "移除", "Remove")}
                  </Text>
                </MotionPressable>
              ) : null}
            </View>

            {loadingImage ? (
              <View style={{ height: 120, alignItems: "center", justifyContent: "center", gap: 8 }}>
                <ActivityIndicator color={tokens.foreground} />
                <Text style={{ color: tokens.mutedForeground, fontSize: 12.5 }}>
                  {copy("正在读取截屏…", "正在讀取截圖…", "Loading screenshot…")}
                </Text>
              </View>
            ) : screenshot ? (
              <View style={{ gap: 8 }}>
                <Image
                  testID="capture-preview-image"
                  source={{ uri: screenshot.previewUri }}
                  resizeMode="contain"
                  style={{
                    width: "100%",
                    height: 200,
                    borderRadius: 14,
                    backgroundColor: chipBg,
                  }}
                />
                <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
                  {`${screenshot.name} · ${Math.max(1, Math.round(screenshot.size / 1024))} KB`}
                </Text>
              </View>
            ) : (
              <Text style={{ color: tokens.mutedForeground, fontSize: 13, lineHeight: 18 }}>
                {copy(
                  "通过背面轻点／快捷指令截屏后会直接出现在这里；也可以点下方按钮粘贴刚截好的屏或从相册选取。",
                  "透過背面輕點／捷徑截圖後會直接出現在這裡；也可以點下方按鈕貼上剛截好的圖或從相簿選取。",
                  "Screenshots from Back Tap / Shortcuts appear here automatically, or paste / pick one below.",
                )}
              </Text>
            )}

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {pasteControlAvailable ? (
                <Clipboard.ClipboardPasteButton
                  acceptedContentTypes={["image"]}
                  imageOptions={{ format: "jpeg", jpegQuality: 0.85 }}
                  cornerStyle="capsule"
                  displayMode="iconAndLabel"
                  backgroundColor={primaryBg}
                  foregroundColor={primaryInk}
                  style={{ width: 112, height: 36 }}
                  onPress={(payload) => {
                    if (payload.type === "image") {
                      const parsed = parseClipboardImageDataUri(payload.data);
                      if (parsed) {
                        setScreenshot(parsed);
                        setErrorMessage(null);
                      }
                    }
                  }}
                />
              ) : null}

              <MotionPressable
                preset="control"
                testID="capture-paste-clipboard"
                accessibilityRole="button"
                onPress={() => void handleReadClipboard()}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 13,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: chipBg,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: chipBorder,
                }}
              >
                <NativeSymbol
                  ios="doc.on.clipboard"
                  android="clipboard-outline"
                  size={14}
                  color={tokens.foreground}
                />
                <Text style={{ color: tokens.foreground, fontSize: 13, fontWeight: "500" }}>
                  {copy("读取剪贴板截屏", "讀取剪貼簿截圖", "From clipboard")}
                </Text>
              </MotionPressable>

              <MotionPressable
                preset="control"
                testID="capture-pick-library"
                accessibilityRole="button"
                onPress={() => void handlePickLibrary()}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 13,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: chipBg,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: chipBorder,
                }}
              >
                <NativeSymbol
                  ios="photo.on.rectangle"
                  android="images-outline"
                  size={14}
                  color={tokens.foreground}
                />
                <Text style={{ color: tokens.foreground, fontSize: 13, fontWeight: "500" }}>
                  {copy("从相册选取", "從相簿選取", "Photo library")}
                </Text>
              </MotionPressable>
            </View>
          </View>

          {/* Simultaneous Message Input */}
          <View
            style={{
              backgroundColor: cardBg,
              borderRadius: 22,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: cardBorder,
              padding: 14,
              gap: 10,
            }}
          >
            <Text style={{ color: tokens.foreground, fontSize: 15, fontWeight: "600" }}>
              {copy(
                "补充想说的话（可选）",
                "補充想說的話（可選）",
                "Message (optional with screenshot)",
              )}
            </Text>
            <TextInput
              testID="capture-message-input"
              multiline
              autoFocus={paramMode === "message"}
              value={text}
              onChangeText={setText}
              placeholder={
                screenshot
                  ? copy(
                      "比如：帮我总结一下这张图，或留空直接发给伙伴分析…",
                      "例如：幫我總結這張圖，或留空直接交給夥伴分析…",
                      "Ask something about this screenshot, or leave empty…",
                    )
                  : copy(
                      "输入想直接发给伙伴的消息…",
                      "輸入想直接發給夥伴的訊息…",
                      "Type a quick message to your bot…",
                    )
              }
              placeholderTextColor={tokens.mutedForeground}
              style={{
                minHeight: 84,
                maxHeight: 160,
                padding: 12,
                borderRadius: 14,
                backgroundColor: chipBg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: chipBorder,
                color: tokens.foreground,
                fontSize: 15,
                lineHeight: 21,
                textAlignVertical: "top",
              }}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {prompts.map((preset) => (
                <MotionPressable
                  key={preset}
                  preset="control"
                  accessibilityRole="button"
                  onPress={() =>
                    setText((prev) => (prev.trim() ? `${prev.trim()} ${preset}` : preset))
                  }
                  style={{
                    paddingHorizontal: 11,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: chipBg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: chipBorder,
                  }}
                >
                  <Text style={{ color: tokens.foreground, fontSize: 12.5 }}>{preset}</Text>
                </MotionPressable>
              ))}
            </ScrollView>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 4,
              }}
            >
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: tokens.foreground, fontSize: 14, fontWeight: "500" }}>
                  {copy(
                    "收到回复后自动语音朗读",
                    "收到回覆後自動語音朗讀",
                    "Speak reply automatically",
                  )}
                </Text>
              </View>
              <NativeSwitch
                accessibilityLabel={copy(
                  "收到回复后自动语音朗读",
                  "收到回覆後自動語音朗讀",
                  "Speak reply automatically",
                )}
                value={speakReply}
                onValueChange={setSpeakReply}
              />
            </View>
          </View>

          {errorMessage ? (
            <Text
              accessibilityRole="alert"
              style={{ color: errorInk, fontSize: 13, lineHeight: 18 }}
            >
              {errorMessage}
            </Text>
          ) : null}

          {/* Primary Send CTA */}
          <MotionPressable
            preset="control"
            testID="capture-send-button"
            accessibilityRole="button"
            disabled={!canSend}
            onPress={() => void handleSend()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 14,
              borderRadius: 16,
              backgroundColor: primaryBg,
              opacity: canSend ? 1 : 0.45,
            }}
          >
            {phase === "sending" || phase === "waiting" ? (
              <ActivityIndicator size="small" color={primaryInk} />
            ) : (
              <NativeSymbol ios="paperplane.fill" android="send" size={16} color={primaryInk} />
            )}
            <Text style={{ color: primaryInk, fontSize: 15.5, fontWeight: "700" }}>
              {phase === "sending"
                ? copy("正在发送…", "正在發送…", "Sending…")
                : phase === "waiting"
                  ? waitingDetail === "waiting_input"
                    ? copy("等待你在对话中确认…", "等待你在對話中確認…", "Waiting for your input…")
                    : copy(
                        `${targetBot?.name ?? "伙伴"} 正在分析回复…`,
                        `${targetBot?.name ?? "夥伴"} 正在分析回覆…`,
                        `${targetBot?.name ?? "Bot"} is replying…`,
                      )
                  : copy(
                      `发送给 ${targetBot?.name ?? "伙伴"}`,
                      `發送給 ${targetBot?.name ?? "夥伴"}`,
                      `Send to ${targetBot?.name ?? "Bot"}`,
                    )}
            </Text>
          </MotionPressable>

          {/* Live Reply Result Card */}
          {replyText ? (
            <View
              testID="capture-reply-card"
              style={{
                backgroundColor: cardBg,
                borderRadius: 22,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: cardBorder,
                padding: 16,
                gap: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: tokens.foreground, fontSize: 15, fontWeight: "700" }}>
                  {copy(
                    `${targetBot?.name ?? "伙伴"} 的回复`,
                    `${targetBot?.name ?? "夥伴"} 的回覆`,
                    `${targetBot?.name ?? "Bot"}'s reply`,
                  )}
                </Text>
                <MotionPressable
                  preset="control"
                  testID="capture-speak-toggle"
                  accessibilityRole="button"
                  onPress={() => {
                    if (speaking) stopLocalSpeech();
                    else if (targetBot) void speakTextAloud(targetBot.id, replyText);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: chipBg,
                  }}
                >
                  <NativeSymbol
                    ios={speaking ? "stop.fill" : "speaker.wave.2"}
                    android={speaking ? "stop" : "volume-high-outline"}
                    size={13}
                    color={tokens.foreground}
                  />
                  <Text style={{ color: tokens.foreground, fontSize: 12.5, fontWeight: "600" }}>
                    {speaking
                      ? copy("停止朗读", "停止朗讀", "Stop")
                      : copy("语音朗读", "語音朗讀", "Speak")}
                  </Text>
                </MotionPressable>
              </View>
              <Text style={{ color: tokens.foreground, fontSize: 14.5, lineHeight: 22 }}>
                {replyText}
              </Text>
              {targetBot ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <MotionPressable
                    preset="control"
                    testID="capture-open-thread"
                    accessibilityRole="button"
                    onPress={() => {
                      stopLocalSpeech();
                      router.replace({
                        pathname: "/thread",
                        params: {
                          botId: targetBot.id,
                          name: targetBot.name,
                          ...(selectedSpaceId() ? { spaceId: selectedSpaceId()! } : {}),
                        },
                      });
                    }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 999,
                      backgroundColor: primaryBg,
                    }}
                  >
                    <Text style={{ color: primaryInk, fontSize: 13.5, fontWeight: "600" }}>
                      {copy("进入完整对话", "進入完整對話", "Open full chat")}
                    </Text>
                  </MotionPressable>
                  <MotionPressable
                    preset="control"
                    accessibilityRole="button"
                    onPress={() => {
                      stopLocalSpeech();
                      setText("");
                      setScreenshot(null);
                      setReplyText(null);
                      setPhase("compose");
                    }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 999,
                      backgroundColor: chipBg,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: chipBorder,
                    }}
                  >
                    <Text style={{ color: tokens.foreground, fontSize: 13.5, fontWeight: "500" }}>
                      {copy("继续提问", "繼續提問", "Ask again")}
                    </Text>
                  </MotionPressable>
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
