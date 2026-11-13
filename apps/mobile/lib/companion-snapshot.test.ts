import { describe, expect, it } from "vitest";
import { companionSnapshot } from "./companion-snapshot";

describe("companion snapshot selection", () => {
  const snapshot = {
    botId: "bot-1",
    snapshotBotId: "bot-1",
    inGroup: false,
    readOnly: false,
    showingSaved: false,
    focused: true,
    foreground: true,
    currentScope: true,
    screenAutoActive: false,
    showingHistory: false,
    working: false,
    messages: [
      { id: "1", role: "bot" as const, blocks: [{ kind: "text" as const, text: "Earlier" }] },
      { id: "2", role: "user" as const, blocks: [{ kind: "text" as const, text: "Question" }] },
      { id: "3", role: "bot" as const, blocks: [{ kind: "text" as const, text: "Answer" }] },
    ],
  };

  it("uses the latest bot text and hides partial output while working", () => {
    expect(companionSnapshot(snapshot)).toEqual({ status: "present", latestReply: "Answer" });
    expect(companionSnapshot({ ...snapshot, working: true })).toEqual({ status: "thinking", latestReply: null });
  });

  it("does not forward a stale, saved, history, group, read-only, or out-of-scope snapshot", () => {
    expect(companionSnapshot({ ...snapshot, snapshotBotId: "other" })).toBeNull();
    expect(companionSnapshot({ ...snapshot, showingSaved: true })).toBeNull();
    expect(companionSnapshot({ ...snapshot, inGroup: true })).toBeNull();
    expect(companionSnapshot({ ...snapshot, readOnly: true })).toBeNull();
    expect(companionSnapshot({ ...snapshot, showingHistory: true })).toBeNull();
    expect(companionSnapshot({ ...snapshot, foreground: false })).toBeNull();
    expect(companionSnapshot({ ...snapshot, currentScope: false })).toBeNull();
    expect(companionSnapshot({ ...snapshot, screenAutoActive: true })).toBeNull();
  });

  it("leaves updates to the independent watcher when another page is focused", () => {
    expect(companionSnapshot({ ...snapshot, focused: false })).toBeNull();
  });

  it("shows listening and thinking only for the current bot's call", () => {
    const call = { botId: "bot-1", phase: "listening" as const, muted: false };
    expect(companionSnapshot({ ...snapshot, call })).toEqual({ status: "listening", latestReply: "Answer" });
    expect(companionSnapshot({ ...snapshot, call: { ...call, muted: true } })?.status).toBe("present");
    expect(companionSnapshot({ ...snapshot, call: { ...call, phase: "thinking" } }))
      .toEqual({ status: "thinking", latestReply: null });
    expect(companionSnapshot({ ...snapshot, call: { ...call, botId: "bot-2" } })?.status).toBe("present");
  });
});
