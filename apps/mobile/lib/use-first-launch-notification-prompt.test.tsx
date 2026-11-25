// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  alert: vi.fn(),
  loaded: true,
  prefs: {
    prompted: false,
    enabled: true,
    messages: true,
    needsAttention: true,
    completions: false,
    sound: false,
  },
  update: vi.fn(async (patch: Record<string, unknown>) => {
    Object.assign(fixture.prefs, patch);
    return fixture.prefs;
  }),
  enable: vi.fn(async () => {
    fixture.prefs.prompted = true;
    fixture.prefs.enabled = true;
    return { granted: true, preferences: fixture.prefs };
  }),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Alert: { alert: fixture.alert },
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN", t: (s: string) => s }) }));
vi.mock("./notification-preferences", () => ({
  getCachedNotificationPreferences: () => fixture.prefs,
  isNotificationPreferencesLoaded: () => fixture.loaded,
  updateNotificationPreferences: fixture.update,
  enableNotificationsWithPrompt: fixture.enable,
}));

import { useFirstLaunchNotificationPrompt } from "./use-first-launch-notification-prompt";

let container: HTMLDivElement;
let root: Root;

function Host(props: { ready: boolean; pathname: string }) {
  useFirstLaunchNotificationPrompt(props.ready, props.pathname);
  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  fixture.loaded = true;
  fixture.prefs = {
    prompted: false,
    enabled: true,
    messages: true,
    needsAttention: true,
    completions: false,
    sound: false,
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("useFirstLaunchNotificationPrompt", () => {
  it("does not prompt on sign-in or server routes, then prompts once on main screen", async () => {
    await act(async () => root.render(createElement(Host, { ready: true, pathname: "/sign-in" })));
    expect(fixture.alert).not.toHaveBeenCalled();

    await act(async () => root.render(createElement(Host, { ready: true, pathname: "/server" })));
    expect(fixture.alert).not.toHaveBeenCalled();

    await act(async () => root.render(createElement(Host, { ready: true, pathname: "/" })));
    expect(fixture.alert).toHaveBeenCalledOnce();
    const [title, _msg, buttons] = fixture.alert.mock.calls[0] as [
      string,
      string,
      Array<{ text: string; onPress?: () => void }>,
    ];
    expect(title).toBe("开启消息通知");
    expect(buttons.map((b) => b.text)).toEqual(["暂不开启", "开启通知"]);

    // Tapping "开启通知" requests permission via enableNotificationsWithPrompt.
    await act(async () => buttons[1]?.onPress?.());
    expect(fixture.enable).toHaveBeenCalledOnce();

    // Navigating to another route does not prompt again.
    await act(async () => root.render(createElement(Host, { ready: true, pathname: "/chats" })));
    expect(fixture.alert).toHaveBeenCalledOnce();
  });

  it("persists prompted=true and enabled=false without requesting system permission when declined", async () => {
    await act(async () => root.render(createElement(Host, { ready: true, pathname: "/" })));
    const buttons = fixture.alert.mock.calls[0]?.[2] as Array<{ onPress?: () => void }>;
    await act(async () => buttons[0]?.onPress?.());
    expect(fixture.update).toHaveBeenCalledWith({ prompted: true, enabled: false });
    expect(fixture.enable).not.toHaveBeenCalled();
  });

  it("does not prompt again when already prompted in persisted preferences", async () => {
    fixture.prefs.prompted = true;
    await act(async () => root.render(createElement(Host, { ready: true, pathname: "/" })));
    expect(fixture.alert).not.toHaveBeenCalled();
  });
});
