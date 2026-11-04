export function watchManagedTaskControl(
  isAllowed: () => Promise<boolean>,
  controller: AbortController,
  intervalMs = 2_000,
) {
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const check = async () => {
    try {
      if (!(await isAllowed()) && !closed) controller.abort();
    } catch {
      if (!closed) controller.abort();
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
