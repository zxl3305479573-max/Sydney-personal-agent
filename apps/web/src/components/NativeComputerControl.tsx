import { t } from "@lingui/core/macro";
import { computerInputForDomKey } from "@rakazo/core";
import { useEffect, useRef, useState } from "react";
import type { NativeScreenGeometry } from "../lib/native-computer-control";
import { nativeScreenGeometry, nativeScreenPoint } from "../lib/native-computer-control";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";

export function NativeComputerControl({
  botId,
  leaseId,
  frame,
}: {
  botId: string;
  leaseId: string;
  frame: HTMLIFrameElement | null;
}) {
  const target = useRef<HTMLDivElement>(null);
  const ignoreNextClick = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const send = useRef<
    (kind: "pointer" | "key" | "clipboard" | "scroll", payload: Record<string, unknown>) => void
  >(() => {});

  useEffect(() => {
    setError(null);
    setReady(false);
    let geometry: NativeScreenGeometry | null = null;
    let active = true;
    let failed = false;
    let queued = 0;
    let pending = Promise.resolve();
    const root = target.current;
    if (!root || !frame) return;
    const isLocalInput = (value: EventTarget | null) =>
      value instanceof Element &&
      Boolean(
        value.closest(
          "button,input,textarea,select,a,form,[contenteditable],[contenteditable='true'],[role='textbox']",
        ),
      );
    const enqueue = (
      kind: "pointer" | "key" | "clipboard" | "scroll",
      payload: Record<string, unknown>,
    ) => {
      if (!active || failed || !geometry) return;
      if (queued >= 32) {
        failed = true;
        setError(t`Too many pending inputs. Take control again.`);
        return;
      }
      queued += 1;
      pending = pending
        .then(async () => {
          if (!active || failed) return;
          try {
            await rpc.computer.input({ botId, controlLeaseId: leaseId, kind, payload });
          } catch (cause) {
            failed = true;
            if (active) setError(errorText(cause, t`Computer input failed. Take control again.`));
          }
        })
        .finally(() => {
          queued -= 1;
        });
    };
    send.current = enqueue;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      if (event.data?.rakazoScreen === "connected") {
        frame.contentWindow?.postMessage({ rakazoScreenGeometryRequest: true }, "*");
      }
      if (["loading", "connecting", "disconnected", "failed"].includes(event.data?.rakazoScreen)) {
        geometry = null;
        setReady(false);
      }
      const next = nativeScreenGeometry(event.data?.rakazoScreenGeometry);
      if (next) {
        geometry = next;
        setReady(true);
      }
    };
    const point = (event: MouseEvent) =>
      geometry
        ? nativeScreenPoint(event.clientX, event.clientY, root.getBoundingClientRect(), geometry)
        : null;
    const onClick = (event: MouseEvent) => {
      if (ignoreNextClick.current) {
        ignoreNextClick.current = false;
        return;
      }
      if (isLocalInput(event.target)) return;
      root.focus({ preventScroll: true });
      event.preventDefault();
      const at = point(event);
      if (at)
        enqueue("pointer", { ...at, type: "click", button: event.button === 2 ? "right" : "left" });
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.button === 2 || isLocalInput(event.target)) return;
      const at = point(event);
      if (!at) return;
      ignoreNextClick.current = true;
      root.focus({ preventScroll: true });
      event.preventDefault();
      enqueue("pointer", { ...at, type: "click", button: "left" });
    };
    const onWheel = (event: WheelEvent) => {
      if (isLocalInput(event.target)) return;
      event.preventDefault();
      const at = point(event);
      if (!at) return;
      const sideways = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const delta = sideways ? event.deltaX : event.deltaY;
      if (!delta) return;
      enqueue("scroll", {
        ...at,
        direction: sideways ? (delta < 0 ? "left" : "right") : delta < 0 ? "up" : "down",
        amount: Math.min(20, Math.max(1, Math.round(Math.abs(delta) / 80))),
      });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || isLocalInput(event.target)) return;
      if (
        ["Control", "Alt", "Shift", "Meta", "Dead", "Process", "Unidentified"].includes(event.key)
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") return;
      if (
        event.key.length !== 1 &&
        ![
          "Enter",
          "Tab",
          "Backspace",
          "Escape",
          "Delete",
          "Home",
          "End",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      const mapped = computerInputForDomKey(event.key);
      const modifiers = [
        ...(event.ctrlKey ? ["ctrl"] : []),
        ...(event.altKey ? ["alt"] : []),
        ...(event.metaKey ? ["super"] : []),
      ];
      if (modifiers.length) {
        if (mapped.kind === "key" || /^[a-zA-Z0-9]$/.test(event.key)) {
          enqueue("key", {
            key: mapped.kind === "key" ? mapped.key : event.key,
            modifiers: [...modifiers, ...(event.shiftKey ? ["shift"] : [])],
          });
        }
      } else
        enqueue(
          mapped.kind,
          mapped.kind === "key"
            ? {
                key: mapped.key,
                ...(event.shiftKey ? { modifiers: ["shift"] } : {}),
              }
            : { text: mapped.text },
        );
    };
    const onPaste = (event: ClipboardEvent) => {
      if (isLocalInput(event.target)) return;
      const value = event.clipboardData?.getData("text/plain");
      if (value) {
        event.preventDefault();
        enqueue("clipboard", { text: value });
      }
    };
    window.addEventListener("message", onMessage);
    root.addEventListener("click", onClick);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("contextmenu", onClick);
    root.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    frame.contentWindow?.postMessage({ rakazoScreenGeometryRequest: true }, "*");
    const retry = window.setInterval(() => {
      if (!active || failed || geometry) return;
      frame.contentWindow?.postMessage({ rakazoScreenGeometryRequest: true }, "*");
    }, 500);
    return () => {
      active = false;
      window.clearInterval(retry);
      send.current = () => {};
      window.removeEventListener("message", onMessage);
      root.removeEventListener("click", onClick);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("contextmenu", onClick);
      root.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, [botId, leaseId, frame]);

  return (
    <div
      ref={target}
      role="application"
      tabIndex={-1}
      aria-label={t`Computer control`}
      data-testid="native-computer-control"
      className="absolute inset-0 z-10 outline-none"
      style={{ touchAction: "manipulation" }}
    >
      {error || !ready ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-background/95 p-2 text-sm">
          {error ? (
            <div role="alert">{error}</div>
          ) : (
            <div role="status">{t`Waiting for screen dimensions…`}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
