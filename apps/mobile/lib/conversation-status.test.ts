import { describe, expect, it } from "vitest";
import {
  aggregateConversationStatus,
  conversationStatusColor,
  conversationStatusLabel,
  conversationStatusTone,
  isConversationActiveStatus,
} from "./conversation-status";

const t = (text: string) => text;

describe("conversation status helpers", () => {
  it("prioritizes takeover > running > leased > waiting_input > queued > failed > idle", () => {
    expect(aggregateConversationStatus(["idle", "queued", "running", "waiting_input"])).toBe(
      "running",
    );
    expect(aggregateConversationStatus(["leased", "waiting_input"])).toBe("leased");
    expect(aggregateConversationStatus(["queued", "waiting_input"])).toBe("waiting_input");
    expect(aggregateConversationStatus(["running", "waiting_takeover"])).toBe("waiting_takeover");
    expect(aggregateConversationStatus(["waiting_input", "waiting_takeover"])).toBe(
      "waiting_takeover",
    );
    expect(aggregateConversationStatus(["failed", "queued", "leased"])).toBe("leased");
    expect(aggregateConversationStatus(["completed", "cancelled", "failed"])).toBe("failed");
    expect(aggregateConversationStatus(["completed", "cancelled", undefined])).toBe("idle");
  });

  it("maps active statuses, tones, labels, and semantic colors consistently", () => {
    expect(isConversationActiveStatus("running")).toBe(true);
    expect(isConversationActiveStatus("waiting_takeover")).toBe(true);
    expect(isConversationActiveStatus("failed")).toBe(false);
    expect(isConversationActiveStatus("idle")).toBe(false);

    expect(conversationStatusLabel("queued", t)).toBe("Queued");
    expect(conversationStatusLabel("leased", t)).toBe("Starting…");
    expect(conversationStatusLabel("running", t)).toBe("Working…");
    expect(conversationStatusLabel("waiting_input", t)).toBe("Needs input");
    expect(conversationStatusLabel("waiting_takeover", t)).toBe("Needs you");
    expect(conversationStatusLabel("failed", t)).toBe("Failed");
    expect(conversationStatusLabel("completed", t)).toBe("");
    expect(conversationStatusLabel("completed", t, { includeTerminal: true })).toBe("Done");
    expect(conversationStatusLabel("idle", t, { composing: true })).toBe("Working…");

    expect(conversationStatusTone("running")).toBe("working");
    expect(conversationStatusTone("waiting_input")).toBe("waiting");
    expect(conversationStatusTone("failed")).toBe("failed");
    expect(conversationStatusTone("idle")).toBe("idle");

    const tokens = { statusWorking: "#111", warning: "#222", destructive: "#333" };
    expect(conversationStatusColor("running", tokens)).toBe("#111");
    expect(conversationStatusColor("waiting_takeover", tokens)).toBe("#222");
    expect(conversationStatusColor("failed", tokens)).toBe("#333");
    expect(conversationStatusColor("idle", tokens)).toBeUndefined();
  });
});
