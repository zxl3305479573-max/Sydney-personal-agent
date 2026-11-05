import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@rakazo/ui-web";
import { Pipette } from "lucide-react";
import { useEffect, useId, useState } from "react";

const PRESETS = [
  "#000000",
  "#FFFFFF",
  "#6B7280",
  "#EF4444",
  "#F59E0B",
  "#22C55E",
  "#3B82F6",
  "#A855F7",
];
const HEX = /^#[0-9a-f]{6}$/i;

export function colorContrast(first: string, second: string): number {
  function luminance(hex: string) {
    const channels = [1, 3, 5].map((index) => {
      const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return (
      0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
    );
  }
  const light = luminance(first);
  const dark = luminance(second);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

type EyeDropperWindow = Window & {
  EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
};

export function AppearanceColorPicker({
  label,
  value,
  onChange,
  contrastWith,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  contrastWith?: string;
}) {
  const [draft, setDraft] = useState(value.toUpperCase());
  const errorId = useId();
  useEffect(() => setDraft(value.toUpperCase()), [value]);
  const invalid = !HEX.test(draft);
  const contrast =
    contrastWith && HEX.test(contrastWith)
      ? colorContrast(value, contrastWith)
      : null;
  const EyeDropper =
    typeof window === "undefined"
      ? undefined
      : (window as EyeDropperWindow).EyeDropper;

  function select(color: string) {
    setDraft(color.toUpperCase());
    onChange(color.toLowerCase());
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) setDraft(value.toUpperCase());
      }}
    >
      <PopoverTrigger
        type="button"
        aria-label={`${label}：${value.toUpperCase()}`}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
      >
        <span
          aria-hidden="true"
          className="size-5 rounded border border-foreground/20"
          style={{ backgroundColor: value }}
        />
        <span>{label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {value.toUpperCase()}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(19rem,calc(100vw-2rem))] gap-3 p-4 motion-reduce:animate-none"
      >
        <PopoverTitle>{label}</PopoverTitle>
        <div className="flex items-center gap-3">
          <label className="flex flex-1 items-center gap-2 text-sm">
            选择颜色
            <input
              aria-label={`${label}选色`}
              type="color"
              value={value}
              onChange={(event) => select(event.target.value)}
              className="h-10 min-w-0 flex-1 cursor-pointer rounded border border-border bg-background"
            />
          </label>
          {EyeDropper ? (
            <button
              type="button"
              aria-label={`${label}屏幕取色`}
              className="rounded-md border border-border p-2 focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => {
                void new EyeDropper()
                  .open()
                  .then(({ sRGBHex }) => {
                    if (HEX.test(sRGBHex)) select(sRGBHex);
                  })
                  .catch(() => undefined);
              }}
            >
              <Pipette className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm">
          HEX
          <input
            aria-label={`${label} HEX`}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            value={draft}
            maxLength={7}
            spellCheck={false}
            onChange={(event) => {
              const next = event.target.value.toUpperCase();
              setDraft(next);
              if (HEX.test(next)) onChange(next.toLowerCase());
            }}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 font-mono text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-invalid:border-destructive"
          />
        </label>
        {invalid ? (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            请输入六位 HEX 颜色，例如 #000000。
          </p>
        ) : null}
        <div aria-label={`${label}预设颜色`} className="flex flex-wrap gap-2">
          {PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`选择 ${color}`}
              aria-pressed={color.toLowerCase() === value.toLowerCase()}
              onClick={() => select(color)}
              className="size-6 rounded-full border border-foreground/25 focus-visible:outline-2 focus-visible:outline-ring aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-2 aria-pressed:ring-offset-background"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        {contrast !== null ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            文字与纯色背景对比度 {contrast.toFixed(2)}:1{" "}
            {contrast >= 4.5 ? "（达到普通文字 AA）" : "（普通文字对比度偏低）"}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
