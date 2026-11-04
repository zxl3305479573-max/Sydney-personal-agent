export type HotPluginState = "stopped" | "starting" | "ready" | "draining" | "stopping" | "failed";

export type HotPluginEvent =
  | { type: "start" }
  | { type: "healthy" }
  | { type: "disable" }
  | { type: "drained"; activeCalls: number }
  | { type: "stop_failed_instance" }
  | { type: "failure" }
  | { type: "exit_confirmed" };

export type HotPluginDecision =
  | { accepted: true; state: HotPluginState }
  | { accepted: false; state: HotPluginState; reason: "invalid_transition" | "calls_in_flight" };

export function decideHotPluginTransition(
  state: HotPluginState,
  event: HotPluginEvent,
): HotPluginDecision {
  let next: HotPluginState | undefined;
  switch (event.type) {
    case "start":
      if (state === "stopped") next = "starting";
      break;
    case "healthy":
      if (state === "starting") next = "ready";
      break;
    case "disable":
      if (state === "ready") next = "draining";
      break;
    case "drained":
      if (state === "draining") {
        if (!Number.isSafeInteger(event.activeCalls) || event.activeCalls !== 0) {
          return { accepted: false, state, reason: "calls_in_flight" };
        }
        next = "stopping";
      }
      break;
    case "stop_failed_instance":
      if (state === "failed") next = "stopping";
      break;
    case "failure":
      if (
        state === "starting" ||
        state === "ready" ||
        state === "draining" ||
        state === "stopping"
      ) {
        next = "failed";
      }
      break;
    case "exit_confirmed":
      if (state === "stopping" || state === "failed") next = "stopped";
      break;
  }
  return next
    ? { accepted: true, state: next }
    : { accepted: false, state, reason: "invalid_transition" };
}

export function hotPluginAcceptsNewCalls(state: HotPluginState): boolean {
  return state === "ready";
}
