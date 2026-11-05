import type { ThreadMessage, ThreadSnapshot } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import type { PendingMessage } from "./optimistic-messages";
import { mergePendingMessages } from "./optimistic-messages";

const pending: PendingMessage = {
  nonce: "nonce-1",
  message: {
    id: "pending:nonce-1",
    threadId: "thread-1",
    role: "user",
    seq: 3,
    blocks: [{ kind: "text", text: "hello" }],
    createdAt: "2026-11-05T00:00:00.000Z",
  },
};

function snapshot(messages: ThreadMessage[], threadId = "thread-1") {
  return { threadId, messages } as ThreadSnapshot;
}

function saved(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return { ...pending.message, id: "saved-1", seq: 4, ...overrides };
}

describe("pending message reconciliation", () => {
  it("shows the pending message immediately and only in its own thread", () => {
    expect(mergePendingMessages(snapshot([]), [pending])).toEqual([pending.message]);
    expect(mergePendingMessages(snapshot([], "thread-2"), [pending])).toEqual([]);
  });

  it("replaces the pending message when its live event carries the nonce", () => {
    const live = saved({ seq: 20, persistedSeq: 4, clientNonce: "nonce-1" });
    expect(mergePendingMessages(snapshot([live]), [pending])).toEqual([live]);
  });

  it("matches the receipt against a live message's persisted sequence or a snapshot sequence", () => {
    const confirmed = { ...pending, confirmedSeq: 4 };
    const live = saved({ seq: 20, persistedSeq: 4 });
    const stored = saved();
    expect(mergePendingMessages(snapshot([live]), [confirmed])).toEqual([live]);
    expect(mergePendingMessages(snapshot([stored]), [confirmed])).toEqual([stored]);
  });

  it("does not merge an identical message from another sender", () => {
    const other = saved({ clientNonce: "different" });
    expect(mergePendingMessages(snapshot([other]), [pending])).toEqual([other, pending.message]);
  });
});
