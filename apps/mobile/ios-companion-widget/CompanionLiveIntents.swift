import AppIntents
import Foundation

/// Toggles background voice conversation directly from the Dynamic Island (iOS 18+) or Shortcuts,
/// without bringing Sydney to the foreground. Declared as a plain AppIntent so AppShortcutsProvider
/// compiles cleanly with an iOS 16.4 deployment target, with AudioRecordingIntent + LiveActivityIntent
/// conformance added on iOS 18+.
struct CompanionVoiceToggleIntent: AppIntent {
  static let title: LocalizedStringResource = "灵动岛语音对话"
  static let description = IntentDescription(
    "直接在后台开启或结束与当前陪伴伙伴的语音对话，无需跳转至 App。"
  )
  static let openAppWhenRun = false
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

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
    guard #available(iOS 18.0, *) else {
      throw CompanionBackgroundError.voiceRequiresIOS18
    }
    try await CompanionBackgroundVoiceManager.shared.toggle(botId: botId, spaceId: spaceId)
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
