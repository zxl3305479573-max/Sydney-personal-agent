import { useRef } from "react";
import type { GestureResponderEvent, LayoutChangeEvent } from "react-native";
import { View } from "react-native";
import type { NativeComputerInput, NativeScreenGeometry } from "../lib/native-computer-control";
import { nativeTouchInput } from "../lib/native-computer-control";

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
