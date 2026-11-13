// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, createElement, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Devices from "../app/(settings)/devices";
import { queryClient } from "./query";

const state = vi.hoisted(() => ({
  server: "https://one.test",
  generation: 1,
  ready: 1,
  listeners: new Set<() => void>(),
  list: vi.fn(),
  appState: null as null | ((state: string) => void),
  blur: null as null | (() => void),
  focus: null as null | (() => void),
  focused: true,
  blurListeners: new Set<() => void>(),
  navigation: {
    addListener: (_event: string, listener: () => void) => {
      state.blurListeners.add(listener);
      return () => state.blurListeners.delete(listener);
    },
  },
}));
vi.mock("./query", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
});
vi.mock("./api", () => ({
  currentApiBase: () => state.server,
  subscribeApiBase: (listener: () => void) => {
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  },
}));
vi.mock("./session", () => ({
  currentSessionGeneration: () => state.generation,
  currentReadySessionGeneration: () => state.ready,
  subscribeSessionGeneration: (listener: () => void) => {
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  },
}));
vi.mock("./user-devices", () => ({
  listUserDevices: state.list,
  DeviceListError: class extends Error {
    constructor(readonly kind: string) {
      super(kind);
    }
  },
}));
vi.mock("expo-router", () => ({
  useNavigation: () => state.navigation,
  useFocusEffect: (effect: () => undefined | (() => void)) =>
    useEffect(() => {
      let cleanup = state.focused ? effect() : undefined;
      state.blur = () => {
        state.focused = false;
        for (const listener of state.blurListeners) listener();
        cleanup?.();
        cleanup = undefined;
      };
      state.focus = () => {
        state.focused = true;
        cleanup = effect();
      };
      return () => {
        cleanup?.();
        state.blur = null;
        state.focus = null;
      };
    }, [effect]),
}));
vi.mock("./i18n", () => ({
  useI18n: () => ({
    locale: "en",
    t: (text: string, values?: { time: string }) =>
      values ? text.replace("{time}", values.time) : text,
  }),
  dateLocaleForUi: () => "en-US",
}));
vi.mock("./side-insets", () => ({ useSideInsets: () => ({}) }));
vi.mock("./native", () => ({ native: { groupedPage: "white", label: "black" } }));
vi.mock("react-native", () => ({
  ScrollView: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Text: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  ActivityIndicator: () => createElement("span", null, "Loading…"),
  AppState: {
    addEventListener: (_event: string, listener: (next: string) => void) => {
      state.appState = listener;
      return {
        remove: () => {
          state.appState = null;
        },
      };
    },
  },
}));
vi.mock("../components/settings-group", () => ({
  SettingsGroup: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SettingsRow: ({
    title,
    detail,
    onPress,
    disabled,
  }: {
    title: string;
    detail?: string;
    onPress?: () => void;
    disabled?: boolean;
  }) =>
    onPress
      ? createElement("button", { type: "button", onClick: onPress, disabled }, title)
      : createElement("div", null, `${title} ${detail}`),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.server = "https://one.test";
  state.generation = 1;
  state.ready = 1;
  state.appState = null;
  state.blur = null;
  state.focus = null;
  state.focused = true;
  state.list.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  queryClient.clear();
  container.remove();
  vi.unstubAllGlobals();
});

it("shows loading, empty, refresh failure and retry success", async () => {
  let finish!: (value: unknown) => void;
  state.list.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
  await act(async () => root.render(<Devices />));
  expect(container.textContent).toContain("Loading…");
  await act(async () => finish([]));
  await vi.waitFor(() => expect(container.textContent).toContain("No computers paired"));
  expect(container.textContent).toContain("Status at");
  state.list.mockRejectedValueOnce(new Error("offline"));
  await act(async () => container.querySelector("button")?.click());
  await vi.waitFor(() => expect(container.textContent).toContain("Could not load devices."));
  state.list.mockResolvedValueOnce([{ deviceId: "1", name: "Laptop", connected: false }]);
  await act(async () => container.querySelector("button")?.click());
  await vi.waitFor(() => expect(container.textContent).toContain("Laptop Offline"));
});

it("refreshes a snapshot when the app returns to the foreground", async () => {
  state.list
    .mockResolvedValueOnce([{ deviceId: "1", name: "PC", connected: true }])
    .mockResolvedValueOnce([{ deviceId: "1", name: "PC", connected: false }]);
  await act(async () => root.render(<Devices />));
  await vi.waitFor(() => expect(container.textContent).toContain("PC Connected"));
  expect(container.textContent).toContain("refresh to check again");
  await act(async () => state.appState?.("active"));
  await vi.waitFor(() => expect(container.textContent).toContain("PC Offline"));
  expect(state.list).toHaveBeenCalledTimes(2);
});

it("replaces an unfinished first request on foreground and ignores its late response", async () => {
  let finishOld!: (value: unknown) => void;
  let finishNew!: (value: unknown) => void;
  state.list
    .mockReturnValueOnce(new Promise((resolve) => (finishOld = resolve)))
    .mockReturnValueOnce(new Promise((resolve) => (finishNew = resolve)));
  await act(async () => root.render(<Devices />));
  expect(state.list).toHaveBeenCalledTimes(1);
  const oldSignal = state.list.mock.calls[0]![0] as AbortSignal;
  await act(async () => state.appState?.("background"));
  await act(async () => state.appState?.("active"));
  expect(oldSignal.aborted).toBe(true);
  expect(state.list).toHaveBeenCalledTimes(2);
  await act(async () => finishNew([{ deviceId: "new", name: "New PC", connected: false }]));
  await vi.waitFor(() => expect(container.textContent).toContain("New PC Offline"));
  await act(async () => finishOld([{ deviceId: "old", name: "Old PC", connected: true }]));
  expect(container.textContent).toContain("New PC Offline");
  expect(container.textContent).not.toContain("Old PC");
});

it("replaces an unfinished first request after blur and refocus", async () => {
  let finishOld!: (value: unknown) => void;
  let finishNew!: (value: unknown) => void;
  state.list
    .mockReturnValueOnce(new Promise((resolve) => (finishOld = resolve)))
    .mockReturnValueOnce(new Promise((resolve) => (finishNew = resolve)));
  await act(async () => root.render(<Devices />));
  expect(state.list).toHaveBeenCalledTimes(1);
  const oldSignal = state.list.mock.calls[0]![0] as AbortSignal;
  await act(async () => state.blur?.());
  expect(state.list).toHaveBeenCalledTimes(1);
  await act(async () => state.focus?.());
  expect(oldSignal.aborted).toBe(true);
  expect(state.list).toHaveBeenCalledTimes(2);
  await act(async () => finishNew([{ deviceId: "new", name: "New PC", connected: false }]));
  await vi.waitFor(() => expect(container.textContent).toContain("New PC Offline"));
  await act(async () => finishOld([{ deviceId: "old", name: "Old PC", connected: true }]));
  expect(container.textContent).toContain("New PC Offline");
  expect(container.textContent).not.toContain("Old PC");
});

it.each(["server", "session"])(
  "refreshes an unfinished new %s request after switching while blurred",
  async (change) => {
    let finishNewScope!: (value: unknown) => void;
    let finishRefreshed!: (value: unknown) => void;
    state.list
      .mockResolvedValueOnce([{ deviceId: "old", name: "Old account PC", connected: true }])
      .mockReturnValueOnce(new Promise((resolve) => (finishNewScope = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (finishRefreshed = resolve)));
    await act(async () => root.render(<Devices />));
    await vi.waitFor(() => expect(container.textContent).toContain("Old account PC"));
    await act(async () => state.blur?.());
    await act(async () => {
      if (change === "server") state.server = "https://two.test";
      else state.generation = state.ready = 2;
      for (const listener of state.listeners) listener();
    });
    await vi.waitFor(() => expect(state.list).toHaveBeenCalledTimes(2));
    const oldSignal = state.list.mock.calls[1]![0] as AbortSignal;
    await act(async () => state.focus?.());
    expect(oldSignal.aborted).toBe(true);
    expect(state.list).toHaveBeenCalledTimes(3);
    await act(async () =>
      finishRefreshed([{ deviceId: "new", name: "Fresh PC", connected: false }]),
    );
    await vi.waitFor(() => expect(container.textContent).toContain("Fresh PC Offline"));
    await act(async () =>
      finishNewScope([{ deviceId: "stale", name: "Stale PC", connected: true }]),
    );
    expect(container.textContent).toContain("Fresh PC Offline");
    expect(container.textContent).not.toContain("Stale PC");
  },
);

it("keeps the refocus refresh pending until the replacement session is ready", async () => {
  let finishNewScope!: (value: unknown) => void;
  let finishRefreshed!: (value: unknown) => void;
  state.list
    .mockResolvedValueOnce([])
    .mockReturnValueOnce(new Promise((resolve) => (finishNewScope = resolve)))
    .mockReturnValueOnce(new Promise((resolve) => (finishRefreshed = resolve)));
  await act(async () => root.render(<Devices />));
  await vi.waitFor(() => expect(container.textContent).toContain("No computers paired"));
  await act(async () => state.blur?.());
  await act(async () => {
    state.generation = 2;
    for (const listener of state.listeners) listener();
  });
  await act(async () => state.focus?.());
  expect(state.list).toHaveBeenCalledTimes(1);
  await act(async () => {
    state.ready = 2;
    for (const listener of state.listeners) listener();
  });
  await vi.waitFor(() => expect(state.list).toHaveBeenCalledTimes(3));
  const oldSignal = state.list.mock.calls[1]![0] as AbortSignal;
  expect(oldSignal.aborted).toBe(true);
  await act(async () => finishRefreshed([]));
  await vi.waitFor(() => expect(container.textContent).toContain("No computers paired"));
  await act(async () => finishNewScope([{ deviceId: "old", name: "Stale PC", connected: true }]));
  expect(container.textContent).not.toContain("Stale PC");
});

it.each([
  ["auth", "Your session is unavailable or expired. Sign in again."],
  ["unavailable", "The device API is unavailable. Check the server configuration."],
  ["network", "Could not reach the server. Check your connection."],
  ["timeout", "The device request timed out. Try again."],
])("shows a distinct %s error", async (kind, message) => {
  const { DeviceListError } = await import("./user-devices");
  state.list.mockRejectedValueOnce(new DeviceListError(kind as "auth"));
  await act(async () => root.render(<Devices />));
  await vi.waitFor(() => expect(container.textContent).toContain(message));
});

it.each(["server", "session"])("hides and ignores old devices when %s changes", async (change) => {
  let finish!: (value: unknown) => void;
  state.list
    .mockResolvedValueOnce([{ deviceId: "old", name: "Old PC", connected: true }])
    .mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    .mockResolvedValueOnce([{ deviceId: "new", name: "New PC", connected: false }]);
  await act(async () => root.render(<Devices />));
  await vi.waitFor(() => expect(container.textContent).toContain("Old PC"));
  await act(async () => container.querySelector("button")?.click());
  await act(async () => {
    if (change === "server") state.server = "https://two.test";
    else state.generation = state.ready = 2;
    for (const listener of state.listeners) listener();
  });
  await vi.waitFor(() => expect(container.textContent).toContain("New PC"));
  await act(async () => finish([{ deviceId: "old", name: "Old PC", connected: true }]));
  expect(container.textContent).not.toContain("Old PC");
});

it("aborts an outstanding request when the page unmounts", async () => {
  state.list.mockImplementation(
    (signal: AbortSignal) =>
      new Promise(() => {
        signal.addEventListener("abort", () => undefined);
      }),
  );
  await act(async () => root.render(<Devices />));
  const signal = state.list.mock.calls[0]![0] as AbortSignal;
  await act(async () => root.unmount());
  expect(signal.aborted).toBe(true);
  root = createRoot(container);
});

it("hides old devices until a replacement session is ready", async () => {
  state.list
    .mockResolvedValueOnce([{ deviceId: "old", name: "Old PC", connected: true }])
    .mockResolvedValueOnce([]);
  await act(async () => root.render(<Devices />));
  await vi.waitFor(() => expect(container.textContent).toContain("Old PC"));
  await act(async () => {
    state.generation = 2;
    for (const listener of state.listeners) listener();
  });
  expect(container.textContent).not.toContain("Old PC");
  expect(state.list).toHaveBeenCalledTimes(1);
  await act(async () => {
    state.ready = 2;
    for (const listener of state.listeners) listener();
  });
  await vi.waitFor(() => expect(container.textContent).toContain("No computers paired"));
});
