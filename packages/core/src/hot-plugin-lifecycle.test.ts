import { describe, expect, it } from "vitest";
import type { HotPluginState } from "./hot-plugin-lifecycle.js";
import { decideHotPluginTransition, hotPluginAcceptsNewCalls } from "./hot-plugin-lifecycle.js";

describe("hot plugin lifecycle decisions", () => {
  it("requires health before calls and confirmed exit after draining", () => {
    expect(decideHotPluginTransition("stopped", { type: "start" })).toEqual({
      accepted: true,
      state: "starting",
    });
    expect(decideHotPluginTransition("starting", { type: "healthy" })).toEqual({
      accepted: true,
      state: "ready",
    });
    expect(decideHotPluginTransition("ready", { type: "disable" })).toEqual({
      accepted: true,
      state: "draining",
    });
    expect(decideHotPluginTransition("draining", { type: "drained", activeCalls: 0 })).toEqual({
      accepted: true,
      state: "stopping",
    });
    expect(decideHotPluginTransition("stopping", { type: "exit_confirmed" })).toEqual({
      accepted: true,
      state: "stopped",
    });
    const states: HotPluginState[] = [
      "stopped",
      "starting",
      "ready",
      "draining",
      "stopping",
      "failed",
    ];
    expect(states.filter(hotPluginAcceptsNewCalls)).toEqual(["ready"]);
  });

  it("does not treat active or invalid counts as drained", () => {
    for (const activeCalls of [1, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(decideHotPluginTransition("draining", { type: "drained", activeCalls })).toEqual({
        accepted: false,
        state: "draining",
        reason: "calls_in_flight",
      });
    }
  });

  it("does not infer exit from failure or allow restart before exit confirmation", () => {
    expect(decideHotPluginTransition("ready", { type: "failure" })).toEqual({
      accepted: true,
      state: "failed",
    });
    expect(decideHotPluginTransition("failed", { type: "start" })).toEqual({
      accepted: false,
      state: "failed",
      reason: "invalid_transition",
    });
    expect(decideHotPluginTransition("failed", { type: "exit_confirmed" })).toEqual({
      accepted: true,
      state: "stopped",
    });
    expect(decideHotPluginTransition("failed", { type: "stop_failed_instance" })).toEqual({
      accepted: true,
      state: "stopping",
    });
  });

  it("rejects stale or out-of-order events", () => {
    for (const state of ["stopped", "ready", "draining"] as const) {
      expect(decideHotPluginTransition(state, { type: "healthy" }).accepted).toBe(false);
      expect(decideHotPluginTransition(state, { type: "exit_confirmed" }).accepted).toBe(false);
    }
    expect(decideHotPluginTransition("starting", { type: "disable" }).accepted).toBe(false);
    expect(decideHotPluginTransition("ready", { type: "drained", activeCalls: 0 }).accepted).toBe(
      false,
    );
  });
});
