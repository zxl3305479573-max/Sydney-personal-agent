// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  DEFAULT_SURFACE_OPACITY,
  EMPTY_CHAT_APPEARANCE,
  getSavedChatAppearance,
  loadChatAppearance,
  saveChatAppearance,
} from "../lib/chat-appearance";
import { ChatAppearanceSettings } from "./ChatAppearanceSettings";
import { ConversationBackgroundSettings } from "./ConversationBackground";

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

it("saves a conversation background independently and can follow the global choice again", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mockIndexedDb();
  await loadChatAppearance();
  await saveChatAppearance({
    ...EMPTY_CHAT_APPEARANCE,
    backgroundId: "global",
    backgrounds: [
      {
        id: "global",
        name: "全局",
        image: new Blob(["a"]),
        fit: "cover",
        opacity: 100,
        overlay: 0,
      },
      { id: "local", name: "单独", image: new Blob(["b"]), fit: "cover", opacity: 100, overlay: 0 },
    ],
  });
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ConversationBackgroundSettings chatKey="one" />));
    const select = container.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      select.value = "local";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(getSavedChatAppearance()).toMatchObject({
      backgroundId: "global",
      chatBackgrounds: { one: "local" },
    });
    await act(async () => {
      select.value = "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(getSavedChatAppearance()).toMatchObject({ backgroundId: "global", chatBackgrounds: {} });
  } finally {
    await act(async () => root.unmount());
  }
});

it("previews and saves the shared component opacity", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mockIndexedDb();
  await loadChatAppearance();
  await saveChatAppearance(EMPTY_CHAT_APPEARANCE);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ChatAppearanceSettings />));
    const slider = container.querySelector<HTMLInputElement>("#surface-opacity")!;
    expect(slider.value).toBe(String(DEFAULT_SURFACE_OPACITY));
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setValue.call(slider, "35");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("35%");
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((item) => item.textContent === "保存外观")
        ?.click(),
    );
    expect(getSavedChatAppearance().surfaceOpacity).toBe(35);
  } finally {
    await act(async () => root.unmount());
  }
});

it("adjusts an uploaded background's transparency in the preview and saves it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const stored = mockIndexedDb();
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      naturalWidth = 10;
      naturalHeight = 10;
      decode = async () => undefined;
    },
  );
  vi.stubGlobal(
    "URL",
    class extends URL {
      static override createObjectURL = vi.fn(() => "blob:background");
      static override revokeObjectURL = vi.fn();
    },
  );
  await loadChatAppearance();
  await saveChatAppearance(EMPTY_CHAT_APPEARANCE);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ChatAppearanceSettings />));
    const file = new File(["image"], "background.png", { type: "image/png" });
    Object.defineProperty(file, "slice", {
      value: () => ({
        arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]).buffer,
      }),
    });
    const upload = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(upload, "files", { configurable: true, value: [file] });
    await act(async () => upload.dispatchEvent(new Event("change", { bubbles: true })));
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(slider.value).toBe("0");
    expect(container.textContent).toContain("背景透明度");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setValue.call(slider, "60");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const preview = container.querySelector<HTMLElement>('[aria-label="聊天外观预览"]')!;
    expect(preview.querySelector("img")?.style.opacity).toBe("0.4");
    expect(preview.querySelector<HTMLDivElement>(".bg-black")?.style.opacity).toBe("0.12");
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((item) => item.textContent === "保存外观")
        ?.click(),
    );
    expect(getSavedChatAppearance().backgrounds[0]?.opacity).toBe(40);
    expect(stored()).toMatchObject({ backgrounds: [{ name: "background.png", opacity: 40 }] });
    await act(async () => {
      setValue.call(slider, "100");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(preview.querySelector("img")?.style.opacity).toBe("0");
    expect(preview.querySelector<HTMLDivElement>(".bg-black")?.style.opacity).toBe("0");
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((item) => item.textContent === "取消预览")
        ?.click(),
    );
    expect(slider.value).toBe("60");
  } finally {
    await act(async () => root.unmount());
  }
});
