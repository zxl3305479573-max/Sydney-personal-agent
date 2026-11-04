export class ManagedTaskControlStopped extends Error {
  constructor() {
    super("Managed task control stopped this attempt.");
    this.name = "ManagedTaskControlStopped";
  }
}

export function watchManagedTaskControl(
  isAllowed: () => Promise<boolean>,
  controller: AbortController,
  intervalMs = 2_000,
) {
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const check = async () => {
    if (closed || controller.signal.aborted) return;
    try {
      if (!(await isAllowed()) && !closed) controller.abort(new ManagedTaskControlStopped());
    } catch {
      if (!closed) controller.abort(new ManagedTaskControlStopped());
    }
  };

  const poll = async () => {
    await check();
    if (!closed && !controller.signal.aborted) {
      timer = setTimeout(() => void poll(), intervalMs);
      timer.unref?.();
    }
  };

  const ready = poll();
  return {
    ready,
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
    },
  };
}
