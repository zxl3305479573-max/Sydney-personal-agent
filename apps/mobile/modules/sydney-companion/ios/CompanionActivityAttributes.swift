import ActivityKit
import Foundation

struct CompanionActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var status: String
    var reply: String?
  }

  var botId: String
  var botName: String
  var spaceId: String?
  var showReply: Bool
  var avatar: String?
  var linkToken: String?
}
