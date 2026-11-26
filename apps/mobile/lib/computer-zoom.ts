export const COMPUTER_ZOOM_MIN = 1;
export const COMPUTER_ZOOM_MAX = 3;
export const COMPUTER_ZOOM_STEP = 0.25;
export const COMPUTER_ZOOM_DOUBLE_TAP = 2;

export type ComputerZoomViewport = {
  width: number;
  height: number;
};

export type ComputerZoomState = {
  scale: number;
  translateX: number;
  translateY: number;
};

export const INITIAL_COMPUTER_ZOOM: ComputerZoomState = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};

export function clampComputerZoomScale(scale: number): number {
  if (!Number.isFinite(scale)) return COMPUTER_ZOOM_MIN;
  const clamped = Math.min(COMPUTER_ZOOM_MAX, Math.max(COMPUTER_ZOOM_MIN, scale));
  return Math.round(clamped * 100) / 100;
}

export function clampComputerZoom(
  state: ComputerZoomState,
  viewport: ComputerZoomViewport | null | undefined,
): ComputerZoomState {
  const scale = clampComputerZoomScale(state.scale);
  if (scale <= COMPUTER_ZOOM_MIN) {
    return INITIAL_COMPUTER_ZOOM;
  }
  const width =
    viewport && Number.isFinite(viewport.width) && viewport.width > 0 ? viewport.width : 0;
  const height =
    viewport && Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : 0;
  const maxX = Math.max(0, (width * (scale - 1)) / 2);
  const maxY = Math.max(0, (height * (scale - 1)) / 2);
  const rawX = Number.isFinite(state.translateX) ? state.translateX : 0;
  const rawY = Number.isFinite(state.translateY) ? state.translateY : 0;
  return {
    scale,
    translateX: Math.min(maxX, Math.max(-maxX, rawX)),
    translateY: Math.min(maxY, Math.max(-maxY, rawY)),
  };
}

export function stepComputerZoom(
  state: ComputerZoomState,
  direction: "in" | "out",
  viewport: ComputerZoomViewport | null | undefined,
): ComputerZoomState {
  const delta = direction === "in" ? COMPUTER_ZOOM_STEP : -COMPUTER_ZOOM_STEP;
  const nextScale = clampComputerZoomScale(state.scale + delta);
  if (nextScale <= COMPUTER_ZOOM_MIN) return INITIAL_COMPUTER_ZOOM;
  const ratio = state.scale > 0 ? nextScale / state.scale : 1;
  return clampComputerZoom(
    {
      scale: nextScale,
      translateX: state.translateX * ratio,
      translateY: state.translateY * ratio,
    },
    viewport,
  );
}

export function panComputerZoom(
  state: ComputerZoomState,
  deltaX: number,
  deltaY: number,
  viewport: ComputerZoomViewport | null | undefined,
): ComputerZoomState {
  if (state.scale <= COMPUTER_ZOOM_MIN) return INITIAL_COMPUTER_ZOOM;
  return clampComputerZoom(
    {
      scale: state.scale,
      translateX: state.translateX + deltaX,
      translateY: state.translateY + deltaY,
    },
    viewport,
  );
}

export function pinchComputerZoom(
  origin: ComputerZoomState,
  scaleFactor: number,
  panDeltaX: number,
  panDeltaY: number,
  viewport: ComputerZoomViewport | null | undefined,
): ComputerZoomState {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return clampComputerZoom(origin, viewport);
  const nextScale = clampComputerZoomScale(origin.scale * scaleFactor);
  if (nextScale <= COMPUTER_ZOOM_MIN) return INITIAL_COMPUTER_ZOOM;
  const ratio = origin.scale > 0 ? nextScale / origin.scale : 1;
  return clampComputerZoom(
    {
      scale: nextScale,
      translateX: origin.translateX * ratio + panDeltaX,
      translateY: origin.translateY * ratio + panDeltaY,
    },
    viewport,
  );
}

export function toggleDoubleTapComputerZoom(
  state: ComputerZoomState,
  viewport: ComputerZoomViewport | null | undefined,
): ComputerZoomState {
  if (state.scale > COMPUTER_ZOOM_MIN + 0.05) {
    return INITIAL_COMPUTER_ZOOM;
  }
  return clampComputerZoom(
    { scale: COMPUTER_ZOOM_DOUBLE_TAP, translateX: 0, translateY: 0 },
    viewport,
  );
}

export function formatComputerZoomPercent(scale: number): string {
  return `${Math.round(clampComputerZoomScale(scale) * 100)}%`;
}
