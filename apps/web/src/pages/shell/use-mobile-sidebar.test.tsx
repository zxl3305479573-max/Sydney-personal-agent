// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMobileSidebar } from "./use-mobile-sidebar";

let desktop = false;
let root: ReturnType<typeof createRoot>;
let current: ReturnType<typeof useMobileSidebar>;

function Harness() {
  current = useMobileSidebar();
  return <div data-open={current.mobileSidebarOpen ? "true" : "false"} />;
}

async function render() {
  if (!root) root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
}

async function go(path: string) {
  window.history.pushState(null, "", path);
  await render();
  // Landing on /app reopens the list in an effect; flush it before reading the result.
  await act(async () => {});
  await render();
  await render();
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  desktop = false;
  vi.stubGlobal("matchMedia", (query: string) => {
    const listeners = new Set<() => void>();
    return {
      matches: query.includes("min-width") ? desktop : !desktop,
      media: query,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    };
  });
  window.history.pushState(null, "", "/app");
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined as unknown as ReturnType<typeof createRoot>;
  vi.unstubAllGlobals();
});

it("opens the chat list on a phone at the app root", async () => {
  await render();
  expect(current.mobileSidebarOpen).toBe(true);
});

it("opens a chat route on its transcript instead of the list", async () => {
  await go("/app/bot-1");
  expect(current.mobileSidebarOpen).toBe(false);
});

it("reopens the list when the user returns to the app root", async () => {
  await go("/app/bot-1");
  await go("/app");
  expect(current.mobileSidebarOpen).toBe(true);
});

it("keeps the list closed after the user closes it on the app root", async () => {
  await render();
  await act(async () => current.setMobileSidebarOpen(false));
  await render();
  expect(current.mobileSidebarOpen).toBe(false);
});

it("stays closed on desktop", async () => {
  desktop = true;
  await render();
  expect(current.mobileSidebarOpen).toBe(false);
});
