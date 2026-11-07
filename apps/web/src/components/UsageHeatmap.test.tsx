// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { UsageHeatmap, usageDays } from "./UsageHeatmap";

afterEach(() => vi.unstubAllGlobals());

it("groups real records by UTC date and limits the window", () => {
  const records = [
    { createdAt: "2026-11-04T23:59:59Z" },
    { createdAt: "2026-11-05T00:00:01+08:00" },
    { createdAt: "2026-01-01T00:00:00Z" },
    { createdAt: "invalid" },
  ];
  const days = usageDays(records, new Date("2026-11-05T12:00:00Z"));
  expect(days).toHaveLength(84);
  expect(days.at(-2)).toEqual({ date: "2026-11-04", calls: 2 });
  expect(days.at(-1)).toEqual({ date: "2026-11-05", calls: 0 });
});

it("renders the contribution calendar and reports loading failures", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <UsageHeatmap records={[{ createdAt: new Date().toISOString() }]} status="success" />,
      ),
    );
    expect(container.querySelector('[role="grid"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="gridcell"]:not(:disabled)')).toHaveLength(84);
    expect(container.textContent).toContain("最近加载的 100 条记录");
    expect(container.querySelector('[aria-label="用量等级"]')).not.toBeNull();
    await act(async () => root.render(<UsageHeatmap status="error" />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("加载失败");
    await act(async () => root.render(<UsageHeatmap records={[]} status="success" />));
    expect(container.textContent).toContain("暂无模型调用记录");
  } finally {
    await act(async () => root.unmount());
  }
});
