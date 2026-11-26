import ActivityKit
import ExpoModulesCore
import Foundation
import Intents
import UIKit
import UserNotifications

private func decodeCustomAvatarImage(_ value: String) -> UIImage? {
  guard value.hasPrefix("r|"),
    value.utf8.count <= 200_002,
    let separator = value.range(of: ";base64,", options: .caseInsensitive),
    [
      "r|data:image/png",
      "r|data:image/jpeg",
      "r|data:image/jpg",
      "r|data:image/webp",
      "r|data:image/gif",
    ].contains(String(value[..<separator.lowerBound]).lowercased()),
    let bytes = Data(base64Encoded: String(value[separator.upperBound...]), options: .ignoreUnknownCharacters),
    let image = UIImage(data: bytes),
    image.size.width > 0, image.size.height > 0,
    image.size.width <= 4096, image.size.height <= 4096
  else { return nil }
  return image
}

private func activityAvatar(_ value: String?) -> String? {
  guard let value else { return nil }
  guard value.hasPrefix("r|") else {
    return value.utf8.count <= 2240 ? value : nil
  }
  guard let image = decodeCustomAvatarImage(value) else { return nil }
  let format = UIGraphicsImageRendererFormat()
  format.scale = 1
  format.opaque = true
  let candidates: [(CGFloat, [CGFloat], Int)] = [
    (48, [0.6, 0.45, 0.3, 0.2], 1800),
    (32, [0.45, 0.3, 0.15, 0.08], 1600),
  ]
  for (side, qualities, maxBytes) in candidates {
    let scale = max(side / image.size.width, side / image.size.height)
    let width = image.size.width * scale
    let height = image.size.height * scale
    let thumbnail = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format)
      .image { context in
        context.cgContext.setFillColor(UIColor.white.cgColor)
        context.cgContext.fill(CGRect(x: 0, y: 0, width: side, height: side))
        image.draw(in: CGRect(x: (side - width) / 2, y: (side - height) / 2, width: width, height: height))
      }
    for quality in qualities {
      if let jpeg = thumbnail.jpegData(compressionQuality: quality), jpeg.count <= maxBytes {
        return "p|" + jpeg.base64EncodedString()
      }
    }
  }
  return nil
}

private func fallbackNotificationBotColor(_ seed: String) -> UIColor {
  let palette: [UIColor] = [
    UIColor(red: 0.31, green: 0.49, blue: 0.67, alpha: 1),
    UIColor(red: 0.55, green: 0.36, blue: 0.96, alpha: 1),
    UIColor(red: 0.24, green: 0.77, blue: 0.66, alpha: 1),
    UIColor(red: 0.92, green: 0.52, blue: 0.30, alpha: 1),
    UIColor(red: 0.85, green: 0.37, blue: 0.56, alpha: 1),
  ]
  var hash: UInt64 = 5381
  for byte in seed.utf8 {
    hash = ((hash &<< 5) &+ hash) &+ UInt64(byte)
  }
  return palette[Int(hash % UInt64(palette.count))]
}

private func drawVectorBotAvatar(_ encoded: String, in cgContext: CGContext, rect: CGRect) -> Bool {
  let parts = encoded.split(separator: "|", omittingEmptySubsequences: false)
  guard parts.count == 4, ["o", "s"].contains(String(parts[0])), parts[1].count == 6,
    let rgb = UInt32(parts[1], radix: 16),
    parts[3].count <= 2200, parts[3].count % 2 == 0
  else { return false }

  let organic = parts[0] == "o"
  let rotation: CGFloat
  let eyeRgb: UInt32
  if organic {
    guard let value = Double(parts[2]), (-4...4).contains(value) else { return false }
    rotation = CGFloat(value)
    eyeRgb = 0x101014
  } else {
    guard parts[2].count == 6, let value = UInt32(parts[2], radix: 16) else { return false }
    rotation = 0
    eyeRgb = value
  }

  let characters = Array(parts[3])
  var values: [UInt8] = []
  values.reserveCapacity(characters.count / 2)
  for index in stride(from: 0, to: characters.count, by: 2) {
    guard let value = UInt8(String(characters[index...index + 1]), radix: 16) else { return false }
    values.append(value)
  }
  guard (organic ? (values.count >= 8 && (values.count - 2) % 6 == 0)
    : (values.count >= 6 && values.count % 2 == 0))
  else { return false }

  let red = CGFloat((rgb >> 16) & 255) / 255.0
  let green = CGFloat((rgb >> 8) & 255) / 255.0
  let blue = CGFloat(rgb & 255) / 255.0
  let luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  let fillColor = UIColor(red: red, green: green, blue: blue, alpha: 1)
  let eyeColor: UIColor =
    luminance < 0.22
      ? .white
      : UIColor(
          red: CGFloat((eyeRgb >> 16) & 255) / 255.0,
          green: CGFloat((eyeRgb >> 8) & 255) / 255.0,
          blue: CGFloat(eyeRgb & 255) / 255.0,
          alpha: 1
        )

  // Warm-porcelain circular backdrop keeps dark and light bot shapes crisp in Notification Center.
  UIColor(red: 0.96, green: 0.95, blue: 0.93, alpha: 1).setFill()
  UIBezierPath(ovalIn: rect).fill()

  let inset = rect.insetBy(dx: rect.width * 0.08, dy: rect.height * 0.08)
  func point(_ index: Int) -> CGPoint {
    if !organic {
      return CGPoint(
        x: inset.minX + CGFloat(values[index]) * inset.width / 255.0,
        y: inset.minY + CGFloat(values[index + 1]) * inset.height / 255.0
      )
    }
    return CGPoint(
      x: inset.minX + (CGFloat(Int(values[index]) - 128) / 2.0 + 60.0) * inset.width / 120.0,
      y: inset.minY + (CGFloat(Int(values[index + 1]) - 128) / 2.0 + 60.0) * inset.height / 120.0
    )
  }

  let path = UIBezierPath()
  path.move(to: point(0))
  if organic {
    for index in stride(from: 2, to: values.count, by: 6) {
      path.addCurve(to: point(index + 4), controlPoint1: point(index), controlPoint2: point(index + 2))
    }
  } else {
    for index in stride(from: 2, to: values.count, by: 2) {
      path.addLine(to: point(index))
    }
  }
  path.close()
  fillColor.setFill()
  path.fill()

  let drawSize = inset.width
  let eyeSpacing = drawSize * (organic ? 14.0 / 120.0 : 38.0 / 259.0)
  let eyeWidth = drawSize * (organic ? 7.0 / 120.0 : 20.0 / 259.0)
  let eyeHeight = drawSize * (organic ? 24.0 / 120.0 : 14.0 / 259.0)
  let eyeRadius = drawSize * (organic ? 3.5 / 120.0 : 7.0 / 259.0)
  let yOffset = organic ? 0.0 : drawSize * ((114.2705 - 8.0 + 15.0) / 259.0 - 0.5)

  cgContext.saveGState()
  cgContext.translateBy(x: inset.midX, y: inset.midY + yOffset)
  if rotation != 0 {
    cgContext.rotate(by: rotation * .pi / 180.0)
  }
  eyeColor.setFill()
  let leftEye = CGRect(
    x: -(eyeSpacing / 2.0) - eyeWidth,
    y: -eyeHeight / 2.0,
    width: eyeWidth,
    height: eyeHeight
  )
  let rightEye = CGRect(
    x: eyeSpacing / 2.0,
    y: -eyeHeight / 2.0,
    width: eyeWidth,
    height: eyeHeight
  )
  UIBezierPath(roundedRect: leftEye, cornerRadius: eyeRadius).fill()
  UIBezierPath(roundedRect: rightEye, cornerRadius: eyeRadius).fill()
  cgContext.restoreGState()
  return true
}

private func renderBotNotificationAvatarPNG(encoded: String?, botName: String, botId: String) -> Data? {
  let side: CGFloat = 160
  let rect = CGRect(x: 0, y: 0, width: side, height: side)
  let format = UIGraphicsImageRendererFormat()
  format.scale = 1
  format.opaque = false
  let image = UIGraphicsImageRenderer(size: rect.size, format: format).image { ctx in
    UIBezierPath(ovalIn: rect).addClip()
    if let encoded, let custom = decodeCustomAvatarImage(encoded) {
      let scale = max(side / custom.size.width, side / custom.size.height)
      let width = custom.size.width * scale
      let height = custom.size.height * scale
      UIColor.white.setFill()
      ctx.fill(rect)
      custom.draw(in: CGRect(x: (side - width) / 2.0, y: (side - height) / 2.0, width: width, height: height))
      return
    }
    if let encoded, drawVectorBotAvatar(encoded, in: ctx.cgContext, rect: rect) {
      return
    }
    fallbackNotificationBotColor(botId.isEmpty ? botName : botId).setFill()
    ctx.fill(rect)
    let initialChar = botName.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1)
    let initial = initialChar.isEmpty ? "S" : String(initialChar)
    let attributes: [NSAttributedString.Key: Any] = [
      .font: UIFont.systemFont(ofSize: side * 0.46, weight: .bold),
      .foregroundColor: UIColor.white,
    ]
    let attributed = NSAttributedString(string: initial, attributes: attributes)
    let textSize = attributed.size()
    attributed.draw(
      at: CGPoint(x: (side - textSize.width) / 2.0, y: (side - textSize.height) / 2.0)
    )
  }
  return image.pngData()
}

public class SydneyCompanionModule: Module {
  private static let companionStatusLabels: Set<String> = [
    "我一直都在", "正在听", "思考中", "连接已断开",
  ]
  private static let callStatusLabels: Set<String> = [
    "通话中", "通话 · 正在听", "通话 · 思考中", "通话 · 说话中", "通话 · 已静音",
  ]
  private var screenCapture: AnyObject?

  public func definition() -> ModuleDefinition {
    Name("SydneyCompanion")
    Events("onScreenState")

    Function("isAvailable") { () -> Bool in
      Bundle.main.object(forInfoDictionaryKey: "SydneyCompanionEnabled") as? Bool == true
    }

    Function("supportsCallStatus") { () -> Bool in
      Bundle.main.object(forInfoDictionaryKey: "SydneyCompanionEnabled") as? Bool == true
    }

    Function("supportsBotNotifications") { () -> Bool in
      true
    }

    AsyncFunction("scheduleBotNotification") {
      (
        identifier: String,
        botId: String,
        botName: String,
        title: String,
        body: String,
        avatar: String?,
        playSound: Bool,
        userInfo: [String: String]
      ) async throws -> Void in
      let safeId = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
      let requestId = safeId.isEmpty ? UUID().uuidString : String(safeId.prefix(160))
      let safeBotId = botId.trimmingCharacters(in: .whitespacesAndNewlines)
      let trimmedName = botName.trimmingCharacters(in: .whitespacesAndNewlines)
      let safeBotName = trimmedName.isEmpty ? "Sydney" : String(trimmedName.prefix(120))
      let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
      let safeTitle = trimmedTitle.isEmpty ? safeBotName : String(trimmedTitle.prefix(160))
      let safeBody = String(body.prefix(400))

      let content = UNMutableNotificationContent()
      content.title = safeTitle
      content.body = safeBody
      content.sound = playSound ? .default : nil
      content.userInfo = userInfo
      content.threadIdentifier = safeBotId.isEmpty ? "sydney-bot" : "bot:\(safeBotId)"

      let pngData = renderBotNotificationAvatarPNG(encoded: avatar, botName: safeBotName, botId: safeBotId)
      if let pngData {
        let tempURL = FileManager.default.temporaryDirectory
          .appendingPathComponent("sydney-bot-avatar-\(UUID().uuidString).png")
        do {
          try pngData.write(to: tempURL, options: .atomic)
          let attachment = try UNNotificationAttachment(
            identifier: "bot-avatar",
            url: tempURL,
            options: [UNNotificationAttachmentOptionsTypeHintKey: "public.png"]
          )
          content.attachments = [attachment]
        } catch {
          try? FileManager.default.removeItem(at: tempURL)
        }
      }

      var finalContent: UNNotificationContent = content
      if !safeBotId.isEmpty {
        let inImage = pngData.map { INImage(imageData: $0) }
        let sender = INPerson(
          personHandle: INPersonHandle(value: safeBotId, type: .unknown),
          nameComponents: nil,
          displayName: safeBotName,
          image: inImage,
          contactIdentifier: nil,
          customIdentifier: safeBotId
        )
        let intent = INSendMessageIntent(
          recipients: nil,
          outgoingMessageType: .outgoingMessageText,
          content: safeBody,
          speakableGroupName: nil,
          conversationIdentifier: content.threadIdentifier,
          serviceName: "Sydney",
          sender: sender,
          attachments: nil
        )
        if let inImage {
          intent.setImage(inImage, forParameterNamed: \.sender)
        }
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        interaction.donate(completion: nil)
        if let updated = try? content.updating(from: intent) {
          finalContent = updated
        }
      }

      let request = UNNotificationRequest(identifier: requestId, content: finalContent, trigger: nil)
      try await UNUserNotificationCenter.current().add(request)
    }

    AsyncFunction("start") { (botId: String, botName: String, spaceId: String?, showReply: Bool, avatar: String?) async throws -> String in
      guard Bundle.main.object(forInfoDictionaryKey: "SydneyCompanionEnabled") as? Bool == true,
        ActivityAuthorizationInfo().areActivitiesEnabled,
        !botId.isEmpty, botId.utf8.count <= 256,
        botName.utf8.count <= 512,
        (spaceId?.utf8.count ?? 0) <= 256
      else {
        throw NSError(domain: "SydneyCompanion", code: 1,
          userInfo: [NSLocalizedDescriptionKey: "陪伴活动不可用，请检查系统设置和安装版本。"])
      }
      for activity in Activity<CompanionActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      let attributes = CompanionActivityAttributes(
        botId: botId, botName: botName, spaceId: spaceId, showReply: showReply,
        avatar: activityAvatar(avatar), linkToken: UUID().uuidString)
      let state = CompanionActivityAttributes.ContentState(status: "我一直都在", reply: nil)
      let activity = try Activity.request(
        attributes: attributes, content: ActivityContent(state: state, staleDate: nil), pushType: nil)
      return activity.id
    }

    AsyncFunction("startCall") {
      (
        botId: String,
        botName: String,
        spaceId: String?,
        showReply: Bool,
        avatar: String?,
        status: String,
        reply: String?,
        callStartedAtMs: Double
      ) async throws -> String in
      guard Bundle.main.object(forInfoDictionaryKey: "SydneyCompanionEnabled") as? Bool == true,
        ActivityAuthorizationInfo().areActivitiesEnabled,
        !botId.isEmpty, botId.utf8.count <= 256,
        botName.utf8.count <= 512,
        (spaceId?.utf8.count ?? 0) <= 256
      else {
        throw NSError(domain: "SydneyCompanion", code: 1,
          userInfo: [NSLocalizedDescriptionKey: "灵动岛通话活动不可用，请检查系统设置和安装版本。"])
      }
      for activity in Activity<CompanionActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      let safeStatus = Self.callStatusLabels.contains(status) ? status : "通话 · 正在听"
      let visibleReply = showReply ? reply.map { String($0.prefix(80)) } : nil
      let attributes = CompanionActivityAttributes(
        botId: botId, botName: botName, spaceId: spaceId, showReply: showReply,
        avatar: activityAvatar(avatar), linkToken: UUID().uuidString)
      let state = CompanionActivityAttributes.ContentState(
        status: safeStatus,
        reply: visibleReply,
        callActive: true,
        callStartedAt: Date(timeIntervalSince1970: callStartedAtMs / 1000.0)
      )
      let activity = try Activity.request(
        attributes: attributes, content: ActivityContent(state: state, staleDate: nil), pushType: nil)
      return activity.id
    }

    AsyncFunction("stopActivity") { (activityId: String) async -> Void in
      for activity in Activity<CompanionActivityAttributes>.activities where activity.id == activityId {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }

    AsyncFunction("stop") { () async throws -> Void in
      for activity in Activity<CompanionActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      #if compiler(>=6.4) && canImport(ScreenCaptureKit)
      if #available(iOS 27.0, *) {
        if let capture = self.screenCapture as? CompanionScreenCapture {
          try await Task { @MainActor in try await capture.stop() }.value
        }
      }
      #endif
    }

    AsyncFunction("screenState") { () async -> String in
      #if compiler(>=6.4) && canImport(ScreenCaptureKit)
      if #available(iOS 27.0, *),
        Bundle.main.object(forInfoDictionaryKey: "SydneyCompanionEnabled") as? Bool == true {
        return await MainActor.run { (self.screenCapture as? CompanionScreenCapture)?.state() ?? "idle" }
      }
      #endif
      return "unsupported"
    }

    AsyncFunction("presentScreen") { (botId: String, spaceId: String?) async throws -> Void in
      #if compiler(>=6.4) && canImport(ScreenCaptureKit)
      if #available(iOS 27.0, *) {
        try await MainActor.run {
          guard Bundle.main.object(forInfoDictionaryKey: "SydneyCompanionEnabled") as? Bool == true,
            let activity = Activity<CompanionActivityAttributes>.activities.first(where: {
              $0.attributes.botId == botId && $0.attributes.spaceId == spaceId
            })
          else {
            throw NSError(domain: "SydneyCompanion", code: 2,
              userInfo: [NSLocalizedDescriptionKey: "请先为当前 Bot 开启陪伴。"])
          }
          let capture = (self.screenCapture as? CompanionScreenCapture) ?? CompanionScreenCapture()
          self.screenCapture = capture
          capture.onState = { [weak self] state in
            self?.sendEvent("onScreenState", ["state": state])
          }
          let accepted = capture.present {
            Activity<CompanionActivityAttributes>.activities.contains {
              $0.id == activity.id && $0.attributes.botId == botId && $0.attributes.spaceId == spaceId
            }
          }
          guard accepted else {
            throw NSError(domain: "SydneyCompanion", code: 3,
              userInfo: [NSLocalizedDescriptionKey: "屏幕识别正在运行或停止中。"])
          }
        }
        return
      }
      #endif
      throw NSError(domain: "SydneyCompanion", code: 4,
        userInfo: [NSLocalizedDescriptionKey: "屏幕识别需要支持的 iOS 版本和实验构建。"])
    }

    AsyncFunction("stopScreen") { () async throws -> Void in
      #if compiler(>=6.4) && canImport(ScreenCaptureKit)
      if #available(iOS 27.0, *) {
        if let capture = self.screenCapture as? CompanionScreenCapture {
          try await Task { @MainActor in try await capture.stop() }.value
        }
      }
      #endif
    }

    AsyncFunction("takeScreenText") { () async -> String? in
      #if compiler(>=6.4) && canImport(ScreenCaptureKit)
      if #available(iOS 27.0, *) {
        return await MainActor.run { (self.screenCapture as? CompanionScreenCapture)?.takeText() }
      }
      #endif
      return nil
    }

    AsyncFunction("peekScreenSnapshot") { () async -> [String: Any]? in
      #if compiler(>=6.4) && canImport(ScreenCaptureKit)
      if #available(iOS 27.0, *),
        Bundle.main.object(forInfoDictionaryKey: "SydneyCompanionEnabled") as? Bool == true {
        let snap: (state: String, text: String?, capturedAt: Double?) = await MainActor.run {
          (self.screenCapture as? CompanionScreenCapture)?.peekSnapshot() ?? ("idle", nil, nil)
        }
        var result: [String: Any] = ["state": snap.state]
        if let text = snap.text {
          result["text"] = text
        }
        if let capturedAt = snap.capturedAt {
          result["capturedAt"] = capturedAt
        }
        return result
      }
      #endif
      return nil
    }

    Function("activeBotId") { () -> String? in
      Activity<CompanionActivityAttributes>.activities.first?.attributes.botId
    }

    Function("activeActivity") { () -> [String: Any]? in
      guard let activity = Activity<CompanionActivityAttributes>.activities.first else { return nil }
      return [
        "id": activity.id,
        "botId": activity.attributes.botId,
        "spaceId": activity.attributes.spaceId ?? "",
        "showReply": activity.attributes.showReply,
        "linkToken": activity.attributes.linkToken ?? "",
      ]
    }

    AsyncFunction("update") {
      (activityId: String, botId: String, spaceId: String?, status: String, reply: String?) async -> Void in
      let allowed = Self.companionStatusLabels.union(Self.callStatusLabels)
      guard allowed.contains(status),
        let activity = Activity<CompanionActivityAttributes>.activities.first(where: {
          $0.id == activityId && $0.attributes.botId == botId && $0.attributes.spaceId == spaceId
        })
      else { return }
      let visibleReply = activity.attributes.showReply ? reply.map { String($0.prefix(80)) } : nil
      let isCall = Self.callStatusLabels.contains(status)
      let state = CompanionActivityAttributes.ContentState(
        status: status,
        reply: visibleReply,
        callActive: isCall ? true : false,
        callStartedAt: nil
      )
      let staleDate: Date? =
        isCall
          ? nil
          : (status == "正在听" || status == "思考中" ? Date().addingTimeInterval(90) : nil)
      await activity.update(ActivityContent(state: state, staleDate: staleDate))
    }

    AsyncFunction("updateCall") {
      (
        activityId: String,
        botId: String,
        spaceId: String?,
        status: String,
        reply: String?,
        callActive: Bool,
        callStartedAtMs: Double?
      ) async -> Void in
      let allowed = callActive
        ? Self.callStatusLabels.union(Self.companionStatusLabels)
        : Self.companionStatusLabels
      guard allowed.contains(status),
        let activity = Activity<CompanionActivityAttributes>.activities.first(where: {
          $0.id == activityId && $0.attributes.botId == botId && $0.attributes.spaceId == spaceId
        })
      else { return }
      let visibleReply = activity.attributes.showReply ? reply.map { String($0.prefix(80)) } : nil
      let startedAt =
        callActive
          ? callStartedAtMs.map { Date(timeIntervalSince1970: $0 / 1000.0) }
          : nil
      let state = CompanionActivityAttributes.ContentState(
        status: status,
        reply: visibleReply,
        callActive: callActive,
        callStartedAt: startedAt
      )
      let staleDate: Date? =
        callActive
          ? nil
          : (status == "正在听" || status == "思考中" ? Date().addingTimeInterval(90) : nil)
      await activity.update(ActivityContent(state: state, staleDate: staleDate))
    }
  }
}
