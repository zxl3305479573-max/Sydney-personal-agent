import { describe, expect, it } from "vitest";
import { companionPresentation } from "./companion-presentation";

describe("companion presentation", () => {
  it("shows the requested presence text and hides replies without permission", () => {
    expect(companionPresentation({
      botName: "Sydney",
      status: "present",
      latestReply: "private reply",
      showReply: false,
    })).toEqual({ title: "Sydney", status: "我一直都在", reply: null });
  });

  it("normalizes and limits visible text without splitting emoji", () => {
    const presentation = companionPresentation({
      botName: "  Sydney  ",
      status: "thinking",
      latestReply: ` hello\n${"🙂".repeat(90)}`,
      showReply: true,
    });
    expect(presentation.title).toBe("Sydney");
    expect(presentation.status).toBe("思考中");
    expect(Array.from(presentation.reply!)).toHaveLength(80);
    expect(presentation.reply).toMatch(/^hello 🙂+…$/u);
  });

  it("does not show an empty reply and reports disconnection", () => {
    expect(companionPresentation({
      botName: " ",
      status: "disconnected",
      latestReply: " \n ",
      showReply: true,
    })).toEqual({ title: "Bot", status: "连接已断开", reply: null });
  });
});
