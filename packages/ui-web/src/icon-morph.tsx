"use client";

import {
  Bell,
  BellRing,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Heart,
  Menu,
  Moon,
  Pause,
  Play,
  Plus,
  Sun,
  X,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { cn } from "./lib/utils.js";

export type IconMorphName =
  | "menu"
  | "play"
  | "plus"
  | "copy"
  | "theme"
  | "chevron"
  | "bell"
  | "heart";

type SharedIconMorphProps = Omit<SVGProps<SVGSVGElement>, "ref" | "children"> & {
  name: IconMorphName;
  state?: boolean;
  size?: number;
  strokeWidth?: number;
  turn?: number;
  pointing?: "down" | "right";
};

export type IconMorphProps = SharedIconMorphProps;

type PairProps = Omit<SharedIconMorphProps, "name" | "pointing">;

const pairs: Record<
  IconMorphName,
  [ComponentType<SVGProps<SVGSVGElement>>, ComponentType<SVGProps<SVGSVGElement>>]
> = {
  menu: [Menu, X],
  play: [Play, Pause],
  plus: [Plus, Check],
  copy: [Copy, Check],
  theme: [Sun, Moon],
  chevron: [ChevronDown, ChevronDown],
  bell: [Bell, BellRing],
  heart: [Heart, Heart],
};

function MorphPair({
  first: First,
  second: Second,
  state = false,
  size = 24,
  strokeWidth = 1.75,
  rotateSecond,
  className,
  style,
  ...props
}: PairProps & {
  first: ComponentType<SVGProps<SVGSVGElement>>;
  second: ComponentType<SVGProps<SVGSVGElement>>;
  rotateSecond?: number;
}) {
  const shared = {
    ...props,
    width: size,
    height: size,
    strokeWidth,
    "aria-hidden": true,
    focusable: "false",
  } as const;
  return (
    <span
      data-slot="icon-morph"
      data-state={state ? "on" : "off"}
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <First
        {...shared}
        style={style}
        className={cn(
          "lucide col-start-1 row-start-1 transition-all duration-200 ease-out motion-reduce:transition-none",
          state ? "scale-75 opacity-0 -rotate-90" : "scale-100 opacity-100 rotate-0",
        )}
      />
      <Second
        {...shared}
        style={
          state && rotateSecond !== undefined
            ? { ...(style ?? {}), rotate: `${rotateSecond}deg` }
            : style
        }
        className={cn(
          "lucide col-start-1 row-start-1 transition-all duration-200 ease-out motion-reduce:transition-none",
          state ? "scale-100 opacity-100 rotate-0" : "scale-75 opacity-0 rotate-90",
        )}
      />
    </span>
  );
}

export function IconMorph({ name, pointing = "down", turn = 180, ...props }: IconMorphProps) {
  const [First, Second] = pairs[name];
  const first = name === "chevron" && pointing === "right" ? ChevronRight : First;
  return (
    <MorphPair
      first={first}
      second={Second}
      rotateSecond={name === "chevron" ? turn : undefined}
      {...props}
    />
  );
}

export function MenuIcon(props: PairProps) {
  return <MorphPair first={Menu} second={X} {...props} />;
}

export function PlayPauseIcon(props: PairProps) {
  return <MorphPair first={Play} second={Pause} {...props} />;
}

export function PlusCheckIcon(props: PairProps) {
  return <MorphPair first={Plus} second={Check} {...props} />;
}

export function CopyCheckIcon(props: PairProps) {
  return <MorphPair first={Copy} second={Check} {...props} />;
}

export function SunMoonIcon(props: PairProps) {
  return <MorphPair first={Sun} second={Moon} {...props} />;
}

export function ChevronIcon({
  pointing = "down",
  turn = 180,
  ...props
}: PairProps & { pointing?: "down" | "right" }) {
  return (
    <MorphPair
      first={pointing === "right" ? ChevronRight : ChevronDown}
      second={pointing === "right" ? ChevronRight : ChevronDown}
      rotateSecond={turn}
      {...props}
    />
  );
}

export function BellIcon(props: PairProps) {
  return <MorphPair first={Bell} second={BellRing} {...props} />;
}

export function HeartIcon(props: PairProps) {
  return <MorphPair first={Heart} second={Heart} {...props} />;
}
