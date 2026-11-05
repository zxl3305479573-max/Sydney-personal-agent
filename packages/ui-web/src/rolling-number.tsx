import { useEffect, useState } from "react";
import { cn } from "./lib/utils.js";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const DIGIT_PATTERN = /[0-9]/;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return reduced;
}

/**
 * One digit column. Every digit sits in a single strip that slides to the current one, so a
 * changed total rolls the way an odometer does instead of swapping the glyph.
 *
 * The key of these columns is their position, never the digit: remounting would skip the roll.
 */
function RollingDigit({ digit, animate }: { digit: number; animate: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-block h-[1em] w-[1ch] overflow-hidden align-baseline"
    >
      <span
        className={cn(
          "absolute inset-x-0 top-0 flex flex-col",
          animate && "transition-transform duration-300 ease-out motion-reduce:transition-none",
        )}
        style={{ transform: `translateY(-${digit}em)` }}
      >
        {DIGITS.map((value) => (
          <span key={value} className="block h-[1em] leading-[1em] text-center tabular-nums">
            {value}
          </span>
        ))}
      </span>
    </span>
  );
}

export type RollingNumberProps = {
  value: number;
  className?: string;
  /** Fixed so server and client format the same way. */
  locale?: string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Spoken text when the formatted number alone is not the whole story. */
  label?: string;
};

/**
 * A total that gives a change a clear sense of movement. The rolling digits are hidden from
 * assistive tech; a hidden copy carries the full number, and changes are not announced.
 */
export function RollingNumber({
  value,
  className,
  locale = "en-US",
  decimals = 0,
  prefix = "",
  suffix = "",
  label,
}: RollingNumberProps) {
  const reduced = useReducedMotion();
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(value) ? value : 0);
  return (
    <span
      data-slot="rolling-number"
      className={cn("inline-flex items-baseline tabular-nums", className)}
    >
      <span className="sr-only">{label ?? `${prefix}${formatted}${suffix}`}</span>
      {prefix ? (
        <span aria-hidden="true" className="me-[0.1em]">
          {prefix}
        </span>
      ) : null}
      {Array.from(formatted).map((character, index) =>
        DIGIT_PATTERN.test(character) ? (
          <RollingDigit key={index} digit={Number(character)} animate={!reduced} />
        ) : (
          <span key={index} aria-hidden="true">
            {character}
          </span>
        ),
      )}
      {suffix ? (
        <span aria-hidden="true" className="ms-[0.1em]">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}
