// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  EMPTY_CHAT_APPEARANCE,
  getSavedChatAppearance,
  loadChatAppearance,
  saveChatAppearance,
} from "../lib/chat-appearance";
import { ChatAppearanceSettings } from "./ChatAppearanceSettings";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockIndexedDb(initial?: unknown, failWrite = false) {
  let record: unknown = initial;
  const database = {
    close: () => undefined,
    transaction: () => {
      let wrote = false;
      const transaction = {
        oncomplete: undefined as (() => void) | undefined,
        onabort: undefined as (() => void) | undefined,
        error: null,
        abort: () => queueMicrotask(() => transaction.onabort?.()),
        objectStore: () => ({
          get: () => {
            const request = { result: record, onsuccess: undefined as (() => void) | undefined };
            queueMicrotask(() => {
              request.onsuccess?.();
              if (!wrote) transaction.oncomplete?.();
            });
            return request;
          },
          put: (value: unknown) => {
            wrote = true;
            queueMicrotask(() => {
              if (failWrite) transaction.onabort?.();
              else {
                record = value;
                transaction.oncomplete?.();
              }
            });
          },
        }),
      };
      return transaction;
    },
  };
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request = { result: database, onsuccess: undefined as (() => void) | undefined };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
  return () => record;
}

it("removes legacy bubble data from storage while preserving background and colors", async () => {
  const image = new Blob(["background"], { type: "image/png" });
  const stored = mockIndexedDb({
    ...EMPTY_CHAT_APPEARANCE,
    backgrounds: [{ id: "bg", name: "背景", image, fit: "cover", opacity: 80, overlay: 30 }],
    backgroundId: "bg",
    bubbles: [{ id: "old", user: { image: new Blob(["bubble"]) } }],
    bubbleId: "old",
    combinations: [{ id: "combination", backgroundId: "bg", bubbleId: "old" }],
    userTextColor: "#123456",
    botTextColor: "#abcdef",
  });
  vi.resetModules();
  const fresh = await import("../lib/chat-appearance");
  await fresh.loadChatAppearance();
  expect(fresh.getSavedChatAppearance()).toMatchObject({
    backgroundId: "bg",
    userTextColor: "#123456",
    botTextColor: "#abcdef",
  });
  expect(fresh.getSavedChatAppearance().backgrounds[0]?.image).toBe(image);
  expect(stored()).not.toHaveProperty("bubbles");
  expect(stored()).not.toHaveProperty("bubbleId");
  expect(stored()).not.toHaveProperty("combinations");
  expect(stored()).toMatchObject({ backgroundId: "bg", userTextColor: "#123456" });
});

it("reports migration failure without deleting the saved record", async () => {
  const legacy = { ...EMPTY_CHAT_APPEARANCE, bubbles: [{ id: "old" }], bubbleId: "old" };
  const stored = mockIndexedDb(legacy, true);
  vi.resetModules();
  const fresh = await import("../lib/chat-appearance");
  await expect(fresh.loadChatAppearance()).rejects.toThrow("无法清理聊天外观");
  expect(stored()).toBe(legacy);
});

it("offers background and separate text colors without bubble settings", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mockIndexedDb();
  await loadChatAppearance();
  await saveChatAppearance({
    ...EMPTY_CHAT_APPEARANCE,
    userTextColor: "#123456",
    botTextColor: "#abcdef",
  });
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ChatAppearanceSettings />));
    expect(container.querySelector("#chat-background")).not.toBeNull();
    expect(container.textContent).not.toContain("气泡");
    const reset = [...container.querySelectorAll("button")].find(
      (item) => item.textContent === "我的文字恢复默认",
    );
    expect(reset).toBeDefined();
    await act(async () => reset?.click());
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((item) => item.textContent === "保存外观")
        ?.click(),
    );
    expect(getSavedChatAppearance()).toMatchObject({
      userTextColor: null,
      botTextColor: "#abcdef",
    });
  } finally {
    await act(async () => root.unmount());
  }
});
