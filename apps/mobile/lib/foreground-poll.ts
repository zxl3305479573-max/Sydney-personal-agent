import { useEffect, useRef } from "react";
import { useAppForeground } from "./app-foreground";

/**
 * Runs one poll at a time while the screen is enabled and the app is visible.
 * The next run is scheduled only after the previous one finishes.
 * Changing `intervalMs` adjusts the waiting delay without firing an extra immediate poll.
 */
export function useForegroundPoll(
  run: () => Promise<unknown>,
  intervalMs: number,
  enabled: boolean,
): void {
  const foreground = useAppForeground();
  const runRef = useRef(run);
  runRef.current = run;
  const intervalRef = useRef(intervalMs);
  intervalRef.current = intervalMs;
  const pendingRef = useRef<Promise<unknown> | null>(null);
  const rescheduleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || !foreground) {
      rescheduleRef.current = null;
      return;
    }
    let cancelled = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastCompletedAt: number | null = null;

    const schedule = (delayMs: number) => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void tick();
      }, delayMs);
    };

    const tick = async () => {
      if (cancelled || stopped) return;
      const pending = pendingRef.current ?? (async () => runRef.current())();
      pendingRef.current = pending;
      let loaded: unknown;
      try {
        loaded = await pending;
      } finally {
        if (pendingRef.current === pending) pendingRef.current = null;
        if (loaded === false) {
          stopped = true;
        } else if (!cancelled) {
          lastCompletedAt = Date.now();
          schedule(intervalRef.current);
        }
      }
    };

    rescheduleRef.current = () => {
      if (cancelled || stopped || pendingRef.current || lastCompletedAt === null) return;
      const remaining = Math.max(0, intervalRef.current - (Date.now() - lastCompletedAt));
      schedule(remaining);
    };

    void tick();
    return () => {
      cancelled = true;
      rescheduleRef.current = null;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [enabled, foreground]);

  useEffect(() => {
    rescheduleRef.current?.();
  }, [intervalMs]);
}
