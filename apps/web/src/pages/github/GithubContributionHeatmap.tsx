import { useLingui } from "@lingui/react/macro";
import type {
  GithubContributionCalendar,
  GithubContributionDay,
  GithubContributionLevel,
  GithubContributionWeek,
} from "@rakazo/contracts";
import { Button, RollingNumber } from "@rakazo/ui-web";
import { CircleDot, Flame, GitCommitHorizontal, GitPullRequest, Trophy } from "lucide-react";
import { useMemo, useState } from "react";

const WEEKDAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function contributionIntensityLevel(level: GithubContributionLevel): 0 | 1 | 2 | 3 | 4 {
  switch (level) {
    case "NONE":
      return 0;
    case "FIRST_QUARTILE":
      return 1;
    case "SECOND_QUARTILE":
      return 2;
    case "THIRD_QUARTILE":
      return 3;
    case "FOURTH_QUARTILE":
      return 4;
  }
}

function contributionCellColor(level: 0 | 1 | 2 | 3 | 4): string {
  return `color-mix(in oklab, var(--primary) ${level === 0 ? 7 : 20 + level * 20}%, var(--background))`;
}

function monthLabelsForWeeks(weeks: readonly GithubContributionWeek[], isZh: boolean) {
  const formatter = new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {
    month: "short",
    timeZone: "UTC",
  });

  const nextWeekStartsMonth =
    weeks.length > 1 && weeks[1]?.contributionDays.some((day) => day.date.endsWith("-01"));

  const labels: Array<{ label: string; column: number }> = [];
  let lastColumn = -4;

  weeks.forEach((week, column) => {
    const firstOfMonth = week.contributionDays.find((day) => day.date.endsWith("-01"));
    const targetDay =
      firstOfMonth ?? (column === 0 && !nextWeekStartsMonth ? week.contributionDays[0] : undefined);
    if (!targetDay) return;
    if (column - lastColumn < 2 && column !== 0) return;

    const date = new Date(`${targetDay.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return;
    labels.push({
      label: formatter.format(date),
      column,
    });
    lastColumn = column;
  });

  return labels;
}

export interface GithubContributionHeatmapProps {
  calendar?: GithubContributionCalendar | null;
  status: "loading" | "error" | "success";
  selectedYear?: number;
  errorMessage?: string | null;
  onSelectYear: (year: number | undefined) => void;
  onRetry?: () => void;
}

export function GithubContributionHeatmap({
  calendar,
  status,
  selectedYear,
  errorMessage,
  onSelectYear,
  onRetry,
}: GithubContributionHeatmapProps) {
  const { i18n } = useLingui();
  const isZh = (i18n?.locale ?? "zh").startsWith("zh");
  const text = (chinese: string, english: string) => (isZh ? chinese : english);

  const [selected, setSelected] = useState<{
    day: GithubContributionDay;
    weekIndex: number;
    row: number;
  } | null>(null);

  const activeYear: number | null =
    selectedYear !== undefined ? selectedYear : (calendar?.year ?? null);

  const weeks = calendar?.weeks ?? [];
  const labels = useMemo(() => monthLabelsForWeeks(weeks, isZh), [weeks, isZh]);
  const weekdays = isZh ? WEEKDAYS_ZH : WEEKDAYS_EN;

  const gridCells = useMemo(() => {
    const items: Array<{
      key: string;
      day: GithubContributionDay | undefined;
      weekIndex: number;
      row: number;
    }> = [];

    weeks.forEach((week, weekIndex) => {
      const byWeekday = new Map<number, GithubContributionDay>();
      for (const day of week.contributionDays) {
        byWeekday.set(day.weekday, day);
      }
      for (let row = 0; row < 7; row += 1) {
        const day = byWeekday.get(row);
        items.push({
          key: day?.date ?? `pad-${weekIndex}-${row}`,
          day,
          weekIndex,
          row,
        });
      }
    });

    return items;
  }, [weeks]);

  const selectedStyle = selected
    ? {
        left: `${28 + 8 + selected.weekIndex * 15 + 6}px`,
        top: `${24 + selected.row * 16}px`,
      }
    : undefined;

  return (
    <section
      data-testid="github-contribution-heatmap"
      aria-label={text("GitHub 贡献热力图", "GitHub contribution heatmap")}
      className="relative grid min-w-0 gap-4 rounded-2xl border border-border bg-background p-4 sm:p-5"
      onMouseLeave={() => setSelected(null)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setSelected(null);
      }}
    >
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="m-0 flex min-w-0 flex-wrap items-baseline gap-1.5 text-sm text-muted-foreground">
            {calendar ? (
              <>
                <strong
                  data-testid="heatmap-total-contributions"
                  className="text-lg font-semibold tabular-nums text-foreground"
                >
                  <RollingNumber value={calendar.totalContributions} />
                </strong>
                <span>
                  {activeYear === null
                    ? text("次贡献 · 过去一年", "contributions in the last year")
                    : text(`次贡献 · ${activeYear} 年`, `contributions in ${activeYear}`)}
                </span>
              </>
            ) : (
              <span className="font-medium text-foreground">
                {text("贡献活跃度", "Contribution activity")}
              </span>
            )}
          </p>
          {calendar && calendar.restrictedContributionsCount > 0 ? (
            <p data-testid="heatmap-restricted-note" className="m-0 text-xs text-muted-foreground">
              {text(
                `含 ${calendar.restrictedContributionsCount} 次私有仓库贡献`,
                `Includes ${calendar.restrictedContributionsCount} private contributions`,
              )}
            </p>
          ) : null}
        </div>

        {calendar ? (
          <fieldset
            aria-label={text("选择贡献年份", "Select contribution year")}
            className="m-0 flex flex-wrap items-center gap-1.5 border-0 p-0"
          >
            <button
              type="button"
              aria-pressed={activeYear === null}
              onClick={() => {
                setSelected(null);
                onSelectYear(undefined);
              }}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                activeYear === null
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {text("过去一年", "Past year")}
            </button>
            {calendar.availableYears.map((yr) => (
              <button
                key={yr}
                type="button"
                aria-pressed={activeYear === yr}
                onClick={() => {
                  setSelected(null);
                  onSelectYear(yr);
                }}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                  activeYear === yr
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {yr}
              </button>
            ))}
          </fieldset>
        ) : null}
      </header>

      {calendar ? (
        <div data-testid="heatmap-stats-strip" className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
            <GitCommitHorizontal
              size={15}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{text("Commits", "Commits")}</div>
              <div className="text-sm font-semibold tabular-nums text-foreground">
                {calendar.totalCommitContributions}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
            <GitPullRequest
              size={15}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{text("PRs", "PRs")}</div>
              <div className="text-sm font-semibold tabular-nums text-foreground">
                {calendar.totalPullRequestContributions}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
            <CircleDot size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{text("Issues", "Issues")}</div>
              <div className="text-sm font-semibold tabular-nums text-foreground">
                {calendar.totalIssueContributions}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
            <Flame size={15} className="shrink-0 text-amber-500" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">
                {text("当前连续", "Current streak")}
              </div>
              <div
                data-testid="heatmap-current-streak"
                className="text-sm font-semibold tabular-nums text-foreground"
              >
                {text(`${calendar.currentStreakDays} 天`, `${calendar.currentStreakDays} d`)}
              </div>
            </div>
          </div>
          <div className="col-span-2 flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 sm:col-span-1">
            <Trophy size={15} className="shrink-0 text-emerald-500" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">
                {text("最长连续", "Longest streak")}
              </div>
              <div
                data-testid="heatmap-longest-streak"
                className="text-sm font-semibold tabular-nums text-foreground"
              >
                {text(`${calendar.longestStreakDays} 天`, `${calendar.longestStreakDays} d`)}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {status === "loading" ? (
        <p className="m-0 py-6 text-sm text-muted-foreground" role="status">
          {text("正在加载 GitHub 贡献日历…", "Loading GitHub contribution calendar…")}
        </p>
      ) : status === "error" ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3"
          role="alert"
        >
          <p className="m-0 text-sm text-destructive">
            {errorMessage ||
              text("贡献热力图加载失败，请稍后重试。", "Could not load contribution heatmap.")}
          </p>
          {onRetry ? (
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              {text("重试", "Retry")}
            </Button>
          ) : null}
        </div>
      ) : !calendar || weeks.length === 0 ? (
        <p className="m-0 py-4 text-sm text-muted-foreground">
          {text("暂无贡献日历数据。", "No contribution calendar data available.")}
        </p>
      ) : (
        <>
          <div className="relative min-w-0">
            <div className="overflow-x-auto pb-1">
              <div className="grid min-w-[680px] grid-cols-[28px_auto] gap-x-2 gap-y-2">
                <div />
                <div className="relative h-4 text-xs text-muted-foreground">
                  {labels.map((item) => (
                    <span
                      key={`${item.label}-${item.column}`}
                      className="absolute whitespace-nowrap"
                      style={{ left: `calc(${item.column} * 15px)` }}
                    >
                      {item.label}
                    </span>
                  ))}
                </div>
                <div className="grid grid-rows-7 gap-1 text-[10px] leading-3 text-muted-foreground">
                  {weekdays.map((day, index) => (
                    <span key={day} className={index % 2 === 1 ? "" : "invisible"}>
                      {day}
                    </span>
                  ))}
                </div>
                <div
                  data-testid="heatmap-week-grid"
                  data-weeks={weeks.length}
                  className="grid grid-flow-col grid-rows-7 gap-1"
                  style={{ gridTemplateColumns: `repeat(${weeks.length}, 12px)` }}
                >
                  {gridCells.map(({ key, day, weekIndex, row }) => {
                    const level = day
                      ? contributionIntensityLevel(day.contributionLevel)
                      : undefined;
                    const dayLabel = day
                      ? text(
                          `${day.date}，${day.contributionCount} 次贡献`,
                          `${day.date}, ${day.contributionCount} contributions`,
                        )
                      : undefined;
                    return (
                      <button
                        key={key}
                        type="button"
                        tabIndex={day ? 0 : -1}
                        disabled={!day}
                        aria-label={dayLabel}
                        title={
                          day
                            ? text(
                                `${day.date}：${day.contributionCount} 次贡献`,
                                `${day.date}: ${day.contributionCount} contributions`,
                              )
                            : undefined
                        }
                        onFocus={() => day && setSelected({ day, weekIndex, row })}
                        onMouseEnter={() => day && setSelected({ day, weekIndex, row })}
                        onClick={() => day && setSelected({ day, weekIndex, row })}
                        className="size-3 rounded-[3px] border-0 outline-offset-2 transition-[background-color,transform] duration-150 focus-visible:z-10 focus-visible:scale-125 focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none motion-reduce:transition-none"
                        data-date={day?.date}
                        data-level={level}
                        data-selected={selected?.day.date === day?.date && day ? "true" : undefined}
                        style={{
                          backgroundColor:
                            level !== undefined ? contributionCellColor(level) : "transparent",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {selected ? (
              <div
                data-testid="heatmap-tooltip"
                aria-hidden="true"
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-background/15 bg-foreground px-3 py-1.5 text-background shadow-lg"
                style={selectedStyle}
              >
                <p className="m-0 whitespace-nowrap text-sm font-medium tabular-nums leading-[1.3]">
                  {text(
                    `${selected.day.contributionCount} 次贡献`,
                    `${selected.day.contributionCount} contributions`,
                  )}
                </p>
                <p className="m-0 whitespace-nowrap text-xs leading-[1.35] text-background/70">
                  {selected.day.date}
                </p>
              </div>
            ) : null}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span aria-live="polite" data-testid="heatmap-selection-readout">
              {selected
                ? text(
                    `${selected.day.date}：${selected.day.contributionCount} 次贡献`,
                    `${selected.day.date}: ${selected.day.contributionCount} contributions`,
                  )
                : text(
                    "悬停或聚焦方格查看每日贡献详情",
                    "Hover or focus a square to inspect daily contributions",
                  )}
            </span>
            <span className="flex items-center gap-1.5" data-testid="heatmap-legend">
              <span className="sr-only">{text("贡献活跃度等级", "Contribution intensity")}</span>
              {text("少", "Less")}
              {([0, 1, 2, 3, 4] as const).map((level) => (
                <i
                  key={level}
                  aria-hidden="true"
                  data-legend-level={level}
                  className="size-3 rounded-[3px]"
                  style={{
                    backgroundColor: contributionCellColor(level),
                  }}
                />
              ))}
              {text("多", "More")}
            </span>
          </footer>
        </>
      )}
    </section>
  );
}
