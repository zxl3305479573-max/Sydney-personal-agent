import type { ComputerKeyboardCommand } from "./computer-keyboard";

export type ComputerPointerMode = "touch" | "mouse";
export type ComputerPoint = { x: number; y: number };
type ScreenSize = { width: number; height: number };

export type NativeScreenGeometry = {
  width: number;
  height: number;
  left: number;
  top: number;
  displayWidth: number;
  displayHeight: number;
  viewportWidth: number;
  viewportHeight: number;
};

export type NativeComputerInput = {
  kind: "pointer" | "key" | "clipboard" | "scroll";
  payload: Record<string, unknown>;
};

export function isNativeControlPage(
  pageUrl: string | undefined,
  screenUrl: string,
  loadedUrl: string | null,
): boolean {
  try {
    const expected = new URL(screenUrl).href;
    return (
      Boolean(loadedUrl) &&
      new URL(loadedUrl!).href === expected &&
      Boolean(pageUrl) &&
      pageUrl !== "null" &&
      new URL(pageUrl!).href === expected
    );
  } catch {
    return false;
  }
}

export function nativeScreenGeometry(data: string, page: string): NativeScreenGeometry | null {
  try {
    const message = JSON.parse(data);
    if (!message || typeof message !== "object" || Array.isArray(message)) return null;
    if (
      Object.keys(message).length !== 2 ||
      message.rakazoNativePage !== page ||
      !message.rakazoNativeGeometry
    )
      return null;
    const value = message.rakazoNativeGeometry as NativeScreenGeometry;
    if (
      !Number.isInteger(value.width) ||
      !Number.isInteger(value.height) ||
      value.width <= 0 ||
      value.height <= 0 ||
      value.width > 8192 ||
      value.height > 8192 ||
      [value.displayWidth, value.displayHeight, value.viewportWidth, value.viewportHeight].some(
        (field) => !Number.isFinite(field) || field <= 0 || field > 16_384,
      ) ||
      !Number.isFinite(value.left) ||
      !Number.isFinite(value.top)
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

export function isNativeScreenGeometryInvalidation(data: string, page: string): boolean {
  try {
    const message = JSON.parse(data);
    return (
      message !== null &&
      typeof message === "object" &&
      !Array.isArray(message) &&
      Object.keys(message).length === 2 &&
      message.rakazoNativePage === page &&
      message.rakazoNativeGeometry === null
    );
  } catch {
    return false;
  }
}

export function nativeScreenDisplayBounds(
  bounds: ScreenSize,
  geometry: NativeScreenGeometry,
): (ScreenSize & { left: number; top: number }) | null {
  if (
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    return null;
  if (
    Math.abs(
      bounds.width / bounds.height / (geometry.viewportWidth / geometry.viewportHeight) - 1,
    ) > 0.02
  )
    return null;
  const scaleX = bounds.width / geometry.viewportWidth;
  const scaleY = bounds.height / geometry.viewportHeight;
  return {
    left: geometry.left * scaleX,
    top: geometry.top * scaleY,
    width: geometry.displayWidth * scaleX,
    height: geometry.displayHeight * scaleY,
  };
}

export function nativeScreenPoint(
  x: number,
  y: number,
  bounds: ScreenSize,
  geometry: NativeScreenGeometry,
): ComputerPoint | null {
  const rect = nativeScreenDisplayBounds(bounds, geometry);
  if (!rect || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const localX = x - rect.left;
  const localY = y - rect.top;
  if (localX < 0 || localY < 0 || localX >= rect.width || localY >= rect.height) return null;
  return {
    x: Math.floor((localX * geometry.width) / rect.width),
    y: Math.floor((localY * geometry.height) / rect.height),
  };
}

export function moveVirtualCursor(
  cursor: ComputerPoint,
  delta: ComputerPoint,
  display: ScreenSize,
): ComputerPoint {
  return {
    x: Math.max(0, Math.min(1, cursor.x + (delta.x * 1.3) / display.width)),
    y: Math.max(0, Math.min(1, cursor.y + (delta.y * 1.3) / display.height)),
  };
}

export function virtualCursorPoint(cursor: ComputerPoint, screen: ScreenSize): ComputerPoint {
  return {
    x: Math.min(screen.width - 1, Math.floor(cursor.x * screen.width)),
    y: Math.min(screen.height - 1, Math.floor(cursor.y * screen.height)),
  };
}

export function computerScrollInput(
  point: ComputerPoint,
  deltaX: number,
  deltaY: number,
): NativeComputerInput | null {
  const distance = Math.hypot(deltaX, deltaY);
  if (!Number.isFinite(distance) || distance < 12) return null;
  const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
  const delta = horizontal ? deltaX : deltaY;
  return {
    kind: "scroll",
    payload: {
      ...point,
      direction: horizontal ? (delta < 0 ? "right" : "left") : delta < 0 ? "down" : "up",
      amount: Math.min(20, Math.max(1, Math.round(Math.abs(delta) / 40))),
    },
  };
}

export function nativeTouchInput(
  start: { x: number; y: number },
  end: { x: number; y: number },
  durationMs: number,
  bounds: { width: number; height: number },
  geometry: NativeScreenGeometry,
): NativeComputerInput | null {
  const point = nativeScreenPoint(start.x, start.y, bounds, geometry);
  if (!point) return null;
  const scroll = computerScrollInput(point, end.x - start.x, end.y - start.y);
  if (scroll) return scroll;
  return {
    kind: "pointer",
    payload: { ...point, type: "click", button: durationMs >= 600 ? "right" : "left" },
  };
}

export function nativeScreenGeometryScript(page: string): string {
  return `
(function () {
  if (window.__rakazoNativeGeometry) return true;
  window.__rakazoNativeGeometry = true;
  var previous = "";
  var observer = null;
  var closed = false;
  function invalidate() {
    if (closed) return;
    closed = true;
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ rakazoNativeGeometry: null, rakazoNativePage: ${JSON.stringify(page)} }));
    }
    previous = "";
  }
  function report() {
    if (closed || !document.documentElement || !window.MutationObserver) return;
    if (!observer) {
      observer = new window.MutationObserver(function (records) {
        if (!previous) return;
        var connected = document.documentElement.classList.contains("noVNC_connected");
        var lost = records.some(function (record) {
          return typeof record.oldValue === "string" && !/(^|\\s)noVNC_connected(\\s|$)/.test(record.oldValue);
        });
        if (!connected || lost) invalidate();
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    }
    var connected = document.documentElement &&
      document.documentElement.classList.contains("noVNC_connected");
    var canvas = connected && document.querySelector("#screen canvas, #noVNC_container canvas, canvas");
    var rect = canvas && canvas.getBoundingClientRect();
    if (!rect || !canvas.width || !canvas.height || !rect.width || !rect.height) {
      if (previous) invalidate();
      previous = "";
      return;
    }
    var value = { width: canvas.width, height: canvas.height, left: rect.left, top: rect.top,
      displayWidth: rect.width, displayHeight: rect.height,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
    var json = JSON.stringify({ rakazoNativeGeometry: value, rakazoNativePage: ${JSON.stringify(page)} });
    if (json !== previous && window.ReactNativeWebView) {
      previous = json;
      window.ReactNativeWebView.postMessage(json);
    }
  }
  window.addEventListener("resize", report);
  window.__rakazoNativeGeometryRefresh = function () { previous = ""; report(); };
  setInterval(report, 500);
  report();
  return true;
})();true;`;
}

export function nativeKeyboardInputs(
  command: ComputerKeyboardCommand,
): NativeComputerInput[] | null {
  if (command.type === "text")
    return command.text ? [{ kind: "clipboard", payload: { text: command.text } }] : [];
  if (command.type === "backspace") {
    if (!Number.isSafeInteger(command.count) || command.count < 0 || command.count > 32)
      return null;
    const count = command.count;
    return Array.from({ length: count }, () => ({ kind: "key", payload: { key: "BackSpace" } }));
  }
  const keyNames: Record<string, string> = {
    Backspace: "BackSpace",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    ArrowUp: "Up",
    ArrowDown: "Down",
  };
  const key = command.type === "char" ? command.text : (keyNames[command.name] ?? command.name);
  if (command.type === "char" && !command.control) {
    return [{ kind: "clipboard", payload: { text: key } }];
  }
  if (command.type === "char" && !/^[a-zA-Z0-9]$/.test(key)) return [];
  return [
    {
      kind: "key",
      payload: { key, ...(command.control ? { modifiers: ["ctrl"] } : {}) },
    },
  ];
}

export function createNativeComputerInputQueue(
  send: (input: NativeComputerInput, isCurrent: () => boolean) => Promise<unknown>,
  onError: (error: unknown) => void,
  onInterrupted: () => void = () => {},
) {
  let active = true;
  let failed = false;
  let generation = 0;
  let queued = 0;
  let pending = Promise.resolve();
  let pendingMove: { input: NativeComputerInput } | null = null;
  let interruptionReported = false;
  function interrupt() {
    generation += 1;
    if (queued > 0) {
      reject(new Error("输入可能已部分执行或结果未知，请核对画面后释放并重新接管。"));
    }
  }
  function reject(error: unknown) {
    if (!active || failed) return;
    failed = true;
    if (queued > 0 && !interruptionReported) {
      interruptionReported = true;
      onInterrupted();
    }
    onError(error);
  }
  function enqueueBatch(inputs: NativeComputerInput[]) {
    if (!active || failed || inputs.length === 0) return;
    const [first] = inputs;
    const moveOnly =
      inputs.length === 1 && first?.kind === "pointer" && first.payload.type === "move";
    if (moveOnly && pendingMove) {
      pendingMove.input = first;
      return;
    }
    if (inputs.length > 32 - queued) {
      reject(new Error("Too many pending inputs. Check the screen and take control again."));
      return;
    }
    for (const input of inputs) {
      const entry = { input };
      pendingMove = moveOnly ? entry : null;
      const current = generation;
      queued += 1;
      pending = pending
        .then(async () => {
          if (pendingMove === entry) pendingMove = null;
          if (!active || failed || generation !== current) return;
          try {
            await send(entry.input, () => active && !failed && generation === current);
          } catch (error) {
            if (active && generation === current && !failed) {
              reject(error);
            }
          }
        })
        .finally(() => {
          queued -= 1;
        });
    }
  }
  return {
    enqueue(input: NativeComputerInput) {
      enqueueBatch([input]);
    },
    enqueueBatch,
    reject,
    invalidate() {
      interrupt();
    },
    dispose() {
      interrupt();
      active = false;
    },
  };
}
