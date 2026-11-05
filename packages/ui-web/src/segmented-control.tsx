"use client";

import * as React from "react";
import { cn } from "./lib/utils.js";

export type SegmentedControlOption = {
  value: string;
  label: string;
  accessory?: React.ReactNode;
};

export type SegmentedControlProps = {
  options: SegmentedControlOption[];
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  onOptionIntent?: (value: string) => void;
  className?: string;
};

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return reduced;
}

export function SegmentedControl({
  options,
  value,
  onValueChange,
  label,
  onOptionIntent,
  className,
}: SegmentedControlProps) {
  const reduced = useReducedMotion();
  const buttons = React.useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const layoutKey = options.map((option) => option.value).join("\u0000");
  const [pill, setPill] = React.useState({ left: 0, width: 0 });
  const [ready, setReady] = React.useState(false);

  React.useLayoutEffect(() => {
    const measure = () => {
      const selected = buttons.current[selectedIndex];
      if (!selected) return;
      const next = { left: selected.offsetLeft, width: selected.offsetWidth };
      setPill((current) =>
        current.left === next.left && current.width === next.width ? current : next,
      );
      setReady(true);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    for (const button of buttons.current) if (button) observer.observe(button);
    return () => observer.disconnect();
  }, [layoutKey, selectedIndex]);

  function select(index: number) {
    const option = options[index];
    if (!option) return;
    buttons.current[index]?.focus();
    onValueChange(option.value);
  }

  return (
    <fieldset
      aria-label={label}
      data-slot="segmented-control"
      className={cn(
        "relative inline-flex min-w-0 max-w-full items-center overflow-x-auto rounded-lg bg-muted p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === "Home") {
          event.preventDefault();
          select(0);
        } else if (event.key === "End") {
          event.preventDefault();
          select(options.length - 1);
        } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          select((selectedIndex + 1) % options.length);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          select((selectedIndex - 1 + options.length) % options.length);
        }
      }}
    >
      <span
        aria-hidden="true"
        data-slot="segmented-control-pill"
        className={cn(
          "pointer-events-none absolute top-1 bottom-1 rounded-md bg-background shadow-sm",
          !reduced && "transition-[left,width] duration-200 ease-out motion-reduce:transition-none",
        )}
        style={{
          left: pill.left,
          width: pill.width,
          opacity: ready && pill.width > 0 ? 1 : 0,
        }}
      />
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          type="button"
          data-slot="segmented-control-item"
          aria-pressed={option.value === value}
          tabIndex={index === selectedIndex ? 0 : -1}
          className="relative z-[1] inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] whitespace-nowrap text-muted-foreground transition-colors aria-pressed:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1 motion-reduce:transition-none"
          onClick={() => onValueChange(option.value)}
          onPointerEnter={() => onOptionIntent?.(option.value)}
          onFocus={() => onOptionIntent?.(option.value)}
        >
          {option.label}
          {option.accessory}
        </button>
      ))}
    </fieldset>
  );
}
