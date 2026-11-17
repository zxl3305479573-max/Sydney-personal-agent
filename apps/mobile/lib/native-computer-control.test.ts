import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  createNativeComputerInputQueue,
  isNativeControlPage,
  isNativeScreenGeometryInvalidation,
  nativeKeyboardInputs,
  nativeScreenGeometry,
  nativeScreenGeometryScript,
  nativeScreenPoint,
  nativeTouchInput,
} from "./native-computer-control";

const geometry = {
  width: 1920,
  height: 1080,
  left: 0,
  top: 100,
  displayWidth: 400,
  displayHeight: 225,
  viewportWidth: 400,
  viewportHeight: 600,
};
const bounds = { width: 400, height: 600 };

describe("native computer control", () => {
  it("only accepts valid screen geometry and the loaded authorized page", () => {
    expect(
      nativeScreenGeometry(
        JSON.stringify({ rakazoNativeGeometry: geometry, rakazoNativePage: "1" }),
        "1",
      ),
    ).toEqual(geometry);
    expect(
      nativeScreenGeometry(
        JSON.stringify({ rakazoNativeGeometry: { ...geometry, width: 0 }, rakazoNativePage: "1" }),
        "1",
      ),
    ).toBeNull();
    expect(
      nativeScreenGeometry(
        JSON.stringify({ rakazoNativeGeometry: geometry, rakazoNativePage: "1", extra: true }),
        "1",
      ),
    ).toBeNull();
    expect(
      isNativeScreenGeometryInvalidation(
        '{"rakazoNativeGeometry":null,"rakazoNativePage":"1"}',
        "1",
      ),
    ).toBe(true);
    expect(
      isNativeScreenGeometryInvalidation(
        '{"rakazoNativeGeometry":null,"rakazoNativePage":"1","extra":1}',
        "1",
      ),
    ).toBe(false);
    expect(
      isNativeScreenGeometryInvalidation('{"rakazoNativeGeometry":{},"rakazoNativePage":"1"}', "1"),
    ).toBe(false);
    expect(
      nativeScreenGeometry(
        JSON.stringify({ rakazoNativeGeometry: geometry, rakazoNativePage: "old" }),
        "1",
      ),
    ).toBeNull();
    const url = "https://example.test/novnc/session/view/token/vnc.html";
    expect(isNativeControlPage(url, url, url)).toBe(true);
    expect(isNativeControlPage("null", url, url)).toBe(false);
    expect(isNativeControlPage("https://example.test/other", url, url)).toBe(false);
    expect(isNativeControlPage("null", url, "https://example.test/other")).toBe(false);
  });

  it("maps clicks through the canvas bounds and ignores letterboxing or stale orientation", () => {
    expect(nativeScreenPoint(200, 212.5, bounds, geometry)).toEqual({ x: 960, y: 540 });
    expect(nativeScreenPoint(200, 50, bounds, geometry)).toBeNull();
    expect(nativeScreenPoint(200, 212, { width: 600, height: 400 }, geometry)).toBeNull();
    expect(nativeTouchInput({ x: 200, y: 212 }, { x: 200, y: 212 }, 30, bounds, geometry)).toEqual({
      kind: "pointer",
      payload: { x: 960, y: 537, type: "click", button: "left" },
    });
    expect(
      nativeTouchInput({ x: 200, y: 212 }, { x: 200, y: 150 }, 120, bounds, geometry),
    ).toMatchObject({ kind: "scroll", payload: { direction: "down", amount: 2 } });
    expect(
      nativeTouchInput({ x: 200, y: 212 }, { x: 200, y: 212 }, 700, bounds, geometry),
    ).toMatchObject({ kind: "pointer", payload: { button: "right" } });
  });

  it("maps text, editing keys and control combinations to the server input format", () => {
    expect(nativeKeyboardInputs({ type: "text", text: "你好" })).toEqual([
      { kind: "clipboard", payload: { text: "你好" } },
    ]);
    expect(nativeKeyboardInputs({ type: "key", name: "ArrowLeft", control: true })).toEqual([
      { kind: "key", payload: { key: "Left", modifiers: ["ctrl"] } },
    ]);
    expect(nativeKeyboardInputs({ type: "backspace", count: 2 })).toEqual([
      { kind: "key", payload: { key: "BackSpace" } },
      { kind: "key", payload: { key: "BackSpace" } },
    ]);
    expect(nativeKeyboardInputs({ type: "char", text: "中", control: true })).toEqual([]);
    expect(nativeKeyboardInputs({ type: "backspace", count: 32 })).toHaveLength(32);
    expect(nativeKeyboardInputs({ type: "backspace", count: 33 })).toBeNull();
    expect(nativeKeyboardInputs({ type: "backspace", count: 40 })).toBeNull();
    expect(nativeKeyboardInputs({ type: "backspace", count: Number.MAX_SAFE_INTEGER })).toBeNull();
  });

  it("reports geometry only after the noVNC screen is connected", () => {
    let connected = false;
    let canvasAvailable = true;
    let tick = () => {};
    const postMessage = vi.fn();
    const window = {
      ReactNativeWebView: { postMessage },
      addEventListener: vi.fn(),
      innerWidth: 400,
      innerHeight: 600,
      MutationObserver: class {
        observe() {}
      },
    };
    const document = {
      documentElement: { classList: { contains: () => connected } },
      querySelector: () =>
        canvasAvailable && {
          width: 1920,
          height: 1080,
          getBoundingClientRect: () => ({ left: 0, top: 100, width: 400, height: 225 }),
        },
    };
    runInNewContext(nativeScreenGeometryScript("1"), {
      window,
      document,
      setInterval: (callback: () => void) => {
        tick = callback;
      },
    });
    expect(postMessage).not.toHaveBeenCalled();
    connected = true;
    tick();
    expect(nativeScreenGeometry(postMessage.mock.calls[0]?.[0], "1")).toEqual(geometry);
    tick();
    expect(postMessage).toHaveBeenCalledTimes(1);
    canvasAvailable = false;
    tick();
    tick();
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(isNativeScreenGeometryInvalidation(postMessage.mock.calls[1]?.[0], "1")).toBe(true);
    canvasAvailable = true;
    tick();
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it("invalidates a connection lost and restored between geometry polls", () => {
    let observeChanges: (records: Array<{ oldValue: string }>) => void = () => {};
    const postMessage = vi.fn();
    const window = {
      ReactNativeWebView: { postMessage },
      addEventListener: vi.fn(),
      innerWidth: 400,
      innerHeight: 600,
      MutationObserver: class {
        constructor(callback: typeof observeChanges) {
          observeChanges = callback;
        }
        observe() {}
      },
    };
    const document = {
      documentElement: { classList: { contains: () => true } },
      querySelector: () => ({
        width: 1920,
        height: 1080,
        getBoundingClientRect: () => ({ left: 0, top: 100, width: 400, height: 225 }),
      }),
    };
    runInNewContext(nativeScreenGeometryScript("1"), {
      window,
      document,
      setInterval: () => {},
    });
    observeChanges([{ oldValue: "noVNC_connected" }, { oldValue: "noVNC_connecting" }]);
    expect(isNativeScreenGeometryInvalidation(postMessage.mock.calls[1]?.[0], "1")).toBe(true);
  });

  it("rejects an entire deletion batch when pending inputs leave insufficient capacity", async () => {
    let finish: () => void = () => undefined;
    const first = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const send = vi.fn().mockReturnValueOnce(first);
    const onError = vi.fn();
    const onInterrupted = vi.fn();
    const queue = createNativeComputerInputQueue(send, onError, onInterrupted);
    const input = { kind: "key", payload: { key: "Tab" } } as const;
    queue.enqueue(input);
    await Promise.resolve();
    queue.enqueueBatch(nativeKeyboardInputs({ type: "backspace", count: 32 })!);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onInterrupted).toHaveBeenCalledTimes(1);
    finish();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("records a manual rejection with pending inputs, but not an idle rejection", async () => {
    const onInterrupted = vi.fn();
    const queue = createNativeComputerInputQueue(
      () => new Promise(() => {}),
      vi.fn(),
      onInterrupted,
    );
    queue.enqueue({ kind: "key", payload: { key: "Tab" } });
    await Promise.resolve();
    queue.reject(new Error("Deletion is too long"));
    queue.dispose();
    expect(onInterrupted).toHaveBeenCalledTimes(1);
    const idle = createNativeComputerInputQueue(vi.fn(), vi.fn(), onInterrupted);
    idle.reject(new Error("Deletion is too long"));
    expect(onInterrupted).toHaveBeenCalledTimes(1);
  });

  it("sends a deletion of 32 keys in order when the queue has room", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const queue = createNativeComputerInputQueue(send, onError);
    queue.enqueueBatch(nativeKeyboardInputs({ type: "backspace", count: 32 })!);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(32));
    expect(onError).not.toHaveBeenCalled();
  });

  it("fails closed on invalidation with pending inputs, without waiting for the old request", async () => {
    let finish: () => void = () => undefined;
    const first = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const send = vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined);
    const onError = vi.fn();
    const queue = createNativeComputerInputQueue(send, onError);
    const input = { kind: "key", payload: { key: "Tab" } } as const;
    queue.enqueue(input);
    queue.enqueue(input);
    await Promise.resolve();
    queue.invalidate();
    queue.enqueue(input);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    finish();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const replacementSend = vi.fn().mockResolvedValue(undefined);
    createNativeComputerInputQueue(replacementSend, vi.fn()).enqueue(input);
    await vi.waitFor(() => expect(replacementSend).toHaveBeenCalledTimes(1));
  });

  it("reports outstanding work on dispose, once, and stays silent for an idle queue", async () => {
    const interrupted = vi.fn();
    const queue = createNativeComputerInputQueue(() => new Promise(() => {}), vi.fn(), interrupted);
    queue.enqueue({ kind: "key", payload: { key: "Tab" } });
    await Promise.resolve();
    queue.dispose();
    queue.dispose();
    expect(interrupted).toHaveBeenCalledTimes(1);
    const idle = createNativeComputerInputQueue(vi.fn(), vi.fn(), interrupted);
    idle.dispose();
    expect(interrupted).toHaveBeenCalledTimes(1);
  });

  it("serializes input and never replays queued work after a failure", async () => {
    let finish: (value: unknown) => void = () => undefined;
    const first = new Promise((resolve) => {
      finish = resolve;
    });
    const send = vi.fn().mockReturnValueOnce(first).mockRejectedValueOnce(new Error("failed"));
    const onError = vi.fn();
    const onInterrupted = vi.fn();
    const queue = createNativeComputerInputQueue(send, onError, onInterrupted);
    const input = { kind: "key", payload: { key: "Tab" } } as const;
    queue.enqueue(input);
    queue.enqueue(input);
    queue.enqueue(input);
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    finish(undefined);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(2);
    expect(onInterrupted).toHaveBeenCalledTimes(1);
    queue.dispose();
    expect(onInterrupted).toHaveBeenCalledTimes(1);
    queue.enqueue(input);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("invalidates queued work and makes pending preparation observe release", async () => {
    let resume: () => void = () => undefined;
    const wait = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const applied = vi.fn();
    const send = vi.fn(async (_input, isCurrent: () => boolean) => {
      await wait;
      if (isCurrent()) applied();
    });
    const queue = createNativeComputerInputQueue(send, vi.fn());
    const input = { kind: "key", payload: { key: "Tab" } } as const;
    queue.enqueue(input);
    queue.enqueue(input);
    await Promise.resolve();
    queue.dispose();
    resume();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(applied).not.toHaveBeenCalled();
  });
});
