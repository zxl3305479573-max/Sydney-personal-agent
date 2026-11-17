import { describe, expect, it } from "vitest";
import { messageAvatarBotId } from "./message-row-layout";

describe("message avatar identity", () => {
  it("uses the sender in a group and the conversation bot as a direct chat fallback", () => {
    expect(messageAvatarBotId({ role: "bot", botId: "sender" }, true, "other")).toBe("sender");
    expect(messageAvatarBotId({ role: "bot" }, false, "direct")).toBe("direct");
    expect(messageAvatarBotId({ role: "bot" }, true, "other")).toBeUndefined();
    expect(messageAvatarBotId({ role: "user" }, false, "direct")).toBeUndefined();
  });
});
