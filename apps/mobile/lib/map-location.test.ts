import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
}));

import {
  estimateTravelMinutes,
  formatDistance,
  formatDuration,
  gcj02ToWgs84,
  haversineDistanceMeters,
  isInChinaMainland,
  loadSavedMapLocation,
  resetMapLocationCacheForTest,
  resolveApproxIpLocation,
  saveMapLocation,
  wgs84ToGcj02,
} from "./map-location";

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  resetMapLocationCacheForTest();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("map-location (MAP-01)", () => {
  it("converts WGS-84 and GCJ-02 inside mainland China within < 5m round-trip error and leaves foreign coords unchanged", () => {
    const samples = [
      { latitude: 39.9042, longitude: 116.4074 }, // Beijing
      { latitude: 31.2304, longitude: 121.4737 }, // Shanghai
      { latitude: 22.5431, longitude: 114.0579 }, // Shenzhen
    ];
    for (const wgs of samples) {
      expect(isInChinaMainland(wgs)).toBe(true);
      const gcj = wgs84ToGcj02(wgs);
      // Offset in China mainland is typically 200m-700m
      const shift = haversineDistanceMeters(wgs, gcj);
      expect(shift).toBeGreaterThan(50);
      expect(shift).toBeLessThan(1_000);
      // Round trip back to WGS-84 must be < 5m
      const restored = gcj02ToWgs84(gcj);
      expect(haversineDistanceMeters(wgs, restored)).toBeLessThan(5);
    }

    const sf = { latitude: 37.7749, longitude: -122.4194 };
    expect(isInChinaMainland(sf)).toBe(false);
    expect(wgs84ToGcj02(sf)).toEqual(sf);
    expect(gcj02ToWgs84(sf)).toEqual(sf);
  });

  it("formats distances and durations across locales", () => {
    expect(formatDistance(354, "zh-CN")).toBe("350 米");
    expect(formatDistance(4_820, "zh-CN")).toBe("4.8 公里");
    expect(formatDistance(4_820, "en-US")).toBe("4.8 km");
    expect(estimateTravelMinutes(4_800, "walking")).toBe(60);
    expect(formatDuration(85, "zh-CN")).toBe("1 小时 25 分钟");
    expect(formatDuration(25, "en-US")).toBe("25 min");
  });

  it("resolves IP approximate location and falls back to secondary provider when primary fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("primary blocked"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          latitude: 31.2304,
          longitude: 121.4737,
          city: "Shanghai",
          region: "Shanghai",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const loc = await resolveApproxIpLocation({ force: true, nowMs: 1000 });
    expect(loc).toMatchObject({
      latitude: 31.2304,
      longitude: 121.4737,
      city: "Shanghai",
      label: "Shanghai",
      source: "ip",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("persists calibrated manual location and recovers cleanly from corrupt storage", async () => {
    await saveMapLocation({
      latitude: 39.9087,
      longitude: 116.3975,
      label: "天安门",
      source: "manual",
      updatedAt: 42,
    });
    resetMapLocationCacheForTest();
    const loaded = await loadSavedMapLocation();
    expect(loaded).toMatchObject({
      latitude: 39.9087,
      longitude: 116.3975,
      label: "天安门",
      source: "manual",
    });

    store.set("sydney.mobile.mapLastLocation.v1", "not-json");
    expect(await loadSavedMapLocation()).toBeNull();
  });
});
