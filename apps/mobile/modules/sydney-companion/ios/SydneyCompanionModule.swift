import ActivityKit
import ExpoModulesCore
import Foundation
import UIKit

private func activityAvatar(_ value: String?) -> String? {
  guard let value else { return nil }
  guard value.hasPrefix("r|") else {
    return value.utf8.count <= 2240 ? value : nil
  }
  guard value.utf8.count <= 200_002,
    let separator = value.range(of: ";base64,"),
    ["r|data:image/png", "r|data:image/jpeg", "r|data:image/webp", "r|data:image/gif"]
      .contains(String(value[..<separator.lowerBound])),
    let bytes = Data(base64Encoded: String(value[separator.upperBound...])),
    let image = UIImage(data: bytes),
    image.size.width > 0, image.size.height > 0,
    image.size.width <= 4096, image.size.height <= 4096
  else { return nil }
  let format = UIGraphicsImageRendererFormat()
  format.scale = 1
  format.opaque = true
  let side: CGFloat = 32
  let scale = max(side / image.size.width, side / image.size.height)
  let width = image.size.width * scale
  let height = image.size.height * scale
  let thumbnail = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format)
    .image { context in
      context.cgContext.setFillColor(UIColor.white.cgColor)
      context.cgContext.fill(CGRect(x: 0, y: 0, width: side, height: side))
      image.draw(in: CGRect(x: (side - width) / 2, y: (side - height) / 2, width: width, height: height))
    }
  for quality in [CGFloat(0.5), 0.3, 0.15] {
    if let jpeg = thumbnail.jpegData(compressionQuality: quality), jpeg.count <= 1400 {
      return "p|" + jpeg.base64EncodedString()
    }
  }
  return nil
}

public class SydneyCompanionModule: Module {
  private var screenCapture: AnyObject?

  public func definition() -> ModuleDefinition {
    Name("SydneyCompanion")
    Events("onScreenState")

    Function("isAvailable") { () -> Bool in
      Bundle.main.object(forInfoDictionaryKey: "SydneyCompanionEnabled") as? Bool == true
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
      let labels = ["我一直都在", "正在听", "思考中", "连接已断开"]
      guard labels.contains(status),
        let activity = Activity<CompanionActivityAttributes>.activities.first(where: {
          $0.id == activityId && $0.attributes.botId == botId && $0.attributes.spaceId == spaceId
        })
      else { return }
      let visibleReply = activity.attributes.showReply ? reply.map { String($0.prefix(80)) } : nil
      let state = CompanionActivityAttributes.ContentState(status: status, reply: visibleReply)
      let staleDate = status == "正在听" || status == "思考中" ? Date().addingTimeInterval(90) : nil
      await activity.update(ActivityContent(state: state, staleDate: staleDate))
    }
  }
}
