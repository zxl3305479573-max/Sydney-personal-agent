import ActivityKit
import AppIntents
import AudioToolbox
import AVFoundation
import Foundation
import Security
import Speech
import SydneyCompanion
import UIKit
import UniformTypeIdentifiers

/// Captures a screenshot from Shortcuts (typically chained after Apple's "Take Screenshot" action),
/// automatically crops away the top Dynamic Island / status-bar band on portrait iPhones, sends it
/// with the user's question in the background (no app switch), and pushes the reply straight onto
/// the active Dynamic Island.
struct SydneyAskScreenshotIntent: AppIntent {
  static let title: LocalizedStringResource = "截屏提问 Sydney"
  static let description = IntentDescription(
    "在后台将当前页面截图（自动裁掉顶部灵动岛）与问题发给当前陪伴伙伴，回复直接显示在灵动岛。"
  )
  static let openAppWhenRun = false
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

  @Parameter(title: "截图")
  var screenshot: IntentFile?

  @Parameter(title: "提问内容", requestValueDialog: "想问 Sydney 什么？")
  var prompt: String

  @Parameter(title: "裁剪顶部灵动岛区域", default: true)
  var cropDynamicIsland: Bool

  @Parameter(title: "语音朗读回复", default: false)
  var speakReply: Bool

  static var parameterSummary: some ParameterSummary {
    Summary("截屏 \(\.$screenshot) 提问 \(\.$prompt)") {
      \.$cropDynamicIsland
      \.$speakReply
    }
  }

  @MainActor
  func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
    guard let target = resolveCompanionTarget(botId: nil, spaceId: nil) else {
      throw CompanionBackgroundError.noBot
    }
    let session = try SydneyBackgroundSession.load()
    let trimmedPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    let effectivePrompt = trimmedPrompt.isEmpty ? "帮我看看这张截图，简明告诉我重点。" : trimmedPrompt

    var preparedImage: (data: Data, mimeType: String, filename: String)?
    if let screenshot {
      if let processed = prepareScreenshotForUpload(screenshot.data, cropDynamicIsland: cropDynamicIsland) {
        preparedImage = processed
      } else {
        preparedImage = (
          data: screenshot.data,
          mimeType: screenshot.type?.preferredMIMEType ?? "image/png",
          filename: screenshot.filename
        )
      }
    }

    await updateActiveCompanionIsland(
      botId: target.botId,
      spaceId: target.spaceId,
      status: "思考中",
      reply: preparedImage != nil ? "正在看截图：\(effectivePrompt)" : "你：\(effectivePrompt)",
      staleAfterSeconds: 90
    )

    do {
      let delivery = try await sendCompanionMessage(
        text: effectivePrompt,
        attachment: preparedImage,
        to: target,
        with: session,
        timeout: 60
      )
      let replyText = try await awaitCompanionReply(for: delivery, timeoutSeconds: 45)
      guard let replyText, !replyText.isEmpty else {
        let fallback = "已收到，正在处理中，回复稍后会更新。"
        await updateActiveCompanionIsland(
          botId: target.botId,
          spaceId: target.spaceId,
          status: "我一直都在",
          reply: fallback,
          bypassPrivacyGate: true
        )
        return .result(value: fallback, dialog: "\(fallback)")
      }
      await updateActiveCompanionIsland(
        botId: target.botId,
        spaceId: target.spaceId,
        status: "我一直都在",
        reply: replyText
      )
      if speakReply {
        await CompanionBackgroundSpeaker.shared.speakAndWait(replyText, activateSession: true)
      }
      return .result(value: replyText, dialog: "\(replyText)")
    } catch {
      let reason = companionErrorDescription(error)
      await updateActiveCompanionIsland(
        botId: target.botId,
        spaceId: target.spaceId,
        status: "我一直都在",
        reply: reason,
        bypassPrivacyGate: true
      )
      throw error
    }
  }
}

/// Sends a quick text message to the active Dynamic Island companion (or last-opened bot) in the
/// background without switching apps, and writes the reply straight back to the Dynamic Island.
struct SydneyQuickMessageIntent: AppIntent {
  static let title: LocalizedStringResource = "后台发消息给 Sydney"
  static let description = IntentDescription(
    "无需跳转至 App，直接向当前陪伴伙伴发消息，并把回复显示在灵动岛。"
  )
  static let openAppWhenRun = false
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

  @Parameter(title: "消息内容", requestValueDialog: "想对 Sydney 说什么？")
  var message: String

  @Parameter(title: "等待回复并显示在灵动岛", default: true)
  var waitForReply: Bool

  static var parameterSummary: some ParameterSummary {
    Summary("发消息 \(\.$message) 给 Sydney") {
      \.$waitForReply
    }
  }

  @MainActor
  func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
    let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      throw $message.needsValueError()
    }
    guard let target = resolveCompanionTarget(botId: nil, spaceId: nil) else {
      throw CompanionBackgroundError.noBot
    }
    let session = try SydneyBackgroundSession.load()

    await updateActiveCompanionIsland(
      botId: target.botId,
      spaceId: target.spaceId,
      status: "思考中",
      reply: "你：\(trimmed)",
      staleAfterSeconds: 90
    )

    do {
      let delivery = try await sendCompanionMessage(
        text: trimmed,
        attachment: nil,
        to: target,
        with: session,
        timeout: 60
      )
      guard waitForReply else {
        await updateActiveCompanionIsland(
          botId: target.botId,
          spaceId: target.spaceId,
          status: "思考中",
          reply: "已发送：\(trimmed)",
          staleAfterSeconds: 90
        )
        return .result(value: "已发送。", dialog: "已发送。")
      }
      let replyText = try await awaitCompanionReply(for: delivery, timeoutSeconds: 45)
      guard let replyText, !replyText.isEmpty else {
        let fallback = "消息已发送，回复稍后会显示在 Sydney 中。"
        await updateActiveCompanionIsland(
          botId: target.botId,
          spaceId: target.spaceId,
          status: "我一直都在",
          reply: fallback,
          bypassPrivacyGate: true
        )
        return .result(value: fallback, dialog: "\(fallback)")
      }
      await updateActiveCompanionIsland(
        botId: target.botId,
        spaceId: target.spaceId,
        status: "我一直都在",
        reply: replyText
      )
      return .result(value: replyText, dialog: "\(replyText)")
    } catch {
      let reason = companionErrorDescription(error)
      await updateActiveCompanionIsland(
        botId: target.botId,
        spaceId: target.spaceId,
        status: "我一直都在",
        reply: reason,
        bypassPrivacyGate: true
      )
      throw error
    }
  }
}

/// Exposes Sydney's zero-jump Shortcuts actions automatically in Apple Shortcuts, Back Tap, and
/// Action Button without requiring restricted Apple Developer entitlements.
struct SydneyCompanionShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: SydneyAskScreenshotIntent(),
      phrases: [
        "用 \(.applicationName) 截屏提问",
        "Ask \(.applicationName) about screenshot",
      ],
      shortTitle: "截屏提问 Sydney",
      systemImageName: "camera.viewfinder"
    )
    AppShortcut(
      intent: SydneyQuickMessageIntent(),
      phrases: [
        "用 \(.applicationName) 后台发消息",
        "Message \(.applicationName) in background",
      ],
      shortTitle: "后台发消息给 Sydney",
      systemImageName: "bubble.left.fill"
    )
    AppShortcut(
      intent: CompanionVoiceToggleIntent(),
      phrases: [
        "用 \(.applicationName) 语音对话",
        "Talk to \(.applicationName)",
      ],
      shortTitle: "灵动岛语音对话",
      systemImageName: "waveform"
    )
  }
}

/// Manages true background voice dialogue directly from the Dynamic Island on iOS 18+:
/// records speech with AVAudioEngine + SFSpeechRecognizer while keeping the current foreground app
/// undisturbed, streams partial text to the Dynamic Island, sends to the active companion bot,
/// renders the reply straight onto the Dynamic Island, and speaks the reply aloud.
@available(iOS 18.0, *)
@MainActor
final class CompanionBackgroundVoiceManager {
  static let shared = CompanionBackgroundVoiceManager()

  private let engine = AVAudioEngine()
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var targetBotId: String?
  private var targetSpaceId: String?
  private var session: SydneyBackgroundSession?
  private var transcript = ""
  private var pauseTimer: Task<Void, Never>?
  private var startedAt = Date()
  /// Counts in-flight send/reply/TTS cycles so iOS keeps the background audio session alive until finished.
  private var activeReplies = 0

  var isRecording: Bool { request != nil }

  func toggle(botId: String?, spaceId: String?) async throws {
    if isRecording {
      await finish()
    } else {
      try await start(botId: botId, spaceId: spaceId)
    }
  }

  func start(botId: String?, spaceId: String?) async throws {
    CompanionBackgroundSpeaker.shared.stop()

    guard let target = resolveCompanionTarget(botId: botId, spaceId: spaceId) else {
      throw CompanionBackgroundError.noBot
    }
    guard AVAudioApplication.shared.recordPermission == .granted,
      SFSpeechRecognizer.authorizationStatus() == .authorized
    else {
      await updateActiveCompanionIsland(
        botId: target.botId,
        spaceId: target.spaceId,
        status: "我一直都在",
        reply: "请先在 Sydney App 内发起一次语音通话，以授予麦克风和语音识别权限。",
        bypassPrivacyGate: true
      )
      throw CompanionBackgroundError.permission
    }
    guard
      let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
        ?? SFSpeechRecognizer(),
      recognizer.isAvailable
    else {
      await updateActiveCompanionIsland(
        botId: target.botId,
        spaceId: target.spaceId,
        status: "我一直都在",
        reply: "当前语音识别暂不可用，请稍后重试。",
        bypassPrivacyGate: true
      )
      throw CompanionBackgroundError.speechUnavailable
    }

    let loadedSession: SydneyBackgroundSession
    do {
      loadedSession = try SydneyBackgroundSession.load()
    } catch {
      await updateActiveCompanionIsland(
        botId: target.botId,
        spaceId: target.spaceId,
        status: "我一直都在",
        reply: companionErrorDescription(error),
        bypassPrivacyGate: true
      )
      throw error
    }

    let recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
    recognitionRequest.shouldReportPartialResults = true
    if recognizer.supportsOnDeviceRecognition {
      recognitionRequest.requiresOnDeviceRecognition = true
    }

    do {
      let audioSession = AVAudioSession.sharedInstance()
      try audioSession.setCategory(
        .playAndRecord,
        mode: .default,
        options: [.duckOthers, .allowBluetoothHFP, .allowBluetoothA2DP, .defaultToSpeaker]
      )
      try audioSession.setAllowHapticsAndSystemSoundsDuringRecording(true)
      try audioSession.setActive(true)

      let input = engine.inputNode
      if engine.isRunning { engine.stop() }
      input.removeTap(onBus: 0)
      input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) {
        buffer, _ in
        recognitionRequest.append(buffer)
      }
      engine.prepare()
      try engine.start()
    } catch {
      releaseUnusedMicrophone()
      await updateActiveCompanionIsland(
        botId: target.botId,
        spaceId: target.spaceId,
        status: "我一直都在",
        reply: "后台开启麦克风失败，请确认灵动岛活动已开启。",
        bypassPrivacyGate: true
      )
      throw CompanionBackgroundError.recordingFailed
    }

    // Subtle system "peek" haptic confirms listening started while in background.
    AudioServicesPlaySystemSound(1519)

    request = recognitionRequest
    targetBotId = target.botId
    targetSpaceId = target.spaceId
    session = loadedSession
    transcript = ""
    startedAt = Date()

    await updateActiveCompanionIsland(
      botId: target.botId,
      spaceId: target.spaceId,
      status: "正在听",
      reply: "正在听，请直接说话…",
      staleAfterSeconds: 90,
      bypassPrivacyGate: true
    )

    task = recognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
      let heard = result?.bestTranscription.formattedString
      let failed = error != nil
      Task { @MainActor in
        self?.handleRecognized(heard, failed: failed, for: recognitionRequest)
      }
    }
    schedulePauseTimeout(seconds: 8.0)
  }

  private func handleRecognized(
    _ heard: String?,
    failed: Bool,
    for expectedRequest: SFSpeechAudioBufferRecognitionRequest
  ) {
    guard request === expectedRequest else { return }
    if let heard, !heard.isEmpty, heard != transcript {
      transcript = heard
      if let botId = targetBotId {
        let spaceId = targetSpaceId
        Task {
          await updateActiveCompanionIsland(
            botId: botId,
            spaceId: spaceId,
            status: "正在听",
            reply: heard,
            staleAfterSeconds: 90
          )
        }
      }
      schedulePauseTimeout(seconds: 2.2)
    }
    if failed {
      Task { await finish(recognizerFailed: true, only: expectedRequest) }
    }
  }

  private func schedulePauseTimeout(seconds: Double) {
    pauseTimer?.cancel()
    let remaining = max(0, 60.0 - Date().timeIntervalSince(startedAt))
    let expected = request
    pauseTimer = Task { [weak self] in
      try? await Task.sleep(nanoseconds: UInt64(min(seconds, remaining) * 1_000_000_000))
      if !Task.isCancelled {
        Task { await self?.finish(only: expected) }
      }
    }
  }

  func finish(
    recognizerFailed: Bool = false,
    only expected: SFSpeechAudioBufferRecognitionRequest? = nil
  ) async {
    guard
      let activeRequest = request,
      let botId = targetBotId,
      let loadedSession = session,
      expected == nil || expected === activeRequest
    else { return }
    let spaceId = targetSpaceId
    let spoken = transcript.trimmingCharacters(in: .whitespacesAndNewlines)

    stopListening(activeRequest)
    activeReplies += 1
    keepMicrophoneOpen()
    defer {
      activeReplies -= 1
      releaseUnusedMicrophone()
    }

    guard !spoken.isEmpty else {
      await updateActiveCompanionIsland(
        botId: botId,
        spaceId: spaceId,
        status: "我一直都在",
        reply: recognizerFailed ? "语音识别暂不可用，请重试。" : "没有听到说话内容。",
        bypassPrivacyGate: true
      )
      return
    }

    await updateActiveCompanionIsland(
      botId: botId,
      spaceId: spaceId,
      status: "思考中",
      reply: "你：\(spoken)",
      staleAfterSeconds: 90
    )

    do {
      let delivery = try await sendCompanionMessage(
        text: spoken,
        attachment: nil,
        to: (botId, spaceId),
        with: loadedSession,
        timeout: 25
      )
      if let replyText = try await awaitCompanionReply(for: delivery, timeoutSeconds: 45),
        !replyText.isEmpty
      {
        await updateActiveCompanionIsland(
          botId: botId,
          spaceId: spaceId,
          status: "我一直都在",
          reply: replyText
        )
        await CompanionBackgroundSpeaker.shared.speakAndWait(replyText, activateSession: false)
      } else {
        await updateActiveCompanionIsland(
          botId: botId,
          spaceId: spaceId,
          status: "我一直都在",
          reply: "消息已发送，回复稍后送达。",
          bypassPrivacyGate: true
        )
      }
    } catch {
      await updateActiveCompanionIsland(
        botId: botId,
        spaceId: spaceId,
        status: "我一直都在",
        reply: companionErrorDescription(error),
        bypassPrivacyGate: true
      )
    }
  }

  func cancel() async {
    guard let activeRequest = request else { return }
    let botId = targetBotId
    let spaceId = targetSpaceId
    stopListening(activeRequest)
    releaseUnusedMicrophone()
    if let botId {
      await updateActiveCompanionIsland(
        botId: botId,
        spaceId: spaceId,
        status: "我一直都在",
        reply: nil
      )
    }
  }

  private func stopListening(_ activeRequest: SFSpeechAudioBufferRecognitionRequest) {
    request = nil
    targetBotId = nil
    targetSpaceId = nil
    session = nil
    pauseTimer?.cancel()
    pauseTimer = nil
    activeRequest.endAudio()
    task?.cancel()
    task = nil
  }

  /// iOS suspends a background app as soon as its audio engine stops; keep a silent tap running
  /// while the bot reply is in flight and being read aloud.
  private func keepMicrophoneOpen() {
    let input = engine.inputNode
    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { _, _ in }
    if !engine.isRunning {
      try? engine.start()
    }
  }

  private func releaseUnusedMicrophone() {
    if isRecording { return }
    if activeReplies > 0 {
      keepMicrophoneOpen()
    } else {
      engine.stop()
      engine.inputNode.removeTap(onBus: 0)
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
  }
}

@MainActor
private final class CompanionBackgroundSpeaker: NSObject, AVSpeechSynthesizerDelegate {
  static let shared = CompanionBackgroundSpeaker()

  private let synthesizer = AVSpeechSynthesizer()
  private var continuation: CheckedContinuation<Void, Never>?
  private var timeoutTask: Task<Void, Never>?

  override init() {
    super.init()
    synthesizer.delegate = self
  }

  private func resumePending() {
    timeoutTask?.cancel()
    timeoutTask = nil
    if let pending = continuation {
      continuation = nil
      pending.resume()
    }
  }

  func stop() {
    if synthesizer.isSpeaking {
      synthesizer.stopSpeaking(at: .immediate)
    }
    resumePending()
  }

  func speakAndWait(_ rawText: String, activateSession: Bool) async {
    let text = stripIslandMarkdown(rawText, maxChars: 240)
    guard !text.isEmpty else { return }
    stop()

    if activateSession {
      let audioSession = AVAudioSession.sharedInstance()
      try? audioSession.setCategory(
        .playback,
        mode: .spokenAudio,
        options: [.duckOthers, .allowBluetoothA2DP]
      )
      try? audioSession.setActive(true)
    }

    let hasCJK = text.unicodeScalars.contains { scalar in
      (0x4E00...0x9FFF).contains(scalar.value) || (0x3400...0x4DBF).contains(scalar.value)
    }
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = AVSpeechSynthesisVoice(language: hasCJK ? "zh-CN" : "en-US")
    utterance.rate = AVSpeechUtteranceDefaultSpeechRate

    await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
      continuation = cont
      synthesizer.speak(utterance)
      let maxSeconds = min(60.0, max(12.0, Double(text.count) * 0.35 + 6.0))
      timeoutTask = Task { @MainActor [weak self] in
        try? await Task.sleep(nanoseconds: UInt64(maxSeconds * 1_000_000_000))
        guard !Task.isCancelled else { return }
        self?.stop()
      }
    }

    if activateSession {
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
  }

  nonisolated func speechSynthesizer(
    _ synthesizer: AVSpeechSynthesizer,
    didFinish utterance: AVSpeechUtterance
  ) {
    Task { @MainActor in
      self.resumePending()
    }
  }

  nonisolated func speechSynthesizer(
    _ synthesizer: AVSpeechSynthesizer,
    didCancel utterance: AVSpeechUtterance
  ) {
    Task { @MainActor in
      self.resumePending()
    }
  }
}

/// Normalizes orientation, trims the top 7% Dynamic Island / status-bar band on portrait iPhone
/// screenshots when `cropDynamicIsland` is enabled, caps resolution to 1600px, and encodes JPEG.
private func prepareScreenshotForUpload(
  _ rawData: Data,
  cropDynamicIsland: Bool
) -> (data: Data, mimeType: String, filename: String)? {
  guard let source = UIImage(data: rawData),
    source.size.width > 0, source.size.height > 0
  else { return nil }

  let srcWidth = source.size.width * source.scale
  let srcHeight = source.size.height * source.scale
  let cropTopRatio: CGFloat = (cropDynamicIsland && (srcHeight / srcWidth) >= 1.75) ? 0.07 : 0.0
  let visibleHeight = srcHeight * (1.0 - cropTopRatio)
  let maxEdge: CGFloat = 1600.0
  let scale = min(1.0, maxEdge / max(srcWidth, visibleHeight))
  let outWidth = max(1, (srcWidth * scale).rounded())
  let outHeight = max(1, (visibleHeight * scale).rounded())
  let drawHeight = (srcHeight * scale).rounded()
  let yOffset = -(srcHeight * cropTopRatio * scale).rounded()

  let format = UIGraphicsImageRendererFormat()
  format.scale = 1
  format.opaque = true
  let rendered = UIGraphicsImageRenderer(
    size: CGSize(width: outWidth, height: outHeight),
    format: format
  ).image { _ in
    UIColor.black.setFill()
    UIRectFill(CGRect(x: 0, y: 0, width: outWidth, height: outHeight))
    source.draw(in: CGRect(x: 0, y: yOffset, width: outWidth, height: drawHeight))
  }
  guard let jpeg = rendered.jpegData(compressionQuality: 0.82) else { return nil }
  return (jpeg, "image/jpeg", "sydney-screenshot.jpg")
}

private func resolveCompanionTarget(
  botId: String?,
  spaceId: String?
) -> (botId: String, spaceId: String?)? {
  if let botId, !botId.isEmpty {
    let resolvedSpace =
      (spaceId?.isEmpty == false ? spaceId : nil)
      ?? Activity<CompanionActivityAttributes>.activities.first(where: {
        $0.attributes.botId == botId
      })?.attributes.spaceId
    return (botId, resolvedSpace)
  }
  if let active = Activity<CompanionActivityAttributes>.activities.first {
    return (active.attributes.botId, active.attributes.spaceId)
  }
  guard let last = companionSecureStoreItem("rakazo.last_bot_id"), !last.isEmpty else {
    return nil
  }
  let lastSpace = companionSecureStoreItem("rakazo.last_bot_space_id")
  return (last, lastSpace?.isEmpty == false ? lastSpace : nil)
}

private func stripIslandMarkdown(_ raw: String, maxChars: Int = 115) -> String {
  let options = AttributedString.MarkdownParsingOptions(
    interpretedSyntax: .inlineOnlyPreservingWhitespace
  )
  var text =
    (try? AttributedString(markdown: raw, options: options)).map { String($0.characters) } ?? raw
  text = text
    .replacingOccurrences(of: "**", with: "")
    .replacingOccurrences(of: "__", with: "")
    .replacingOccurrences(of: "~~", with: "")
    .replacingOccurrences(of: "`", with: "")
    .replacingOccurrences(of: "\r\n", with: " ")
    .replacingOccurrences(of: "\n", with: " ")
  while text.contains("  ") {
    text = text.replacingOccurrences(of: "  ", with: " ")
  }
  let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
  guard trimmed.count > maxChars else { return trimmed }
  return String(trimmed.prefix(max(1, maxChars - 1))) + "…"
}

private func updateActiveCompanionIsland(
  botId: String,
  spaceId: String?,
  status: String,
  reply: String?,
  staleAfterSeconds: TimeInterval? = nil,
  bypassPrivacyGate: Bool = false
) async {
  let activities = Activity<CompanionActivityAttributes>.activities
  let activity =
    activities.first(where: {
      $0.attributes.botId == botId && ($0.attributes.spaceId == spaceId || spaceId == nil)
    }) ?? activities.first
  guard let activity else { return }

  let visibleReply: String?
  if let reply, !reply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
    (bypassPrivacyGate || activity.attributes.showReply)
  {
    visibleReply = stripIslandMarkdown(reply, maxChars: 115)
  } else {
    visibleReply = nil
  }

  let state = CompanionActivityAttributes.ContentState(
    status: status,
    reply: visibleReply,
    callActive: false,
    callStartedAt: nil
  )
  let staleDate = staleAfterSeconds.map { Date().addingTimeInterval($0) }
  await activity.update(ActivityContent(state: state, staleDate: staleDate))
}

private struct CompanionDelivery {
  let session: SydneyBackgroundSession
  let botId: String
  let spaceId: String?
  let runId: String
}

private func sendCompanionMessage(
  text: String,
  attachment: (data: Data, mimeType: String, filename: String)?,
  to target: (botId: String, spaceId: String?),
  with session: SydneyBackgroundSession,
  timeout: TimeInterval
) async throws -> CompanionDelivery {
  let botId = target.botId
  let spaceId = target.spaceId ?? session.selectedSpaceId
  try await session.requireConsent(["botId": botId], spaceId: spaceId, timeout: timeout)
  var input: [String: Any] = [
    "botId": botId,
    "text": text.trimmingCharacters(in: .whitespacesAndNewlines),
    "clientNonce": UUID().uuidString,
  ]
  if let attachment {
    let artifact: CompanionArtifact = try await session.rpc(
      "artifacts/create",
      [
        "botId": botId,
        "name": attachment.filename,
        "mimeType": attachment.mimeType,
        "contentBase64": attachment.data.base64EncodedString(),
      ],
      spaceId: spaceId,
      timeout: timeout
    )
    input["artifactIds"] = [artifact.id]
    input["imageHandling"] = "confirm"
  }
  let sent: CompanionSent = try await session.rpc(
    "threads/send",
    input,
    spaceId: spaceId,
    timeout: timeout
  )
  return CompanionDelivery(session: session, botId: botId, spaceId: spaceId, runId: sent.runId)
}

private func awaitCompanionReply(
  for delivery: CompanionDelivery,
  timeoutSeconds: TimeInterval
) async throws -> String? {
  guard
    try await delivery.session.waitForReply(
      runId: delivery.runId,
      botId: delivery.botId,
      spaceId: delivery.spaceId,
      timeoutSeconds: timeoutSeconds
    )
  else { return nil }
  let thread: CompanionThreadSnapshot
  do {
    thread = try await delivery.session.rpc(
      "threads/get",
      ["botId": delivery.botId],
      spaceId: delivery.spaceId,
      timeout: 8
    )
  } catch let error as URLError {
    if error.code == .cancelled { throw error }
    return nil
  }
  if thread.run?.id == delivery.runId, thread.run?.status == "failed" {
    throw CompanionBackgroundError.server(nil)
  }
  let raw = thread.messages
    .filter { $0.runId == delivery.runId && $0.role == "bot" }
    .flatMap(\.blocks)
    .compactMap(\.text)
    .joined(separator: "\n\n")
  if raw.isEmpty, thread.activeRuns?.contains(where: { $0.id == delivery.runId }) == true {
    throw CompanionBackgroundError.needsYou
  }
  guard !raw.isEmpty else { return nil }
  return stripIslandMarkdown(raw, maxChars: 600)
}

/// Never forward session tokens or proxy credentials across HTTP redirects.
private final class CompanionRejectRedirects: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }
}

private struct SydneyBackgroundSession {
  private static let transport = URLSession(
    configuration: .ephemeral,
    delegate: CompanionRejectRedirects(),
    delegateQueue: nil
  )

  let apiBase: String
  let token: String
  let selectedSpaceId: String?
  let headers: [String: String]

  static func load() throws -> SydneyBackgroundSession {
    guard let token = companionSecureStoreItem("rakazo.session_token"), !token.isEmpty else {
      throw CompanionBackgroundError.signedOut
    }
    let fallback =
      (Bundle.main.object(forInfoDictionaryKey: "SydneyDefaultApiBase") as? String)
      ?? (Bundle.main.object(forInfoDictionaryKey: "RakazoDefaultApiBase") as? String)
    guard let apiBase = companionSecureStoreItem("rakazo.api_base") ?? fallback,
      !apiBase.isEmpty
    else {
      throw CompanionBackgroundError.signedOut
    }
    let space = companionSecureStoreItem("rakazo.space_id")
    return SydneyBackgroundSession(
      apiBase: apiBase.hasSuffix("/") ? String(apiBase.dropLast()) : apiBase,
      token: token,
      selectedSpaceId: space?.isEmpty == false ? space : nil,
      headers: serverHeaders(for: apiBase)
    )
  }

  private static func serverHeaders(for apiBase: String) -> [String: String] {
    guard let stored = companionSecureStoreItem("rakazo.server_headers")?.data(using: .utf8),
      let saved = try? JSONDecoder().decode(CompanionSavedHeaders.self, from: stored),
      saved.apiBase == apiBase
    else { return [:] }
    return saved.headers
  }

  func requireConsent(
    _ target: [String: String],
    spaceId: String?,
    timeout: TimeInterval = 60
  ) async throws {
    let uses = ["model", "memory"]
    var input: [String: Any] = target
    input["uses"] = uses
    let consent: CompanionConsentStatus = try await rpc(
      "aiConsent/status",
      input,
      spaceId: spaceId,
      timeout: timeout
    )
    guard consent.recipients.allSatisfy({ $0.allowed || !uses.contains($0.use) }) else {
      throw CompanionBackgroundError.consentRequired
    }
  }

  func waitForReply(
    runId: String,
    botId: String,
    spaceId: String?,
    timeoutSeconds: TimeInterval
  ) async throws -> Bool {
    var req = try makeRequest(
      "threads/subscribe",
      ["botId": botId, "cursor": 0],
      spaceId: spaceId,
      timeout: timeoutSeconds
    )
    req.setValue("text/event-stream", forHTTPHeaderField: "accept")
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForResource = timeoutSeconds
    let stream = URLSession(
      configuration: config,
      delegate: CompanionRejectRedirects(),
      delegateQueue: nil
    )
    defer { stream.invalidateAndCancel() }
    do {
      let (bytes, response) = try await stream.bytes(for: req)
      try checkResponse(response)
      var frame = Data()
      var previousLf = false
      var discardingFrame = false
      for try await byte in bytes {
        if byte == 13 { continue }
        if byte == 10 && previousLf {
          previousLf = false
          if discardingFrame {
            discardingFrame = false
            continue
          }
          let payload = String(decoding: frame, as: UTF8.self)
            .split(separator: "\n")
            .filter { $0.hasPrefix("data:") }
            .map { $0.dropFirst(5).trimmingCharacters(in: .whitespaces) }
            .joined(separator: "\n")
          frame.removeAll(keepingCapacity: true)
          guard let data = payload.data(using: .utf8),
            let event = try? JSONDecoder().decode(
              CompanionEnvelope<CompanionReplyEvent>.self,
              from: data
            ).json,
            event.runId == runId
          else { continue }
          if [
            "run.completed", "run.failed", "run.cancelled", "run.waiting_input",
            "computer.takeover.requested",
          ].contains(event.type) {
            return true
          }
        } else {
          previousLf = byte == 10
          guard !discardingFrame else { continue }
          frame.append(byte)
          if frame.count > 1_048_576 {
            frame.removeAll(keepingCapacity: true)
            discardingFrame = true
          }
        }
      }
    } catch let error as URLError {
      if error.code == .cancelled { throw error }
    }
    return false
  }

  private func makeRequest(
    _ procedure: String,
    _ input: [String: Any],
    spaceId: String?,
    timeout: TimeInterval
  ) throws -> URLRequest {
    guard let url = URL(string: "\(apiBase)/rpc/\(procedure)") else {
      throw CompanionBackgroundError.signedOut
    }
    var req = URLRequest(url: url, timeoutInterval: timeout)
    req.httpMethod = "POST"
    for (name, value) in headers {
      req.setValue(value, forHTTPHeaderField: name)
    }
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    req.setValue("rakazo://", forHTTPHeaderField: "origin")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
    if let spaceId {
      req.setValue(spaceId, forHTTPHeaderField: "x-rakazo-space-id")
    }
    req.httpBody = try JSONSerialization.data(withJSONObject: ["json": input])
    return req
  }

  private func checkResponse(_ response: URLResponse) throws {
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    if status == 401 { throw CompanionBackgroundError.signedOut }
    guard (200..<300).contains(status) else { throw CompanionBackgroundError.server(nil) }
  }

  func rpc<Output: Decodable>(
    _ procedure: String,
    _ input: [String: Any],
    spaceId: String?,
    timeout: TimeInterval = 60
  ) async throws -> Output {
    let req = try makeRequest(procedure, input, spaceId: spaceId, timeout: timeout)
    let (data, response) = try await Self.transport.data(for: req)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    if status == 401 { throw CompanionBackgroundError.signedOut }
    guard (200..<300).contains(status) else {
      let error = try? JSONDecoder().decode(CompanionEnvelope<CompanionServerError>.self, from: data)
      throw CompanionBackgroundError.server(error?.json.message)
    }
    return try JSONDecoder().decode(CompanionEnvelope<Output>.self, from: data).json
  }
}

/// Reads keys written by expo-secure-store under service "app:no-auth" (or legacy "app").
private func companionSecureStoreItem(_ key: String) -> String? {
  for service in ["app:no-auth", "app"] {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: Data(key.utf8),
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecReturnData as String: true,
    ]
    var result: AnyObject?
    if SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data
    {
      return String(data: data, encoding: .utf8)
    }
  }
  return nil
}

private func companionErrorDescription(_ error: Error) -> String {
  if let localized = error as? CustomLocalizedStringResourceConvertible {
    return String(localized: localized.localizedStringResource)
  }
  return (error as? URLError)?.localizedDescription ?? "请求失败，请稍后重试。"
}

enum CompanionBackgroundError: Error, CustomLocalizedStringResourceConvertible {
  case signedOut
  case noBot
  case needsYou
  case consentRequired
  case permission
  case speechUnavailable
  case recordingFailed
  case voiceRequiresIOS18
  case server(String?)

  var localizedStringResource: LocalizedStringResource {
    switch self {
    case .signedOut: "请先打开 Sydney App 登录账号。"
    case .noBot: "请先在 Sydney App 打开一个伙伴对话或开启灵动岛陪伴。"
    case .needsYou: "当前任务需要你在 Sydney App 内确认。"
    case .consentRequired: "请先在 Sydney 账号设置中确认 AI 数据授权。"
    case .permission: "请先在 Sydney App 内发起一次语音通话，以授予麦克风和语音识别权限。"
    case .speechUnavailable: "当前语音识别暂不可用，请稍后重试。"
    case .recordingFailed: "后台开启语音对话失败，请重试。"
    case .voiceRequiresIOS18: "灵动岛后台语音对话需要 iOS 18 或更高版本。"
    case .server(let message?): "\(message)"
    case .server(nil): "服务器请求失败，请稍后重试。"
    }
  }
}

private struct CompanionSavedHeaders: Decodable {
  let apiBase: String
  let headers: [String: String]
}

private struct CompanionEnvelope<Value: Decodable>: Decodable {
  let json: Value
}

private struct CompanionServerError: Decodable {
  let message: String?
}

private struct CompanionSent: Decodable {
  let runId: String
}

private struct CompanionArtifact: Decodable {
  let id: String
}

private struct CompanionReplyEvent: Decodable {
  let runId: String?
  let type: String
}

private struct CompanionThreadSnapshot: Decodable {
  struct Run: Decodable {
    let id: String
    let status: String
  }
  struct Message: Decodable {
    struct Block: Decodable {
      let text: String?
    }
    let role: String
    let runId: String?
    let blocks: [Block]
  }
  let messages: [Message]
  let run: Run?
  let activeRuns: [Run]?
}

private struct CompanionConsentStatus: Decodable {
  struct Recipient: Decodable {
    let use: String
    let allowed: Bool
  }
  let recipients: [Recipient]
}
