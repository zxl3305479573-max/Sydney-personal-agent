import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
}));

import {
  getNativeLocationStatus,
  isNativeLocationAvailable,
  requestDeviceGpsLocation,
  resetDeviceLocationCacheForTest,
  setNativeLocationModuleForTest,
} from "./device-location";
import { getCachedUserLocation, resetMapLocationCacheForTest } from "./map-location";

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  resetMapLocationCacheForTest();
  resetDeviceLocationCacheForTest();
  setNativeLocationModuleForTest(null);
});

afterEach(() => {
  setNativeLocationModuleForTest(undefined);
});

describe("device-location (native CoreLocation bridge)", () => {
  it("reports unavailable when native SydneyLocation module is absent", async () => {
    expect(isNativeLocationAvailable()).toBe(false);
    expect(getNativeLocationStatus()).toBe("unavailable");
    await expect(requestDeviceGpsLocation()).resolves.toEqual({ status: "unavailable" });
  });

  it("returns native GPS fix, persists it to shared map cache, and deduplicates cached reads", async () => {
    const getCurrentLocation = vi.fn(async () => ({
      latitude: 30.2741,
      longitude: 120.1551,
      accuracyMeters: 12,
      city: "杭州市",
      district: "西湖区",
      region: "浙江省",
      label: "杭州市 · 西湖区",
    }));
    setNativeLocationModuleForTest({
      isAvailable: () => true,
      authorizationStatus: () => "authorized",
      getCurrentLocation,
    });

    expect(isNativeLocationAvailable()).toBe(true);
    expect(getNativeLocationStatus()).toBe("authorized");

    const first = await requestDeviceGpsLocation({ nowMs: 1_000 });
    expect(first).toEqual({
      status: "ok",
      location: expect.objectContaining({
        latitude: 30.2741,
        longitude: 120.1551,
        accuracyMeters: 12,
        label: "杭州市 · 西湖区",
        source: "gps",
      }),
    });
    expect(getCachedUserLocation()).toMatchObject({
      latitude: 30.2741,
      longitude: 120.1551,
      label: "杭州市 · 西湖区",
      source: "gps",
    });

    // Cached read within TTL avoids duplicate CoreLocation lock.
    const second = await requestDeviceGpsLocation({ nowMs: 30_000 });
    expect(second.status).toBe("ok");
    expect(getCurrentLocation).toHaveBeenCalledTimes(1);

    // Forced refresh triggers a fresh lock.
    await requestDeviceGpsLocation({ force: true, nowMs: 40_000 });
    expect(getCurrentLocation).toHaveBeenCalledTimes(2);
  });

  it("surfaces denied status cleanly when iOS location permission is refused", async () => {
    setNativeLocationModuleForTest({
      isAvailable: () => true,
      authorizationStatus: () => "denied",
      getCurrentLocation: vi.fn(async () => {
        throw new Error("location_denied");
      }),
    });

    await expect(requestDeviceGpsLocation({ force: true })).resolves.toEqual({ status: "denied" });
  });
});
