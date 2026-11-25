export type PressMotionPreset = "card" | "control" | "icon" | "row" | "inline";

export type PressMotionSpring = {
  damping: number;
  stiffness: number;
  mass: number;
};

export type PressMotionSpec = {
  pressedScale: number;
  pressedOpacity: number;
  inDurationMs: number;
  outDurationMs: number;
  spring?: PressMotionSpring;
};

export const PRESS_MOTION_PRESETS: Readonly<Record<PressMotionPreset, PressMotionSpec>> = {
  card: {
    pressedScale: 0.978,
    pressedOpacity: 0.94,
    inDurationMs: 110,
    outDurationMs: 180,
    spring: { damping: 22, stiffness: 360, mass: 0.7 },
  },
  control: {
    pressedScale: 0.955,
    pressedOpacity: 0.84,
    inDurationMs: 90,
    outDurationMs: 160,
    spring: { damping: 20, stiffness: 420, mass: 0.65 },
  },
  icon: {
    pressedScale: 0.9,
    pressedOpacity: 0.74,
    inDurationMs: 80,
    outDurationMs: 150,
    spring: { damping: 18, stiffness: 460, mass: 0.55 },
  },
  row: {
    pressedScale: 1,
    pressedOpacity: 0.72,
    inDurationMs: 80,
    outDurationMs: 170,
  },
  inline: {
    pressedScale: 0.98,
    pressedOpacity: 0.68,
    inDurationMs: 80,
    outDurationMs: 150,
  },
};

export type ResolvedPressMotion = {
  pressedScale: number;
  pressedOpacity: number;
  inDurationMs: number;
  outDurationMs: number;
  useSpring: boolean;
  spring?: PressMotionSpring;
};

/**
 * Resolves the concrete scale, opacity, and timing values for a press motion preset.
 * Honors system Reduce Motion by disabling scale transforms and spring bounce.
 */
export function resolvePressMotion(
  preset: PressMotionPreset,
  options?: {
    reducedMotion?: boolean;
    activeOpacity?: number;
    hasHighlight?: boolean;
  },
): ResolvedPressMotion {
  const spec = PRESS_MOTION_PRESETS[preset];
  const reducedMotion = Boolean(options?.reducedMotion);
  const hasHighlight = Boolean(options?.hasHighlight);
  const pressedOpacity =
    options?.activeOpacity ??
    (hasHighlight ? 1 : reducedMotion && preset === "card" ? 0.92 : spec.pressedOpacity);

  if (reducedMotion) {
    return {
      pressedScale: 1,
      pressedOpacity,
      inDurationMs: Math.min(spec.inDurationMs, 75),
      outDurationMs: Math.min(spec.outDurationMs, 110),
      useSpring: false,
    };
  }

  return {
    pressedScale: spec.pressedScale,
    pressedOpacity,
    inDurationMs: spec.inDurationMs,
    outDurationMs: spec.outDurationMs,
    useSpring: Boolean(spec.spring),
    spring: spec.spring,
  };
}
