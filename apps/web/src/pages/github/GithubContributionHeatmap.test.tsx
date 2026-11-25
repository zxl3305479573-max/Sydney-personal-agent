// @vitest-environment jsdom

import type {
  GithubContributionCalendar,
  GithubContributionLevel,
  GithubContributionWeek,
} from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { contributionIntensityLevel, GithubContributionHeatmap } from "./GithubContributionHeatmap";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    i18n: { locale: "zh-CN" },
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((acc, part, idx) => acc + part + (values[idx] ?? ""), ""),
  }),
  Trans: ({ children }: { children?: ReactNode }) => children,
}));

const LEVELS: GithubContributionLevel[] = [
  "NONE",
  "FIRST_QUARTILE",
  "SECOND_QUARTILE",
  "THIRD_QUARTILE",
  "FOURTH_QUARTILE",
];

function buildSample53WeekCalendar(year: number | null = null): GithubContributionCalendar {
  const start = Date.UTC(2025, 10, 16); // Sunday 2025-11-16
  const dayMs = 86_400_000;
  const weeks: GithubContributionWeek[] = Array.from({ length: 53 }, (_, weekIdx) => ({
    contributionDays: Array.from({ length: 7 }, (__, weekday) => {
      const index = weekIdx * 7 + weekday;
      const date = new Date(start + index * dayMs).toISOString().slice(0, 10);
      const level = LEVELS[index % LEVELS.length]!;
      const count = level === "NONE" ? 0 : (index % 5) * 3;
      return {
        date,
        contributionCount: count,
        contributionLevel: level,
        weekday,
      };
    }),
  }));

  return {
    year,
    from: "2025-11-16T00:00:00.000Z",
    to: "2026-11-21T23:59:59.000Z",
    availableYears: [2026, 2025, 2024],
    totalContributions: 1284,
    totalCommitContributions: 980,
    totalPullRequestContributions: 192,
    totalIssueContributions: 64,
    totalPullRequestReviewContributions: 48,
    restrictedContributionsCount: 37,
    currentStreakDays: 14,
    longestStreakDays: 42,
    weeks,
  };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("maps all 5 GitHub contribution levels to intensity 0..4", () => {
  expect(contributionIntensityLevel("NONE")).toBe(0);
  expect(contributionIntensityLevel("FIRST_QUARTILE")).toBe(1);
  expect(contributionIntensityLevel("SECOND_QUARTILE")).toBe(2);
  expect(contributionIntensityLevel("THIRD_QUARTILE")).toBe(3);
  expect(contributionIntensityLevel("FOURTH_QUARTILE")).toBe(4);
});

it("renders 53 weeks, intensity levels 0..4, summary stats, tooltip/readout, and year switching", async () => {
  const onSelectYear = vi.fn();
  const calendar = buildSample53WeekCalendar(null);

  await act(async () => {
    root.render(
      <GithubContributionHeatmap
        calendar={calendar}
        status="success"
        onSelectYear={onSelectYear}
      />,
    );
  });

  const grid = container.querySelector('[data-testid="heatmap-week-grid"]');
  expect(grid?.getAttribute("data-weeks")).toBe("53");

  const dayCells = [...container.querySelectorAll<HTMLButtonElement>("button[data-date]")];
  expect(dayCells).toHaveLength(53 * 7);

  const renderedLevels = new Set(dayCells.map((btn) => btn.getAttribute("data-level")));
  expect(renderedLevels).toEqual(new Set(["0", "1", "2", "3", "4"]));

  // Verify stats strip & restricted private contribution note
  expect(
    container.querySelector('[data-testid="heatmap-total-contributions"]')?.textContent,
  ).toContain("1,284");
  const statsStrip =
    container.querySelector('[data-testid="heatmap-stats-strip"]')?.textContent ?? "";
  expect(statsStrip).toContain("980");
  expect(statsStrip).toContain("192");
  expect(statsStrip).toContain("64");
  expect(container.querySelector('[data-testid="heatmap-current-streak"]')?.textContent).toContain(
    "14 天",
  );
  expect(container.querySelector('[data-testid="heatmap-longest-streak"]')?.textContent).toContain(
    "42 天",
  );
  expect(container.querySelector('[data-testid="heatmap-restricted-note"]')?.textContent).toContain(
    "含 37 次私有仓库贡献",
  );

  // Focus a day cell -> updates aria-live readout and renders tooltip
  const targetCell = dayCells[2]!; // index 2 -> SECOND_QUARTILE, count 6
  await act(async () => {
    targetCell.focus();
  });
  expect(targetCell.getAttribute("data-selected")).toBe("true");
  expect(container.querySelector('[data-testid="heatmap-tooltip"]')?.textContent).toContain(
    "6 次贡献",
  );
  expect(
    container.querySelector('[data-testid="heatmap-selection-readout"]')?.textContent,
  ).toContain(`${targetCell.getAttribute("data-date")}：6 次贡献`);

  // Year switching callbacks
  const year2025Btn = [...container.querySelectorAll("button")].find(
    (btn) => btn.textContent === "2025",
  );
  expect(year2025Btn).toBeDefined();
  await act(async () => {
    year2025Btn!.click();
  });
  expect(onSelectYear).toHaveBeenCalledWith(2025);

  await act(async () => {
    root.render(
      <GithubContributionHeatmap
        calendar={buildSample53WeekCalendar(2025)}
        selectedYear={2025}
        status="success"
        onSelectYear={onSelectYear}
      />,
    );
  });

  const pastYearBtn = [...container.querySelectorAll("button")].find(
    (btn) => btn.textContent === "过去一年",
  );
  expect(pastYearBtn?.getAttribute("aria-pressed")).toBe("false");
  await act(async () => {
    pastYearBtn!.click();
  });
  expect(onSelectYear).toHaveBeenLastCalledWith(undefined);
});

it("renders loading and error retry states cleanly", async () => {
  const onRetry = vi.fn();

  await act(async () => {
    root.render(<GithubContributionHeatmap status="loading" onSelectYear={() => {}} />);
  });
  expect(container.querySelector('[role="status"]')?.textContent).toContain("正在加载");

  await act(async () => {
    root.render(
      <GithubContributionHeatmap
        status="error"
        errorMessage="GitHub GraphQL 超时"
        onSelectYear={() => {}}
        onRetry={onRetry}
      />,
    );
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("GitHub GraphQL 超时");
  const retryBtn = [...container.querySelectorAll("button")].find(
    (btn) => btn.textContent === "重试",
  )!;
  await act(async () => {
    retryBtn.click();
  });
  expect(onRetry).toHaveBeenCalledTimes(1);
});
