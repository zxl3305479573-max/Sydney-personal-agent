import { beforeEach, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  value: null as string | null,
  fail: false,
}));

vi.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    exists = true;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
  },
  Paths: { document: "file://documents" },
}));
vi.mock("expo-image-picker", () => ({}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => storage.value),
  setItemAsync: vi.fn(async (_key: string, value: string) => {
    if (storage.fail) throw new Error("storage unavailable");
    storage.value = value;
  }),
}));

beforeEach(() => {
  storage.value = null;
  storage.fail = false;
  vi.resetModules();
});

it("preserves the selected bubble style after reloading", async () => {
  const initial = await import("./chat-appearance");
  await initial.saveMobileChatAppearance({
    ...initial.getMobileChatAppearance(),
    bubble: initial.MOBILE_BUBBLE_PRESETS[2]!.value,
  });
  vi.resetModules();
  const restored = await import("./chat-appearance");
  expect((await restored.loadMobileChatAppearance()).bubble).toEqual(
    restored.MOBILE_BUBBLE_PRESETS[2]!.value,
  );
});

it("applies transparency to the bubble background without fading its contents", async () => {
  const mobile = await import("./chat-appearance");
  const appearance = {
    ...mobile.getMobileChatAppearance(),
    bubble: { ...mobile.MOBILE_BUBBLE_PRESETS[0]!.value, radius: 12, opacity: 0.4 },
  };
  expect(
    mobile.mobileBubbleSurfaceStyle(appearance, "user", { backgroundColor: "#000000" }),
  ).toEqual({
    backgroundColor: "rgba(219, 234, 254, 0.4)",
    borderRadius: 12,
  });
});

it("keeps the previous appearance when saving fails", async () => {
  const mobile = await import("./chat-appearance");
  const previous = mobile.getMobileChatAppearance();
  const listener = vi.fn();
  mobile.subscribeMobileChatAppearance(listener);
  storage.fail = true;
  await expect(
    mobile.saveMobileChatAppearance({
      ...previous,
      bubble: mobile.MOBILE_BUBBLE_PRESETS[1]!.value,
    }),
  ).rejects.toThrow();
  expect(mobile.getMobileChatAppearance()).toBe(previous);
  expect(listener).not.toHaveBeenCalled();
});

it("restores legacy background settings and defaults its display mode to cover", async () => {
  storage.value = JSON.stringify({
    backgroundUri: "file://background",
    backgroundOpacity: 0.6,
    overlayOpacity: 0.3,
    bubble: null,
  });
  const mobile = await import("./chat-appearance");
  expect(await mobile.loadMobileChatAppearance()).toMatchObject({
    backgroundUri: "file://background",
    backgroundFit: "cover",
    backgroundOpacity: 0.6,
    overlayOpacity: 0.3,
  });
});

it("persists background display controls without changing the selected bubble", async () => {
  const mobile = await import("./chat-appearance");
  const bubble = mobile.MOBILE_BUBBLE_PRESETS[1]!.value;
  await mobile.saveMobileChatAppearance({
    ...mobile.getMobileChatAppearance(),
    backgroundUri: "file://background",
    backgroundFit: "contain",
    backgroundOpacity: 0.4,
    overlayOpacity: 0.7,
    bubble,
  });
  vi.resetModules();
  const restored = await import("./chat-appearance");
  expect(await restored.loadMobileChatAppearance()).toMatchObject({
    backgroundUri: "file://background",
    backgroundFit: "contain",
    backgroundOpacity: 0.4,
    overlayOpacity: 0.7,
    bubble,
  });
});
