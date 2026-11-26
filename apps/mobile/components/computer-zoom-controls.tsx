import { useRef } from "react";
import type { GestureResponderEvent } from "react-native";
import { Text, View } from "react-native";
import type { ComputerZoomState, ComputerZoomViewport } from "../lib/computer-zoom";
import {
  COMPUTER_ZOOM_MAX,
  COMPUTER_ZOOM_MIN,
  formatComputerZoomPercent,
  panComputerZoom,
  pinchComputerZoom,
  toggleDoubleTapComputerZoom,
} from "../lib/computer-zoom";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { MotionPressable } from "./motion-pressable";

function isLightTokenBackground(background: string | undefined): boolean {
  if (!background) return true;
  const trimmed = background.trim();
  const match = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (!match) return true;
  const hex = match[1]!;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
}

export function ComputerZoomBar({
  zoom,
  compact = false,
  canPanToggle = false,
  panMode = false,
  onZoomOut,
  onZoomIn,
  onReset,
  onTogglePanMode,
}: {
  zoom: ComputerZoomState;
  compact?: boolean;
  canPanToggle?: boolean;
  panMode?: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onReset: () => void;
  onTogglePanMode?: () => void;
}) {
  const i18n = useI18n() as { locale?: string };
  const locale = i18n?.locale ?? "en";
  const tokens = useMobileTokens();
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const copy = (zhHans: string, zhHant: string, en: string) =>
    chinese ? (traditional ? zhHant : zhHans) : en;

  const isLight = isLightTokenBackground(tokens?.background);
  const pillBg = isLight ? "rgba(255, 254, 252, 0.94)" : "rgba(36, 41, 51, 0.92)";
  const pillBorder = isLight ? "rgba(38, 35, 31, 0.09)" : "rgba(245, 244, 240, 0.14)";
  const activeBg = isLight ? "#2E2B27" : "#E7E4DD";
  const activeFg = isLight ? "#FAF8F4" : "#15171C";
  const fg = tokens?.foreground ?? (isLight ? "#26231F" : "#F5F4F0");
  const mutedFg = tokens?.mutedForeground ?? (isLight ? "#6E675E" : "#B8B3AA");

  const atMin = zoom.scale <= COMPUTER_ZOOM_MIN + 0.001;
  const atMax = zoom.scale >= COMPUTER_ZOOM_MAX - 0.001;
  const percent = formatComputerZoomPercent(zoom.scale);
  const buttonHeight = compact ? 34 : 36;
  const buttonWidth = compact ? 34 : 38;

  return (
    <View
      testID={compact ? "computer-preview-zoom-bar" : "computer-zoom-bar"}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 999,
          backgroundColor: pillBg,
          borderWidth: 0.5,
          borderColor: pillBorder,
          overflow: "hidden",
        }}
      >
        <MotionPressable
          preset="icon"
          testID={compact ? "computer-preview-zoom-out" : "computer-zoom-out"}
          accessibilityRole="button"
          accessibilityLabel={copy("缩小画面", "縮小畫面", "Zoom out")}
          disabled={atMin}
          onPress={onZoomOut}
          style={{
            width: buttonWidth,
            height: buttonHeight,
            alignItems: "center",
            justifyContent: "center",
            opacity: atMin ? 0.35 : 1,
          }}
        >
          <Text
            style={{
              color: fg,
              fontSize: 17,
              lineHeight: 19,
              fontWeight: "500",
            }}
          >
            {"\u2212"}
          </Text>
        </MotionPressable>

        <MotionPressable
          preset="control"
          testID={compact ? "computer-preview-zoom-reset" : "computer-zoom-reset"}
          accessibilityRole="button"
          accessibilityLabel={copy(
            `重置缩放，当前 ${percent}`,
            `重設縮放，目前 ${percent}`,
            `Reset zoom, currently ${percent}`,
          )}
          disabled={atMin}
          onPress={onReset}
          style={{
            minWidth: compact ? 48 : 54,
            height: buttonHeight,
            paddingHorizontal: 6,
            alignItems: "center",
            justifyContent: "center",
            borderLeftWidth: 0.5,
            borderRightWidth: 0.5,
            borderColor: pillBorder,
          }}
        >
          <Text
            style={{
              color: atMin ? mutedFg : fg,
              fontSize: 12.5,
              fontWeight: "600",
              fontVariant: ["tabular-nums"],
            }}
          >
            {percent}
          </Text>
        </MotionPressable>

        <MotionPressable
          preset="icon"
          testID={compact ? "computer-preview-zoom-in" : "computer-zoom-in"}
          accessibilityRole="button"
          accessibilityLabel={copy("放大画面", "放大畫面", "Zoom in")}
          disabled={atMax}
          onPress={onZoomIn}
          style={{
            width: buttonWidth,
            height: buttonHeight,
            alignItems: "center",
            justifyContent: "center",
            opacity: atMax ? 0.35 : 1,
          }}
        >
          <Text
            style={{
              color: fg,
              fontSize: 17,
              lineHeight: 19,
              fontWeight: "500",
            }}
          >
            +
          </Text>
        </MotionPressable>
      </View>

      {canPanToggle && !atMin && onTogglePanMode ? (
        <MotionPressable
          preset="control"
          testID="computer-zoom-pan-toggle"
          accessibilityRole="button"
          accessibilityLabel={
            panMode
              ? copy("返回桌面操作", "返回桌面操作", "Resume desktop control")
              : copy("拖动查看画面", "拖曳檢視畫面", "Pan zoomed screen")
          }
          onPress={onTogglePanMode}
          style={{
            height: buttonHeight,
            paddingHorizontal: 11,
            borderRadius: 999,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: panMode ? activeBg : pillBg,
            borderWidth: 0.5,
            borderColor: panMode ? "transparent" : pillBorder,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: panMode ? activeFg : mutedFg,
            }}
          />
          <Text
            style={{
              color: panMode ? activeFg : fg,
              fontSize: 12.5,
              fontWeight: "600",
            }}
          >
            {panMode ? copy("拖动中", "拖曳中", "Panning") : copy("移动画面", "移動畫面", "Pan")}
          </Text>
        </MotionPressable>
      ) : null}
    </View>
  );
}

type PinchAnchor = {
  distance: number;
  centerX: number;
  centerY: number;
  origin: ComputerZoomState;
};

type PanAnchor = {
  lastX: number;
  lastY: number;
  moved: boolean;
};

const DOUBLE_TAP_WINDOW_MS = 280;
const PAN_THRESHOLD = 4;

function pinchMetrics(event: GestureResponderEvent) {
  const [first, second] = event.nativeEvent.touches;
  if (!first || !second) return null;
  const dx = second.pageX - first.pageX;
  const dy = second.pageY - first.pageY;
  return {
    distance: Math.max(1, Math.hypot(dx, dy)),
    centerX: (first.pageX + second.pageX) / 2,
    centerY: (first.pageY + second.pageY) / 2,
  };
}

/**
 * Responder-based pinch-to-zoom, pan-when-zoomed, and double-tap zoom overlay.
 * Works reliably inside native iOS Modals without extra GestureHandlerRootView nesting.
 */
export function ComputerZoomGestureOverlay({
  zoom,
  viewport,
  onChange,
  accessibilityLabel,
}: {
  zoom: ComputerZoomState;
  viewport: ComputerZoomViewport | null;
  onChange: (next: ComputerZoomState) => void;
  accessibilityLabel?: string;
}) {
  const pinch = useRef<PinchAnchor | null>(null);
  const pan = useRef<PanAnchor | null>(null);
  const lastTapAt = useRef<number>(0);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  function begin(event: GestureResponderEvent) {
    const touches = event.nativeEvent.touches;
    if (touches.length >= 2) {
      const metrics = pinchMetrics(event);
      pan.current = null;
      pinch.current = metrics ? { ...metrics, origin: zoomRef.current } : null;
      return;
    }
    pinch.current = null;
    if (touches.length === 1) {
      pan.current = {
        lastX: event.nativeEvent.pageX,
        lastY: event.nativeEvent.pageY,
        moved: false,
      };
    }
  }

  function handleMove(event: GestureResponderEvent) {
    const touches = event.nativeEvent.touches;
    if (touches.length >= 2) {
      const metrics = pinchMetrics(event);
      if (!metrics) return;
      if (!pinch.current) {
        pan.current = null;
        pinch.current = { ...metrics, origin: zoomRef.current };
        return;
      }
      const next = pinchComputerZoom(
        pinch.current.origin,
        metrics.distance / pinch.current.distance,
        metrics.centerX - pinch.current.centerX,
        metrics.centerY - pinch.current.centerY,
        viewport,
      );
      onChange(next);
      return;
    }
    pinch.current = null;
    if (touches.length === 1 && pan.current) {
      const dx = event.nativeEvent.pageX - pan.current.lastX;
      const dy = event.nativeEvent.pageY - pan.current.lastY;
      if (!pan.current.moved && Math.hypot(dx, dy) < PAN_THRESHOLD) return;
      pan.current.moved = true;
      pan.current.lastX = event.nativeEvent.pageX;
      pan.current.lastY = event.nativeEvent.pageY;
      if (zoomRef.current.scale > COMPUTER_ZOOM_MIN) {
        onChange(panComputerZoom(zoomRef.current, dx, dy, viewport));
      }
    }
  }

  function handleEnd() {
    const wasTap = pan.current !== null && !pan.current.moved && pinch.current === null;
    pinch.current = null;
    pan.current = null;
    if (wasTap) {
      const now = Date.now();
      if (now - lastTapAt.current <= DOUBLE_TAP_WINDOW_MS) {
        lastTapAt.current = 0;
        onChange(toggleDoubleTapComputerZoom(zoomRef.current, viewport));
      } else {
        lastTapAt.current = now;
      }
    }
  }

  return (
    <View
      testID="computer-zoom-gesture-overlay"
      accessibilityLabel={accessibilityLabel ?? "Zoom and pan desktop"}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={begin}
      onResponderMove={handleMove}
      onResponderRelease={handleEnd}
      onResponderTerminate={() => {
        pinch.current = null;
        pan.current = null;
      }}
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
    />
  );
}
