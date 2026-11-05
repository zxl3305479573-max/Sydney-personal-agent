// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  EMPTY_CHAT_APPEARANCE,
  getSavedChatAppearance,
  normalizeAppearance,
  saveChatAppearance,
} from "../lib/chat-appearance";
import { ChatAppearanceSettings } from "./ChatAppearanceSettings";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockIndexedDb() {
  let record: unknown;
  const database = {
    close: () => undefined,
    transaction: () => {
      const transaction: {
        oncomplete?: () => void;
        objectStore: () => {
          get: () => { result: unknown; onsuccess?: () => void };
          put: (value: unknown) => void;
        };
      } = {
        objectStore: () => ({
          get: () => {
            const request = {
              result: record,
              onsuccess: undefined as (() => void) | undefined,
            };
            queueMicrotask(() => request.onsuccess?.());
            return request;
          },
          put: (value) => {
            record = value;
            queueMicrotask(() => transaction.oncomplete?.());
          },
        }),
      };
      return transaction;
    },
  };
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request = {
        result: database,
        onsuccess: undefined as (() => void) | undefined,
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
  return () => record;
}

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === text,
  );
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
}

it("creates and saves a bubble style, previews edits and cancels them", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mockIndexedDb();
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ChatAppearanceSettings />));
    await act(async () => button(container, "添加样式").click());
    expect(
      container.querySelector('input[aria-label="搭配名称"]'),
    ).not.toBeNull();
    await act(async () => button(container, "保存外观").click());
    const saved = getSavedChatAppearance();
    expect(saved.bubbles).toHaveLength(1);
    expect(saved.bubbleId).toBe(saved.bubbles[0]?.id);
    await act(async () => button(container, "删除样式").click());
    expect(
      container.querySelector("#chat-bubble-style")?.textContent,
    ).not.toContain("新气泡样式");
    await act(async () => button(container, "取消预览").click());
    expect(
      container.querySelector("#chat-bubble-style")?.textContent,
    ).toContain("新气泡样式");
    expect(getSavedChatAppearance().bubbles).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
  }
});

it("switches modes without losing custom assets and restores them after reload", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  mockIndexedDb();
  const image = new Blob(["bubble"], { type: "image/png" });
  const { newBubbleStyle } = await import("../lib/chat-appearance");
  const bubble = newBubbleStyle();
  bubble.user.image = image;
  await saveChatAppearance({
    ...EMPTY_CHAT_APPEARANCE,
    bubbles: [bubble],
    bubbleId: bubble.id,
  });
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ChatAppearanceSettings />));
    await act(async () => button(container, "简洁默认").click());
    await act(async () => button(container, "保存外观").click());
    expect(getSavedChatAppearance()).toMatchObject({
      mode: "simple",
      bubbleId: bubble.id,
    });
    expect(getSavedChatAppearance().bubbles[0]?.user.image).toBe(image);
    await act(async () => button(container, "自定义").click());
    expect(
      container.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
        ?.textContent,
    ).toBe("自定义");
    await act(async () => button(container, "保存外观").click());
    vi.resetModules();
    const fresh = await import("../lib/chat-appearance");
    await fresh.loadChatAppearance();
    expect(fresh.getSavedChatAppearance()).toMatchObject({
      mode: "custom",
      bubbleId: bubble.id,
    });
    expect(fresh.getSavedChatAppearance().bubbles[0]?.user.image).toBe(image);
  } finally {
    await act(async () => root.unmount());
  }
});

it("saves separate combinations and switches between them", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mockIndexedDb();
  await saveChatAppearance(EMPTY_CHAT_APPEARANCE);
  const container = document.createElement("div");
  const root = createRoot(container);
  const setName = (value: string) => {
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="搭配名称"]',
    );
    if (!input) throw new Error("Missing combination name");
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  try {
    await act(async () => root.render(<ChatAppearanceSettings />));
    await act(async () => button(container, "添加样式").click());
    await act(async () => setName("第一套"));
    await act(async () => button(container, "保存当前搭配").click());
    await act(async () => button(container, "添加样式").click());
    await act(async () => setName("第二套"));
    await act(async () => button(container, "保存当前搭配").click());
    await act(async () => button(container, "保存外观").click());
    const saved = getSavedChatAppearance();
    expect(saved.combinations).toHaveLength(2);
    expect(saved.combinations[0]?.bubbleId).not.toBe(
      saved.combinations[1]?.bubbleId,
    );
    const select =
      container.querySelector<HTMLSelectElement>("#chat-combination");
    if (!select) throw new Error("Missing combination selector");
    await act(async () => {
      select.value = saved.combinations[0]?.id ?? "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(
      container.querySelector<HTMLSelectElement>("#chat-bubble-style")?.value,
    ).toBe(saved.combinations[0]?.bubbleId);
    await act(async () => button(container, "取消预览").click());
  } finally {
    await act(async () => root.unmount());
  }
});

it("clears missing resource references and restores a saved binary background", async () => {
  const stored = mockIndexedDb();
  const image = new Blob(["image"], { type: "image/png" });
  const value = normalizeAppearance({
    backgrounds: [
      {
        id: "background",
        name: "图片",
        image,
        fit: "cover",
        opacity: 100,
        overlay: 30,
      },
    ],
    bubbles: [],
    combinations: [
      {
        id: "combo",
        name: "搭配",
        backgroundId: "missing",
        bubbleId: "missing",
      },
    ],
    backgroundId: "background",
    bubbleId: "missing",
  });
  expect(value.bubbleId).toBeNull();
  expect(value.combinations[0]).toMatchObject({
    backgroundId: null,
    bubbleId: null,
  });
  await saveChatAppearance(value);
  expect(stored()).toMatchObject({ backgroundId: "background" });
  vi.resetModules();
  const fresh = await import("../lib/chat-appearance");
  await fresh.loadChatAppearance();
  expect(fresh.getSavedChatAppearance().backgrounds[0]?.image).toBe(image);
  await saveChatAppearance(EMPTY_CHAT_APPEARANCE);
});

it("reports storage errors without replacing the saved appearance", async () => {
  const before = getSavedChatAppearance();
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request = {
        error: new Error("storage unavailable"),
        onerror: undefined as (() => void) | undefined,
      };
      queueMicrotask(() => request.onerror?.());
      return request;
    },
  });
  await expect(
    saveChatAppearance({ ...before, backgroundId: null }),
  ).rejects.toThrow("storage unavailable");
  expect(getSavedChatAppearance()).toBe(before);
});
