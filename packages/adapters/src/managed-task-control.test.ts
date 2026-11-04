import { expect, it, vi } from "vitest";
import { ManagedTaskControlStopped, watchManagedTaskControl } from "./managed-task-control.js";

it("aborts when task control changes and stops polling", async () => {
  vi.useFakeTimers();
  try {
    const allowed = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const controller = new AbortController();
    const watch = watchManagedTaskControl(allowed, controller, 20);
    await watch.ready;
    expect(controller.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBeInstanceOf(ManagedTaskControlStopped);
    await vi.advanceTimersByTimeAsync(100);
    expect(allowed).toHaveBeenCalledTimes(2);
    watch.close();
  } finally {
    vi.useRealTimers();
  }
});

it("fails closed on a control read error", async () => {
  const controller = new AbortController();
  const watch = watchManagedTaskControl(async () => {
    throw new Error("unavailable");
  }, controller);
  await watch.ready;
  expect(controller.signal.aborted).toBe(true);
  expect(controller.signal.reason).toBeInstanceOf(ManagedTaskControlStopped);
  watch.close();
});

it("does not abort after the watcher is closed while a read is pending", async () => {
  let resolveRead!: (allowed: boolean) => void;
  const controller = new AbortController();
  const watch = watchManagedTaskControl(
    () => new Promise<boolean>((resolve) => { resolveRead = resolve; }),
    controller,
  );
  watch.close();
  resolveRead(false);
  await watch.ready;
  expect(controller.signal.aborted).toBe(false);
});

it("does not read control when the attempt is already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  const allowed = vi.fn(async () => true);
  const watch = watchManagedTaskControl(allowed, controller);
  await watch.ready;
  expect(allowed).not.toHaveBeenCalled();
  watch.close();
});
