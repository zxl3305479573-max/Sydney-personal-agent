// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workspaceScript = resolve(process.cwd(), "apps/web/public/mobile-startup.js");
const script = readFileSync(
  existsSync(workspaceScript)
    ? workspaceScript
    : resolve(process.cwd(), "public/mobile-startup.js"),
  "utf8",
);

function start(mobile = true, reducedMotion = false) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduced-motion") ? reducedMotion : mobile,
  }));
  document.body.innerHTML = `
    <div id="root"></div>
    <div id="mobile-startup"><div class="mobile-startup-error" hidden><button>Refresh</button></div></div>
  `;
  new Function("window", "document", "MutationObserver", "performance", script)(
    window,
    document,
    MutationObserver,
    performance,
  );
}

describe("mobile startup", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    document.head.querySelectorAll("link[data-mobile-styles]").forEach((link) => {
      link.remove();
    });
    window.history.replaceState(null, "", "/");
  });

  it("keeps the brand visible while the first page is loading", async () => {
    start();
    const root = document.getElementById("root")!;
    root.innerHTML =
      '<div data-rakazo-app-state="ready"><div data-mobile-startup-pending></div></div>';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.getElementById("mobile-startup")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(700);
    expect(document.getElementById("mobile-startup")).not.toBeNull();
    expect(root.querySelector("[data-mobile-startup-pending]")).not.toBeNull();
  });

  it("keeps a late loading screen covered until the page is ready", async () => {
    start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(document.getElementById("mobile-startup")).not.toBeNull();
    document.getElementById("root")!.innerHTML = "<div data-mobile-startup-pending></div>";
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(200);
    expect(document.getElementById("mobile-startup")).not.toBeNull();
    document.getElementById("root")!.innerHTML =
      '<div data-rakazo-app-state="ready"><main>Ready</main></div>';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(180);
    expect(document.getElementById("mobile-startup")).toBeNull();
  });

  it("enables mobile styles and waits for them before revealing the page", async () => {
    const link = document.createElement("link");
    link.dataset.mobileStyles = "";
    link.media = "(min-width: 768px), (pointer: fine)";
    document.head.append(link);
    start();
    document.getElementById("root")!.innerHTML =
      '<div data-rakazo-app-state="ready"><main>Ready</main></div>';
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.getElementById("mobile-startup")).not.toBeNull();
    link.dispatchEvent(new Event("load"));
    expect(link.media).toBe("all");
    await vi.advanceTimersByTimeAsync(180);
    expect(document.getElementById("mobile-startup")).toBeNull();
  });

  it("enables styles on callback pages without blocking the callback", () => {
    const link = document.createElement("link");
    link.dataset.mobileStyles = "";
    document.head.append(link);
    window.history.replaceState(null, "", "/sso/callback");
    start();
    link.dispatchEvent(new Event("load"));
    expect(link.media).toBe("all");
    expect(document.getElementById("mobile-startup")).toBeNull();
  });

  it("waits for the animation when the page is ready quickly", async () => {
    start();
    document.getElementById("root")!.innerHTML =
      '<div data-rakazo-app-state="ready"><main>Ready</main></div>';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);
    expect(document.getElementById("mobile-startup")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(280);
    expect(document.getElementById("mobile-startup")).toBeNull();
  });

  it("does not restart the animation wait after a slow script download", async () => {
    await vi.advanceTimersByTimeAsync(3000);
    start();
    document.getElementById("root")!.innerHTML =
      '<div data-rakazo-app-state="ready"><main>Ready</main></div>';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(180);
    expect(document.getElementById("mobile-startup")).toBeNull();
  });

  it("enables styles that finished loading before the startup script", async () => {
    const link = document.createElement("link");
    link.dataset.mobileStyles = "";
    link.media = "(min-width: 768px), (pointer: fine)";
    Object.defineProperty(link, "sheet", { value: {} });
    document.head.append(link);
    start();
    expect(link.media).toBe("all");
  });

  it("reveals errors immediately and does not delay reduced motion", async () => {
    start(true, true);
    document.getElementById("root")!.innerHTML = '<div data-rakazo-app-state="failed"></div>';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1);
    expect(document.getElementById("mobile-startup")).toBeNull();
  });

  it("keeps redirects covered and releases a connection error without waiting for the animation", async () => {
    start();
    const root = document.getElementById("root")!;
    root.innerHTML = '<div data-rakazo-app-state="ready"></div>';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(document.getElementById("mobile-startup")).not.toBeNull();
    root.innerHTML = "<div data-mobile-startup-terminal>Retry</div>";
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(180);
    expect(document.getElementById("mobile-startup")).toBeNull();
  });

  it("offers recovery after a slow load and removes itself on desktop", async () => {
    start();
    await vi.advanceTimersByTimeAsync(8000);
    expect(document.querySelector<HTMLElement>(".mobile-startup-error")?.hidden).toBe(false);
    start(false);
    expect(document.getElementById("mobile-startup")).toBeNull();
  });

  it("does not block sign-in callback windows", () => {
    window.history.replaceState(null, "", "/sso/callback");
    start();
    expect(document.getElementById("mobile-startup")).toBeNull();
  });
});
