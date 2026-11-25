// @vitest-environment jsdom

import type { SVGProps } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { GestureResponderEvent, ViewProps } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComputerVirtualMouse } from "../components/native-computer-control";

const surface = vi.hoisted(() => ({ props: {} as ViewProps }));

vi.mock("react-native", () => ({
  View: (props: ViewProps) => {
    if (props.onResponderGrant) surface.props = props;
    return <div>{props.children}</div>;
  },
}));
vi.mock("react-native-svg", () => ({
  default: (props: SVGProps<SVGSVGElement>) => <svg {...props} />,
  Path: (props: SVGProps<SVGPathElement>) => <path {...props} />,
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ t: (text: string) => text }) }));

const screen = { width: 1920, height: 1080 };
const geometry = {
  ...screen,
  left: 0,
  top: 100,
  displayWidth: 400,
  displayHeight: 225,
  viewportWidth: 400,
  viewportHeight: 600,
};

function touch(pageX: number, pageY: number, count = 1): GestureResponderEvent {
  return {
    nativeEvent: {
      pageX,
      pageY,
      touches: Array.from({ length: count }, (_, index) => ({ pageX: pageX + index * 20, pageY })),
    },
  } as GestureResponderEvent;
}

describe("computer virtual mouse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("moves relatively, clicks at the cursor, and scrolls with two fingers", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const container = document.createElement("div");
    const root = createRoot(container);
    const onInput = vi.fn();
    try {
      act(() =>
        root.render(<ComputerVirtualMouse geometry={geometry} screen={screen} onInput={onInput} />),
      );
      const layout = (width: number, height: number) =>
        act(() =>
          surface.props.onLayout?.({
            nativeEvent: { layout: { x: 0, y: 0, width, height } },
          } as Parameters<NonNullable<ViewProps["onLayout"]>>[0]),
        );
      layout(400, 600);
      const cursor = container.querySelector("svg");
      expect(cursor?.querySelector("path")?.getAttribute("d")).toMatch(/^M2 2 L/);
      expect(cursor?.getAttribute("pointer-events")).toBe("none");
      expect(cursor?.style.left).toBe("198px");
      expect(cursor?.style.top).toBe("210.5px");
      act(() => surface.props.onResponderGrant?.(touch(20, 20)));
      act(() => surface.props.onResponderRelease?.(touch(22, 20, 0)));
      expect(onInput).toHaveBeenLastCalledWith({
        kind: "pointer",
        payload: { x: 960, y: 540, type: "click", button: "left" },
      });

      now += 200;
      act(() => surface.props.onResponderGrant?.(touch(250, 220)));
      act(() => surface.props.onResponderMove?.(touch(290, 220)));
      act(() => surface.props.onResponderRelease?.(touch(290, 220, 0)));
      expect(onInput).toHaveBeenLastCalledWith({
        kind: "pointer",
        payload: { x: 1209, y: 540, type: "move" },
      });
      expect(cursor?.style.left).toBe("250px");
      expect(cursor?.style.top).toBe("210.5px");
      expect(onInput).toHaveBeenCalledTimes(2);

      act(() => surface.props.onResponderGrant?.(touch(5, 160)));
      now += 650;
      act(() => surface.props.onResponderRelease?.(touch(5, 160, 0)));
      expect(onInput).toHaveBeenLastCalledWith({
        kind: "pointer",
        payload: { x: 1209, y: 540, type: "click", button: "right" },
      });

      act(() => surface.props.onResponderGrant?.(touch(60, 200)));
      act(() => surface.props.onResponderStart?.(touch(60, 200, 2)));
      act(() => surface.props.onResponderMove?.(touch(60, 120, 2)));
      act(() => surface.props.onResponderRelease?.(touch(60, 120, 0)));
      expect(onInput).toHaveBeenLastCalledWith({
        kind: "scroll",
        payload: { x: 1209, y: 540, direction: "down", amount: 2 },
      });

      layout(600, 400);
      expect(container.querySelector("svg")).toBeNull();
      act(() => surface.props.onResponderGrant?.(touch(50, 50)));
      act(() => surface.props.onResponderRelease?.(touch(50, 50, 0)));
      expect(onInput).toHaveBeenCalledTimes(4);
    } finally {
      act(() => root.unmount());
    }
  });
});
