export type NativeScreenGeometry = {
  width: number;
  height: number;
  left: number;
  top: number;
  displayWidth: number;
  displayHeight: number;
  viewportWidth: number;
  viewportHeight: number;
};

export function nativeScreenGeometry(value: unknown): NativeScreenGeometry | null {
  if (!value || typeof value !== "object") return null;
  const geometry = value as NativeScreenGeometry;
  const fields = [
    geometry.width,
    geometry.height,
    geometry.displayWidth,
    geometry.displayHeight,
    geometry.viewportWidth,
    geometry.viewportHeight,
  ];
  if (
    fields.some((field) => !Number.isFinite(field) || field <= 0 || field > 16_384) ||
    !Number.isInteger(geometry.width) ||
    !Number.isInteger(geometry.height) ||
    geometry.width > 8192 ||
    geometry.height > 8192 ||
    !Number.isFinite(geometry.left) ||
    !Number.isFinite(geometry.top)
  )
    return null;
  return geometry;
}

export function nativeScreenPoint(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, "left" | "top" | "width" | "height">,
  geometry: NativeScreenGeometry,
): { x: number; y: number } | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const localX = ((clientX - bounds.left) * geometry.viewportWidth) / bounds.width - geometry.left;
  const localY = ((clientY - bounds.top) * geometry.viewportHeight) / bounds.height - geometry.top;
  if (
    localX < 0 ||
    localY < 0 ||
    localX >= geometry.displayWidth ||
    localY >= geometry.displayHeight
  )
    return null;
  return {
    x: Math.min(geometry.width - 1, Math.floor((localX * geometry.width) / geometry.displayWidth)),
    y: Math.min(
      geometry.height - 1,
      Math.floor((localY * geometry.height) / geometry.displayHeight),
    ),
  };
}
