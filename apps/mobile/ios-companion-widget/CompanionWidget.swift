import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

@main
struct CompanionWidgetBundle: WidgetBundle {
  var body: some Widget { CompanionWidget() }
}

struct CompanionWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: CompanionActivityAttributes.self) { context in
      HStack(spacing: 12) {
        animatedMark(context.attributes.avatar, status: context.isStale ? "" : context.state.status)
        VStack(alignment: .leading, spacing: 4) {
          Text(context.attributes.botName).font(.headline).lineLimit(1)
          Text(context.isStale ? "状态待更新" : context.state.status).font(.subheadline)
          if let reply = context.state.reply {
            Text(reply).font(.caption).lineLimit(2).privacySensitive()
          }
        }
      }
      .padding()
      .widgetURL(chatURL(context.attributes))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack {
            animatedMark(context.attributes.avatar, status: context.isStale ? "" : context.state.status)
            Text(context.attributes.botName).lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            Text(context.isStale ? "状态待更新" : context.state.status)
            if let reply = context.state.reply {
              Text(reply).lineLimit(2).privacySensitive()
            }
            if let url = chatURL(context.attributes) {
              Link("打开对话", destination: url)
            }
            if let url = chatURL(context.attributes, voice: true) {
              Link("语音对话", destination: url)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      } compactLeading: {
        animatedMark(context.attributes.avatar, status: context.isStale ? "" : context.state.status)
      } compactTrailing: {
        Text(context.isStale ? "状态待更新" : context.state.status).font(.caption2).lineLimit(1)
      } minimal: {
        animatedMark(context.attributes.avatar, status: context.isStale ? "" : context.state.status)
      }
      .widgetURL(chatURL(context.attributes))
    }
  }

  private func animatedMark(_ encoded: String?, status: String) -> some View {
    CompanionAnimatedMark(status: status, content: mark(encoded))
  }

  @ViewBuilder
  private func mark(_ encoded: String?) -> some View {
    if let encoded, encoded.hasPrefix("p|"),
      let data = Data(base64Encoded: String(encoded.dropFirst(2))),
      let image = UIImage(data: data) {
      Image(uiImage: image)
        .resizable()
        .scaledToFill()
        .frame(width: 24, height: 24)
        .clipShape(Circle())
        .accessibilityLabel("Bot")
    } else if let encoded, let avatar = CompanionBotAvatar(encoded: encoded) {
      avatar.frame(width: 24, height: 24).accessibilityLabel("Bot")
    } else {
      Image(systemName: "sparkles")
        .font(.caption.bold())
        .foregroundStyle(.white)
        .frame(width: 24, height: 24)
        .background(.purple.gradient, in: Circle())
        .accessibilityLabel("Sydney")
    }
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
      .scaleEffect(status == "思考中" ? 0.88 : 1)
      .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: status)
  }
}

private struct CompanionBotAvatar: View {
  let organic: Bool
  let logo: Bool
  let color: Color
  let eyeColor: Color
  let rotation: Double
  let coordinates: [UInt8]

  init?(encoded: String) {
    let parts = encoded.split(separator: "|", omittingEmptySubsequences: false)
    guard parts.count == 4, ["o", "s", "l"].contains(String(parts[0])), parts[1].count == 6,
      let rgb = UInt32(parts[1], radix: 16),
      parts[3].count <= 2200, parts[3].count % 2 == 0
    else { return nil }
    let organic = parts[0] == "o"
    let logo = parts[0] == "l"
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
    for index in stride(from: 0, to: characters.count, by: 2) {
      guard let value = UInt8(String(characters[index...index + 1]), radix: 16) else { return nil }
      values.append(value)
    }
    guard (organic ? (values.count >= 8 && (values.count - 2) % 6 == 0)
      : (values.count >= 6 && values.count % 2 == 0)) else { return nil }
    self.organic = organic
    self.logo = logo
    self.color = Color(
      red: Double((rgb >> 16) & 255) / 255,
      green: Double((rgb >> 8) & 255) / 255,
      blue: Double(rgb & 255) / 255)
    self.rotation = rotation
    self.eyeColor = Color(
      red: Double((eyes >> 16) & 255) / 255,
      green: Double((eyes >> 8) & 255) / 255,
      blue: Double(eyes & 255) / 255)
    self.coordinates = values
  }

  var body: some View {
    GeometryReader { geometry in
      let size = min(geometry.size.width, geometry.size.height)
      ZStack {
        if logo {
          RoundedRectangle(cornerRadius: size * 0.23).fill(Color(uiColor: .secondarySystemBackground))
        }
        if logo {
          CompanionBotShape(coordinates: coordinates, organic: false).fill(color.gradient)
        } else {
          CompanionBotShape(coordinates: coordinates, organic: organic).fill(color)
        }
        HStack(spacing: size * (organic ? 14.0 / 120 : logo ? 8.6 / 100 : 38.0 / 259)) {
          eye(size)
          eye(size)
        }
        .rotationEffect(.degrees(rotation))
        .offset(y: organic ? 0 : logo ? -size * 0.01 : size * ((114.2705 - 8 + 15) / 259 - 0.5))
      }
      .frame(width: size, height: size)
      .clipShape(RoundedRectangle(cornerRadius: logo ? size * 0.23 : 0))
    }
  }

  private func eye(_ size: CGFloat) -> some View {
    RoundedRectangle(cornerRadius: size * (organic ? 3.5 / 120 : logo ? 5.2 / 100 : 7.0 / 259))
      .fill(eyeColor)
      .frame(
        width: size * (organic ? 7.0 / 120 : logo ? 10.4 / 100 : 20.0 / 259),
        height: size * (organic ? 24.0 / 120 : logo ? 16.0 / 100 : 14.0 / 259))
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
