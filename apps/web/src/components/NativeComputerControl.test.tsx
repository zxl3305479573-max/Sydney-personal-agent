// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { NativeComputerControl } from "./NativeComputerControl";

const input = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("../lib/rpc", () => ({ rpc: { computer: { input } } }));

afterEach(() => {
  input.mockReset().mockResolvedValue({ ok: true });
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const root = createRoot(host);
  await act(async () => {
    root.render(<NativeComputerControl botId="bot" leaseId="lease" frame={frame} />);
  });
  const overlay = host.querySelector<HTMLElement>('[data-testid="native-computer-control"]')!;
  overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 640 }) as DOMRect;
  const geometry = {
    width: 1920,
    height: 1080,
    left: 0,
    top: 50,
    displayWidth: 960,
    displayHeight: 540,
    viewportWidth: 960,
    viewportHeight: 640,
  };
  const report = async (source: Window | null = frame.contentWindow) => {
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source,
          data: { rakazoScreenGeometry: geometry },
        }),
      );
    });
  };
  const click = async (x = 480, y = 320) => {
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
    });
  };
  const key = async (value: string, options: KeyboardEventInit = {}) => {
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...options }),
      );
    });
  };
  const unmount = async () => {
    await act(async () => root.unmount());
  };
  return { host, root, frame, overlay, click, key, report, unmount };
}

it("only accepts geometry from its own frame and maps clicks outside letterboxing", async () => {
  const value = await mount();
  await value.click();
  expect(input).not.toHaveBeenCalled();
  await value.report(window);
  await value.click();
  expect(input).not.toHaveBeenCalled();
  await value.report();
  await value.click(480, 10);
  expect(input).not.toHaveBeenCalled();
  await value.click();
  expect(input).toHaveBeenCalledWith({
    botId: "bot",
    controlLeaseId: "lease",
    kind: "pointer",
    payload: { x: 960, y: 540, type: "click", button: "left" },
  });
  await value.unmount();
});

it("shows failed input, cancels queued actions and never replays uncertain results", async () => {
  const value = await mount();
  await value.report();
  let rejectInput!: (reason: Error) => void;
  input.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectInput = reject;
      }),
  );
  await value.click();
  await value.click();
  expect(input).toHaveBeenCalledOnce();
  await act(async () => rejectInput(new Error("disconnected")));
  expect(value.host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  await value.click();
  expect(input).toHaveBeenCalledOnce();
  await value.unmount();
});

it("accepts keyboard input while the screen frame has focus and ignores the text form", async () => {
  const value = await mount();
  await value.report();
  await value.key("a");
  expect(input).toHaveBeenLastCalledWith({
    botId: "bot",
    controlLeaseId: "lease",
    kind: "clipboard",
    payload: { text: "a" },
  });
  const field = value.host.querySelector("input")!;
  await act(async () => {
    field.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", bubbles: true, cancelable: true }),
    );
  });
  expect(input).toHaveBeenCalledTimes(1);
  await value.unmount();
});

it("does not turn a contenteditable page control into desktop input", async () => {
  const value = await mount();
  await value.report();
  const editable = document.createElement("div");
  editable.setAttribute("contenteditable", "true");
  value.host.append(editable);
  await act(async () => {
    editable.dispatchEvent(
      new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true }),
    );
  });
  expect(input).not.toHaveBeenCalled();
  await value.unmount();
});

it("stops input when the frame disconnects or the control is unmounted", async () => {
  const value = await mount();
  await value.report();
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", {
        source: value.frame.contentWindow,
        data: { rakazoScreen: "disconnected" },
      }),
    );
  });
  await value.click();
  expect(input).not.toHaveBeenCalled();
  await value.unmount();
  await value.click();
  expect(input).not.toHaveBeenCalled();
});
