// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  cancelChatAppearancePreview,
  chatBackgroundKey,
  DEFAULT_SURFACE_OPACITY,
  EMPTY_CHAT_APPEARANCE,
  normalizeAppearance,
  previewChatAppearance,
} from "../lib/chat-appearance";
import { WorkspaceBackground } from "./WorkspaceBackground";

it("updates and clears the global background when a preview changes", async () => {
  const create = vi.fn(() => "blob:background");
  const revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static override createObjectURL = create;
      static override revokeObjectURL = revoke;
    },
  );
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<WorkspaceBackground />));
    await act(async () =>
      previewChatAppearance({
        ...EMPTY_CHAT_APPEARANCE,
        backgroundId: "bg",
        backgrounds: [
          {
            id: "bg",
            name: "背景",
            image: new Blob(["image"]),
            fit: "cover",
            opacity: 40,
            overlay: 30,
          },
        ],
      }),
    );
    expect(host.querySelector("img")?.style.opacity).toBe("0.4");
    expect(
      host.querySelector<HTMLElement>('[data-testid="workspace-background"] > div')?.style.opacity,
    ).toBe("0.12");
    expect(document.documentElement.dataset.workspaceBackground).toBe("true");
    expect(document.documentElement.style.getPropertyValue("--sydney-surface-opacity")).toBe("0.8");
    expect(document.documentElement.style.getPropertyValue("--sydney-surface-alpha")).toBe("80%");
    await act(async () => cancelChatAppearancePreview());
    expect(host.querySelector("img")).toBeNull();
    expect(document.documentElement.dataset.workspaceBackground).toBeUndefined();
    expect(revoke).toHaveBeenCalledWith("blob:background");
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("previews a shared surface opacity without changing the saved value", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<WorkspaceBackground />));
    await act(async () => previewChatAppearance({ ...EMPTY_CHAT_APPEARANCE, surfaceOpacity: 35 }));
    expect(document.documentElement.style.getPropertyValue("--sydney-surface-opacity")).toBe(
      "0.35",
    );
    expect(document.documentElement.style.getPropertyValue("--sydney-surface-alpha")).toBe("35%");
    await act(async () => cancelChatAppearancePreview());
    expect(document.documentElement.style.getPropertyValue("--sydney-surface-opacity")).toBe(
      String(DEFAULT_SURFACE_OPACITY / 100),
    );
  } finally {
    act(() => root.unmount());
  }
});

it("keeps valid per-account conversation choices and removes deleted images", () => {
  const first = chatBackgroundKey("user", "bot", "1");
  const second = chatBackgroundKey("user", "group", "1");
  const otherUser = chatBackgroundKey("other", "bot", "1");
  expect(new Set([first, second, otherUser]).size).toBe(3);
  const result = normalizeAppearance({
    ...EMPTY_CHAT_APPEARANCE,
    backgrounds: [
      {
        id: "bg",
        name: "背景",
        image: new Blob(["image"]),
        fit: "cover",
        opacity: 100,
        overlay: 0,
      },
    ],
    chatBackgrounds: { [first]: "bg", [second]: "deleted" },
  });
  expect(result.chatBackgrounds).toEqual({ [first]: "bg" });
});
