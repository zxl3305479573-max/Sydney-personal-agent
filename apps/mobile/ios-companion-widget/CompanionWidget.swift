import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

@main
struct CompanionWidgetBundle: WidgetBundle {
  var body: some Widget { CompanionWidget() }
}

private extension Color {
  static let islandSurface = Color(red: 0.11, green: 0.12, blue: 0.15)
  static let islandSecondary = Color.white.opacity(0.76)
  static let islandSubtle = Color.white.opacity(0.56)
  static let islandPill = Color.white.opacity(0.15)
  static let statusPresent = Color(red: 0.32, green: 0.84, blue: 0.56)
  static let statusListening = Color(red: 0.38, green: 0.72, blue: 0.99)
  static let statusThinking = Color(red: 0.97, green: 0.74, blue: 0.28)
  static let statusDisconnected = Color(red: 0.98, green: 0.44, blue: 0.40)
  static let callActiveGreen = Color(red: 0.24, green: 0.84, blue: 0.48)
  static let callMutedGray = Color.white.opacity(0.68)
}

struct CompanionWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: CompanionActivityAttributes.self) { context in
      let isCall = context.state.callActive == true
      let displayStatus = context.isStale && !isCall ? "状态待更新" : context.state.status
      let accent = statusAccent(displayStatus, isCall: isCall)
      HStack(alignment: .center, spacing: 12) {
        avatarBadge(
          context.attributes.avatar,
          botName: context.attributes.botName,
          botId: context.attributes.botId,
          status: displayStatus,
          isCall: isCall,
          size: 40
        )
        VStack(alignment: .leading, spacing: 4) {
          HStack(spacing: 6) {
            Text(context.attributes.botName)
              .font(.headline)
              .foregroundStyle(.white)
              .lineLimit(1)
            Spacer(minLength: 4)
            if isCall, let startedAt = context.state.callStartedAt {
              HStack(spacing: 4) {
                callSignalIcon(displayStatus, size: 12)
                Text(startedAt, style: .timer)
                  .font(.caption.monospacedDigit().weight(.semibold))
                  .foregroundStyle(accent)
              }
            } else {
              HStack(spacing: 4) {
                Circle()
                  .fill(accent)
                  .frame(width: 6, height: 6)
                Text(displayStatus)
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(accent)
                  .lineLimit(1)
              }
            }
          }
          if isCall {
            Text(displayStatus)
              .font(.subheadline.weight(.medium))
              .foregroundStyle(accent)
              .lineLimit(1)
          }
          if let reply = context.state.reply, !reply.isEmpty {
            Text(reply)
              .font(.subheadline)
              .foregroundStyle(Color.islandSecondary)
              .lineLimit(2)
              .privacySensitive()
          } else if !isCall {
            Text(context.attributes.showReply ? "随时待命，点击打开对话" : "回复内容已隐藏")
              .font(.caption)
              .foregroundStyle(Color.islandSubtle)
              .lineLimit(1)
          }
        }
      }
      .padding(14)
      .activityBackgroundTint(Color.islandSurface)
      .activitySystemActionForegroundColor(.white)
      .widgetURL(chatURL(context.attributes))
    } dynamicIsland: { context in
      let isCall = context.state.callActive == true
      let displayStatus = context.isStale && !isCall ? "状态待更新" : context.state.status
      let accent = statusAccent(displayStatus, isCall: isCall)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 8) {
            avatarBadge(
              context.attributes.avatar,
              botName: context.attributes.botName,
              botId: context.attributes.botId,
              status: displayStatus,
              isCall: isCall,
              size: 32
            )
            Text(context.attributes.botName)
              .font(.headline)
              .foregroundStyle(.white)
              .lineLimit(1)
          }
          .padding(.leading, 2)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if isCall {
            HStack(spacing: 5) {
              callSignalIcon(displayStatus, size: 14)
              if let startedAt = context.state.callStartedAt {
                Text(startedAt, style: .timer)
                  .font(.subheadline.monospacedDigit().weight(.semibold))
                  .foregroundStyle(accent)
                  .multilineTextAlignment(.trailing)
              } else {
                Text(compactCallLabel(displayStatus))
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(accent)
              }
            }
            .padding(.trailing, 2)
          } else {
            HStack(spacing: 5) {
              Circle()
                .fill(accent)
                .frame(width: 6, height: 6)
              Text(displayStatus)
                .font(.caption.weight(.semibold))
                .foregroundStyle(accent)
                .lineLimit(1)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.islandPill, in: Capsule())
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 8) {
            if isCall {
              Text(displayStatus)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(accent)
                .lineLimit(1)
            }
            if let reply = context.state.reply, !reply.isEmpty {
              Text(reply)
                .font(.subheadline)
                .foregroundStyle(.white)
                .lineLimit(2)
                .privacySensitive()
            } else if !isCall {
              Text(context.attributes.showReply ? "随时待命，点击打开对话" : "回复内容已隐藏")
                .font(.caption)
                .foregroundStyle(Color.islandSecondary)
                .lineLimit(1)
            }
            HStack(spacing: 6) {
              if isCall {
                if let url = chatURL(context.attributes) {
                  Link(destination: url) {
                    Label("返回通话", systemImage: "phone.fill")
                      .font(.caption.weight(.semibold))
                      .foregroundStyle(.white)
                      .padding(.horizontal, 10)
                      .padding(.vertical, 5)
                      .background(accent.opacity(0.28), in: Capsule())
                  }
                }
              } else {
                if let url = captureURL(context.attributes, mode: "message") {
                  Link(destination: url) {
                    Text("发消息")
                      .font(.caption.weight(.semibold))
                      .foregroundStyle(.white)
                      .padding(.horizontal, 9)
                      .padding(.vertical, 5)
                      .background(Color.islandPill, in: Capsule())
                  }
                }
                if let url = captureURL(context.attributes, mode: "capture") {
                  Link(destination: url) {
                    Text("截屏提问")
                      .font(.caption.weight(.semibold))
                      .foregroundStyle(.white)
                      .padding(.horizontal, 9)
                      .padding(.vertical, 5)
                      .background(accent.opacity(0.28), in: Capsule())
                  }
                }
                if let url = chatURL(context.attributes, voice: true) {
                  Link(destination: url) {
                    Text("语音对话")
                      .font(.caption.weight(.semibold))
                      .foregroundStyle(.white)
                      .padding(.horizontal, 9)
                      .padding(.vertical, 5)
                      .background(Color.islandPill, in: Capsule())
                  }
                }
              }
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.top, 4)
        }
      } compactLeading: {
        avatarBadge(
          context.attributes.avatar,
          botName: context.attributes.botName,
          botId: context.attributes.botId,
          status: displayStatus,
          isCall: isCall,
          size: 22
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
                .frame(maxWidth: 42, alignment: .trailing)
            } else {
              Text(compactCallLabel(displayStatus))
                .font(.caption2.weight(.semibold))
                .foregroundStyle(accent)
                .lineLimit(1)
            }
          }
          .padding(.trailing, 2)
        } else if displayStatus == "我一直都在" {
          HStack(spacing: 4) {
            Circle()
              .fill(accent)
              .frame(width: 5, height: 5)
            Text(context.attributes.botName)
              .font(.caption2.weight(.semibold))
              .foregroundStyle(.white)
              .lineLimit(1)
              .frame(maxWidth: 68, alignment: .trailing)
          }
          .padding(.trailing, 2)
        } else {
          HStack(spacing: 4) {
            companionStatusIcon(displayStatus, size: 11, tint: accent)
            Text(compactCompanionStatus(displayStatus))
              .font(.caption2.weight(.semibold))
              .foregroundStyle(accent)
              .lineLimit(1)
          }
          .padding(.trailing, 2)
        }
      } minimal: {
        if isCall {
          callSignalIcon(displayStatus, size: 13)
        } else {
          avatarBadge(
            context.attributes.avatar,
            botName: context.attributes.botName,
            botId: context.attributes.botId,
            status: displayStatus,
            isCall: false,
            size: 22
          )
        }
      }
      .keylineTint(accent)
      .widgetURL(chatURL(context.attributes))
    }
  }

  private func statusAccent(_ status: String, isCall: Bool) -> Color {
    if isCall {
      if status.contains("静音") { return .callMutedGray }
      if status.contains("思考") { return .statusThinking }
      return .callActiveGreen
    }
    if status.contains("断开") || status.contains("待更新") { return .statusDisconnected }
    if status.contains("思考") { return .statusThinking }
    if status.contains("听") { return .statusListening }
    return .statusPresent
  }

  private func compactCallLabel(_ status: String) -> String {
    if status.contains("静音") { return "静音" }
    if status.contains("思考") { return "思考" }
    if status.contains("说话") { return "说话" }
    return "通话"
  }

  private func compactCompanionStatus(_ status: String) -> String {
    if status.contains("断开") { return "重连中" }
    if status.contains("待更新") { return "待更新" }
    return status
  }

  @ViewBuilder
  private func companionStatusIcon(_ status: String, size: CGFloat, tint: Color) -> some View {
    if status.contains("思考") {
      animatedSymbol("ellipsis", size: size, tint: tint)
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
  private func callSignalIcon(_ status: String, size: CGFloat) -> some View {
    let tint = statusAccent(status, isCall: true)
    if status.contains("静音") {
      Image(systemName: "mic.slash.fill")
        .font(.system(size: size, weight: .semibold))
        .foregroundStyle(tint)
    } else if status.contains("思考") {
      animatedSymbol("ellipsis", size: size, tint: tint)
    } else if status.contains("说话") {
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
    size: CGFloat
  ) -> some View {
    let dotSize = max(7, size * 0.30)
    return ZStack(alignment: .bottomTrailing) {
      CompanionAnimatedMark(
        status: status,
        content: mark(encoded, botName: botName, botId: botId, size: size)
      )
      if isCall {
        Circle()
          .fill(statusAccent(status, isCall: true))
          .frame(width: dotSize, height: dotSize)
          .overlay(Circle().stroke(Color.black, lineWidth: 1.2))
      }
    }
    .frame(width: size, height: size)
  }

  @ViewBuilder
  private func mark(_ encoded: String?, botName: String, botId: String, size: CGFloat) -> some View {
    if let encoded, encoded.hasPrefix("p|"),
      let data = Data(base64Encoded: String(encoded.dropFirst(2))),
      let image = UIImage(data: data) {
      Image(uiImage: image)
        .resizable()
        .scaledToFill()
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.white.opacity(0.24), lineWidth: 0.75))
        .accessibilityLabel(botName)
    } else if let encoded, let avatar = CompanionBotAvatar(encoded: encoded, size: size) {
      avatar.accessibilityLabel(botName)
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
      .overlay(Circle().stroke(Color.white.opacity(0.22), lineWidth: 0.75))
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
      .scaleEffect(status.contains("思考") ? 0.90 : 1)
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
