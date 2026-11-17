import type { BotAvatarSet } from "@rakazo/contracts";
import type { BotColorDef, LogoAvatarActivity } from "@rakazo/core";
import {
  BOT_AVATAR_COLORS,
  BOT_COLOR_LIST,
  DEFAULT_BOT_AVATAR_COLOR,
  resolvePersonaColorDef,
  SHIPPED_BOT_AVATAR_CENTER,
  SHIPPED_BOT_AVATAR_SHAPE_KEYS,
  SHIPPED_BOT_AVATAR_SHAPES,
  SHIPPED_BOT_AVATAR_VIEWBOX,
  shippedBotAvatarShapePath,
} from "@rakazo/core";
import { memo, useMemo } from "react";
import { useBotAvatarActivity } from "./bot-avatar-activity.js";
import { cn } from "./lib/utils.js";
import "./styles.css";

export type { BotColorDef };
export { BOT_AVATAR_COLORS, BOT_COLOR_LIST, DEFAULT_BOT_AVATAR_COLOR, resolvePersonaColorDef };

export const BOT_SHAPES = SHIPPED_BOT_AVATAR_SHAPES;
export const SHIPPED_SHAPE_KEYS = SHIPPED_BOT_AVATAR_SHAPE_KEYS;
const VIEWBOX = SHIPPED_BOT_AVATAR_VIEWBOX;
const CENTER = SHIPPED_BOT_AVATAR_CENTER;

export const BOT_MASCOT_SHAPES = SHIPPED_SHAPE_KEYS.map(
  (k) => BOT_SHAPES[k] ?? FALLBACK_SHAPE_PATH,
);

const FALLBACK_SHAPE_PATH = BOT_SHAPES.hex ?? "";

export function parseBotAvatar(
  rawColor: string,
  _identity?: string,
): {
  color: string;
  shapeIndex?: number;
  isImage: boolean;
  imageUrl?: string;
} {
  if (!rawColor) return { color: "#F97316", isImage: false };
  const fluid = /^(#[0-9a-fA-F]{3,6})::fluid_#[0-9a-fA-F]{6}$/.exec(rawColor);
  if (fluid) return { color: fluid[1]!, isImage: false };
  if (rawColor.startsWith("data:image/")) {
    return { color: "#F97316", isImage: true, imageUrl: rawColor };
  }
  if (/^\/avatar-library\/[a-z0-9-]+\.webp$/.test(rawColor)) {
    return { color: "#F97316", isImage: true, imageUrl: rawColor };
  }
  if (rawColor.includes("::shape_")) {
    const parts = rawColor.split("::shape_");
    const rawShapeIdx = parts[1] ?? "0";
    const parsedShapeIdx = /^\d+$/.test(rawShapeIdx) ? Number(rawShapeIdx) : 0;
    const shapeIdx = Number.isSafeInteger(parsedShapeIdx) ? parsedShapeIdx : 0;
    return {
      color: parts[0] || "#F97316",
      shapeIndex: shapeIdx % SHIPPED_SHAPE_KEYS.length,
      isImage: false,
    };
  }
  return { color: rawColor, isImage: false };
}

const AVATAR_HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function defaultBotAvatarValue(rawColor: string): string {
  const parsed = parseBotAvatar(rawColor);
  if (rawColor && !parsed.isImage && AVATAR_HEX.test(parsed.color)) return parsed.color;
  return DEFAULT_BOT_AVATAR_COLOR;
}

export interface BotAvatarProps {
  color: string;
  avatarSet?: BotAvatarSet;
  size?: number;
  status?: string;
  identity?: string;
  className?: string;
  activity?: LogoAvatarActivity;
}

export const BotAvatar = memo(function BotAvatar({
  color,
  size = 36,
  status,
  identity = "",
  className,
  activity,
  avatarSet,
}: BotAvatarProps) {
  const parsed = useMemo(() => parseBotAvatar(color, identity), [color, identity]);
  const liveActivity = useBotAvatarActivity(
    identity,
    status,
    activity === undefined &&
      avatarSet === "rakazo" &&
      !parsed.isImage &&
      parsed.shapeIndex === undefined,
  );
  const renderedActivity = activity ?? liveActivity;
  const isWorking =
    renderedActivity !== "idle" && renderedActivity !== "error" && renderedActivity !== "waiting";
  const effectiveId = identity || parsed.color || "agent";
  const avatarColor = /::fluid_(#[0-9a-fA-F]{6})$/.exec(color)?.[1] ?? parsed.color;
  const variant = parsed.shapeIndex === undefined ? 0 : (parsed.shapeIndex + 1) % 5;
  const offset = (variant - 2) * 2;

  const colorDef = useMemo(
    () => resolvePersonaColorDef(effectiveId, avatarColor),
    [effectiveId, avatarColor],
  );

  if (parsed.isImage && parsed.imageUrl) {
    return (
      <div
        className={cn("rakazo-bot-avatar relative shrink-0 select-none", className)}
        data-working={isWorking}
        data-activity={renderedActivity}
        style={{ width: size, height: size }}
      >
        <div className="rakazo-bot-avatar-picture relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-transparent">
          <img src={parsed.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
        {isWorking ? (
          <svg
            className="rakazo-bot-avatar-ring rakazo-bot-avatar-ring-working absolute pointer-events-none"
            style={{
              inset: -4,
              width: size + 8,
              height: size + 8,
            }}
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="24"
              cy="24"
              r="22"
              className="stroke-status-working"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeDasharray="45 80"
            />
          </svg>
        ) : null}
      </div>
    );
  }

  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn("sydney-bot-avatar shrink-0 select-none", className)}
      data-working={isWorking}
      data-activity={renderedActivity}
      data-color={colorDef.hex}
      data-variant={variant}
      style={{ width: size, height: size, flex: "none" }}
    >
      <path
        d={
          parsed.shapeIndex === undefined
            ? `M32 ${5 + Math.abs(offset)} C46 ${4 + offset} 59 15 60 30 C61 46 48 59 32 60 C16 61 4 49 5 33 C6 18 18 ${6 + Math.abs(offset)} 32 ${5 + Math.abs(offset)} Z`
            : shippedBotAvatarShapePath(parsed.shapeIndex)
        }
        transform={parsed.shapeIndex === undefined ? undefined : "translate(4 4) scale(0.245)"}
        fill={colorDef.hex}
      />
      <g
        className="sydney-bot-avatar-eyes"
        fill={colorDef.eyeColor}
        transform={`rotate(${30 + offset} 32 32)`}
      >
        <rect x={21 + offset} y="19" width="7" height="17" rx="3.5" />
        <rect x={36 + offset} y="27" width="7" height="17" rx="3.5" />
      </g>
    </svg>
  );
});

export function BotShapePreview({
  shapeIndex,
  identity,
  label,
  color,
  selected,
  onClick,
}: {
  /** An Avatar Studio shape; omit it to draw the organic body `identity` gets. */
  shapeIndex?: number;
  identity?: string;
  label?: string;
  color: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const key =
    shapeIndex === undefined
      ? undefined
      : (SHIPPED_SHAPE_KEYS[shapeIndex % SHIPPED_SHAPE_KEYS.length] ?? "hex");
  const colorDef = resolvePersonaColorDef("preview", color);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? key}
      aria-pressed={selected ?? false}
      className={cn(
        "relative flex size-11 items-center justify-center rounded-xl transition-transform hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
        selected
          ? "ring-2 ring-primary ring-offset-2 ring-offset-popover bg-white/10"
          : "hover:bg-white/5",
      )}
    >
      {shapeIndex === undefined ? (
        <BotAvatar color={color} identity={identity} size={32} />
      ) : (
        <svg viewBox={VIEWBOX} className="size-8 overflow-visible" aria-hidden="true">
          <path d={shippedBotAvatarShapePath(shapeIndex)} fill={colorDef.light} />
          <g fill={colorDef.eyeColor}>
            <ellipse cx={CENTER - 29} cy={CENTER - 8} rx={10} ry={7} />
            <ellipse cx={CENTER + 29} cy={CENTER - 8} rx={10} ry={7} />
          </g>
        </svg>
      )}
    </button>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span aria-hidden="true" className="sydney-brand-mark h-11 w-11" />
      <span className="rk-script-type text-[28px] tracking-tight text-foreground">Sydney</span>
    </div>
  );
}
