// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { GestureResponderEvent, ViewProps } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComputerZoomBar, ComputerZoomGestureOverlay } from "../components/computer-zoom-controls";
import {
  COMPUTER_ZOOM_DOUBLE_TAP,
  COMPUTER_ZOOM_MAX,
  COMPUTER_ZOOM_MIN,
  clampComputerZoom,
  clampComputerZoomScale,
  formatComputerZoomPercent,
  INITIAL_COMPUTER_ZOOM,
  panComputerZoom,
  pinchComputerZoom,
  stepComputerZoom,
  toggleDoubleTapComputerZoom,
} from "./computer-zoom";

const overlayProps = vi.hoisted(() => ({ current: {} as ViewProps }));

vi.mock("react-native", () => ({
  View: (props: ViewProps & { testID?: string; children?: ReactNode }) => {
    if (props.testID === "computer-zoom-gesture-overlay") {
      overlayProps.current = props;
    }
    return createElement("div", { "data-testid": props.testID }, props.children);
  },
  Text: (props: { children?: ReactNode }) => createElement("span", null, props.children),
  Pressable: (props: {
    children?: ReactNode;
    testID?: string;
    disabled?: boolean;
    accessibilityLabel?: string;
    onPress?: () => void;
  }) =>
    createElement(
      "button",
      {
        type: "button",
        "data-testid": props.testID,
        "aria-label": props.accessibilityLabel,
        disabled: props.disabled,
        onClick: () => props.onPress?.(),
      },
      props.children,
    ),
}));

vi.mock("./i18n", () => ({
  useI18n: () => ({ locale: "zh-CN", t: (text: string) => text }),
}));

vi.mock("./native", () => ({
  useMobileTokens: () => ({
    background: "#F3F1EC",
    foreground: "#26231F",
    mutedForeground: "#6E675E",
  }),
}));

function singleTouch(pageX: number, pageY: number): GestureResponderEvent {
  return {
    nativeEvent: {
      pageX,
      pageY,
      touches: [{ pageX, pageY }],
    },
  } as unknown as GestureResponderEvent;
}

function twoFingerTouch(
  first: { x: number; y: number },
  second: { x: number; y: number },
): GestureResponderEvent {
  return {
    nativeEvent: {
      pageX: (first.x + second.x) / 2,
      pageY: (first.y + second.y) / 2,
      touches: [
        { pageX: first.x, pageY: first.y },
        { pageX: second.x, pageY: second.y },
      ],
    },
  } as unknown as GestureResponderEvent;
}

describe("computer zoom state math", () => {
  const viewport = { width: 400, height: 250 };

  it("clamps scale and resets translation at 100%", () => {
    expect(clampComputerZoomScale(0.2)).toBe(COMPUTER_ZOOM_MIN);
    expect(clampComputerZoomScale(5)).toBe(COMPUTER_ZOOM_MAX);
    expect(clampComputerZoomScale(Number.NaN)).toBe(COMPUTER_ZOOM_MIN);

    expect(clampComputerZoom({ scale: 1, translateX: 80, translateY: -40 }, viewport)).toEqual(
      INITIAL_COMPUTER_ZOOM,
    );
    expect(clampComputerZoom({ scale: 2, translateX: 500, translateY: -500 }, viewport)).toEqual({
      scale: 2,
      translateX: 200,
      translateY: -125,
    });
  });

  it("steps zoom in/out while preserving focal offset and clamping bounds", () => {
    const s1 = stepComputerZoom(INITIAL_COMPUTER_ZOOM, "in", viewport);
    expect(s1).toEqual({ scale: 1.25, translateX: 0, translateY: 0 });

    const panned = panComputerZoom({ scale: 2, translateX: 0, translateY: 0 }, 120, -60, viewport);
    expect(panned).toEqual({ scale: 2, translateX: 120, translateY: -60 });

    const steppedIn = stepComputerZoom(panned, "in", viewport);
    expect(steppedIn.scale).toBe(2.25);
    expect(steppedIn.translateX).toBeCloseTo(135, 3);
    expect(steppedIn.translateY).toBeCloseTo(-67.5, 3);

    const steppedOut = stepComputerZoom(
      { scale: 1.25, translateX: 20, translateY: 10 },
      "out",
      viewport,
    );
    expect(steppedOut).toEqual(INITIAL_COMPUTER_ZOOM);
  });

  it("handles pinch zoom, double-tap toggle, and percentage formatting", () => {
    const pinched = pinchComputerZoom(INITIAL_COMPUTER_ZOOM, 1.8, 30, -20, viewport);
    expect(pinched).toEqual({ scale: 1.8, translateX: 30, translateY: -20 });

    const toggledIn = toggleDoubleTapComputerZoom(INITIAL_COMPUTER_ZOOM, viewport);
    expect(toggledIn).toEqual({ scale: COMPUTER_ZOOM_DOUBLE_TAP, translateX: 0, translateY: 0 });

    const toggledOut = toggleDoubleTapComputerZoom(toggledIn, viewport);
    expect(toggledOut).toEqual(INITIAL_COMPUTER_ZOOM);

    expect(formatComputerZoomPercent(1)).toBe("100%");
    expect(formatComputerZoomPercent(2.25)).toBe("225%");
    expect(formatComputerZoomPercent(4)).toBe("300%");
  });
});

describe("ComputerZoomBar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("disables zoom-out/reset at 100%, zoom-in at 300%, and shows pan toggle only when zoomed with control", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    const root = createRoot(container);
    const onZoomOut = vi.fn();
    const onZoomIn = vi.fn();
    const onReset = vi.fn();
    const onTogglePanMode = vi.fn();

    try {
      act(() => {
        root.render(
          <ComputerZoomBar
            zoom={INITIAL_COMPUTER_ZOOM}
            canPanToggle
            panMode={false}
            onZoomOut={onZoomOut}
            onZoomIn={onZoomIn}
            onReset={onReset}
            onTogglePanMode={onTogglePanMode}
          />,
        );
      });

      const zoomOut = container.querySelector<HTMLButtonElement>(
        '[data-testid="computer-zoom-out"]',
      )!;
      const zoomReset = container.querySelector<HTMLButtonElement>(
        '[data-testid="computer-zoom-reset"]',
      )!;
      const zoomIn = container.querySelector<HTMLButtonElement>(
        '[data-testid="computer-zoom-in"]',
      )!;
      expect(zoomOut.disabled).toBe(true);
      expect(zoomReset.disabled).toBe(true);
      expect(zoomReset.textContent).toBe("100%");
      expect(zoomIn.disabled).toBe(false);
      expect(container.querySelector('[data-testid="computer-zoom-pan-toggle"]')).toBeNull();

      act(() => zoomIn.click());
      expect(onZoomIn).toHaveBeenCalledTimes(1);

      act(() => {
        root.render(
          <ComputerZoomBar
            zoom={{ scale: 2, translateX: 20, translateY: -10 }}
            canPanToggle
            panMode={false}
            onZoomOut={onZoomOut}
            onZoomIn={onZoomIn}
            onReset={onReset}
            onTogglePanMode={onTogglePanMode}
          />,
        );
      });

      expect(zoomOut.disabled).toBe(false);
      expect(zoomReset.disabled).toBe(false);
      expect(zoomReset.textContent).toBe("200%");
      const panToggle = container.querySelector<HTMLButtonElement>(
        '[data-testid="computer-zoom-pan-toggle"]',
      )!;
      expect(panToggle).not.toBeNull();
      expect(panToggle.textContent).toContain("移动画面");
      act(() => panToggle.click());
      expect(onTogglePanMode).toHaveBeenCalledTimes(1);

      act(() => {
        root.render(
          <ComputerZoomBar
            zoom={{ scale: COMPUTER_ZOOM_MAX, translateX: 0, translateY: 0 }}
            canPanToggle
            panMode
            onZoomOut={onZoomOut}
            onZoomIn={onZoomIn}
            onReset={onReset}
            onTogglePanMode={onTogglePanMode}
          />,
        );
      });

      expect(zoomIn.disabled).toBe(true);
      expect(zoomReset.textContent).toBe("300%");
      expect(
        container.querySelector('[data-testid="computer-zoom-pan-toggle"]')?.textContent,
      ).toContain("拖动中");
    } finally {
      act(() => root.unmount());
    }
  });
});

describe("ComputerZoomGestureOverlay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("supports two-finger pinch zoom, single-finger pan when zoomed, and double-tap zoom toggle", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    const container = document.createElement("div");
    const root = createRoot(container);
    const viewport = { width: 400, height: 250 };
    const onChange = vi.fn();

    try {
      act(() => {
        root.render(
          <ComputerZoomGestureOverlay
            zoom={INITIAL_COMPUTER_ZOOM}
            viewport={viewport}
            onChange={onChange}
          />,
        );
      });

      // Pinch from distance 100 -> 200 (2x)
      act(() =>
        overlayProps.current.onResponderGrant?.(
          twoFingerTouch({ x: 100, y: 100 }, { x: 200, y: 100 }),
        ),
      );
      act(() =>
        overlayProps.current.onResponderMove?.(
          twoFingerTouch({ x: 50, y: 100 }, { x: 250, y: 100 }),
        ),
      );
      act(() => overlayProps.current.onResponderRelease?.(singleTouch(150, 100)));
      expect(onChange).toHaveBeenLastCalledWith({ scale: 2, translateX: 0, translateY: 0 });

      // Single-finger pan while zoomed at 2x
      act(() => {
        root.render(
          <ComputerZoomGestureOverlay
            zoom={{ scale: 2, translateX: 0, translateY: 0 }}
            viewport={viewport}
            onChange={onChange}
          />,
        );
      });
      act(() => overlayProps.current.onResponderGrant?.(singleTouch(120, 120)));
      act(() => overlayProps.current.onResponderMove?.(singleTouch(180, 90)));
      act(() => overlayProps.current.onResponderRelease?.(singleTouch(180, 90)));
      expect(onChange).toHaveBeenLastCalledWith({ scale: 2, translateX: 60, translateY: -30 });

      // Double tap while zoomed resets to 1x
      act(() => overlayProps.current.onResponderGrant?.(singleTouch(100, 100)));
      act(() => overlayProps.current.onResponderRelease?.(singleTouch(100, 100)));
      now += 150;
      act(() => overlayProps.current.onResponderGrant?.(singleTouch(100, 100)));
      act(() => overlayProps.current.onResponderRelease?.(singleTouch(100, 100)));
      expect(onChange).toHaveBeenLastCalledWith(INITIAL_COMPUTER_ZOOM);
    } finally {
      act(() => root.unmount());
    }
  });
});
