import { avatarIdentitySeed, organicAvatarPath, organicAvatarSampleIdentity } from "@rakazo/core";
import { describe, expect, it } from "vitest";
import { companionAvatar } from "./companion-avatar";

describe("companion organic avatar", () => {
  it("encodes the same shape and eye rotation for all organic families within the activity budget", () => {
    for (let family = 0; family < 10; family++) {
      const botId = organicAvatarSampleIdentity(family);
      const encoded = companionAvatar({ botId, color: "#abc", avatarSet: "organic" });
      expect(encoded).not.toBeNull();
      const [kind, color, rotation, path] = encoded!.split("|");
      expect(kind).toBe("o");
      expect(color).toBe("AABBCC");
      expect(Number(rotation)).toBe((avatarIdentitySeed(botId) % 9) - 4);
      expect(path!.length).toBeLessThanOrEqual(2200);
      const values = path!.match(/../g)!.map((pair) => (parseInt(pair, 16) - 128) / 2);
      const source = organicAvatarPath(avatarIdentitySeed(botId))
        .match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      expect(values).toHaveLength(source.length);
      for (let index = 0; index < values.length; index++) {
        expect(Math.abs(values[index]! - source[index]!)).toBeLessThanOrEqual(0.25);
      }
    }
  });

  it("encodes each shipped shape and its matching eye color", () => {
    const encodedShapes = new Set<string>();
    for (let shape = 0; shape < 8; shape++) {
      const result = companionAvatar({ botId: "bot", color: `#EAB308::shape_${shape}` });
      expect(result).toMatch(/^s\|EAB308\|141414\|[0-9a-f]+$/);
      const data = result!.split("|")[3]!;
      encodedShapes.add(data);
      expect(data.length).toBeGreaterThanOrEqual(12);
      expect(data.length).toBeLessThanOrEqual(2200);
    }
    expect(encodedShapes.size).toBe(8);
  });

  it("leaves room for activity identifiers and a bounded reply", () => {
    const avatar = companionAvatar({
      botId: organicAvatarSampleIdentity(0),
      color: "#8B5CF6",
    });
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
    expect(companionAvatar({ botId: "bot", color: "data:image/png;base64,YWJj" }))
      .toBe("r|data:image/png;base64,YWJj");
    expect(companionAvatar({ botId: "bot", color: "data:image/png;base64,?invalid" })).toBeNull();
    expect(companionAvatar({ botId: "bot", color: "https://example.com/avatar.png" })).toBeNull();
    expect(companionAvatar({ botId: "bot", color: `data:image/png;base64,${"A".repeat(200_001)}` })).toBeNull();
  });

  it("encodes the logo body and a contrasting eye color", () => {
    expect(companionAvatar({ botId: "bot", color: "#123456", avatarSet: "rakazo" }))
      .toMatch(/^l\|[0-9A-F]{6}\|(101014|FFFFFF)\|[0-9a-f]+$/);
  });
});
