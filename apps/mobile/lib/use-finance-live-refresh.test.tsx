// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useFinanceLiveRefresh } from "./use-finance-live-refresh";

const state = vi.hoisted(() => ({
  currentState: "active",
  onChange: undefined as ((next: string) => void) | undefined,
  remove: vi.fn(),
  refresh: vi.fn(async () => undefined),
}));

vi.mock("expo-router", () => ({
  useFocusEffect: (callback: () => () => void) => useEffect(callback, [callback]),
}));
vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return state.currentState;
    },
    addEventListener: (_event: string, callback: (next: string) => void) => {
      state.onChange = callback;
      return { remove: state.remove };
    },
  },
}));
vi.mock("./personal-finance", () => ({ refreshPersonalFinance: state.refresh }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("refreshes the focused month every 15 seconds only while active and cleans up", () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.currentState = "active";
  const root = createRoot(document.createElement("div"));
  function Screen({ month }: { month: string }) {
    useFinanceLiveRefresh(month);
    return null;
  }
  act(() => root.render(<Screen month="2026-11" />));
  expect(state.refresh).toHaveBeenLastCalledWith({ month: "2026-11" });
  act(() => vi.advanceTimersByTime(30_000));
  expect(state.refresh).toHaveBeenCalledTimes(3);
  act(() => state.onChange?.("background"));
  act(() => vi.advanceTimersByTime(60_000));
  expect(state.refresh).toHaveBeenCalledTimes(3);
  act(() => state.onChange?.("active"));
  expect(state.refresh).toHaveBeenCalledTimes(4);
  act(() => root.render(<Screen month="2026-10" />));
  expect(state.remove).toHaveBeenCalledOnce();
  expect(state.refresh).toHaveBeenLastCalledWith({ month: "2026-10" });
  act(() => root.unmount());
  expect(state.remove).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not start syncing if the focused app is already in the background", () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.currentState = "background";
  const root = createRoot(document.createElement("div"));
  function Screen() {
    useFinanceLiveRefresh("2026-11");
    return null;
  }
  act(() => root.render(<Screen />));
  act(() => vi.advanceTimersByTime(60_000));
  expect(state.refresh).not.toHaveBeenCalled();
  act(() => state.onChange?.("active"));
  expect(state.refresh).toHaveBeenCalledOnce();
  act(() => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
});
