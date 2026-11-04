import { expect, it } from "vitest";
import { HotPluginPilot } from "./hot-plugin-pilot.js";

async function waitForStopped(pilot: HotPluginPilot): Promise<void> {
  await vi.waitFor(() => expect(pilot.getState()).toBe("stopped"), { timeout: 3000 });
}

import { vi } from "vitest";

it("starts a fixed child, extracts headings and restarts after stopping", async () => {
  const pilot = new HotPluginPilot();
  await pilot.start();
  expect(pilot.getState()).toBe("ready");
  expect(await pilot.extractHeadings("# First\nbody\n## Second")).toEqual(["First", "Second"]);
  await pilot.stop();
  expect(pilot.getState()).toBe("stopped");
  await pilot.start();
  await pilot.stop();
  expect(pilot.getState()).toBe("stopped");
});

it("drains an active request and rejects new ones while stopping", async () => {
  const pilot = new HotPluginPilot("slow");
  await pilot.start();
  const active = pilot.extractHeadings("# In flight");
  const stopping = pilot.stop();
  expect(pilot.getState()).toBe("draining");
  await expect(pilot.extractHeadings("# Blocked")).rejects.toThrow("not ready");
  await expect(active).resolves.toEqual(["In flight"]);
  await stopping;
  expect(pilot.getState()).toBe("stopped");
});

it("contains a child crash and leaves another pilot responsive", async () => {
  const broken = new HotPluginPilot("crash");
  const healthy = new HotPluginPilot();
  await Promise.all([broken.start(), healthy.start()]);
  await expect(broken.extractHeadings("# crash")).rejects.toThrow();
  await waitForStopped(broken);
  await expect(healthy.extractHeadings("# healthy")).resolves.toEqual(["healthy"]);
  await healthy.stop();
});

it("times out a stalled call and confirms child exit", async () => {
  const pilot = new HotPluginPilot("hang", 500);
  await pilot.start();
  await expect(pilot.extractHeadings("# stalled")).rejects.toThrow("timed out");
  await waitForStopped(pilot);
});

it("times out a missing handshake without becoming ready", async () => {
  const pilot = new HotPluginPilot("no-handshake", 500);
  await expect(pilot.start()).rejects.toThrow("timed out");
  await waitForStopped(pilot);
});

it("rejects incompatible protocol versions and oversized responses", async () => {
  const incompatible = new HotPluginPilot("bad-version");
  await expect(incompatible.start()).rejects.toThrow("Invalid pilot response");
  await waitForStopped(incompatible);
  const oversized = new HotPluginPilot("big-output");
  await oversized.start();
  await expect(oversized.extractHeadings("# request")).rejects.toThrow("too large");
  await waitForStopped(oversized);
});

it("finishes stopping when an in-flight request times out", async () => {
  const pilot = new HotPluginPilot("hang", 500);
  await pilot.start();
  const active = pilot.extractHeadings("# stalled");
  const stopping = pilot.stop();
  await expect(active).rejects.toThrow("timed out");
  await stopping;
  expect(pilot.getState()).toBe("stopped");
});

it("rejects concurrent calls and oversized input", async () => {
  const pilot = new HotPluginPilot("slow");
  await pilot.start();
  const active = pilot.extractHeadings("# one");
  await expect(pilot.extractHeadings("# two")).rejects.toThrow("active request");
  await active;
  await expect(pilot.extractHeadings("x".repeat(16 * 1024 + 1))).rejects.toThrow("too large");
  await pilot.stop();
});
