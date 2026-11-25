import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
}));

import { gcj02ToWgs84, haversineDistanceMeters, wgs84ToGcj02 } from "./map-location";
import {
  fetchMapRoutePreview,
  loadRecentMapDestinations,
  rememberMapDestination,
  reverseGeocodeLocation,
  searchMapPlaces,
} from "./map-search";

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("map-search (MAP-02)", () => {
  it("searches places via Nominatim by default and uses Amap Web API when key is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          place_id: 101,
          name: "天安门",
          display_name: "天安门, 东城区, 北京市",
          lat: "39.9087",
          lon: "116.3975",
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const nominatimResults = await searchMapPlaces("天安门", {
      latitude: 39.9042,
      longitude: 116.4074,
    });
    expect(nominatimResults).toHaveLength(1);
    expect(nominatimResults[0]).toMatchObject({
      name: "天安门",
      latitude: 39.9087,
      longitude: 116.3975,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("nominatim.openstreetmap.org");

    vi.stubEnv("EXPO_PUBLIC_AMAP_WEB_KEY", "test-amap-key");
    const targetWgs = { latitude: 31.2304, longitude: 121.4737 };
    const targetGcj = wgs84ToGcj02(targetWgs);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        pois: [
          {
            id: "B001",
            name: "外滩",
            cityname: "上海市",
            adname: "黄浦区",
            address: "中山东一路",
            location: `${targetGcj.longitude.toFixed(6)},${targetGcj.latitude.toFixed(6)}`,
          },
        ],
      }),
    });

    const amapResults = await searchMapPlaces("外滩", targetWgs);
    expect(amapResults).toHaveLength(1);
    expect(amapResults[0]?.name).toBe("外滩");
    const restored = gcj02ToWgs84(targetGcj);
    expect(
      haversineDistanceMeters(
        { latitude: amapResults[0]!.latitude, longitude: amapResults[0]!.longitude },
        restored,
      ),
    ).toBeLessThan(5);
  });

  it("reverse geocodes coordinates and gracefully returns null on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            address: { city: "北京市", district: "朝阳区", road: "建国路" },
          }),
        })
        .mockRejectedValueOnce(new Error("timeout")),
    );

    expect(await reverseGeocodeLocation({ latitude: 39.909, longitude: 116.46 })).toBe(
      "北京市 · 朝阳区 · 建国路",
    );
    expect(await reverseGeocodeLocation({ latitude: 39.909, longitude: 116.46 })).toBeNull();
  });

  it("decodes OSRM road routes and falls back to straight-line estimate for transit or network errors", async () => {
    const origin = { latitude: 39.9042, longitude: 116.4074 };
    const dest = { latitude: 39.99, longitude: 116.48 };

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            routes: [
              {
                distance: 12_400,
                duration: 1_320,
                geometry: {
                  coordinates: [
                    [116.4074, 39.9042],
                    [116.45, 39.95],
                    [116.48, 39.99],
                  ],
                },
              },
            ],
          }),
        })
        .mockRejectedValueOnce(new Error("osrm unreachable")),
    );

    const road = await fetchMapRoutePreview(origin, dest, "driving");
    expect(road.estimated).toBe(false);
    expect(road.distanceMeters).toBe(12_400);
    expect(road.durationMinutes).toBe(22);
    expect(road.points).toHaveLength(3);

    const transit = await fetchMapRoutePreview(origin, dest, "transit");
    expect(transit.estimated).toBe(true);
    expect(transit.points).toEqual([origin, dest]);

    const fallback = await fetchMapRoutePreview(origin, dest, "walking");
    expect(fallback.estimated).toBe(true);
    expect(fallback.points).toHaveLength(2);
  });

  it("deduplicates and caps recent map destinations", async () => {
    for (let i = 1; i <= 10; i += 1) {
      await rememberMapDestination({ name: `地点-${i}`, latitude: 39.9, longitude: 116.4 });
    }
    const afterCap = await loadRecentMapDestinations();
    expect(afterCap).toHaveLength(8);
    expect(afterCap[0]?.name).toBe("地点-10");

    await rememberMapDestination({ name: "地点-5", latitude: 39.9, longitude: 116.4 });
    const reordered = await loadRecentMapDestinations();
    expect(reordered[0]?.name).toBe("地点-5");
    expect(reordered.filter((item) => item.name === "地点-5")).toHaveLength(1);
  });
});
