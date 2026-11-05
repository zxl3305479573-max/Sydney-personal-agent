import { useMemo, useState } from "react";

export type UsageEvent = { createdAt: string };
type Day = { date: string; calls: number };

const DAY = 86_400_000;
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

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
    const date = new Date(end - (83 - index) * DAY).toISOString().slice(0, 10);
    return { date, calls: counts.get(date) ?? 0 };
  });
}

function levelFor(count: number, maximum: number): number {
  if (count === 0) return 0;
  if (count <= Math.max(1, Math.ceil(maximum * 0.25))) return 1;
  if (count <= Math.max(2, Math.ceil(maximum * 0.5))) return 2;
  if (count <= Math.max(3, Math.ceil(maximum * 0.75))) return 3;
  return 4;
}

function monthLabels(days: Day[], lead: number) {
  return days.flatMap((day, index) => {
    const date = new Date(`${day.date}T00:00:00Z`);
    if (date.getUTCDate() !== 1 && index !== 0) return [];
    return [
      {
        label: new Intl.DateTimeFormat("zh-CN", {
          month: "short",
          timeZone: "UTC",
        }).format(date),
        column: Math.floor((lead + index) / 7),
      },
    ];
  });
}

export function UsageHeatmap({
  records,
  status,
}: {
  records?: UsageEvent[];
  status: "loading" | "error" | "success";
}) {
  const [selected, setSelected] = useState<{
    day: Day;
    index: number;
  } | null>(null);
  const days = useMemo(() => usageDays(records ?? []), [records]);
  const maximum = Math.max(0, ...days.map((day) => day.calls));
  const total = days.reduce((sum, day) => sum + day.calls, 0);
  const lead = days[0]
    ? (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 7) % 7
    : 0;
  const weeks = Math.ceil((lead + days.length) / 7);
  const labels = monthLabels(days, lead);
  const cells = Array.from({ length: weeks * 7 }, (_, index) => {
    const day = days[index - lead];
    return { day, index };
  });
  const selectedColumn = selected
    ? Math.floor(selected.index / 7)
    : 0;
  const selectedRow = selected ? selected.index % 7 : 0;
  const selectedStyle = selected
    ? {
        left: `${24 + 8 + selectedColumn * 15 + 6}px`,
        top: `${24 + selectedRow * 16}px`,
      }
    : undefined;

  return (
    <section
      className="relative mt-4 grid min-w-0 gap-4 rounded-2xl border border-border bg-background p-4"
      aria-label="近期用量热力图"
    >
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <p className="m-0 flex min-w-0 flex-wrap items-baseline gap-1.5 text-sm text-muted-foreground">
          <strong className="font-medium tabular-nums text-foreground">
            {total}
          </strong>
          <span>次模型调用 · 最近 12 周</span>
        </p>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
          UTC 日期
        </span>
      </header>
      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        数据来自最近加载的 100 条记录，缺少的历史记录不会被补算。
      </p>
      {status === "loading" ? (
        <p className="text-sm text-muted-foreground" role="status">
          正在加载用量记录…
        </p>
      ) : status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          用量记录加载失败，请重新打开用量页面重试。
        </p>
      ) : records?.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无模型调用记录。</p>
      ) : (
        <>
          <div className="relative">
            <div className="overflow-x-auto pb-1">
              <div
                className="grid min-w-[480px] grid-cols-[24px_auto] gap-x-2 gap-y-2"
                role="grid"
                aria-label="按日期查看模型调用次数"
              >
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
                  {WEEKDAYS.map((day, index) => (
                    <span
                      key={day}
                      className={index % 2 === 0 ? "" : "invisible"}
                    >
                      {day}
                    </span>
                  ))}
                </div>
                <div
                  className="grid grid-flow-col grid-rows-7 gap-1"
                  style={{ gridTemplateColumns: `repeat(${weeks}, 12px)` }}
                  onMouseLeave={() => setSelected(null)}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                      setSelected(null);
                  }}
                >
                  {cells.map(({ day, index }) => (
                    <button
                      key={day?.date ?? `empty-${index}`}
                      type="button"
                      role="gridcell"
                      tabIndex={day ? 0 : -1}
                      disabled={!day}
                      aria-label={
                        day ? `${day.date}，${day.calls} 次模型调用` : undefined
                      }
                      title={
                        day ? `${day.date}：${day.calls} 次模型调用` : undefined
                      }
                      onFocus={() => day && setSelected({ day, index })}
                      onMouseEnter={() => day && setSelected({ day, index })}
                      onClick={() => day && setSelected({ day, index })}
                      className="size-3 rounded-[3px] border-0 outline-offset-2 transition-[background-color,transform] duration-150 focus-visible:z-10 focus-visible:scale-125 focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none motion-reduce:transition-none"
                      data-level={day ? levelFor(day.calls, maximum) : undefined}
                      data-selected={
                        selected?.day.date === day?.date ? "true" : undefined
                      }
                      style={{
                        backgroundColor: day
                          ? `color-mix(in oklab, var(--primary) ${day.calls === 0 ? 7 : 20 + levelFor(day.calls, maximum) * 20}%, var(--background))`
                          : "transparent",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
            {selected ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-[var(--radius)] border border-background/15 bg-foreground px-3 py-1.5 text-background shadow-lg"
                style={selectedStyle}
              >
                <p className="m-0 whitespace-nowrap text-sm font-medium tabular-nums leading-[1.3]">
                  {selected.day.calls} 次模型调用
                </p>
                <p className="m-0 whitespace-nowrap text-xs leading-[1.35] text-background/70">
                  {selected.day.date}
                </p>
              </div>
            ) : null}
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span aria-live="polite">
              {selected
                ? `${selected.day.date}：${selected.day.calls} 次模型调用`
                : "悬停或选择方格查看日期"}
            </span>
            <span className="flex items-center gap-1.5" aria-label="用量等级">
              少
              {[0, 1, 2, 3, 4].map((level) => (
                <i
                  key={level}
                  aria-hidden="true"
                  className="size-3 rounded-[3px]"
                  style={{
                    backgroundColor: `color-mix(in oklab, var(--primary) ${level === 0 ? 7 : 20 + level * 20}%, var(--background))`,
                  }}
                />
              ))}
              多
            </span>
          </footer>
        </>
      )}
    </section>
  );
}
