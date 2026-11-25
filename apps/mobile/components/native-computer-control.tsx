import { useRef, useState } from "react";
import type { GestureResponderEvent, LayoutChangeEvent } from "react-native";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useI18n } from "../lib/i18n";
import type {
  ComputerPoint,
  NativeComputerInput,
  NativeScreenGeometry,
} from "../lib/native-computer-control";
import {
  computerScrollInput,
  moveVirtualCursor,
  nativeScreenDisplayBounds,
  nativeTouchInput,
  virtualCursorPoint,
} from "../lib/native-computer-control";

export function NativeComputerControl({
  geometry,
  onInput,
}: {
  geometry: NativeScreenGeometry | null;
  onInput: (input: NativeComputerInput) => void;
}) {
  const bounds = useRef({ width: 0, height: 0 });
  const start = useRef<{ x: number; y: number; time: number } | null>(null);
  function onLayout(event: LayoutChangeEvent) {
    bounds.current = event.nativeEvent.layout;
  }
  function onStart(event: GestureResponderEvent) {
    if (event.nativeEvent.touches.length !== 1) {
      start.current = null;
      return;
    }
    start.current = {
      x: event.nativeEvent.locationX,
      y: event.nativeEvent.locationY,
      time: Date.now(),
    };
  }
  function onEnd(event: GestureResponderEvent) {
    const origin = start.current;
    start.current = null;
    if (!origin || !geometry) return;
    const input = nativeTouchInput(
      origin,
      { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY },
      Date.now() - origin.time,
      bounds.current,
      geometry,
    );
    if (input) onInput(input);
  }
  return (
    <View
      accessibilityLabel="Computer control"
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={onStart}
      onResponderMove={(event) => {
        if (event.nativeEvent.touches.length !== 1) start.current = null;
      }}
      onResponderRelease={onEnd}
      onResponderTerminate={() => {
        start.current = null;
      }}
      style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
    />
  );
}

type MouseGesture = {
  origin: ComputerPoint;
  last: ComputerPoint;
  startedAt: number;
  moved: boolean;
  scrolling: boolean;
};

const MOVE_THRESHOLD = 5;
const MOVE_INTERVAL_MS = 100;
const CURSOR_HOTSPOT = 2;
const INITIAL_CURSOR = { x: 0.5, y: 0.5 };

function gesturePoint(event: GestureResponderEvent): ComputerPoint {
  const { pageX, pageY } = event.nativeEvent;
  const [first, second] = event.nativeEvent.touches;
  return first && second
    ? { x: (first.pageX + second.pageX) / 2, y: (first.pageY + second.pageY) / 2 }
    : { x: pageX, y: pageY };
}

export function ComputerVirtualMouse({
  geometry,
  screen,
  onInput,
}: {
  geometry: NativeScreenGeometry | null;
  screen: { width: number; height: number };
  onInput: (input: NativeComputerInput) => void;
}) {
  const { t } = useI18n();
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [cursor, setCursor] = useState(INITIAL_CURSOR);
  const position = useRef(INITIAL_CURSOR);
  const lastMove = useRef<{ at: number; point: ComputerPoint } | null>(null);
  const gesture = useRef<MouseGesture | null>(null);
  const display =
    bounds.width > 0 && bounds.height > 0
      ? geometry
        ? nativeScreenDisplayBounds(bounds, geometry)
        : { left: 0, top: 0, ...bounds }
      : null;

  function startGesture(point: ComputerPoint, scrolling: boolean): MouseGesture {
    return { origin: point, last: point, startedAt: Date.now(), moved: false, scrolling };
  }

  function sendMove(at: number, force = false) {
    const point = virtualCursorPoint(position.current, screen);
    const last = lastMove.current;
    if (
      last &&
      ((!force && at - last.at < MOVE_INTERVAL_MS) ||
        (last.point.x === point.x && last.point.y === point.y))
    )
      return;
    lastMove.current = { at, point };
    onInput({ kind: "pointer", payload: { ...point, type: "move" } });
  }

  function move(active: MouseGesture, next: ComputerPoint) {
    if (!display) return;
    const delta = { x: next.x - active.last.x, y: next.y - active.last.y };
    if (!active.moved && Math.hypot(delta.x, delta.y) < MOVE_THRESHOLD) return;
    active.moved = true;
    active.last = next;
    position.current = moveVirtualCursor(position.current, delta, display);
    setCursor(position.current);
  }

  return (
    <View
      accessibilityLabel={t("Virtual mouse")}
      onLayout={(event) => {
        gesture.current = null;
        setBounds(event.nativeEvent.layout);
      }}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(event) => {
        const count = event.nativeEvent.touches.length;
        gesture.current = display && count === 1 ? startGesture(gesturePoint(event), false) : null;
      }}
      onResponderStart={(event) => {
        const count = event.nativeEvent.touches.length;
        if (count > 2) gesture.current = null;
        if (count === 2 && display) gesture.current = startGesture(gesturePoint(event), true);
      }}
      onResponderMove={(event) => {
        const active = gesture.current;
        if (!active || !display) return;
        const count = event.nativeEvent.touches.length;
        if (count > 2) {
          gesture.current = null;
          return;
        }
        const point = gesturePoint(event);
        if (count === 2) {
          if (active.scrolling) active.last = point;
          else gesture.current = startGesture(point, true);
        } else if (!active.scrolling) {
          move(active, point);
          if (active.moved) sendMove(Date.now());
        }
      }}
      onResponderRelease={(event) => {
        const active = gesture.current;
        gesture.current = null;
        if (!active || !display) return;
        const at = Date.now();
        const point = virtualCursorPoint(position.current, screen);
        if (active.scrolling) {
          const input = computerScrollInput(
            point,
            active.last.x - active.origin.x,
            active.last.y - active.origin.y,
          );
          if (input) onInput(input);
          return;
        }
        move(active, gesturePoint(event));
        if (active.moved) {
          sendMove(at, true);
          return;
        }
        lastMove.current = { at, point };
        onInput({
          kind: "pointer",
          payload: {
            ...point,
            type: "click",
            button: at - active.startedAt >= 600 ? "right" : "left",
          },
        });
      }}
      onResponderTerminate={() => {
        gesture.current = null;
      }}
      style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
    >
      {display ? (
        <Svg
          pointerEvents="none"
          width={20}
          height={24}
          viewBox="0 0 20 24"
          style={{
            position: "absolute",
            left: display.left + cursor.x * display.width - CURSOR_HOTSPOT,
            top: display.top + cursor.y * display.height - CURSOR_HOTSPOT,
          }}
        >
          <Path
            d={`M${CURSOR_HOTSPOT} ${CURSOR_HOTSPOT} L17 15 H10.5 L13.5 21.5 L10 23 L7 16.5 L2 20 Z`}
            fill="#171717"
            stroke="#fff"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}
