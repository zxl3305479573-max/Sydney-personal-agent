import type { BotAvatarSet } from "@rakazo/contracts";
import { Alert } from "react-native";

export type CompanionVoiceLaunchTarget = {
  botId: string;
  botName: string;
  botColor?: string;
  botAvatarSet?: BotAvatarSet | null;
};

export async function launchCompanionVoiceCall(
  target: CompanionVoiceLaunchTarget,
  options: {
    locale: string;
    onOpenVoiceSettings?: () => void;
  },
): Promise<boolean> {
  const [
    { rpc },
    { startCall },
    { loadDeviceVoiceEnabled },
    dictation,
    { currentSessionGeneration },
    { resolveVoiceCallPlan },
  ] = await Promise.all([
    import("./api"),
    import("./call-session"),
    import("./device-voice"),
    import("./dictation"),
    import("./session"),
    import("./voice-call-entry"),
  ]);

  const generation = currentSessionGeneration();
  const chinese = options.locale.startsWith("zh");
  const traditional = options.locale === "zh-TW";
  const copy = (zhHans: string, zhHant: string, en: string) =>
    chinese ? (traditional ? zhHant : zhHans) : en;

  const plan = await resolveVoiceCallPlan({
    loadDeviceVoiceEnabled,
    dictationAvailable: () => dictation.available(),
    loadVoiceStatus: async () => {
      try {
        const res = await rpc("voice/status", {});
        return { ready: Boolean(res.ready), transcribe: Boolean(res.transcribe) };
      } catch {
        return { ready: false, transcribe: false };
      }
    },
  });

  if (generation !== currentSessionGeneration()) return false;

  if (plan.kind === "settings") {
    Alert.alert(
      copy("需要先配置语音", "需要先設定語音", "Voice setup required"),
      copy(
        "请在语音设置中启用本机语音或连接语音服务后再发起通话。",
        "請在語音設定中啟用本機語音或連接語音服務後再發起通話。",
        "Enable on-device voice or connect a voice provider in Voice settings first.",
      ),
      [
        { text: copy("取消", "取消", "Cancel"), style: "cancel" },
        ...(options.onOpenVoiceSettings
          ? [
              {
                text: copy("前往设置", "前往設定", "Open settings"),
                onPress: options.onOpenVoiceSettings,
              },
            ]
          : []),
      ],
    );
    return false;
  }

  if (plan.kind === "dictation") {
    Alert.alert(
      copy("语音识别不可用", "語音辨識不可用", "Speech recognition unavailable"),
      copy(
        "请在系统设置中允许语音识别与麦克风权限，或连接支持转写的语音服务。",
        "請在系統設定中允許語音辨識與麥克風權限，或連接支援轉寫的語音服務。",
        "Allow speech recognition and microphone access in system settings, or connect a transcription provider.",
      ),
    );
    return false;
  }

  const startedId = startCall({
    botId: target.botId,
    botName: target.botName,
    botColor: target.botColor,
    botAvatarSet: target.botAvatarSet ?? undefined,
    transcribe: plan.transcribe,
    session: generation,
  });
  return Boolean(startedId);
}

export function confirmAndLaunchCompanionVoiceCall(
  target: CompanionVoiceLaunchTarget,
  options: {
    locale: string;
    onOpenVoiceSettings?: () => void;
    onError?: (message: string) => void;
  },
): void {
  const chinese = options.locale.startsWith("zh");
  const traditional = options.locale === "zh-TW";
  const copy = (zhHans: string, zhHant: string, en: string) =>
    chinese ? (traditional ? zhHant : zhHans) : en;

  Alert.alert(
    copy("发起语音陪伴通话", "發起語音陪伴通話", "Start companion voice call"),
    copy(
      `将向 ${target.botName} 发起语音对话，开始后会按系统授权使用麦克风。`,
      `將向 ${target.botName} 發起語音對話，開始後會按系統授權使用麥克風。`,
      `Start a voice call with ${target.botName}? The microphone will be used according to system permission.`,
    ),
    [
      { text: copy("取消", "取消", "Cancel"), style: "cancel" },
      {
        text: copy("开始通话", "開始通話", "Start call"),
        onPress: () => {
          void launchCompanionVoiceCall(target, options).catch((error) => {
            options.onError?.(
              error instanceof Error
                ? error.message
                : copy(
                    "无法开启语音通话，请重试。",
                    "無法開啟語音通話，請重試。",
                    "Could not start voice call.",
                  ),
            );
          });
        },
      },
    ],
  );
}
