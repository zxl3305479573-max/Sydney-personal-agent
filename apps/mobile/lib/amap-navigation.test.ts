import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Linking: { openURL: vi.fn() },
}));

import { buildAmapNavigationUrls, openInAmapNavigation } from "./amap-navigation";
import { wgs84ToGcj02 } from "./map-location";

describe("amap-navigation (MAP-02)", () => {
  const origin = { name: "我的位置", latitude: 39.9042, longitude: 116.4074 };
  const destination = { name: "首都机场", latitude: 40.0799, longitude: 116.6031 };

  it("builds GCJ-02 aligned iOS, Android, and Web Amap navigation URLs for all travel modes", () => {
    const gcjOrigin = wgs84ToGcj02({ latitude: origin.latitude, longitude: origin.longitude });
    const gcjDest = wgs84ToGcj02({
      latitude: destination.latitude,
      longitude: destination.longitude,
    });

    const iosDrive = buildAmapNavigationUrls({
      origin,
      destination,
      mode: "driving",
      platform: "ios",
    });
    expect(iosDrive.nativeUrl).toMatch(/^iosamap:\/\/path\?/);
    expect(iosDrive.nativeUrl).toContain(`slat=${gcjOrigin.latitude.toFixed(6)}`);
    expect(iosDrive.nativeUrl).toContain(`slon=${gcjOrigin.longitude.toFixed(6)}`);
    expect(iosDrive.nativeUrl).toContain(`dlat=${gcjDest.latitude.toFixed(6)}`);
    expect(iosDrive.nativeUrl).toContain(`dlon=${gcjDest.longitude.toFixed(6)}`);
    expect(iosDrive.nativeUrl).toContain("dev=0");
    expect(iosDrive.nativeUrl).toContain("t=0");
    expect(iosDrive.webUrl).toMatch(/^https:\/\/uri\.amap\.com\/navigation\?/);
    expect(iosDrive.webUrl).toContain("mode=car");
    expect(iosDrive.webUrl).toContain("coordinate=gaode");
    expect(iosDrive.webUrl).toContain("callnative=1");

    const androidWalk = buildAmapNavigationUrls({
      origin: null,
      destination,
      mode: "walking",
      platform: "android",
    });
    expect(androidWalk.nativeUrl).toMatch(/^amapuri:\/\/route\/plan\/\?/);
    expect(androidWalk.nativeUrl).not.toContain("slat=");
    expect(androidWalk.nativeUrl).toContain("t=2");
    expect(androidWalk.webUrl).toContain("mode=walk");

    const iosTransit = buildAmapNavigationUrls({
      origin,
      destination,
      mode: "transit",
      platform: "ios",
    });
    expect(iosTransit.nativeUrl).toContain("t=1");
    expect(iosTransit.webUrl).toContain("mode=bus");

    const iosRide = buildAmapNavigationUrls({
      origin,
      destination,
      mode: "riding",
      platform: "ios",
    });
    expect(iosRide.nativeUrl).toContain("t=3");
    expect(iosRide.webUrl).toContain("mode=ride");
  });

  it("supports direct name-only destination links when coordinates are absent", () => {
    const urls = buildAmapNavigationUrls({
      origin,
      destination: { name: "北京南站" },
      mode: "driving",
      platform: "ios",
    });
    expect(urls.nativeUrl).toMatch(/^iosamap:\/\/path\?/);
    expect(urls.nativeUrl).toContain(encodeURIComponent("北京南站"));
    expect(urls.nativeUrl).not.toContain("dlat=");
    expect(urls.webUrl).toMatch(/^https:\/\/uri\.amap\.com\/search\?/);
    expect(urls.webUrl).toContain("callnative=1");
  });

  it("opens installed Amap app first and falls back to official web URI when app is unavailable", async () => {
    const openApp = vi.fn(async (_url: string) => undefined);
    const appResult = await openInAmapNavigation(
      { origin, destination, mode: "driving", platform: "ios" },
      { openURL: openApp },
    );
    expect(appResult.opened).toBe("amap-app");
    expect(openApp).toHaveBeenCalledOnce();
    expect(openApp.mock.calls[0]?.[0]).toMatch(/^iosamap:\/\/path\?/);

    const openFallback = vi
      .fn(async (_url: string) => undefined)
      .mockRejectedValueOnce(new Error("no handler"))
      .mockResolvedValueOnce(undefined);
    const webResult = await openInAmapNavigation(
      { origin, destination, mode: "driving", platform: "ios" },
      { openURL: openFallback },
    );
    expect(webResult.opened).toBe("amap-web");
    expect(openFallback).toHaveBeenCalledTimes(2);
    expect(openFallback.mock.calls[1]?.[0]).toMatch(/^https:\/\/uri\.amap\.com\/navigation\?/);

    const openBothFail = vi.fn().mockRejectedValue(new Error("blocked"));
    const failResult = await openInAmapNavigation(
      { origin, destination, mode: "driving", platform: "ios" },
      { openURL: openBothFail },
    );
    expect(failResult.opened).toBe("failed");
  });
});
