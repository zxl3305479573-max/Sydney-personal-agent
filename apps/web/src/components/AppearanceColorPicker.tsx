import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@rakazo/ui-web";
import { Check, Pipette, Plus } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import {
  CHECKERBOARD,
  HEX,
  HEX_EXAMPLE,
  HUE_GRADIENT,
  PRESETS,
  SATURATION_BACKGROUND,
} from "./appearance-palette";

type Hsva = { h: number; s: number; v: number };
type Format = "hex" | "rgb" | "hsl";
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function hexToHsva(value: string): Hsva {
  const hex = HEX.test(value) ? value.slice(1) : "000000";
  const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvChannel(h: number, s: number, v: number, offset: number): number {
  const k = (offset + h / 60) % 6;
  return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
}

function hsvaToHex({ h, s, v }: Hsva): string {
  const rgb = [5, 3, 1].map((offset) =>
    Math.round(hsvChannel(h, s, v, offset) * 255)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${rgb.join("")}`;
}

function colorToFormat(value: string, format: Format): string {
  if (format === "hex") return value.toUpperCase();
  const { h, s, v } = hexToHsva(value);
  const rgb = [5, 3, 1].map((offset) => Math.round(hsvChannel(h, s, v, offset) * 255));
  if (format === "rgb") return `rgb(${rgb.join(", ")})`;
  const lightness = v * (1 - s / 2);
  const saturation =
    lightness === 0 || lightness === 1 ? 0 : (v - lightness) / Math.min(lightness, 1 - lightness);
  return `hsl(${Math.round(h)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%)`;
}

export function colorContrast(first: string, second: string): number {
  function luminance(hex: string) {
    const channels = [1, 3, 5].map((index) => {
      const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
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
  const [hsva, setHsva] = useState(() => hexToHsva(value));
  const [format, setFormat] = useState<Format>("hex");
  const [swatches, setSwatches] = useState<string[]>([]);
  const errorId = useId();
  const invalid = !HEX.test(draft);
  const contrast =
    contrastWith && HEX.test(contrastWith) ? colorContrast(value, contrastWith) : null;
  const eyedropper =
    typeof window === "undefined" ? undefined : (window as EyeDropperWindow).EyeDropper;
  const hueColor = hsvaToHex({ h: hsva.h, s: 1, v: 1 });

  useEffect(() => {
    setDraft(value.toUpperCase());
    setHsva(hexToHsva(value));
  }, [value]);

  const displayValue = useMemo(() => colorToFormat(value, format), [format, value]);

  function commit(next: Hsva) {
    setHsva(next);
    const hex = hsvaToHex(next);
    setDraft(hex.toUpperCase());
    onChange(hex);
  }

  function pointToValue(event: ReactPointerEvent<HTMLDivElement>, kind: "area" | "hue") {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    if (kind === "area") commit({ ...hsva, s: x, v: 1 - y });
    else commit({ ...hsva, h: x * 360 });
  }

  function select(color: string) {
    const next = color.toLowerCase();
    setDraft(next.toUpperCase());
    setHsva(hexToHsva(next));
    onChange(next);
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) {
          setDraft(value.toUpperCase());
          setHsva(hexToHsva(value));
        }
      }}
    >
      <PopoverTrigger
        type="button"
        aria-label={`${label}：${value.toUpperCase()}`}
        className="flex h-11 items-center gap-2.5 rounded-full border border-border bg-background px-1.5 pe-4 text-sm shadow-sm transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
      >
        <span
          aria-hidden="true"
          className="relative size-8 overflow-hidden rounded-full border border-foreground/15"
          style={{ background: CHECKERBOARD }}
        >
          <span className="absolute inset-0" style={{ backgroundColor: value }} />
        </span>
        <span className="grid min-w-0 text-start leading-tight">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="font-mono text-sm font-medium tabular-nums">{value.toUpperCase()}</span>
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        collisionAvoidance={{ side: "none", align: "shift", fallbackAxisSide: "none" }}
        className="w-[min(19rem,calc(100vw-2rem))] gap-3 overflow-y-auto rounded-2xl p-3.5 motion-reduce:animate-none"
        style={{ maxHeight: "var(--available-height)" }}
      >
        <div className="flex items-center justify-between">
          <PopoverTitle>{label}</PopoverTitle>
          {eyedropper ? (
            <button
              type="button"
              aria-label={`${label}屏幕取色`}
              className="grid size-8 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
              onClick={() => {
                void new eyedropper()
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
        <div
          role="slider"
          tabIndex={0}
          aria-label={`${label}饱和度和明度`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsva.s * 100)}
          className="relative h-40 touch-none cursor-crosshair overflow-hidden rounded-2xl shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]"
          style={{
            background: `${SATURATION_BACKGROUND},${hueColor}`,
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pointToValue(event, "area");
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) pointToValue(event, "area");
          }}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_2px_8px_rgb(0_0_0/0.3),inset_0_0_0_1px_rgb(0_0_0/0.14)]"
            style={{
              left: `${hsva.s * 100}%`,
              top: `${(1 - hsva.v) * 100}%`,
              backgroundColor: value,
            }}
          />
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label={`${label}色相`}
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsva.h)}
          className="relative mx-2 h-3 cursor-pointer touch-none rounded-full"
          style={{ background: HUE_GRADIENT }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pointToValue(event, "hue");
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) pointToValue(event, "hue");
          }}
        >
          <span
            aria-hidden="true"
            className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_2px_8px_rgb(0_0_0/0.3),inset_0_0_0_1px_rgb(0_0_0/0.14)]"
            style={{
              left: `${(hsva.h / 360) * 100}%`,
              backgroundColor: hueColor,
            }}
          />
        </div>
        <div className="flex h-10 overflow-hidden rounded-xl border border-border bg-muted">
          <select
            aria-label={`${label}格式`}
            value={format}
            onChange={(event) => setFormat(event.target.value as Format)}
            className="border-e border-border bg-transparent px-2 text-xs font-medium text-muted-foreground outline-none"
          >
            <option value="hex">HEX</option>
            <option value="rgb">RGB</option>
            <option value="hsl">HSL</option>
          </select>
          <input
            aria-label={`${label} HEX`}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            value={format === "hex" ? draft : displayValue}
            maxLength={format === "hex" ? 7 : undefined}
            spellCheck={false}
            onChange={(event) => {
              const next = event.target.value.toUpperCase();
              setDraft(next);
              if (format === "hex" && HEX.test(next)) select(next);
            }}
            className="min-w-0 flex-1 bg-transparent px-3 font-mono text-sm text-foreground outline-none"
          />
        </div>
        {invalid ? (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            请输入六位 HEX 颜色，例如 {HEX_EXAMPLE}。
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <fieldset
            aria-label={`${label}预设颜色`}
            className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
          >
            {[...PRESETS, ...swatches].map((color, index) => (
              <button
                key={`${color}-${index}`}
                type="button"
                aria-label={`选择 ${color}`}
                aria-pressed={color.toLowerCase() === value.toLowerCase()}
                onClick={() => select(color)}
                className="size-6 rounded-full border border-foreground/20 focus-visible:outline-2 focus-visible:outline-ring aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-2 aria-pressed:ring-offset-background"
                style={{ backgroundColor: color }}
              >
                {color.toLowerCase() === value.toLowerCase() ? (
                  <Check className="m-auto size-3 text-white drop-shadow" aria-hidden="true" />
                ) : null}
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            aria-label={`保存${label}颜色`}
            className="grid size-7 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
            onClick={() =>
              setSwatches((current) =>
                [value, ...current.filter((color) => color !== value)].slice(0, 7),
              )
            }
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
        {contrast !== null ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            对比度 {contrast.toFixed(2)}:1 ·{" "}
            {contrast >= 4.5 ? "普通文字 AA" : "普通文字对比度偏低"}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
