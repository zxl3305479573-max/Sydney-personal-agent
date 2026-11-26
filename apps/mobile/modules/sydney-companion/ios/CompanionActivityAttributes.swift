import ActivityKit
import Foundation

public struct CompanionActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var status: String
    public var reply: String?
    public var callActive: Bool?
    public var callStartedAt: Date?

    public init(
      status: String,
      reply: String?,
      callActive: Bool? = nil,
      callStartedAt: Date? = nil
    ) {
      self.status = status
      self.reply = reply
      self.callActive = callActive
      self.callStartedAt = callStartedAt
    }
  }

  public var botId: String
  public var botName: String
  public var spaceId: String?
  public var showReply: Bool
  public var avatar: String?
  public var linkToken: String?

  public init(
    botId: String,
    botName: String,
    spaceId: String?,
    showReply: Bool,
    avatar: String?,
    linkToken: String?
  ) {
    self.botId = botId
    self.botName = botName
    self.spaceId = spaceId
    self.showReply = showReply
    self.avatar = avatar
    self.linkToken = linkToken
  }
}
