import ActivityKit
import AppIntents
import SwiftUI
import UIKit
import WidgetKit

@main
struct CompanionWidgetBundle: WidgetBundle {
  var body: some Widget { CompanionWidget() }
}

private extension Color {
  static let islandSecondary = Color.white.opacity(0.78)
  static let islandSubtle = Color.white.opacity(0.56)
  static let islandPill = Color.white.opacity(0.16)
  static let statusPresent = Color(red: 0.32, green: 0.84, blue: 0.56)
  static let statusListening = Color(red: 0.38, green: 0.72, blue: 0.99)
  static let statusThinking = Color(red: 0.97, green: 0.74, blue: 0.28)
  static let statusDisconnected = Color(red: 0.98, green: 0.44, blue: 0.40)
  static let callActiveGreen = Color(red: 0.24, green: 0.84, blue: 0.48)
  static let callMutedGray = Color.white.opacity(0.68)
}

private extension View {
  @ViewBuilder
  func nativeLockScreenActivitySurface() -> some View {
    if #available(iOS 26.0, *) {
      self.activityBackgroundTint(.clear)
    } else {
      self.activityBackgroundTint(nil)
    }
  }
}

struct CompanionWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: CompanionActivityAttributes.self) { context in
      let isCall = context.state.callActive == true
      let displayStatus = context.isStale && !isCall ? "状态待更新" : context.state.status
      let isBackgroundListening = !isCall && displayStatus.contains("正在听")
      let isBackgroundSpeaking = !isCall && displayStatus.contains("播报")
      let accent = lockScreenStatusAccent(displayStatus, isCall: isCall)
      let cleanReply = cleanedReply(context.state.reply)
      HStack(alignment: .center, spacing: 12) {
        avatarBadge(
          context.attributes.avatar,
          botName: context.attributes.botName,
          botId: context.attributes.botId,
          status: displayStatus,
          isCall: isCall || isBackgroundListening || isBackgroundSpeaking,
          size: 42,
          onDarkSurface: false
        )
        VStack(alignment: .leading, spacing: 3) {
          HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(context.attributes.botName)
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(.primary)
              .lineLimit(1)
              .unredacted()
            Spacer(minLength: 8)
            if isCall, let startedAt = context.state.callStartedAt {
              HStack(spacing: 4) {
                callSignalIcon(displayStatus, size: 12, accent: accent)
                Text(startedAt, style: .timer)
                  .font(.caption.monospacedDigit().weight(.semibold))
                  .foregroundStyle(accent)
                  .unredacted()
              }
            } else {
              HStack(spacing: 4) {
                companionStatusIcon(displayStatus, size: 11, tint: accent)
                Text(displayStatus)
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(accent)
                  .lineLimit(1)
                  .unredacted()
              }
            }
          }
          if isCall {
            Text(displayStatus)
              .font(.footnote.weight(.medium))
              .foregroundStyle(accent)
              .lineLimit(1)
              .unredacted()
          }
          if let reply = cleanReply {
            Text(reply)
              .font(.subheadline)
              .foregroundStyle(.primary)
              .lineLimit(4)
              .truncationMode(.tail)
              .lineSpacing(1.5)
              .unredacted()
          } else if !isCall {
            Text(
              isBackgroundSpeaking
                ? "正在语音播报回复…"
                : (context.attributes.showReply ? "随时待命，点击打开对话" : "回复内容已隐藏")
            )
              .font(.footnote)
              .foregroundStyle(.secondary)
              .lineLimit(1)
              .unredacted()
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 13)
      .nativeLockScreenActivitySurface()
      .widgetURL(chatURL(context.attributes))
    } dynamicIsland: { context in
      let isCall = context.state.callActive == true
      let displayStatus = context.isStale && !isCall ? "状态待更新" : context.state.status
      let isBackgroundListening = !isCall && displayStatus.contains("正在听")
      let isBackgroundSpeaking = !isCall && displayStatus.contains("播报")
      let voiceOutputMode = normalizedVoiceOutputMode(context.state.voiceOutputMode)
      let accent = statusAccent(displayStatus, isCall: isCall)
      let cleanReply = cleanedReply(context.state.reply)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          avatarBadge(
            context.attributes.avatar,
            botName: context.attributes.botName,
            botId: context.attributes.botId,
            status: displayStatus,
            isCall: isCall || isBackgroundListening || isBackgroundSpeaking,
            size: 30
          )
          .padding(.leading, 4)
          .padding(.top, 2)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if isCall {
            HStack(spacing: 4) {
              callSignalIcon(displayStatus, size: 12)
              if let startedAt = context.state.callStartedAt {
                Text(startedAt, style: .timer)
                  .font(.caption.monospacedDigit().weight(.semibold))
                  .foregroundStyle(accent)
                  .multilineTextAlignment(.trailing)
                  .unredacted()
              } else {
                Text(compactCallLabel(displayStatus))
                  .font(.caption2.weight(.semibold))
                  .foregroundStyle(accent)
                  .unredacted()
              }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.islandPill, in: Capsule())
            .padding(.trailing, 2)
            .padding(.top, 2)
          } else {
            HStack(spacing: 4) {
              companionStatusIcon(displayStatus, size: 10, tint: accent)
              Text(displayStatus)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(accent)
                .lineLimit(1)
                .unredacted()
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.islandPill, in: Capsule())
            .padding(.trailing, 2)
            .padding(.top, 2)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .center, spacing: 6) {
              Text(context.attributes.botName)
                .font(.system(size: 13.5, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .unredacted()
              if isCall {
                Text(displayStatus)
                  .font(.caption2.weight(.semibold))
                  .foregroundStyle(accent)
                  .lineLimit(1)
                  .unredacted()
              } else {
                Spacer(minLength: 6)
                voiceModeButton(attributes: context.attributes, mode: voiceOutputMode)
              }
            }

            if let reply = cleanReply {
              Text(reply)
                .font(.system(size: 12.5))
                .foregroundStyle(Color.white.opacity(0.96))
                .lineLimit(3)
                .truncationMode(.tail)
                .lineSpacing(1)
                .unredacted()
            } else if !isCall {
              Text(
                isBackgroundListening
                  ? "正在聆听，说完停顿片刻或点击发送…"
                  : isBackgroundSpeaking
                    ? "正在语音播报回复…"
                    : (context.attributes.showReply ? "随时待命，点下方按钮直接互动" : "回复内容已隐藏")
              )
              .font(.system(size: 12))
              .foregroundStyle(Color.islandSecondary)
              .lineLimit(2)
              .truncationMode(.tail)
              .unredacted()
            }

            actionRow(
              attributes: context.attributes,
              accent: accent,
              isCall: isCall,
              isBackgroundListening: isBackgroundListening,
              isBackgroundSpeaking: isBackgroundSpeaking
            )
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 2)
          .padding(.top, 0)
          .padding(.bottom, 2)
        }
      } compactLeading: {
        avatarBadge(
          context.attributes.avatar,
          botName: context.attributes.botName,
          botId: context.attributes.botId,
          status: displayStatus,
          isCall: isCall || isBackgroundListening || isBackgroundSpeaking,
          size: 24
        )
        .padding(.leading, 2)
      } compactTrailing: {
        if isCall {
          HStack(spacing: 4) {
            callSignalIcon(displayStatus, size: 12)
            if let startedAt = context.state.callStartedAt {
              Text(startedAt, style: .timer)
                .font(.caption2.monospacedDigit().weight(.semibold))
                .foregroundStyle(accent)
                .multilineTextAlignment(.trailing)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: 44, alignment: .trailing)
                .unredacted()
            } else {
              Text(compactCallLabel(displayStatus))
                .font(.caption2.weight(.semibold))
                .foregroundStyle(accent)
                .lineLimit(1)
                .unredacted()
            }
          }
          .padding(.trailing, 3)
        } else if displayStatus == "我一直都在" {
          EmptyView()
        } else {
          companionStatusIcon(displayStatus, size: 12, tint: accent)
            .padding(.trailing, 3)
        }
      } minimal: {
        if isCall || isBackgroundListening || isBackgroundSpeaking {
          callSignalIcon(displayStatus, size: 13)
        } else {
          avatarBadge(
            context.attributes.avatar,
            botName: context.attributes.botName,
            botId: context.attributes.botId,
            status: displayStatus,
            isCall: false,
            size: 24
          )
        }
      }
      .keylineTint(accent)
      .widgetURL(chatURL(context.attributes))
    }
  }

  private func normalizedVoiceOutputMode(_ raw: String?) -> String {
    switch raw {
    case "text", "voice", "both":
      return raw!
    default:
      return "both"
    }
  }

  private func voiceModeDisplay(_ mode: String) -> (icon: String, label: String) {
    switch mode {
    case "text":
      return ("text.bubble.fill", "仅文字")
    case "voice":
      return ("speaker.wave.2.fill", "仅语音")
    default:
      return ("speaker.wave.2.fill", "文字+语音")
    }
  }

  @ViewBuilder
  private func voiceModeButton(
    attributes: CompanionActivityAttributes,
    mode: String
  ) -> some View {
    let display = voiceModeDisplay(mode)
    let badge = HStack(spacing: 3) {
      Image(systemName: display.icon)
        .font(.system(size: 9.5, weight: .semibold))
      Text(display.label)
        .font(.system(size: 10.5, weight: .semibold))
        .lineLimit(1)
    }
    .foregroundStyle(Color.white.opacity(0.92))
    .unredacted()
    .padding(.horizontal, 7)
    .padding(.vertical, 3)
    .background(Color.islandPill, in: Capsule())

    if #available(iOS 17.0, *) {
      Button(intent: CompanionVoiceCycleOutputIntent(botId: attributes.botId, spaceId: attributes.spaceId)) {
        badge
      }
      .buttonStyle(.plain)
    } else {
      badge
    }
  }

  @ViewBuilder
  private func actionRow(
    attributes: CompanionActivityAttributes,
    accent: Color,
    isCall: Bool,
    isBackgroundListening: Bool,
    isBackgroundSpeaking: Bool
  ) -> some View {
    HStack(spacing: 8) {
      if isCall {
        if let url = chatURL(attributes) {
          Link(destination: url) {
            actionLabel("返回通话", systemImage: "phone.fill", background: accent.opacity(0.32))
          }
        }
      } else if isBackgroundListening {
        if #available(iOS 17.0, *) {
          Button(intent: CompanionVoiceFinishIntent()) {
            actionLabel("立即发送", systemImage: "arrow.up.circle.fill", background: accent.opacity(0.34))
          }
          .buttonStyle(.plain)
          Button(intent: CompanionVoiceCancelIntent()) {
            actionLabel("取消", systemImage: "xmark", background: Color.islandPill)
          }
          .buttonStyle(.plain)
        } else if let url = chatURL(attributes) {
          Link(destination: url) {
            actionLabel("打开对话", systemImage: "bubble.left.fill", background: Color.islandPill)
          }
        }
      } else if isBackgroundSpeaking {
        if #available(iOS 17.0, *) {
          Button(intent: CompanionVoiceStopSpeakingIntent()) {
            actionLabel("停止播报", systemImage: "speaker.slash.fill", background: accent.opacity(0.34))
          }
          .buttonStyle(.plain)
        }
        if #available(iOS 18.0, *) {
          Button(intent: CompanionVoiceToggleIntent(botId: attributes.botId, spaceId: attributes.spaceId)) {
            actionLabel("继续说", systemImage: "waveform", background: Color.islandPill)
          }
          .buttonStyle(.plain)
        } else if let url = chatURL(attributes) {
          Link(destination: url) {
            actionLabel("打开对话", systemImage: "bubble.left.fill", background: Color.islandPill)
          }
        }
      } else {
        if let url = captureURL(attributes, mode: "message") {
          Link(destination: url) {
            actionLabel("发消息", systemImage: "bubble.left.fill", background: Color.islandPill)
          }
        }
        if let url = captureURL(attributes, mode: "capture") {
          Link(destination: url) {
            actionLabel("截屏提问", systemImage: "camera.viewfinder", background: accent.opacity(0.28))
          }
        }
        if #available(iOS 18.0, *) {
          Button(intent: CompanionVoiceToggleIntent(botId: attributes.botId, spaceId: attributes.spaceId)) {
            actionLabel("语音对话", systemImage: "waveform", background: Color.islandPill)
          }
          .buttonStyle(.plain)
        } else if let url = chatURL(attributes, voice: true) {
          Link(destination: url) {
            actionLabel("语音对话", systemImage: "waveform", background: Color.islandPill)
          }
        }
      }
    }
  }

  private func actionLabel(_ title: String, systemImage: String, background: Color) -> some View {
    HStack(spacing: 4) {
      Image(systemName: systemImage)
        .font(.system(size: 11, weight: .semibold))
      Text(title)
        .font(.system(size: 11.5, weight: .semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.85)
    }
    .foregroundStyle(.white)
    .unredacted()
    .frame(maxWidth: .infinity)
    .padding(.horizontal, 6)
    .padding(.vertical, 6)
    .background(background, in: Capsule())
  }

  private func cleanedReply(_ raw: String?) -> String? {
    guard let raw else { return nil }
    var text = raw
      .replacingOccurrences(of: "**", with: "")
      .replacingOccurrences(of: "__", with: "")
      .replacingOccurrences(of: "~~", with: "")
      .replacingOccurrences(of: "`", with: "")
    while text.contains("  ") {
      text = text.replacingOccurrences(of: "  ", with: " ")
    }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  private func statusAccent(_ status: String, isCall: Bool) -> Color {
    if isCall {
      if status.contains("静音") { return .callMutedGray }
      if status.contains("思考") { return .statusThinking }
      return .callActiveGreen
    }
    if status.contains("断开") || status.contains("待更新") { return .statusDisconnected }
    if status.contains("思考") { return .statusThinking }
    if status.contains("听") || status.contains("播报") { return .statusListening }
    return .statusPresent
  }

  private func lockScreenStatusAccent(_ status: String, isCall: Bool) -> Color {
    if isCall {
      if status.contains("静音") { return .secondary }
      if status.contains("思考") { return .orange }
      return .green
    }
    if status.contains("断开") || status.contains("待更新") { return .red }
    if status.contains("思考") { return .orange }
    if status.contains("听") || status.contains("播报") { return .blue }
    return .green
  }

  private func compactCallLabel(_ status: String) -> String {
    if status.contains("静音") { return "静音" }
    if status.contains("思考") { return "思考" }
    if status.contains("说话") { return "说话" }
    return "通话"
  }

  @ViewBuilder
  private func companionStatusIcon(_ status: String, size: CGFloat, tint: Color) -> some View {
    if status.contains("思考") {
      animatedSymbol("ellipsis", size: size, tint: tint)
    } else if status.contains("播报") {
      animatedSymbol("speaker.wave.2.fill", size: size, tint: tint)
    } else if status.contains("听") {
      animatedSymbol("waveform", size: size, tint: tint)
    } else if status.contains("断开") || status.contains("待更新") {
      Image(systemName: "wifi.exclamationmark")
        .font(.system(size: size, weight: .semibold))
        .foregroundStyle(tint)
    } else {
      Circle()
        .fill(tint)
        .frame(width: 6, height: 6)
    }
  }

  @ViewBuilder
  private func callSignalIcon(_ status: String, size: CGFloat, accent: Color? = nil) -> some View {
    let tint = accent ?? statusAccent(status, isCall: true)
    if status.contains("静音") {
      Image(systemName: "mic.slash.fill")
        .font(.system(size: size, weight: .semibold))
        .foregroundStyle(tint)
    } else if status.contains("思考") {
      animatedSymbol("ellipsis", size: size, tint: tint)
    } else if status.contains("说话") || status.contains("播报") {
      animatedSymbol("speaker.wave.2.fill", size: size, tint: tint)
    } else {
      animatedSymbol("waveform", size: size, tint: tint)
    }
  }

  @ViewBuilder
  private func animatedSymbol(_ name: String, size: CGFloat, tint: Color) -> some View {
    if #available(iOS 17.0, *) {
      Image(systemName: name)
        .font(.system(size: size, weight: .semibold))
        .foregroundStyle(tint)
        .symbolEffect(.variableColor.iterative)
    } else {
      Image(systemName: name)
        .font(.system(size: size, weight: .semibold))
        .foregroundStyle(tint)
    }
  }

  private func avatarBadge(
    _ encoded: String?,
    botName: String,
    botId: String,
    status: String,
    isCall: Bool,
    size: CGFloat,
    onDarkSurface: Bool = true
  ) -> some View {
    let dotSize = max(8, size * 0.28)
    let dotTint = onDarkSurface ? statusAccent(status, isCall: true) : lockScreenStatusAccent(status, isCall: true)
    return ZStack(alignment: .bottomTrailing) {
      CompanionAnimatedMark(
        status: status,
        content: mark(encoded, botName: botName, botId: botId, size: size, onDarkSurface: onDarkSurface)
      )
      if isCall {
        Circle()
          .fill(dotTint)
          .frame(width: dotSize, height: dotSize)
          .overlay(
            Circle().stroke(
              onDarkSurface ? Color.black : Color.primary.opacity(0.22),
              lineWidth: onDarkSurface ? 1.4 : 1.0
            )
          )
      }
    }
    .frame(width: size, height: size)
    .unredacted()
  }

  private func decodeWidgetAvatarImage(_ encoded: String) -> UIImage? {
    guard encoded.hasPrefix("p|"),
      let data = Data(base64Encoded: String(encoded.dropFirst(2))),
      let decoded = UIImage(data: data),
      decoded.size.width > 0,
      decoded.size.height > 0
    else { return nil }
    let side = min(max(decoded.size.width * decoded.scale, decoded.size.height * decoded.scale), 84)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    format.preferredRange = .standard
    return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format)
      .image { context in
        context.cgContext.interpolationQuality = .high
        decoded.draw(in: CGRect(x: 0, y: 0, width: side, height: side))
      }
  }

  @ViewBuilder
  private func avatarPhoto(_ image: UIImage, size: CGFloat) -> some View {
    let base = Image(uiImage: image)
      .renderingMode(.original)
      .resizable()
      .interpolation(.high)
      .antialiased(true)
    if #available(iOS 18.0, *) {
      base
        .widgetAccentedRenderingMode(.fullColor)
        .scaledToFill()
        .frame(width: size, height: size)
    } else {
      base
        .scaledToFill()
        .frame(width: size, height: size)
    }
  }

  @ViewBuilder
  private func mark(
    _ encoded: String?,
    botName: String,
    botId: String,
    size: CGFloat,
    onDarkSurface: Bool = true
  ) -> some View {
    let ringColor = onDarkSurface ? Color.white.opacity(0.28) : Color.primary.opacity(0.14)
    let ringWidth: CGFloat = onDarkSurface ? 0.9 : 0.6
    if let encoded, let image = decodeWidgetAvatarImage(encoded) {
      avatarPhoto(image, size: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(ringColor, lineWidth: ringWidth))
        .unredacted()
        .accessibilityLabel(botName)
    } else if let encoded, let avatar = CompanionBotAvatar(encoded: encoded, size: size) {
      avatar.unredacted().accessibilityLabel(botName)
    } else {
      let initial = String(botName.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1))
      ZStack {
        Circle()
          .fill(fallbackBotColor(botId.isEmpty ? botName : botId))
        Text(initial.isEmpty ? "S" : initial)
          .font(.system(size: size * 0.46, weight: .bold))
          .foregroundStyle(.white)
      }
      .frame(width: size, height: size)
      .overlay(Circle().stroke(ringColor, lineWidth: ringWidth))
      .unredacted()
      .accessibilityLabel(botName)
    }
  }

  private func fallbackBotColor(_ seed: String) -> Color {
    let palette: [Color] = [
      Color(red: 0.31, green: 0.49, blue: 0.67),
      Color(red: 0.55, green: 0.36, blue: 0.96),
      Color(red: 0.24, green: 0.77, blue: 0.66),
      Color(red: 0.92, green: 0.52, blue: 0.30),
      Color(red: 0.85, green: 0.37, blue: 0.56),
    ]
    var hash: UInt64 = 5381
    for byte in seed.utf8 {
      hash = ((hash &<< 5) &+ hash) &+ UInt64(byte)
    }
    return palette[Int(hash % UInt64(palette.count))]
  }

  private func chatURL(_ attributes: CompanionActivityAttributes, voice: Bool = false) -> URL? {
    var components = URLComponents(string: "rakazo://thread")
    components?.queryItems = [URLQueryItem(name: "botId", value: attributes.botId)]
    if let spaceId = attributes.spaceId {
      components?.queryItems?.append(URLQueryItem(name: "spaceId", value: spaceId))
    }
    components?.queryItems?.append(URLQueryItem(name: "companionLink", value: "1"))
    if let token = attributes.linkToken {
      components?.queryItems?.append(URLQueryItem(name: "companionToken", value: token))
    }
    if voice {
      components?.queryItems?.append(URLQueryItem(name: "companionVoice", value: "1"))
    }
    return components?.url
  }

  private func captureURL(_ attributes: CompanionActivityAttributes, mode: String) -> URL? {
    var components = URLComponents(string: "rakazo://companion-capture")
    components?.queryItems = [
      URLQueryItem(name: "botId", value: attributes.botId),
      URLQueryItem(name: "mode", value: mode),
      URLQueryItem(name: "companionLink", value: "1"),
    ]
    if mode == "capture" {
      components?.queryItems?.append(URLQueryItem(name: "source", value: "clipboard"))
      components?.queryItems?.append(URLQueryItem(name: "speak", value: "1"))
    }
    if let spaceId = attributes.spaceId {
      components?.queryItems?.append(URLQueryItem(name: "spaceId", value: spaceId))
    }
    if let token = attributes.linkToken {
      components?.queryItems?.append(URLQueryItem(name: "companionToken", value: token))
    }
    return components?.url
  }
}

private struct CompanionAnimatedMark<Content: View>: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let status: String
  let content: Content

  init(status: String, content: Content) {
    self.status = status
    self.content = content
  }

  var body: some View {
    content
      .scaleEffect(status.contains("思考") ? 0.92 : 1)
      .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: status)
  }
}

private struct CompanionBotAvatar: View {
  let organic: Bool
  let color: Color
  let eyeColor: Color
  let isDarkFill: Bool
  let rotation: Double
  let coordinates: [UInt8]
  let size: CGFloat

  init?(encoded: String, size: CGFloat) {
    let parts = encoded.split(separator: "|", omittingEmptySubsequences: false)
    guard parts.count == 4, ["o", "s"].contains(String(parts[0])), parts[1].count == 6,
      let rgb = UInt32(parts[1], radix: 16),
      parts[3].count <= 2200, parts[3].count % 2 == 0
    else { return nil }
    let organic = parts[0] == "o"
    let rotation: Double
    let eyes: UInt32
    if organic {
      guard let value = Double(parts[2]), (-4...4).contains(value) else { return nil }
      rotation = value
      eyes = 0x101014
    } else {
      guard parts[2].count == 6, let value = UInt32(parts[2], radix: 16) else { return nil }
      rotation = 0
      eyes = value
    }
    let characters = Array(parts[3])
    var values: [UInt8] = []
    values.reserveCapacity(characters.count / 2)
    for index in stride(from: 0, to: characters.count, by: 2) {
      guard let value = UInt8(String(characters[index...index + 1]), radix: 16) else { return nil }
      values.append(value)
    }
    guard (organic ? (values.count >= 8 && (values.count - 2) % 6 == 0)
      : (values.count >= 6 && values.count % 2 == 0)) else { return nil }
    let r = Double((rgb >> 16) & 255) / 255
    let g = Double((rgb >> 8) & 255) / 255
    let b = Double(rgb & 255) / 255
    let luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    self.organic = organic
    self.color = Color(red: r, green: g, blue: b)
    self.isDarkFill = luminance < 0.22
    self.rotation = rotation
    self.eyeColor =
      luminance < 0.22
        ? Color.white
        : Color(
            red: Double((eyes >> 16) & 255) / 255,
            green: Double((eyes >> 8) & 255) / 255,
            blue: Double(eyes & 255) / 255
          )
    self.coordinates = values
    self.size = size
  }

  var body: some View {
    ZStack {
      let shape = CompanionBotShape(coordinates: coordinates, organic: organic)
      shape.fill(color)
      if isDarkFill {
        shape.stroke(Color.white.opacity(0.38), lineWidth: 1)
      }
      HStack(spacing: size * (organic ? 14.0 / 120 : 38.0 / 259)) {
        eye
        eye
      }
      .rotationEffect(.degrees(rotation))
      .offset(y: organic ? 0 : size * ((114.2705 - 8 + 15) / 259 - 0.5))
    }
    .frame(width: size, height: size)
  }

  private var eye: some View {
    RoundedRectangle(cornerRadius: size * (organic ? 3.5 / 120 : 7.0 / 259))
      .fill(eyeColor)
      .frame(
        width: size * (organic ? 7.0 / 120 : 20.0 / 259),
        height: size * (organic ? 24.0 / 120 : 14.0 / 259))
  }
}

private struct CompanionBotShape: Shape {
  let coordinates: [UInt8]
  let organic: Bool

  func path(in rect: CGRect) -> Path {
    func point(_ index: Int) -> CGPoint {
      if !organic {
        return CGPoint(
          x: rect.minX + CGFloat(coordinates[index]) * rect.width / 255,
          y: rect.minY + CGFloat(coordinates[index + 1]) * rect.height / 255)
      }
      return CGPoint(
        x: rect.minX + (CGFloat(Int(coordinates[index]) - 128) / 2 + 60) * rect.width / 120,
        y: rect.minY + (CGFloat(Int(coordinates[index + 1]) - 128) / 2 + 60) * rect.height / 120)
    }
    var path = Path()
    path.move(to: point(0))
    if organic {
      for index in stride(from: 2, to: coordinates.count, by: 6) {
        path.addCurve(to: point(index + 4), control1: point(index), control2: point(index + 2))
      }
    } else {
      for index in stride(from: 2, to: coordinates.count, by: 2) {
        path.addLine(to: point(index))
      }
    }
    path.closeSubpath()
    return path
  }
}
