import AppIntents
import Foundation

/// Output preference for Dynamic Island background voice dialogue (usable in Shortcuts too).
enum CompanionVoiceOutputChoice: String, AppEnum {
  case followSettings
  case both
  case text
  case voice

  static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "输出方式")

  static let caseDisplayRepresentations: [CompanionVoiceOutputChoice: DisplayRepresentation] = [
    .followSettings: DisplayRepresentation(title: "跟随陪伴设置"),
    .both: DisplayRepresentation(title: "灵动岛文字 + 语音播报"),
    .text: DisplayRepresentation(title: "仅灵动岛显示文字"),
    .voice: DisplayRepresentation(title: "仅语音播报"),
  ]
}

/// Toggles background voice conversation directly from the Dynamic Island (iOS 18+) or Shortcuts,
/// without bringing Sydney to the foreground. Declared as a plain AppIntent so AppShortcutsProvider
/// compiles cleanly with an iOS 16.4 deployment target, with AudioRecordingIntent + LiveActivityIntent
/// conformance added on iOS 18+.
struct CompanionVoiceToggleIntent: AppIntent {
  static let title: LocalizedStringResource = "灵动岛语音对话"
  static let description = IntentDescription(
    "直接在后台开启或结束与当前陪伴伙伴的语音对话，支持灵动岛实时显示输出文字或语音播报，无需跳转至 App。"
  )
  static let openAppWhenRun = false
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

  @Parameter(title: "Bot ID")
  var botId: String?

  @Parameter(title: "Space ID")
  var spaceId: String?

  @Parameter(title: "输出方式")
  var outputMode: CompanionVoiceOutputChoice?

  init() {}

  init(
    botId: String?,
    spaceId: String?,
    outputMode: CompanionVoiceOutputChoice? = nil
  ) {
    self.botId = botId
    self.spaceId = spaceId
    self.outputMode = outputMode
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    #if !SYDNEY_COMPANION_WIDGET
    guard #available(iOS 18.0, *) else {
      throw CompanionBackgroundError.voiceRequiresIOS18
    }
    try await CompanionBackgroundVoiceManager.shared.toggle(
      botId: botId,
      spaceId: spaceId,
      outputMode: outputMode
    )
    #endif
    return .result()
  }
}

@available(iOS 18.0, *)
extension CompanionVoiceToggleIntent: AudioRecordingIntent, LiveActivityIntent {}

/// Sends the active background voice utterance immediately from the Dynamic Island action button.
@available(iOS 17.0, *)
struct CompanionVoiceFinishIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "立即发送语音"
  static let isDiscoverable = false

  @MainActor
  func perform() async throws -> some IntentResult {
    #if !SYDNEY_COMPANION_WIDGET
    if #available(iOS 18.0, *) {
      await CompanionBackgroundVoiceManager.shared.finish()
    }
    #endif
    return .result()
  }
}

/// Cancels the active background voice utterance from the Dynamic Island action button.
@available(iOS 17.0, *)
struct CompanionVoiceCancelIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "取消语音对话"
  static let isDiscoverable = false

  @MainActor
  func perform() async throws -> some IntentResult {
    #if !SYDNEY_COMPANION_WIDGET
    if #available(iOS 18.0, *) {
      await CompanionBackgroundVoiceManager.shared.cancel()
    }
    #endif
    return .result()
  }
}

/// Stops active background voice broadcast directly from the Dynamic Island action button.
@available(iOS 17.0, *)
struct CompanionVoiceStopSpeakingIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "停止语音播报"
  static let isDiscoverable = false

  @MainActor
  func perform() async throws -> some IntentResult {
    #if !SYDNEY_COMPANION_WIDGET
    if #available(iOS 18.0, *) {
      await CompanionBackgroundVoiceManager.shared.stopSpeaking()
    } else {
      CompanionBackgroundSpeaker.shared.stop()
    }
    #endif
    return .result()
  }
}

/// Cycles Dynamic Island voice output mode (text + voice -> text only -> voice only) directly
/// from the Dynamic Island without bringing Sydney to the foreground.
@available(iOS 17.0, *)
struct CompanionVoiceCycleOutputIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "切换灵动岛输出方式"
  static let isDiscoverable = false

  @Parameter(title: "Bot ID")
  var botId: String?

  @Parameter(title: "Space ID")
  var spaceId: String?

  init() {}

  init(botId: String?, spaceId: String?) {
    self.botId = botId
    self.spaceId = spaceId
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    #if !SYDNEY_COMPANION_WIDGET
    await cycleCompanionVoiceOutputMode(botId: botId, spaceId: spaceId)
    #endif
    return .result()
  }
}
