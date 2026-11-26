import { describe, expect, it } from "vitest";
import {
  callLiveActivityPresentation,
  companionPresentation,
  stripCompanionMarkdown,
} from "./companion-presentation";

describe("companion presentation", () => {
  it("shows the requested presence text and hides replies without permission", () => {
    expect(
      companionPresentation({
        botName: "Sydney",
        status: "present",
        latestReply: "private reply",
        showReply: false,
      }),
    ).toEqual({ title: "Sydney", status: "我一直都在", reply: null });
  });

  it("normalizes and limits visible text without splitting emoji", () => {
    const presentation = companionPresentation({
      botName: "  Sydney  ",
      status: "thinking",
      latestReply: ` hello\n${"🙂".repeat(130)}`,
      showReply: true,
    });
    expect(presentation.title).toBe("Sydney");
    expect(presentation.status).toBe("思考中");
    expect(Array.from(presentation.reply!)).toHaveLength(110);
    expect(presentation.reply).toMatch(/^hello 🙂+…$/u);
  });

  it("strips Markdown syntax before rendering replies on the Dynamic Island", () => {
    expect(
      stripCompanionMarkdown(
        "### **你的位置**\n- 城市：`上海` · [天气详情](https://example.com)\n> *多云转晴*",
      )
        .replace(/\s+/gu, " ")
        .trim(),
    ).toBe("你的位置 城市：上海 · 天气详情 多云转晴");
    expect(
      companionPresentation({
        botName: "Sydney",
        status: "present",
        latestReply: "现在可以看到啦。**你的位置** - 城市 / 街道",
        showReply: true,
      }).reply,
    ).toBe("现在可以看到啦。你的位置 - 城市 / 街道");
  });

  it("does not show an empty reply and reports disconnection", () => {
    expect(
      companionPresentation({
        botName: " ",
        status: "disconnected",
        latestReply: " \n ",
        showReply: true,
      }),
    ).toEqual({ title: "Bot", status: "连接已断开", reply: null });
  });

  it("formats rich and legacy call Dynamic Island labels with privacy opt-in", () => {
    expect(
      callLiveActivityPresentation({
        botName: "Sydney",
        phase: "listening",
        caption: "你好，帮我查一下天气",
        showReply: true,
        richNativeStatus: true,
      }),
    ).toEqual({ title: "Sydney", status: "通话 · 正在听", reply: "你好，帮我查一下天气" });

    expect(
      callLiveActivityPresentation({
        botName: "Sydney",
        phase: "speaking",
        caption: "今天晴转多云",
        showReply: false,
        richNativeStatus: true,
      }),
    ).toEqual({ title: "Sydney", status: "通话 · 说话中", reply: null });

    expect(
      callLiveActivityPresentation({
        botName: "Sydney",
        phase: "muted",
        caption: null,
        showReply: true,
        richNativeStatus: true,
      }),
    ).toEqual({ title: "Sydney", status: "通话 · 已静音", reply: null });

    expect(
      callLiveActivityPresentation({
        botName: "Sydney",
        phase: "speaking",
        caption: "Legacy fallback",
        showReply: true,
        richNativeStatus: false,
      }),
    ).toEqual({ title: "Sydney", status: "正在听", reply: "Legacy fallback" });
  });
});
