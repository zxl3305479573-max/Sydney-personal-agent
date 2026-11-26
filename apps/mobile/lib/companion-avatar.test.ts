import { describe, expect, it } from "vitest";
import { companionAvatar } from "./companion-avatar";
import { DEFAULT_BOT_AVATAR_DATA_URI } from "./default-bot-avatar";

describe("companion avatar encoding", () => {
  it("uses the bundled 大肥鱼 default photo for legacy color or shape values within the ActivityKit budget", () => {
    for (const value of ["#4F7CAC", "#abc", "#8B5CF6", "#EAB308::shape_3", ""]) {
      expect(companionAvatar({ botId: "bot-1", color: value })).toBe(
        `r|${DEFAULT_BOT_AVATAR_DATA_URI}`,
      );
    }

    const avatar = companionAvatar({ botId: "bot-1", color: "#4F7CAC" });
    const payload = JSON.stringify({
      botId: "a".repeat(256),
      botName: "🙂".repeat(32),
      spaceId: "b".repeat(256),
      showReply: true,
      avatar,
      status: "我一直都在",
      reply: "🙂".repeat(80),
    });
    expect(Buffer.byteLength(payload, "utf8")).toBeLessThan(3500);
  });

  it("only passes valid bounded photo data to the native thumbnailer", () => {
    expect(companionAvatar({ botId: "bot", color: "data:image/png;base64,YWJj" })).toBe(
      "r|data:image/png;base64,YWJj",
    );
    expect(companionAvatar({ botId: "bot", color: "data:image/png;base64,?invalid" })).toBeNull();
    expect(companionAvatar({ botId: "bot", color: "https://example.com/avatar.png" })).toBeNull();
    expect(
      companionAvatar({ botId: "bot", color: `data:image/png;base64,${"A".repeat(200_001)}` }),
    ).toBeNull();
  });

  it("maps retired avatarSet values to the same default 大肥鱼 avatar", () => {
    expect(companionAvatar({ botId: "bot", color: "#123456", avatarSet: "rakazo" })).toBe(
      `r|${DEFAULT_BOT_AVATAR_DATA_URI}`,
    );
  });
});
