import { useMemo, useState } from "react";

export type UsageEvent = { createdAt: string };
type Day = { date: string; calls: number };

export function usageDays(records: UsageEvent[], now = new Date()): Day[] {
  const end = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const counts = new Map<string, number>();
  for (const record of records) {
    const date = new Date(record.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from({ length: 84 }, (_, index) => {
    const date = new Date(end - (83 - index) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return { date, calls: counts.get(date) ?? 0 };
  });
}

export function UsageHeatmap({
  records,
  status,
}: {
  records?: UsageEvent[];
  status: "loading" | "error" | "success";
}) {
  const [view, setView] = useState<"grid" | "curve">("grid");
  const [selected, setSelected] = useState<Day | null>(null);
  const days = useMemo(() => usageDays(records ?? []), [records]);
  const maximum = Math.max(0, ...days.map((day) => day.calls));
  const shownCalls = days.reduce((sum, day) => sum + day.calls, 0);
  const points = days
    .map(
      (day, index) =>
        `${(index / (days.length - 1)) * 100},${46 - (day.calls / Math.max(1, maximum)) * 40}`,
    )
    .join(" ");

  return (
    <section
      className="mt-4 rounded-xl border border-border p-4"
      aria-label="近期用量趋势"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-foreground">近期用量趋势</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            最近 12 周，按 UTC 日期统计已加载的模型调用；最多读取最近 100
            条记录，历史可能不完整。
          </p>
        </div>
        <div
          className="flex rounded-lg border border-border p-1"
          aria-label="图表视图"
        >
          <button
            type="button"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
            className={`rounded-md px-3 py-1 text-xs ${view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
          >
            热力图
          </button>
          <button
            type="button"
            aria-pressed={view === "curve"}
            onClick={() => setView("curve")}
            className={`rounded-md px-3 py-1 text-xs ${view === "curve" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
          >
            趋势曲线
          </button>
        </div>
      </div>
      {status === "loading" ? (
        <p className="mt-5 text-sm text-muted-foreground" role="status">
          正在加载用量记录…
        </p>
      ) : status === "error" ? (
        <p className="mt-5 text-sm text-destructive" role="alert">
          用量记录加载失败，请重新打开用量页面重试。
        </p>
      ) : records?.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">暂无模型调用记录。</p>
      ) : (
        <>
          <div className="mt-4 flex items-baseline gap-2">
            <strong className="text-2xl font-semibold tabular-nums">
              {shownCalls}
            </strong>
            <span className="text-xs text-muted-foreground">
              次已加载的调用
            </span>
          </div>
          {view === "grid" ? (
            <div className="mt-4 overflow-x-auto">
              <div
                className="grid min-w-[420px] grid-flow-col grid-rows-7 gap-1"
                role="group"
                aria-label="按日期查看已加载的调用次数"
              >
                {days.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    aria-label={`${day.date}，已加载 ${day.calls} 次调用`}
                    title={`${day.date}：${day.calls} 次已加载调用`}
                    onFocus={() => setSelected(day)}
                    onMouseEnter={() => setSelected(day)}
                    onClick={() => setSelected(day)}
                    className="h-4 min-w-4 rounded-[3px] bg-primary outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
                    style={{
                      opacity:
                        day.calls === 0
                          ? 0.1
                          : 0.25 + (day.calls / maximum) * 0.75,
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <svg
                viewBox="0 0 100 50"
                preserveAspectRatio="none"
                className="h-32 min-w-[420px] w-full overflow-visible"
                role="img"
                aria-label={`最近 12 周每日已加载调用次数趋势，最高 ${maximum} 次`}
              >
                <path
                  d="M0 46 H100"
                  fill="none"
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth="0.3"
                  vectorEffect="non-scaling-stroke"
                />
                <polyline
                  points={points}
                  fill="none"
                  stroke="currentColor"
                  className="text-primary"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          )}
          <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {days[0]?.date} — {days.at(-1)?.date}（UTC）
            </span>
            <span aria-live="polite">
              {selected
                ? `${selected.date}：${selected.calls} 次已加载调用`
                : "选择方格查看当天数据"}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
