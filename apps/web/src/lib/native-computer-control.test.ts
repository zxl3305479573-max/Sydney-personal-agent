import { expect, it } from "vitest";
import { nativeScreenGeometry, nativeScreenPoint } from "./native-computer-control";

const geometry = {
  width: 1920,
  height: 1080,
  left: 0,
  top: 50,
  displayWidth: 960,
  displayHeight: 540,
  viewportWidth: 960,
  viewportHeight: 640,
};
const bounds = { left: 10, top: 20, width: 960, height: 640 };

it("maps the actual framebuffer rather than assuming a fixed 1280 pixel desktop", () => {
  expect(nativeScreenPoint(490, 340, bounds, geometry)).toEqual({ x: 960, y: 540 });
  expect(nativeScreenPoint(10, 30, bounds, geometry)).toBeNull();
  expect(nativeScreenPoint(970, 340, bounds, geometry)).toBeNull();
  expect(nativeScreenPoint(250, 180, { ...bounds, width: 480, height: 320 }, geometry)).toEqual({
    x: 960,
    y: 540,
  });
});

it("rejects invalid geometry and supports resized portrait views", () => {
  expect(nativeScreenGeometry(geometry)).toEqual(geometry);
  for (const value of [
    null,
    {},
    { ...geometry, width: 9000 },
    { ...geometry, height: -1 },
    { ...geometry, left: Infinity },
    { ...geometry, displayWidth: 0 },
  ])
    expect(nativeScreenGeometry(value)).toBeNull();
  expect(nativeScreenPoint(0, 0, { ...bounds, width: 0 }, geometry)).toBeNull();
});
